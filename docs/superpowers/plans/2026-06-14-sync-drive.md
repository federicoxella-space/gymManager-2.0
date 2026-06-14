# Sincronizzazione multi-dispositivo via Google Drive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development per implementare task-by-task. Gli step usano checkbox (`- [ ]`).

**Goal:** Sincronizzare il DB tra più dispositivi dello stesso operatore tramite un file di sync dedicato su Google Drive, con guardia di versione ottimistica, polling e risoluzione conflitti "blocca e chiedi".

**Architecture:** Sync a **file intero** del DB SQLCipher. Un file di sync dedicato su Drive (`gymmanager_sync.db`) sovrascritto in-place; versione = `headRevisionId` di Drive; stato locale in `sync-state.json`; `localDirty` = hash del file DB ≠ hash all'ultimo sync. Logica di decisione **pura e testata**; orchestrazione in `sync-service` con i metodi Drive mockabili; reload mid-sessione riusa il ciclo close→overwrite→open riaprendo con la **chiave in memoria** (`currentKey`). Spec: `docs/superpowers/specs/2026-06-14-sync-drive-design.md`.

**Tech Stack:** Electron (main + preload + renderer React) + TypeScript strict + better-sqlite3-multiple-ciphers (SQLCipher) + Google Drive REST (fetch) + i18next. Test: Vitest (node-only).

**Verifica (DoD «verde»):** `npm run verify` verde dopo ogni task. **Test unit** per le parti pure/orchestrazione (Drive mockato); OAuth/rete reale e cipher-rekey = **verifica manuale** (come B3/B2), test cipher-dipendenti `skipIf(!CIPHER_ENABLED)`. Stringhe UI in i18n (IT/EN allineate). Trailer commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Note di sicurezza Electron:** IPC solo via preload; nessun token/segreto nel renderer; il file di sync è cifrato a riposo (SQLCipher). Entrambi i dispositivi devono usare la **stessa master password**.

---

## File coinvolti (mappa)

| File | Responsabilità | Task |
|---|---|---|
| `src/main/db/database.ts` | `getCurrentKey()`, `openDatabaseWithKey(key)` | T1 |
| `src/main/backup/restore-service.ts` | `eseguiRipristinoConChiaveCorrente(path)` (reload senza password) | T1 |
| `src/main/sync/sync-logic.ts` (Create) | logica PURA: `decideAzioneApertura`, `decideAzionePolling`, confronto revisioni | T2 |
| `src/main/sync/sync-state.ts` (Create) | sidecar `sync-state.json`, hash DB, `isLocalDirty` | T2 |
| `tests/unit/sync-logic.test.ts` · `sync-state.test.ts` (Create) | test pura logica + stato | T2 |
| `src/main/backup/drive-service.ts` | metodi sync: `getOrCreateSyncFile`, `getSyncMetadata`, `uploadSync`, `downloadSync` | T3 |
| `src/main/sync/sync-service.ts` (Create) | orchestrazione: enable/disable/status/syncNow/check/resolve/firstRun; emette eventi | T4 |
| `tests/unit/sync-service.test.ts` (Create) | orchestrazione con Drive mockato | T4 |
| `src/main/ipc/handlers.ts` · `src/preload/index.ts` · `src/types/shared.ts` · `src/renderer/src/types/api.d.ts` | IPC `sync:*` + tipi | T5 |
| `src/main/index.ts` (init window) · handler `db:unlock` / app close | hook apertura + chiusura | T6 |
| `src/renderer/src/pages/SettingsPage.tsx` · nuovo `SyncBanner.tsx` · `SyncConflictDialog.tsx` · `App.tsx` · i18n | UI: sezione Sincronizzazione, banner, dialog, timer polling | T7 |
| `ANALYSYS.md` · `OPEN-QUESTIONS.md` | chiusura | T8 |

---

## Task 1: Riapertura DB con chiave in memoria + reload senza password

**Files:**
- Modify: `src/main/db/database.ts`
- Modify: `src/main/backup/restore-service.ts`
- Test: `tests/unit/db.test.ts` (estendi)

**Contesto:** `database.ts` tiene `currentKey` (chiave derivata) in memoria ma non la password in chiaro. Per ricaricare il file di sync scaricato senza ri-chiedere la password, serve riaprire con `currentKey`. `eseguiRipristino(path, password)` esiste già (close→safety→overwrite→open).

- [ ] **Step 1: `database.ts` — esporre la chiave e l'apertura con chiave.** Aggiungere:

```ts
/** Ritorna la chiave SQLCipher corrente (hex) o null se il DB non è aperto. Uso interno (sync/reload). */
export function getCurrentKey(): string | null {
  return currentKey
}

/** Apre il DB con una chiave già derivata (hex 64). Usata dal reload sync per non ri-derivare la password. */
export function openDatabaseWithKey(key: string): void {
  if (dbInstance !== null) {
    log.info('[database] DB già aperto, skip')
    return
  }
  const dbPath = DB_PATH
  let db: Database.Database | null = null
  try {
    db = new Database(dbPath)
    db.pragma(`key='${key}'`)
    db.prepare('SELECT count(*) FROM sqlite_master').get() // verifica chiave/integrità
  } catch (err) {
    if (db) db.close()
    throw new Error('PASSWORD_WRONG')
  }
  dbInstance = db
  currentKey = key
  dbInstance.pragma('journal_mode = WAL')
  runMigrations(dbInstance)
  log.info('[database] DB aperto con chiave esistente (reload sync)')
}
```

  (Allinea i dettagli — pragma/migrazioni — a quanto fa `openDatabase`; LEGGI `openDatabase` per replicarne fedelmente fase 1/2.)

- [ ] **Step 2: `restore-service.ts` — reload con chiave corrente.** Aggiungere:

```ts
import { DB_PATH, openDatabase, openDatabaseWithKey, getCurrentKey, closeDatabase, isDatabaseOpen } from '../db/database'

/**
 * Reload sync: sostituisce il DB locale con `nuovoPath` e riapre con la chiave CORRENTE
 * (stessa master password tra dispositivi). Se l'apertura fallisce → SYNC_PASSWORD_MISMATCH e
 * ripristino del DB precedente. Non richiede la password in chiaro.
 */
export async function eseguiRipristinoConChiaveCorrente(nuovoPath: string): Promise<void> {
  const key = getCurrentKey()
  if (key === null) throw new Error('DB_NON_APERTO')
  const safetyPath = DB_PATH + '.sync-safety.db'
  let hasSafety = false
  if (isDatabaseOpen()) closeDatabase()
  if (existsSync(DB_PATH)) { copyFileSync(DB_PATH, safetyPath); hasSafety = true }
  try {
    copyFileSync(nuovoPath, DB_PATH)
    openDatabaseWithKey(key)
    log.info('[sync] Reload completato con chiave corrente')
  } catch (err) {
    log.error('[sync] Reload fallito, ripristino DB precedente', err)
    if (isDatabaseOpen()) closeDatabase()
    if (hasSafety) { copyFileSync(safetyPath, DB_PATH); openDatabaseWithKey(key) }
    throw new Error('SYNC_PASSWORD_MISMATCH')
  } finally {
    if (hasSafety && existsSync(safetyPath)) { try { unlinkSync(safetyPath) } catch { /* ignore */ } }
  }
}
```

- [ ] **Step 3: test** in `tests/unit/db.test.ts`: `openDatabaseWithKey` apre un DB creato da `openDatabase` con la stessa password (usa `deriveKey(password)` per la chiave); il round-trip preserva i dati. Gate cipher-dipendente con `it.skipIf(!CIPHER_ENABLED)` per il caso "chiave errata → PASSWORD_WRONG" (riusa il probe `isCipherEnabled()` già presente nel file).

- [ ] **Step 4: `npm run verify`** → VERDE.

- [ ] **Step 5: Commit**
```bash
git add src/main/db/database.ts src/main/backup/restore-service.ts tests/unit/db.test.ts
git commit -m "feat(sync): openDatabaseWithKey + eseguiRipristinoConChiaveCorrente (reload senza password)"
```

---

## Task 2: Logica pura di decisione + stato locale (sidecar + hash)

**Files:**
- Create: `src/main/sync/sync-logic.ts`
- Create: `src/main/sync/sync-state.ts`
- Test: `tests/unit/sync-logic.test.ts`, `tests/unit/sync-state.test.ts`

- [ ] **Step 1: `sync-logic.ts` (PURA, no I/O).**

```ts
export type AzioneApertura = 'usa-locale' | 'download-auto' | 'conflitto' | 'primo-avvio'
export type AzionePolling = 'nessuna' | 'banner-reload' | 'conflitto'

export interface StatoConfronto {
  /** Revisione remota corrente (headRevisionId) o null se il file di sync non esiste. */
  remoteRevision: string | null
  /** Revisione all'ultimo sync riuscito (dallo stato locale) o null se mai sincronizzato. */
  lastRemoteRevision: string | null
  /** true se il DB locale ha modifiche non ancora caricate. */
  localDirty: boolean
}

/** Decide l'azione all'apertura/unlock. */
export function decideAzioneApertura(s: StatoConfronto): AzioneApertura {
  if (s.remoteRevision === null) return 'primo-avvio' // nessun file di sync remoto
  if (s.remoteRevision === s.lastRemoteRevision) return 'usa-locale'
  // remoto avanzato rispetto al mio ultimo sync
  return s.localDirty ? 'conflitto' : 'download-auto'
}

/** Decide l'azione durante il polling (app aperta). */
export function decideAzionePolling(s: StatoConfronto): AzionePolling {
  if (s.remoteRevision === null) return 'nessuna'
  if (s.remoteRevision === s.lastRemoteRevision) return 'nessuna'
  return s.localDirty ? 'conflitto' : 'banner-reload'
}

/** Guardia ottimistica prima dell'upload: true se è sicuro sovrascrivere. */
export function uploadConsentito(remoteRevision: string | null, lastRemoteRevision: string | null): boolean {
  // sicuro se nessuno ha toccato il remoto dal mio ultimo sync (o il file non esiste ancora)
  return remoteRevision === null || remoteRevision === lastRemoteRevision
}
```

- [ ] **Step 2: test `sync-logic.test.ts`** — tabella di casi per le tre funzioni:

```ts
import { describe, it, expect } from 'vitest'
import { decideAzioneApertura, decideAzionePolling, uploadConsentito } from '../../src/main/sync/sync-logic'

describe('decideAzioneApertura', () => {
  it('nessun file remoto → primo-avvio', () => expect(decideAzioneApertura({ remoteRevision: null, lastRemoteRevision: null, localDirty: false })).toBe('primo-avvio'))
  it('revisione invariata → usa-locale', () => expect(decideAzioneApertura({ remoteRevision: 'r1', lastRemoteRevision: 'r1', localDirty: true })).toBe('usa-locale'))
  it('remoto avanzato + pulito → download-auto', () => expect(decideAzioneApertura({ remoteRevision: 'r2', lastRemoteRevision: 'r1', localDirty: false })).toBe('download-auto'))
  it('remoto avanzato + dirty → conflitto', () => expect(decideAzioneApertura({ remoteRevision: 'r2', lastRemoteRevision: 'r1', localDirty: true })).toBe('conflitto'))
})

describe('decideAzionePolling', () => {
  it('invariato → nessuna', () => expect(decideAzionePolling({ remoteRevision: 'r1', lastRemoteRevision: 'r1', localDirty: true })).toBe('nessuna'))
  it('avanzato + pulito → banner-reload', () => expect(decideAzionePolling({ remoteRevision: 'r2', lastRemoteRevision: 'r1', localDirty: false })).toBe('banner-reload'))
  it('avanzato + dirty → conflitto', () => expect(decideAzionePolling({ remoteRevision: 'r2', lastRemoteRevision: 'r1', localDirty: true })).toBe('conflitto'))
})

describe('uploadConsentito', () => {
  it('remoto invariato → consentito', () => expect(uploadConsentito('r1', 'r1')).toBe(true))
  it('remoto assente → consentito', () => expect(uploadConsentito(null, 'r1')).toBe(true))
  it('remoto avanzato → negato', () => expect(uploadConsentito('r2', 'r1')).toBe(false))
})
```

- [ ] **Step 3: `sync-state.ts` (sidecar + hash + dirty).**

```ts
import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { DB_PATH, getDatabase, isDatabaseOpen } from '../db/database'

export interface SyncState {
  enabled: boolean
  syncFileId: string | null
  lastRemoteRevision: string | null
  /** hash del file DB all'ultimo sync riuscito; usato per calcolare localDirty. */
  lastLocalHash: string | null
  lastSyncAt: string | null
  pollingSec: number
}

const STATE_FILE = 'sync-state.json'
const DEFAULT_STATE: SyncState = { enabled: false, syncFileId: null, lastRemoteRevision: null, lastLocalHash: null, lastSyncAt: null, pollingSec: 60 }

function statePath(): string { return join(app.getPath('userData'), STATE_FILE) }

export function loadSyncState(): SyncState {
  if (!existsSync(statePath())) return { ...DEFAULT_STATE }
  try { return { ...DEFAULT_STATE, ...JSON.parse(readFileSync(statePath(), 'utf-8')) as Partial<SyncState> } }
  catch { return { ...DEFAULT_STATE } }
}

export function saveSyncState(s: SyncState): void {
  writeFileSync(statePath(), JSON.stringify(s, null, 2), 'utf-8')
}

/** Hash del contenuto del DB: forza un checkpoint WAL così il file principale è completo, poi SHA-256. */
export function hashDbFile(): string {
  if (isDatabaseOpen()) {
    try { getDatabase().pragma('wal_checkpoint(TRUNCATE)') } catch { /* best effort */ }
  }
  const buf = readFileSync(DB_PATH)
  return createHash('sha256').update(buf).digest('hex')
}

/** true se il DB locale è cambiato rispetto all'ultimo sync. */
export function isLocalDirty(s: SyncState): boolean {
  if (s.lastLocalHash === null) return true // mai sincronizzato → consideralo dirty
  return hashDbFile() !== s.lastLocalHash
}
```

- [ ] **Step 4: test `sync-state.test.ts`** — mock di `electron` (path userData su tmp) e di `../db/database` (DB_PATH su un file tmp, `isDatabaseOpen`→false). Verifica: load default quando manca il file; save→load round-trip; `hashDbFile` stabile sullo stesso contenuto e diverso al cambiare del file; `isLocalDirty` true se `lastLocalHash` null, false se uguale all'hash corrente, true se diverso. (Segui il pattern di mock di `electron` già usato in `tests/unit/db.test.ts`.)

- [ ] **Step 5: `npm run verify`** → VERDE.

- [ ] **Step 6: Commit**
```bash
git add src/main/sync/sync-logic.ts src/main/sync/sync-state.ts tests/unit/sync-logic.test.ts tests/unit/sync-state.test.ts
git commit -m "feat(sync): logica pura di decisione + stato locale (sidecar, hash DB, localDirty)"
```

---

## Task 3: drive-service — metodi per il file di sync

**Files:**
- Modify: `src/main/backup/drive-service.ts`

**Contesto:** `drive-service` ha già OAuth/token (`getValidToken`), `getOrCreateFolder`, e i metodi di backup timestamped (invariati). Aggiungere i metodi per il **file di sync stabile** (overwrite-in-place). `getValidToken`/`getOrCreateFolder` sono `function` interne riusabili.

- [ ] **Step 1: costanti e metodi.** Aggiungere in `drive-service.ts`:

```ts
const SYNC_FILE_NAME = 'gymmanager_sync.db'

/** Trova (o crea vuoto) il file di sync stabile nella cartella app. Ritorna il fileId. */
export async function getOrCreateSyncFile(): Promise<string> {
  const accessToken = await getValidToken()
  const folderId = await getOrCreateFolder(accessToken)
  const q = `name='${SYNC_FILE_NAME}' and '${folderId}' in parents and trashed=false`
  const listUrl = `${GOOGLE_DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!listRes.ok) throw new Error(`SYNC_LIST_FAILED: ${await listRes.text()}`)
  const data = await listRes.json() as { files: Array<{ id: string }> }
  if (data.files.length > 0) return data.files[0].id
  // crea metadata-only (contenuto vuoto); il primo upload lo riempirà
  const createRes = await fetch(`${GOOGLE_DRIVE_API}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: SYNC_FILE_NAME, parents: [folderId] })
  })
  if (!createRes.ok) throw new Error(`SYNC_CREATE_FAILED: ${await createRes.text()}`)
  return (await createRes.json() as { id: string }).id
}

export interface SyncMetadata { revision: string; modifiedTime: string; size: number }

/** Metadati di versione del file di sync. `revision` = headRevisionId (fallback modifiedTime). */
export async function getSyncMetadata(fileId: string): Promise<SyncMetadata> {
  const accessToken = await getValidToken()
  const url = `${GOOGLE_DRIVE_API}/files/${fileId}?fields=headRevisionId,modifiedTime,size`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`SYNC_META_FAILED: ${await res.text()}`)
  const d = await res.json() as { headRevisionId?: string; modifiedTime: string; size?: string }
  return { revision: d.headRevisionId ?? d.modifiedTime, modifiedTime: d.modifiedTime, size: parseInt(d.size ?? '0', 10) }
}

/** Sovrascrive in-place il contenuto del file di sync; ritorna la nuova revisione. */
export async function uploadSync(fileId: string, dbPath: string): Promise<string> {
  const accessToken = await getValidToken()
  const content = readFileSync(dbPath)
  const url = `${GOOGLE_DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media&fields=headRevisionId,modifiedTime`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream', 'Content-Length': String(content.byteLength) },
    body: content
  })
  if (!res.ok) throw new Error(`SYNC_UPLOAD_FAILED: ${await res.text()}`)
  const d = await res.json() as { headRevisionId?: string; modifiedTime: string }
  return d.headRevisionId ?? d.modifiedTime
}

/** Scarica il contenuto del file di sync su `destPath`. */
export async function downloadSync(fileId: string, destPath: string): Promise<void> {
  const accessToken = await getValidToken()
  const res = await fetch(`${GOOGLE_DRIVE_API}/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`SYNC_DOWNLOAD_FAILED: ${await res.text()}`)
  writeFileSync(destPath, Buffer.from(await res.arrayBuffer()))
}

/** Carica una copia di conflitto (file separato timestamped). Ritorna il fileId. */
export async function uploadConflictCopy(dbPath: string): Promise<string> {
  // riusa la logica di backupSuDrive ma con nome gymmanager_conflict_<iso>.db
  return backupSuDriveConNome(dbPath, `gymmanager_conflict_${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
}
```

  Estrai da `backupSuDrive` un helper `backupSuDriveConNome(path, fileName)` (refactor non distruttivo: `backupSuDrive` lo richiama con il nome timestamped attuale) per riusarlo in `uploadConflictCopy`.

- [ ] **Step 2: `npm run verify`** → VERDE (typecheck/lint/build). I metodi sono I/O di rete: niente unit test qui (verifica manuale OAuth in T8).

- [ ] **Step 3: Commit**
```bash
git add src/main/backup/drive-service.ts
git commit -m "feat(sync): metodi drive-service per il file di sync (getOrCreate/metadata/upload/download/conflict)"
```

---

## Task 4: sync-service — orchestrazione

**Files:**
- Create: `src/main/sync/sync-service.ts`
- Test: `tests/unit/sync-service.test.ts`

**Contesto:** orchestratore che usa `sync-logic`, `sync-state`, `drive-service`, `restore-service`. Emette eventi al renderer via la finestra principale (pattern `auto-updater`).

- [ ] **Step 1: `sync-service.ts`.** Implementa (firme esatte):

```ts
import type { BrowserWindow } from 'electron'
import log from 'electron-log'
import { DB_PATH } from '../db/database'
import { eseguiRipristinoConChiaveCorrente } from '../backup/restore-service'
import * as drive from '../backup/drive-service'
import { loadSyncState, saveSyncState, hashDbFile, isLocalDirty, type SyncState } from './sync-state'
import { decideAzioneApertura, decideAzionePolling, uploadConsentito } from './sync-logic'

let mainWindow: BrowserWindow | null = null
export function initSyncService(win: BrowserWindow): void { mainWindow = win }
function emit(channel: string, payload?: unknown): void { mainWindow?.webContents.send(channel, payload) }

export interface SyncStatus {
  enabled: boolean
  connected: boolean       // drive.isDriveConnected()
  lastSyncAt: string | null
  dirty: boolean
  conflict: boolean        // conflitto pendente non risolto
}

const join = (...p: string[]): string => p.join('/') // usa node:path nel codice reale
const TMP_DOWNLOAD = `${DB_PATH}.sync-download.db`

export async function getStatus(): Promise<SyncStatus> { /* legge stato + drive.isDriveConnected + isLocalDirty */ }

/** Sync manuale completo: confronta, e fa download-auto o upload secondo lo stato; gestisce conflitto → emette 'sync:conflict'. */
export async function syncNow(): Promise<void> { /* vedi logica sotto */ }

/** Check non distruttivo (polling): decide e emette 'sync:remote-changed' (banner) o 'sync:conflict'. */
export async function checkRemote(): Promise<void> { /* usa decideAzionePolling */ }

/** All'apertura/post-unlock: usa decideAzioneApertura; download-auto se pulito; primo-avvio gestito. */
export async function syncOnOpen(): Promise<void> { /* usa decideAzioneApertura */ }

/** Upload con guardia ottimistica. Su remoto avanzato → emette 'sync:conflict' senza sovrascrivere. */
export async function upload(): Promise<void> { /* getSyncMetadata → uploadConsentito → uploadSync → aggiorna stato */ }

/** Risoluzione conflitto scelta dall'utente. */
export async function resolveConflict(scelta: 'remoto' | 'locale' | 'copia'): Promise<void> { /* vedi sotto */ }

export async function enableSync(): Promise<void> { /* primo avvio: adotta remoto o push locale (emette evento per la scelta) */ }
export async function disableSync(): Promise<void> { /* state.enabled=false, salva */ }
export function setPolling(sec: number): void { /* aggiorna stato */ }
```

  Logica chiave (implementa nei corpi):
  - **upload()**: `const st = loadSyncState(); const fileId = st.syncFileId ?? await drive.getOrCreateSyncFile(); const meta = await drive.getSyncMetadata(fileId).catch(()=>null);` se `!uploadConsentito(meta?.revision ?? null, st.lastRemoteRevision)` → `emit('sync:conflict'); return`. Altrimenti `const rev = await drive.uploadSync(fileId, DB_PATH);` poi `saveSyncState({ ...st, syncFileId: fileId, lastRemoteRevision: rev, lastLocalHash: hashDbFile(), lastSyncAt: new Date().toISOString() })`.
  - **syncOnOpen()/checkRemote()**: `const st = loadSyncState(); if(!st.enabled) return; const fileId = st.syncFileId; ... const meta = await drive.getSyncMetadata(fileId); const azione = decide...({ remoteRevision: meta.revision, lastRemoteRevision: st.lastRemoteRevision, localDirty: isLocalDirty(st) })`. Per `download-auto`: `await drive.downloadSync(fileId, TMP_DOWNLOAD); await eseguiRipristinoConChiaveCorrente(TMP_DOWNLOAD); saveSyncState({...st, lastRemoteRevision: meta.revision, lastLocalHash: hashDbFile(), lastSyncAt: ...}); emit('sync:reloaded')`. Per `banner-reload`: `emit('sync:remote-changed')`. Per `conflitto`: `emit('sync:conflict')`.
  - **resolveConflict('remoto')**: come download-auto. **('locale')**: forza `drive.uploadSync` (senza guardia) + aggiorna stato. **('copia')**: `await drive.uploadConflictCopy(DB_PATH)` poi come 'remoto'.

  Usa `node:path` reale per `TMP_DOWNLOAD` (`DB_PATH + '.sync-download.db'`).

- [ ] **Step 2: test `sync-service.test.ts`** — mocka `../backup/drive-service`, `../backup/restore-service`, `./sync-state` (con `vi.mock`) e verifica l'orchestrazione:
  - `upload()` con remoto invariato → chiama `uploadSync` e salva il nuovo stato.
  - `upload()` con remoto avanzato → NON chiama `uploadSync`, emette `sync:conflict` (verifica via spy su `mainWindow.webContents.send` — inietta un finto window con `initSyncService`).
  - `checkRemote()` remoto avanzato + pulito → emette `sync:remote-changed`; + dirty → `sync:conflict`.
  - `resolveConflict('copia')` → chiama `uploadConflictCopy` poi reload.
  (Segui i pattern `vi.mock` già usati nei test del progetto; LEGGI un test esistente che mocka un modulo per lo stile.)

- [ ] **Step 3: `npm run verify`** → VERDE.

- [ ] **Step 4: Commit**
```bash
git add src/main/sync/sync-service.ts tests/unit/sync-service.test.ts
git commit -m "feat(sync): sync-service (orchestrazione open/poll/upload/resolve, eventi renderer) + test"
```

---

## Task 5: IPC + preload + tipi

**Files:**
- Modify: `src/main/ipc/handlers.ts`, `src/preload/index.ts`, `src/types/shared.ts`, `src/renderer/src/types/api.d.ts`

- [ ] **Step 1: handlers IPC** (`handlers.ts`) — registra (stile try/catch+log come gli altri):
  `sync:status` → `getStatus()`; `sync:now` → `syncNow()`; `sync:check` → `checkRemote()`; `sync:resolve` ({scelta}) → `resolveConflict(scelta)`; `sync:enable` → `enableSync()`; `sync:disable` → `disableSync()`; `sync:setPolling` ({sec}) → `setPolling(sec)`. Importa da `../sync/sync-service`.

- [ ] **Step 2: preload** (`index.ts`) — namespace `sync`:
```ts
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    now: () => ipcRenderer.invoke('sync:now'),
    check: () => ipcRenderer.invoke('sync:check'),
    resolve: (scelta: 'remoto' | 'locale' | 'copia') => ipcRenderer.invoke('sync:resolve', { scelta }),
    enable: () => ipcRenderer.invoke('sync:enable'),
    disable: () => ipcRenderer.invoke('sync:disable'),
    setPolling: (sec: number) => ipcRenderer.invoke('sync:setPolling', { sec })
  },
```
  Verifica che il canale eventi `window.api.on(channel, cb)` già esistente copra `sync:remote-changed`/`sync:conflict`/`sync:reloaded` (lo stesso usato per `update:*`). Se `on` filtra una whitelist di canali, aggiungi i canali `sync:*` alla whitelist.

- [ ] **Step 3: tipi** — in `shared.ts` ElectronAPI e mirror `api.d.ts`: aggiungi l'interfaccia `sync` con le firme sopra e `SyncStatus`. Copie allineate.

- [ ] **Step 4: `npm run verify`** → VERDE.

- [ ] **Step 5: Commit**
```bash
git add src/main/ipc/handlers.ts src/preload/index.ts src/types/shared.ts src/renderer/src/types/api.d.ts
git commit -m "feat(sync): IPC sync:* + preload + tipi"
```

---

## Task 6: Hook apertura e chiusura

**Files:**
- Modify: `src/main/index.ts` (init window → `initSyncService`)
- Modify: `src/main/ipc/handlers.ts` (`db:unlock` → trigger `syncOnOpen`)
- Modify: `src/main/index.ts` o handler app-quit (upload alla chiusura)

- [ ] **Step 1: init** — in `src/main/index.ts`, dopo aver creato `mainWindow` (vicino a `initAutoUpdater(mainWindow)`), chiama `initSyncService(mainWindow)`.

- [ ] **Step 2: post-unlock** — nell'handler `db:unlock` (handlers.ts ~riga 164), dopo l'apertura DB riuscita e gli `aggiornaStato*`, lancia in modo non bloccante `void syncOnOpen().catch(err => log.warn('[sync] open check', err))`.

- [ ] **Step 3: chiusura** — su `app.on('before-quit', …)` (o `mainWindow.on('close')`), se sync abilitato e `localDirty`, esegui un upload best-effort. ATTENZIONE: l'upload è async e la chiusura potrebbe non attenderlo; usa lo stesso pattern già adottato per il `backup_on_close` esistente (LEGGI come è implementato il backup alla chiusura e replica l'attesa). Se non c'è un meccanismo di attesa affidabile, esponi l'upload-on-close tramite il flusso già esistente e documenta il limite (upload garantito da "Sincronizza ora"/polling).

- [ ] **Step 4: `npm run verify`** → VERDE.

- [ ] **Step 5: Commit**
```bash
git add src/main/index.ts src/main/ipc/handlers.ts
git commit -m "feat(sync): hook syncOnOpen al post-unlock, init service, upload best-effort alla chiusura"
```

---

## Task 7: UI — Settings, banner, dialog conflitto, polling

**Files:**
- Modify: `src/renderer/src/pages/SettingsPage.tsx`
- Create: `src/renderer/src/components/sync/SyncBanner.tsx`, `src/renderer/src/components/sync/SyncConflictDialog.tsx`
- Modify: `src/renderer/src/App.tsx` (montaggio banner/dialog + listener eventi + timer polling)
- Modify: `src/renderer/src/i18n/locales/it.json`, `en.json`

- [ ] **Step 1: i18n** — sezione `sync` in it/en (copie allineate): `titolo`, `descrizione`, `abilita`, `disabilita`, `sincronizza_ora`, `ultimo_sync`, `stato_aggiornato`, `stato_modifiche_locali`, `intervallo_polling`, `banner_aggiornato`, `banner_ricarica`, `conflitto_titolo`, `conflitto_msg`, `conflitto_ricarica`, `conflitto_sovrascrivi`, `conflitto_copia`, `errore_password_diversa`, `primo_avvio_titolo`, `primo_avvio_adotta_remoto`, `primo_avvio_carica_locale`.

- [ ] **Step 2: Settings → Sincronizzazione.** In `SettingsPage.tsx` aggiungi una sezione (sotto il blocco Drive esistente): toggle abilita/disabilita (`window.api.sync.enable/disable`), stato da `window.api.sync.status()` (ultimo sync, "modifiche locali da sincronizzare" se dirty), pulsante "Sincronizza ora" (`sync.now()` con spinner+esito), selettore intervallo polling (`sync.setPolling`). Richiede Drive connesso (riusa lo stato connessione esistente); se non connesso, mostra invito a connettere.

- [ ] **Step 3: `SyncBanner.tsx`** — banner non bloccante (stile come `UpdateNotification`): si mostra su evento `sync:remote-changed` con testo `sync.banner_aggiornato` + bottone `sync.banner_ricarica` (chiama `sync.now()` → reload). Si nasconde su `sync:reloaded`.

- [ ] **Step 4: `SyncConflictDialog.tsx`** — modale (riusa `Modal`/`ConfirmDialog` pattern) su evento `sync:conflict`: messaggio `sync.conflitto_msg` + 3 bottoni → `sync.resolve('remoto'|'locale'|'copia')`. Gestisci `SYNC_PASSWORD_MISMATCH` mostrando `sync.errore_password_diversa`.

- [ ] **Step 5: `App.tsx`** — monta `SyncBanner` e `SyncConflictDialog`; registra i listener `window.api.on('sync:remote-changed'|'sync:conflict'|'sync:reloaded', …)`; avvia un timer che chiama `window.api.sync.check()` ogni `pollingSec` (letto da `sync.status()`), attivo solo quando sync abilitato; pulizia su unmount; trigger `check()` anche su `window` focus.

- [ ] **Step 6: `npm run verify`** → VERDE.

- [ ] **Step 7: Checklist manuale (con 2 dispositivi / 2 profili):** abilita sync su A → carica; su B → adotta remoto; modifica su A, chiudi/sincronizza; su B (aperto) → banner "Ricarica" → ricarica mostra i dati di A; modifica su entrambi prima di sincronizzare → dialog conflitto con le 3 scelte; password diversa → errore senza perdita.

- [ ] **Step 8: Commit**
```bash
git add src/renderer/src/pages/SettingsPage.tsx src/renderer/src/components/sync/ src/renderer/src/App.tsx src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(sync): UI sincronizzazione (Settings, banner Ricarica, dialog conflitto, polling)"
```

---

## Task 8: Review + chiusura documentale

- [ ] **Step 1:** reviewer di sola lettura sull'intero diff vs `main`: copertura spec, correttezza guardia ottimistica/decisioni, niente stringhe hardcoded, parità IT/EN, niente `any`, sicurezza (nessun token nel renderer).
- [ ] **Step 2: `ANALYSYS.md` / `OPEN-QUESTIONS.md`** — registra la feature sync (assorbe parte Drive di B8); annota la **verifica manuale** richiesta (OAuth/rete reale tra 2 dispositivi; reload con cipher attivo) e i limiti noti (upload-on-close best-effort).
- [ ] **Step 3: `npm run verify` finale** → VERDE.
- [ ] **Step 4: commit docs**
```bash
git add ANALYSYS.md OPEN-QUESTIONS.md
git commit -m "docs: chiusura feature sync Drive multi-dispositivo"
```
- [ ] **Step 5:** skill **superpowers:finishing-a-development-branch** per chiudere `sync-drive`.

---

## Self-Review (eseguita in fase di stesura)

**Copertura spec:** §1 modello Drive → T3 · §2 token/stato → T2 · §3 flussi (apertura/polling/upload) → T2 (decisioni) + T4 (orchestrazione) + T6 (hook) · §4 conflitto → T4 (`resolveConflict`) + T7 (dialog) · §5 password → T1 (`SYNC_PASSWORD_MISMATCH`) · §6 primo avvio → T4 (`enableSync`) + T7 · §7 componenti/UI → T3/T4/T5/T7 · §8 edge → T4/T6/T7 · §9 test → T1/T2/T4. **Tutti coperti.**

**Placeholder scan:** i corpi di `sync-service` (T4 Step 1) sono dati come firme + "logica chiave" descritta puntualmente con le chiamate esatte (getSyncMetadata→uploadConsentito→uploadSync→saveSyncState, ecc.) e i nomi reali; non sono TODO vaghi. Le parti pure (T2) e i metodi Drive (T3) e i tipi (T1) hanno codice completo. T6 Step 3 e T7 rimandano a LEGGI-pattern-esistente (upload-on-close, evento `on`, Modal) perché vanno allineati a meccanismi presenti — fornite le azioni esatte.

**Coerenza tipi/nomi:** `SyncState`/`loadSyncState`/`saveSyncState`/`hashDbFile`/`isLocalDirty` (T2) usati in T4. `decideAzioneApertura`/`decideAzionePolling`/`uploadConsentito` (T2) usati in T4. `getOrCreateSyncFile`/`getSyncMetadata`/`uploadSync`/`downloadSync`/`uploadConflictCopy` (T3) usati in T4. `eseguiRipristinoConChiaveCorrente`/`openDatabaseWithKey`/`getCurrentKey` (T1) usati in T4/T1. IPC `sync:*` (T5) ↔ preload ↔ eventi `sync:remote-changed|conflict|reloaded` (T4 emit ↔ T7 listener). `resolveConflict` scelte `'remoto'|'locale'|'copia'` coerenti T4↔T5↔T7.

**Note:** feature grande ma coesa → un solo piano, 8 task con confini netti (logica pura testata isolata da I/O e UI). OAuth/rete + reload cipher = verifica manuale (come B2/B3). `localDirty` via hash del file DB (niente hooking delle mutazioni).
