# Configurazione backup locale (B8) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere configurabili la cartella di destinazione, la frequenza automatica (chiusura + timer periodico) e la retention dei backup locali.

**Architecture:** Estensione locale del backend di backup esistente. Nuove chiavi in `AppSettings` (persistite in `settings.json` via `loadSettings`/`saveSettings`); `backup-service` reso parametrico su cartella + retention; nuovo `backup-scheduler` nel main per il timer periodico (avviato a `db:unlock`, riavviato a `settings:set`); UI in `SettingsPage`.

**Tech Stack:** Electron (main/preload/renderer), TypeScript strict, React + Tailwind, i18next (IT/EN), Vitest.

**Riferimenti:** spec `docs/superpowers/specs/2026-06-14-b8-backup-config-design.md`; invarianti in `CLAUDE.md` (stringhe esternalizzate, niente `any`, IPC solo via preload, `npm run verify` verde).

---

## File Structure

- `src/types/shared.ts` — `AppSettings` (+ 4 nuove chiavi); tipo `dialog.showOpenDialog` esteso con `properties`.
- `src/renderer/src/types/api.d.ts` — mirror dei due tipi sopra.
- `src/main/settings/store.ts` — `DEFAULT_SETTINGS` + mappatura in `loadSettings`.
- `src/main/backup/backup-service.ts` — `risolviCartellaBackup` (puro) + `backupAutomatico` parametrico.
- `src/main/backup/backup-scheduler.ts` — **nuovo**: `intervalloMs` (puro) + `initBackupScheduler`/`restartBackupScheduler`.
- `src/main/ipc/handlers.ts` — wiring scheduler in `db:unlock` e `settings:set`; `dialog:showOpenDialog` con `properties`.
- `src/preload/index.ts` — bridge `dialog.showOpenDialog` con `properties`.
- `src/renderer/src/pages/SettingsPage.tsx` — UI cartella/frequenza/retention.
- `src/renderer/src/i18n/locales/it.json` + `en.json` — stringhe nuove.
- `tests/unit/backup.test.ts` — estensione rotazione/cartella parametrica.
- `tests/unit/settings-store.test.ts` — **nuovo**: `loadSettings` legge le nuove chiavi.
- `tests/unit/backup-scheduler.test.ts` — **nuovo**: `intervalloMs` + enable/disable timer.

---

### Task 1: Tipi e impostazioni — nuove chiavi

**Files:**
- Modify: `src/types/shared.ts` (interfaccia `AppSettings`)
- Modify: `src/renderer/src/types/api.d.ts` (mirror `AppSettings`)
- Modify: `src/main/settings/store.ts:8-23` (`DEFAULT_SETTINGS`) e `:45-69` (mappatura `loadSettings`)
- Test: `tests/unit/settings-store.test.ts` (nuovo)

- [ ] **Step 1: Scrivi il test di `loadSettings`**

Crea `tests/unit/settings-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'

const TEST_USER_DATA = join(tmpdir(), `gymmanager-settings-test-${process.pid}`)

vi.mock('electron', () => ({
  app: { getPath: (_n: string) => TEST_USER_DATA, getVersion: () => '0.1.0-test' }
}))
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { loadSettings, getSettingsPath } from '../../src/main/settings/store'

beforeEach(() => {
  mkdirSync(TEST_USER_DATA, { recursive: true })
})
afterEach(() => {
  if (existsSync(TEST_USER_DATA)) rmSync(TEST_USER_DATA, { recursive: true, force: true })
})

describe('loadSettings — chiavi backup B8', () => {
  it('usa i default quando il file non esiste', () => {
    const s = loadSettings()
    expect(s.backup_dir).toBe('')
    expect(s.backup_periodic_enabled).toBe(false)
    expect(s.backup_periodic_hours).toBe(6)
    expect(s.backup_retention).toBe(10)
  })

  it('legge i valori persistiti', () => {
    writeFileSync(
      getSettingsPath(),
      JSON.stringify({
        backup_dir: 'D:/GymBackup',
        backup_periodic_enabled: true,
        backup_periodic_hours: 12,
        backup_retention: 20
      }),
      'utf-8'
    )
    const s = loadSettings()
    expect(s.backup_dir).toBe('D:/GymBackup')
    expect(s.backup_periodic_enabled).toBe(true)
    expect(s.backup_periodic_hours).toBe(12)
    expect(s.backup_retention).toBe(20)
  })
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run tests/unit/settings-store.test.ts`
Expected: FAIL (le proprietà `backup_dir`/`backup_periodic_*`/`backup_retention` non esistono su `AppSettings`).

- [ ] **Step 3: Aggiungi le chiavi a `AppSettings` (shared.ts)**

In `src/types/shared.ts`, nell'interfaccia `AppSettings`, accanto a `backup_on_close: boolean` aggiungi:

```typescript
  backup_on_close: boolean
  /** Cartella di destinazione dei backup locali; vuoto = cartella predefinita (userData/backups). */
  backup_dir: string
  /** Abilita il backup periodico automatico mentre l'app è aperta. */
  backup_periodic_enabled: boolean
  /** Intervallo del backup periodico, in ore (1–168). */
  backup_periodic_hours: number
  /** Numero di backup da conservare nella cartella (rotazione, 1–100). */
  backup_retention: number
```

- [ ] **Step 4: Rispecchia in `api.d.ts`**

In `src/renderer/src/types/api.d.ts`, nell'interfaccia `AppSettings` (riga ~26, dopo `backup_on_close: boolean`), aggiungi le stesse 4 proprietà con gli stessi commenti.

- [ ] **Step 5: Aggiorna `DEFAULT_SETTINGS` e `loadSettings`**

In `src/main/settings/store.ts`, in `DEFAULT_SETTINGS` (dopo `backup_on_close: true`):

```typescript
  backup_on_close: true,
  backup_dir: '',
  backup_periodic_enabled: false,
  backup_periodic_hours: 6,
  backup_retention: 10
```

E nel return di `loadSettings` (dopo `backup_on_close: parsed.backup_on_close ?? DEFAULT_SETTINGS.backup_on_close`):

```typescript
      backup_on_close: parsed.backup_on_close ?? DEFAULT_SETTINGS.backup_on_close,
      backup_dir: parsed.backup_dir ?? DEFAULT_SETTINGS.backup_dir,
      backup_periodic_enabled:
        parsed.backup_periodic_enabled ?? DEFAULT_SETTINGS.backup_periodic_enabled,
      backup_periodic_hours: parsed.backup_periodic_hours ?? DEFAULT_SETTINGS.backup_periodic_hours,
      backup_retention: parsed.backup_retention ?? DEFAULT_SETTINGS.backup_retention
```

> Nota: le nuove chiavi sono persistite solo in `settings.json` (non in `app_settings`/DB): nessuna query SQL le usa, quindi NON vanno aggiunte all'array `campi` di `applyAppSettingsToDb`.

- [ ] **Step 6: Esegui il test e verifica che passi**

Run: `npx vitest run tests/unit/settings-store.test.ts`
Expected: PASS (entrambi i test).

- [ ] **Step 7: Commit**

```bash
git add src/types/shared.ts src/renderer/src/types/api.d.ts src/main/settings/store.ts tests/unit/settings-store.test.ts
git commit -m "feat(backup): chiavi impostazioni backup_dir/periodic/retention (B8)"
```

---

### Task 2: backup-service parametrico (cartella + retention)

**Files:**
- Modify: `src/main/backup/backup-service.ts:26-27` (rimuovi `MAX_AUTO_BACKUPS`), `:87-128` (`backupAutomatico`); aggiungi `risolviCartellaBackup`
- Test: `tests/unit/backup.test.ts` (estensione)

- [ ] **Step 1: Scrivi i test (helper puro + rotazione parametrica)**

In `tests/unit/backup.test.ts`, aggiorna l'import e aggiungi una suite. Import (riga 68):

```typescript
import { backupLocale, backupAutomatico, risolviCartellaBackup } from '../../src/main/backup/backup-service'
```

Aggiungi in fondo al file:

```typescript
describe('risolviCartellaBackup', () => {
  it('ritorna il default se la cartella è vuota o whitespace', () => {
    expect(risolviCartellaBackup('', '/def')).toBe('/def')
    expect(risolviCartellaBackup('   ', '/def')).toBe('/def')
  })
  it('ritorna la cartella configurata se valorizzata', () => {
    expect(risolviCartellaBackup('/custom', '/def')).toBe('/custom')
  })
})

describe('backupAutomatico — cartella e retention parametriche', () => {
  it('scrive nella cartella passata in opts', async () => {
    const dir = join(TEST_USER_DATA, 'custom-bk')
    const p = await backupAutomatico({ dir, retention: 10 })
    expect(p.startsWith(dir)).toBe(true)
    expect(existsSync(p)).toBe(true)
  })

  it('ruota mantenendo esattamente `retention` file', async () => {
    const dir = join(TEST_USER_DATA, 'rot-bk')
    mkdirSync(dir, { recursive: true })
    // crea 6 backup fittizi con mtime crescente
    for (let i = 0; i < 6; i++) {
      const f = join(dir, `backup_2026010${i}_000000.db`)
      writeFileSync(f, 'x')
    }
    // un backup reale che innesca la rotazione a 3
    await backupAutomatico({ dir, retention: 3 })
    const rimasti = readdirSync(dir).filter((f) => f.startsWith('backup_') && f.endsWith('.db'))
    expect(rimasti.length).toBe(3)
  })
})
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `npx vitest run tests/unit/backup.test.ts -t "risolviCartellaBackup"`
Expected: FAIL (`risolviCartellaBackup` non esportata).

- [ ] **Step 3: Implementa `risolviCartellaBackup` e parametrizza `backupAutomatico`**

In `src/main/backup/backup-service.ts`:

Rimuovi la costante `const MAX_AUTO_BACKUPS = 5` (righe 26-27) e aggiungi l'import di `loadSettings` in cima:

```typescript
import { loadSettings } from '../settings/store'
```

Aggiungi l'helper puro (prima di `backupAutomatico`):

```typescript
/** Default di retention se le impostazioni non sono risolvibili. */
const DEFAULT_RETENTION = 10

/**
 * Risolve la cartella di backup: usa `backupDir` se valorizzata, altrimenti `defaultDir`.
 * Funzione pura (nessun side effect), testabile senza filesystem.
 */
export function risolviCartellaBackup(backupDir: string, defaultDir: string): string {
  return backupDir.trim().length > 0 ? backupDir.trim() : defaultDir
}
```

Riscrivi `backupAutomatico` così:

```typescript
/**
 * Esegue un backup nella cartella configurata (o quella di default),
 * con nome `backup_YYYYMMDD_HHMMSS.db`. Mantiene gli ultimi `retention` backup
 * (prefisso `backup_`: manuali e automatici condividono la rotazione).
 *
 * Se `opts` non fornisce `dir`/`retention`, vengono letti dalle impostazioni.
 * @returns Il percorso del file di backup creato
 */
export async function backupAutomatico(opts?: { dir?: string; retention?: number }): Promise<string> {
  const defaultDir = join(app.getPath('userData'), 'backups')
  let backupDir = opts?.dir
  let retention = opts?.retention
  if (backupDir === undefined || retention === undefined) {
    const settings = loadSettings()
    backupDir = backupDir ?? risolviCartellaBackup(settings.backup_dir, defaultDir)
    retention = retention ?? settings.backup_retention
  }
  const targetDir = backupDir
  const keep = Number.isFinite(retention) && retention > 0 ? Math.floor(retention) : DEFAULT_RETENTION

  mkdirSync(targetDir, { recursive: true })

  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const datePart =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const backupPath = join(targetDir, `backup_${datePart}.db`)

  await backupLocale(backupPath)
  log.info(`[backup] Backup creato: ${backupPath}`)

  // Rotazione: mantieni gli ultimi `keep` file con prefisso backup_
  const files = readdirSync(targetDir)
    .filter((f) => f.startsWith('backup_') && f.endsWith('.db'))
    .map((f) => ({ name: f, path: join(targetDir, f), mtime: statSync(join(targetDir, f)).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime) // più vecchi prima

  if (files.length > keep) {
    const toDelete = files.slice(0, files.length - keep)
    for (const file of toDelete) {
      try {
        unlinkSync(file.path)
        const manifestPath = file.path + '.manifest.json'
        if (existsSync(manifestPath)) unlinkSync(manifestPath)
        log.info(`[backup] Backup rimosso (eccesso): ${file.name}`)
      } catch (err) {
        log.warn(`[backup] Impossibile rimuovere backup obsoleto ${file.name}:`, err)
      }
    }
  }

  return backupPath
}
```

> Nota: i due backup fittizi del test hanno mtime quasi identici; l'ordinamento per mtime è stabile rispetto al numero finale di file mantenuti (3), che è ciò che il test verifica.

- [ ] **Step 4: Aggiorna i test esistenti che assumevano il limite fisso 5**

Cerca nel file i test della suite `backupAutomatico` esistente (riga ~261) che verificano il limite a 5. Se un test crea >5 backup e si aspetta 5, passa `retention: 5` esplicitamente alla chiamata `backupAutomatico({ retention: 5 })` per mantenerlo deterministico, oppure aggiorna l'asserzione coerentemente. Non lasciare asserzioni implicite sul vecchio `MAX_AUTO_BACKUPS`.

- [ ] **Step 5: Esegui tutta la suite backup**

Run: `npx vitest run tests/unit/backup.test.ts`
Expected: PASS (incluse le nuove suite e quelle aggiornate).

- [ ] **Step 6: Commit**

```bash
git add src/main/backup/backup-service.ts tests/unit/backup.test.ts
git commit -m "feat(backup): backupAutomatico parametrico su cartella e retention (B8)"
```

---

### Task 3: Scheduler periodico

**Files:**
- Create: `src/main/backup/backup-scheduler.ts`
- Test: `tests/unit/backup-scheduler.test.ts` (nuovo)

- [ ] **Step 1: Scrivi i test (helper puro + enable/disable)**

Crea `tests/unit/backup-scheduler.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const settingsMock = vi.hoisted(() => ({ value: { backup_periodic_enabled: false, backup_periodic_hours: 6 } }))

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))
vi.mock('../../src/main/settings/store', () => ({
  loadSettings: () => settingsMock.value
}))
const backupSpy = vi.fn().mockResolvedValue('/tmp/backup_x.db')
vi.mock('../../src/main/backup/backup-service', () => ({
  backupAutomatico: (...args: unknown[]) => backupSpy(...args)
}))

import { intervalloMs, initBackupScheduler, restartBackupScheduler, stopBackupScheduler } from '../../src/main/backup/backup-scheduler'

beforeEach(() => {
  vi.useFakeTimers()
  backupSpy.mockClear()
  settingsMock.value = { backup_periodic_enabled: false, backup_periodic_hours: 6 }
})
afterEach(() => {
  stopBackupScheduler()
  vi.useRealTimers()
})

describe('intervalloMs', () => {
  it('converte ore in ms', () => {
    expect(intervalloMs(6)).toBe(6 * 3600 * 1000)
  })
  it('applica un minimo difensivo (>= 1 ora)', () => {
    expect(intervalloMs(0)).toBe(3600 * 1000)
    expect(intervalloMs(-5)).toBe(3600 * 1000)
  })
})

describe('scheduler enable/disable', () => {
  it('non programma nulla se disabilitato', () => {
    settingsMock.value = { backup_periodic_enabled: false, backup_periodic_hours: 1 }
    initBackupScheduler()
    vi.advanceTimersByTime(3600 * 1000 * 2)
    expect(backupSpy).not.toHaveBeenCalled()
  })

  it('esegue un backup a ogni intervallo se abilitato', () => {
    settingsMock.value = { backup_periodic_enabled: true, backup_periodic_hours: 1 }
    initBackupScheduler()
    expect(backupSpy).not.toHaveBeenCalled() // nessuno scatto immediato
    vi.advanceTimersByTime(3600 * 1000)
    expect(backupSpy).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3600 * 1000)
    expect(backupSpy).toHaveBeenCalledTimes(2)
  })

  it('restart con disabilitato ferma il timer', () => {
    settingsMock.value = { backup_periodic_enabled: true, backup_periodic_hours: 1 }
    initBackupScheduler()
    settingsMock.value = { backup_periodic_enabled: false, backup_periodic_hours: 1 }
    restartBackupScheduler()
    vi.advanceTimersByTime(3600 * 1000 * 3)
    expect(backupSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `npx vitest run tests/unit/backup-scheduler.test.ts`
Expected: FAIL (modulo `backup-scheduler` inesistente).

- [ ] **Step 3: Implementa lo scheduler**

Crea `src/main/backup/backup-scheduler.ts`:

```typescript
import log from 'electron-log'
import { loadSettings } from '../settings/store'
import { backupAutomatico } from './backup-service'

/** Intervallo minimo difensivo: 1 ora. */
const MIN_HOURS = 1

let timer: ReturnType<typeof setInterval> | null = null

/**
 * Converte ore in millisecondi, con un minimo difensivo di 1 ora.
 * Funzione pura, testabile.
 */
export function intervalloMs(ore: number): number {
  const h = Number.isFinite(ore) && ore >= MIN_HOURS ? Math.floor(ore) : MIN_HOURS
  return h * 3600 * 1000
}

/** Ferma il timer periodico se attivo. */
export function stopBackupScheduler(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

/**
 * (Ri)avvia lo scheduler in base alle impostazioni correnti.
 * Idempotente: ferma sempre il timer precedente prima di valutare.
 * Il primo scatto avviene dopo N ore (nessun backup immediato).
 */
export function restartBackupScheduler(): void {
  stopBackupScheduler()
  const settings = loadSettings()
  if (!settings.backup_periodic_enabled) {
    log.info('[backup] Scheduler periodico disattivato')
    return
  }
  const ms = intervalloMs(settings.backup_periodic_hours)
  timer = setInterval(() => {
    backupAutomatico()
      .then((p) => log.info(`[backup] Backup periodico completato: ${p}`))
      .catch((err) => log.warn('[backup] Backup periodico fallito (non bloccante):', err))
  }, ms)
  log.info(`[backup] Scheduler periodico attivo: ogni ${ms / 3600000}h`)
}

/** Alias di avvio iniziale (chiamato dopo l'apertura del DB). */
export function initBackupScheduler(): void {
  restartBackupScheduler()
}
```

- [ ] **Step 4: Esegui e verifica il successo**

Run: `npx vitest run tests/unit/backup-scheduler.test.ts`
Expected: PASS (tutti i test).

- [ ] **Step 5: Commit**

```bash
git add src/main/backup/backup-scheduler.ts tests/unit/backup-scheduler.test.ts
git commit -m "feat(backup): scheduler backup periodico (init/restart, intervalloMs) (B8)"
```

---

### Task 4: Wiring scheduler nel main (db:unlock + settings:set)

**Files:**
- Modify: `src/main/ipc/handlers.ts` (import; `db:unlock` ~185; `settings:set` ~262)

- [ ] **Step 1: Aggiungi l'import dello scheduler**

In `src/main/ipc/handlers.ts`, accanto agli altri import di backup (riga ~5):

```typescript
import { initBackupScheduler, restartBackupScheduler } from '../backup/backup-scheduler'
```

- [ ] **Step 2: Avvia lo scheduler dopo l'unlock**

In `db:unlock`, dopo `void syncOnOpen().catch(...)` (riga ~185), aggiungi:

```typescript
        void syncOnOpen().catch((err) => log.warn('[sync] open check fallito:', err))
        initBackupScheduler()
```

- [ ] **Step 3: Riavvia lo scheduler dopo il salvataggio impostazioni**

In `settings:set`, dopo `saveSettings(updated)` (riga ~262), aggiungi:

```typescript
        saveSettings(updated)
        // Le impostazioni di backup periodico possono essere cambiate: riallinea il timer.
        restartBackupScheduler()
```

> Nota: anche il primo avvio dell'app (creazione DB, handler `db:init`/setup) apre il DB; se esiste un handler di inizializzazione separato che non passa da `db:unlock`, aggiungi `initBackupScheduler()` anche lì. Verifica con: `grep -n "openDatabase(" src/main/ipc/handlers.ts` e aggancia lo scheduler dopo ogni apertura riuscita del DB. Non duplicare: `initBackupScheduler` è idempotente.

- [ ] **Step 4: Verifica typecheck + build**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/handlers.ts
git commit -m "feat(backup): avvia/riavvia scheduler a db:unlock e settings:set (B8)"
```

---

### Task 5: `dialog:showOpenDialog` con selezione cartella

**Files:**
- Modify: `src/main/ipc/handlers.ts:937-958` (handler)
- Modify: `src/preload/index.ts:292-299` (bridge)
- Modify: `src/types/shared.ts:543-548` e `src/renderer/src/types/api.d.ts:~441` (tipo)

- [ ] **Step 1: Estendi il tipo in shared.ts**

In `src/types/shared.ts`, sostituisci la firma `dialog.showOpenDialog`:

```typescript
  dialog: {
    showOpenDialog: (options?: {
      title?: string
      filters?: { name: string; extensions: string[] }[]
      properties?: Array<'openFile' | 'openDirectory'>
    }) => Promise<{ canceled: boolean; filePaths: string[] }>
  }
```

- [ ] **Step 2: Rispecchia in api.d.ts**

In `src/renderer/src/types/api.d.ts` (riga ~441), applica la stessa modifica (aggiungi `properties?: Array<'openFile' | 'openDirectory'>`).

- [ ] **Step 3: Aggiorna il bridge preload**

In `src/preload/index.ts` (riga ~293):

```typescript
  dialog: {
    showOpenDialog(options?: {
      title?: string
      filters?: { name: string; extensions: string[] }[]
      properties?: Array<'openFile' | 'openDirectory'>
    }): Promise<{ canceled: boolean; filePaths: string[] }> {
      return ipcRenderer.invoke('dialog:showOpenDialog', options)
    }
  },
```

- [ ] **Step 4: Aggiorna l'handler IPC**

In `src/main/ipc/handlers.ts` (riga ~937), sostituisci il corpo del handler `dialog:showOpenDialog`:

```typescript
  ipcMain.handle(
    'dialog:showOpenDialog',
    async (
      event,
      options?: {
        title?: string
        filters?: { name: string; extensions: string[] }[]
        properties?: Array<'openFile' | 'openDirectory'>
      }
    ): Promise<{ canceled: boolean; filePaths: string[] }> => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender)
        const properties = options?.properties ?? ['openFile']
        const isDirectory = properties.includes('openDirectory')
        const dialogOptions: Electron.OpenDialogOptions = {
          title: options?.title,
          properties,
          // I filtri si applicano solo alla selezione di file
          ...(isDirectory
            ? {}
            : { filters: options?.filters ?? [{ name: 'Database', extensions: ['db'] }] })
        }
        const result = win
          ? await dialog.showOpenDialog(win, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions)
        return { canceled: result.canceled, filePaths: result.filePaths }
      } catch (err) {
        log.error('[ipc] dialog:showOpenDialog errore:', err)
        throw err instanceof Error ? err : new Error('Errore apertura finestra di selezione file')
      }
    }
  )
```

- [ ] **Step 5: Verifica typecheck**

Run: `npm run typecheck`
Expected: nessun errore. Verifica anche che `RestoreDialog.tsx` (chiamante esistente senza `properties`) resti valido (il campo è opzionale).

- [ ] **Step 6: Commit**

```bash
git add src/types/shared.ts src/renderer/src/types/api.d.ts src/preload/index.ts src/main/ipc/handlers.ts
git commit -m "feat(ipc): showOpenDialog supporta selezione cartella (openDirectory) (B8)"
```

---

### Task 6: i18n — stringhe nuove (IT/EN)

**Files:**
- Modify: `src/renderer/src/i18n/locales/it.json` (oggetto `backup`)
- Modify: `src/renderer/src/i18n/locales/en.json` (oggetto `backup`)

- [ ] **Step 1: Aggiungi le chiavi IT**

In `it.json`, dentro l'oggetto `"backup"`, aggiungi:

```json
    "cartella_label": "Cartella backup",
    "cartella_sfoglia": "Sfoglia…",
    "cartella_help": "Lascia vuoto per usare la cartella predefinita dell'applicazione.",
    "cartella_predefinita": "(cartella predefinita)",
    "periodico_label": "Backup periodico mentre l'app è aperta",
    "periodico_ogni": "ogni",
    "periodico_ore": "ore",
    "retention_label": "Conserva gli ultimi backup",
    "retention_unita": "backup"
```

- [ ] **Step 2: Aggiungi le chiavi EN**

In `en.json`, dentro `"backup"`:

```json
    "cartella_label": "Backup folder",
    "cartella_sfoglia": "Browse…",
    "cartella_help": "Leave empty to use the application's default folder.",
    "cartella_predefinita": "(default folder)",
    "periodico_label": "Periodic backup while the app is open",
    "periodico_ogni": "every",
    "periodico_ore": "hours",
    "retention_label": "Keep the latest backups",
    "retention_unita": "backups"
```

- [ ] **Step 3: Verifica parità chiavi**

Run: `node -e "const it=require('./src/renderer/src/i18n/locales/it.json');const en=require('./src/renderer/src/i18n/locales/en.json');const f=o=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?f(v).map(s=>k+'.'+s):[k]);const a=new Set(f(it)),b=new Set(f(en));const only=(x,y)=>[...x].filter(k=>!y.has(k));console.log('solo IT:',only(a,b));console.log('solo EN:',only(b,a));"`
Expected: `solo IT: []` e `solo EN: []`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(i18n): stringhe configurazione backup locale (B8)"
```

---

### Task 7: UI — sezione Backup locale in SettingsPage

**Files:**
- Modify: `src/renderer/src/pages/SettingsPage.tsx` (interfaccia form ~91; initial state ~165; load ~226; save payload ~500; JSX backup ~1016-1037; nuovo handler "Sfoglia")

- [ ] **Step 1: Estendi lo stato del form**

Nell'interfaccia del form (riga ~91, dove c'è `backup_on_close: boolean`), aggiungi:

```typescript
  backup_on_close: boolean
  backup_dir: string
  backup_periodic_enabled: boolean
  backup_periodic_hours: number
  backup_retention: number
```

Nello stato iniziale `useState` (riga ~165, dopo `backup_on_close: true,`):

```typescript
    backup_on_close: true,
    backup_dir: '',
    backup_periodic_enabled: false,
    backup_periodic_hours: 6,
    backup_retention: 10,
```

Nel caricamento da settings (riga ~226, dopo `backup_on_close: s.backup_on_close ?? true,`):

```typescript
          backup_on_close: s.backup_on_close ?? true,
          backup_dir: s.backup_dir ?? '',
          backup_periodic_enabled: s.backup_periodic_enabled ?? false,
          backup_periodic_hours: s.backup_periodic_hours ?? 6,
          backup_retention: s.backup_retention ?? 10,
```

Nel payload di salvataggio (riga ~500, dove c'è `backup_on_close: form.backup_on_close,`):

```typescript
        backup_on_close: form.backup_on_close,
        backup_dir: form.backup_dir,
        backup_periodic_enabled: form.backup_periodic_enabled,
        backup_periodic_hours: form.backup_periodic_hours,
        backup_retention: form.backup_retention,
```

- [ ] **Step 2: Aggiungi l'handler "Sfoglia cartella"**

Accanto a `handleBackupNow` (riga ~529), aggiungi:

```typescript
  async function handleSfogliaCartella(): Promise<void> {
    const res = await window.api.dialog.showOpenDialog({
      title: t('backup.cartella_label'),
      properties: ['openDirectory'],
    })
    if (!res.canceled && res.filePaths.length > 0) {
      setForm((prev) => ({ ...prev, backup_dir: res.filePaths[0] }))
    }
  }
```

- [ ] **Step 3: Aggiungi i controlli UI nella sezione "Backup locale"**

In `src/renderer/src/pages/SettingsPage.tsx`, dentro il blocco "Backup locale" (riga ~1016), subito **prima** del checkbox `backup_on_close` (riga ~1026), inserisci il selettore cartella:

```tsx
            {/* Cartella di destinazione */}
            <div className="mb-4">
              <label
                htmlFor="settings-backup-dir"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                {t('backup.cartella_label')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="settings-backup-dir"
                  type="text"
                  readOnly
                  value={form.backup_dir}
                  placeholder={t('backup.cartella_predefinita')}
                  className="block flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => { void handleSfogliaCartella() }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                >
                  {t('backup.cartella_sfoglia')}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {t('backup.cartella_help')}
              </p>
            </div>
```

Poi, **dopo** il checkbox `backup_on_close` (dopo la riga ~1036, prima del blocco "Feedback backup"), inserisci backup periodico e retention:

```tsx
            {/* Backup periodico */}
            <label className="flex items-center gap-3 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.backup_periodic_enabled}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, backup_periodic_enabled: e.target.checked }))
                }
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 focus:ring-2 cursor-pointer"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 select-none">
                {t('backup.periodico_label')}
              </span>
            </label>
            {form.backup_periodic_enabled && (
              <div className="flex items-center gap-2 mb-4 ml-7">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t('backup.periodico_ogni')}
                </span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  step={1}
                  value={form.backup_periodic_hours}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      backup_periodic_hours: Math.min(168, Math.max(1, Number(e.target.value) || 1)),
                    }))
                  }
                  className="block w-24 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t('backup.periodico_ore')}
                </span>
              </div>
            )}

            {/* Retention */}
            <div className="flex items-center gap-2 mb-4">
              <label
                htmlFor="settings-backup-retention"
                className="text-sm text-gray-700 dark:text-gray-300"
              >
                {t('backup.retention_label')}
              </label>
              <input
                id="settings-backup-retention"
                type="number"
                min={1}
                max={100}
                step={1}
                value={form.backup_retention}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    backup_retention: Math.min(100, Math.max(1, Number(e.target.value) || 1)),
                  }))
                }
                className="block w-24 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t('backup.retention_unita')}
              </span>
            </div>
```

- [ ] **Step 4: Verifica typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: nessun errore, 0 warning. Verifica in particolare che `window.api.dialog.showOpenDialog` accetti `properties` (Task 5) e che `s.backup_*` siano tipizzati (Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/SettingsPage.tsx
git commit -m "feat(backup): UI cartella, backup periodico e retention in Impostazioni (B8)"
```

---

### Task 8: Documentazione e verify finale

**Files:**
- Modify: `ANALYSYS.md` (voce B8)
- Modify: `OPEN-QUESTIONS.md` (nota verifica manuale timer)

- [ ] **Step 1: Marca B8 come chiusa in ANALYSYS.md**

Nella voce `### B8` (riga ~268), aggiungi in coda una riga di chiusura, es.:

```markdown
- **Stato (2026-06-14):** **Chiuso.** Cartella backup configurabile (con "Sfoglia…"), backup periodico opzionale ogni N ore (default 6) oltre al backup-on-close, retention configurabile (default 10). `backupAutomatico` parametrico su cartella+retention; nuovo `backup-scheduler` (init a `db:unlock`, restart a `settings:set`). Vedi `docs/superpowers/specs/2026-06-14-b8-backup-config-design.md`.
```

- [ ] **Step 2: Annota la verifica manuale in OPEN-QUESTIONS.md**

Aggiungi una voce:

```markdown
- **[Da verificare]** B8 — Backup periodico (2026-06-14): il timer `setInterval` reale (scatto effettivo ogni N ore mentre l'app è aperta) non è coperto da unit test oltre alla logica (`intervalloMs`, enable/disable con fake timers). Verificare su build reale: (1) attivazione del periodico → backup creato dopo l'intervallo nella cartella configurata; (2) cambio cartella/intervallo da Impostazioni → effetto immediato (restart scheduler); (3) rotazione che mantiene esattamente N file.
```

- [ ] **Step 3: `npm run verify` finale**

Run: `npm run verify`
Expected: typecheck OK · lint 0 warning · test verdi (con i nuovi test) · build OK.

- [ ] **Step 4: Commit**

```bash
git add ANALYSYS.md OPEN-QUESTIONS.md
git commit -m "docs(backup): chiusura B8 + nota verifica manuale timer periodico"
```

---

## Self-Review

- **Spec coverage:** percorso configurabile (Task 1,5,7) ✓; frequenza = chiusura + periodico (Task 3,4,7) ✓; retention configurabile (Task 1,2,7) ✓; "Backup ora" usa cartella+retention (Task 2, l'IPC `backup:automatico` esistente ora legge i settings) ✓; default 6h/10 e nessuno scatto immediato (Task 3) ✓; manuali e automatici condividono la rotazione (Task 2) ✓; i18n IT/EN (Task 6) ✓; test (Task 1,2,3) ✓; docs (Task 8) ✓.
- **Placeholder scan:** nessun TBD/TODO; ogni step ha codice o comando concreto.
- **Type consistency:** `AppSettings` esteso con le stesse 4 chiavi in `shared.ts` e `api.d.ts`; `risolviCartellaBackup(backupDir, defaultDir)` usata coerentemente in service e test; `backupAutomatico(opts?: { dir?; retention? })` con la stessa firma in service, scheduler (chiamata senza args) e test; `intervalloMs(ore)` coerente; `dialog.showOpenDialog` con `properties` allineato in handler/preload/2 tipi/chiamante UI.
