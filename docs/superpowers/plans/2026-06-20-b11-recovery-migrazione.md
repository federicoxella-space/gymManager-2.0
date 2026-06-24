# Recovery da migrazione fallita guidato dalla UI (B11) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando l'unlock fallisce con `MIGRATION_FAILED`, la schermata Unlock mostra un pannello di recovery con l'elenco dei backup locali (+ Sfoglia) per ripristinare e riprendere, riusando la password già inserita.

**Architecture:** Nuova `listBackupLocali(dir?)` nel backup-service + IPC `backup:listLocale`; la UI Unlock entra in modalità recovery al `MIGRATION_FAILED`, elenca i backup e ripristina via gli IPC esistenti `backup:verifica`/`backup:ripristina`. Solo backup locali; nessuna modifica alla logica di restore.

**Tech Stack:** Electron (main/preload/renderer), React + Tailwind, TypeScript strict, i18next (IT/EN), Vitest.

**Riferimenti:** spec `docs/superpowers/specs/2026-06-20-b11-recovery-migrazione-design.md`; D13 in `docs/DECISIONS.md`; invarianti in `CLAUDE.md` (stringhe esternalizzate, no `any`, IPC via preload, `npm run verify` verde).

---

## File Structure

- `src/types/shared.ts` — nuovo tipo `BackupLocaleInfo` + `ElectronAPI.backup.listLocale`.
- `src/renderer/src/types/api.d.ts` — mirror dei due.
- `src/main/backup/backup-service.ts` — `listBackupLocali(dir?)`.
- `src/main/ipc/handlers.ts` — handler `backup:listLocale`.
- `src/preload/index.ts` — bridge `backup.listLocale`.
- `src/renderer/src/pages/Unlock.tsx` — pannello recovery.
- `src/renderer/src/i18n/locales/it.json` + `en.json` — stringhe recovery.
- `tests/unit/backup.test.ts` — test `listBackupLocali`.
- `ANALYSYS.md` / `OPEN-QUESTIONS.md` — chiusura + verifica manuale.

---

### Task 1: Backend `listBackupLocali` + IPC + tipi

**Files:** `shared.ts`, `api.d.ts`, `backup-service.ts`, `handlers.ts`, `preload/index.ts`, `tests/unit/backup.test.ts`

- [ ] **Step 1: Scrivi i test (TDD)**

In `tests/unit/backup.test.ts`, aggiorna l'import per includere `listBackupLocali` (riga ~68):
```typescript
import { backupLocale, backupAutomatico, risolviCartellaBackup, listBackupLocali } from '../../src/main/backup/backup-service'
```
Aggiungi in fondo al file:
```typescript
describe('listBackupLocali', () => {
  it('elenca i backup con manifest, ordinati dal più recente', async () => {
    const dir = join(TEST_USER_DATA, 'list-bk')
    mkdirSync(dir, { recursive: true })
    // backup più vecchio
    writeFileSync(join(dir, 'backup_20260101_100000.db'), 'x')
    writeFileSync(
      join(dir, 'backup_20260101_100000.db.manifest.json'),
      JSON.stringify({ version: 6, createdAt: '2026-01-01T10:00:00.000Z', appVersion: '0.1.0', dbPath: 'x' })
    )
    // backup più recente
    writeFileSync(join(dir, 'backup_20260201_120000.db'), 'x')
    writeFileSync(
      join(dir, 'backup_20260201_120000.db.manifest.json'),
      JSON.stringify({ version: 7, createdAt: '2026-02-01T12:00:00.000Z', appVersion: '0.1.1', dbPath: 'x' })
    )

    const lista = await listBackupLocali(dir)
    expect(lista.length).toBe(2)
    expect(lista[0].createdAt).toBe('2026-02-01T12:00:00.000Z') // più recente in cima
    expect(lista[0].appVersion).toBe('0.1.1')
    expect(lista[0].version).toBe(7)
    expect(lista[1].appVersion).toBe('0.1.0')
  })

  it('include i backup senza manifest (fallback) ed esclude i file non-backup', async () => {
    const dir = join(TEST_USER_DATA, 'list-bk2')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'backup_20260301_090000.db'), 'x') // senza manifest
    writeFileSync(join(dir, 'altro.db'), 'x') // non-backup
    writeFileSync(join(dir, 'note.txt'), 'x') // non-backup

    const lista = await listBackupLocali(dir)
    expect(lista.length).toBe(1)
    expect(lista[0].path.endsWith('backup_20260301_090000.db')).toBe(true)
    expect(typeof lista[0].createdAt).toBe('string')
    expect(lista[0].createdAt.length).toBeGreaterThan(0)
  })

  it('ritorna [] se la cartella non esiste', async () => {
    const lista = await listBackupLocali(join(TEST_USER_DATA, 'inesistente-xyz'))
    expect(lista).toEqual([])
  })
})
```

- [ ] **Step 2: Esegui, verifica FAIL**

Run: `npx vitest run tests/unit/backup.test.ts -t "listBackupLocali"`
Expected: FAIL (`listBackupLocali` non esportata).

- [ ] **Step 3: Definisci il tipo `BackupLocaleInfo`**

In `src/types/shared.ts`, vicino a `BackupManifest`, aggiungi:
```typescript
export interface BackupLocaleInfo {
  /** Percorso completo del file .db di backup. */
  path: string
  /** ISO datetime di creazione (dal manifest; fallback mtime del file). */
  createdAt: string
  /** Versione app al backup (dal manifest; '' se assente). */
  appVersion: string
  /** user_version dello schema al backup (dal manifest; 0 se assente). */
  version: number
}
```
In `src/renderer/src/types/api.d.ts`, aggiungi lo stesso `interface BackupLocaleInfo` (mirror; mantieni l'ordine/posizione coerente con gli altri tipi del file).

- [ ] **Step 4: Implementa `listBackupLocali`**

In `src/main/backup/backup-service.ts`:
- Assicurati che l'import dei tipi includa `BackupLocaleInfo` se il file importa da `shared.ts` (altrimenti definisci il tipo di ritorno usando l'interfaccia importata). Importa `readFileSync` se non già presente (sono già importati `existsSync, readdirSync, statSync`; aggiungi `readFileSync` all'import `fs` se manca).
- Aggiungi:
```typescript
import type { BackupLocaleInfo } from '../../types/shared'

/**
 * Elenca i backup locali (`backup_*.db`) nella cartella configurata (o `dir` se passata),
 * leggendo i metadati dal sidecar `.manifest.json`. Ordina dal più recente.
 * Se la cartella non esiste ritorna [].
 */
export async function listBackupLocali(dir?: string): Promise<BackupLocaleInfo[]> {
  const defaultDir = join(app.getPath('userData'), 'backups')
  const targetDir = dir ?? risolviCartellaBackup(loadSettings().backup_dir, defaultDir)
  if (!existsSync(targetDir)) return []

  const files = readdirSync(targetDir).filter((f) => f.startsWith('backup_') && f.endsWith('.db'))
  const lista: BackupLocaleInfo[] = files.map((f) => {
    const fullPath = join(targetDir, f)
    const manifestPath = fullPath + '.manifest.json'
    let createdAt: string
    let appVersion = ''
    let version = 0
    if (existsSync(manifestPath)) {
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Partial<BackupManifest>
        createdAt = m.createdAt ?? new Date(statSync(fullPath).mtimeMs).toISOString()
        appVersion = m.appVersion ?? ''
        version = m.version ?? 0
      } catch {
        createdAt = new Date(statSync(fullPath).mtimeMs).toISOString()
      }
    } else {
      createdAt = new Date(statSync(fullPath).mtimeMs).toISOString()
    }
    return { path: fullPath, createdAt, appVersion, version }
  })

  lista.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) // più recente in cima
  return lista
}
```
> Nota: `app`, `join`, `existsSync`, `readdirSync`, `statSync`, `loadSettings`, `risolviCartellaBackup`, `BackupManifest` sono già nel file (verifica e aggiungi solo `readFileSync` e l'import di `BackupLocaleInfo`).

- [ ] **Step 5: Esegui, verifica PASS**

Run: `npx vitest run tests/unit/backup.test.ts -t "listBackupLocali"` → PASS (3 test).
Run: `npx vitest run tests/unit/backup.test.ts` → tutta la suite verde.

- [ ] **Step 6: IPC handler**

In `src/main/ipc/handlers.ts`:
- Aggiungi `listBackupLocali` all'import da `../backup/backup-service` (riga ~5: `import { backupLocale, backupAutomatico, listBackupLocali } from '../backup/backup-service'`).
- Aggiungi `BackupLocaleInfo` all'import dei tipi da `../../types/shared`.
- Vicino agli altri handler backup (dopo `backup:automatico`, ~riga 898), aggiungi:
```typescript
  ipcMain.handle('backup:listLocale', async (): Promise<BackupLocaleInfo[]> => {
    try {
      return await listBackupLocali()
    } catch (err) {
      log.error('[ipc] backup:listLocale errore:', err)
      throw err instanceof Error ? err : new Error('Errore nel recupero dei backup locali')
    }
  })
```

- [ ] **Step 7: Preload + tipi ElectronAPI**

`src/preload/index.ts`, nel namespace `backup` (dopo `automatico()`, ~riga 245):
```typescript
    listLocale(): Promise<BackupLocaleInfo[]> {
      return ipcRenderer.invoke('backup:listLocale')
    },
```
Aggiungi l'import del tipo `BackupLocaleInfo` in cima al preload (dove sono importati gli altri tipi da `../../types/shared`).

`src/types/shared.ts` `ElectronAPI.backup` (~riga 534, dopo `automatico`):
```typescript
    listLocale: () => Promise<BackupLocaleInfo[]>
```
`src/renderer/src/types/api.d.ts` `backup` (~riga 431, dopo `automatico`): stessa riga.

- [ ] **Step 8: Verifica**

Run: `npm run typecheck` → nessun errore.
Run: `npm run lint` → 0 warning.

- [ ] **Step 9: Commit**

```bash
git add src/types/shared.ts src/renderer/src/types/api.d.ts src/main/backup/backup-service.ts src/main/ipc/handlers.ts src/preload/index.ts tests/unit/backup.test.ts
git commit -m "feat(backup): listBackupLocali + IPC backup:listLocale per il recovery (B11)"
```

---

### Task 2: i18n stringhe recovery

**Files:** `src/renderer/src/i18n/locales/it.json`, `en.json`

- [ ] **Step 1: Aggiungi le chiavi IT**

In `it.json`, dentro l'oggetto `"unlock"` (dove c'è già `migration_failed`), aggiungi:
```json
    "recovery_titolo": "Aggiornamento del database non riuscito",
    "recovery_spiegazione": "I tuoi dati non sono persi. Puoi ripristinare un backup recente per riportare il database a uno stato funzionante.",
    "recovery_limite": "Se il ripristino non risolve il problema, l'aggiornamento potrebbe richiedere una versione corretta dell'app: contatta il supporto.",
    "recovery_lista_titolo": "Ripristina da un backup",
    "recovery_ripristina": "Ripristina",
    "recovery_sfoglia": "Sfoglia file…",
    "recovery_vuota": "Nessun backup locale trovato.",
    "recovery_in_corso": "Ripristino in corso…",
    "recovery_errore": "Ripristino non riuscito. Prova con un altro backup o contatta il supporto.",
    "recovery_riga_versione": "app {{versione}}"
```

- [ ] **Step 2: Aggiungi le chiavi EN**

In `en.json`, dentro `"unlock"`:
```json
    "recovery_titolo": "Database update failed",
    "recovery_spiegazione": "Your data is not lost. You can restore a recent backup to bring the database back to a working state.",
    "recovery_limite": "If restoring does not fix the problem, the update may require a corrected app version: contact support.",
    "recovery_lista_titolo": "Restore from a backup",
    "recovery_ripristina": "Restore",
    "recovery_sfoglia": "Browse file…",
    "recovery_vuota": "No local backup found.",
    "recovery_in_corso": "Restoring…",
    "recovery_errore": "Restore failed. Try another backup or contact support.",
    "recovery_riga_versione": "app {{versione}}"
```

- [ ] **Step 3: Verifica parità chiavi**

Run:
```
node -e "const it=require('./src/renderer/src/i18n/locales/it.json');const en=require('./src/renderer/src/i18n/locales/en.json');const f=o=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?f(v).map(s=>k+'.'+s):[k]);const a=new Set(f(it)),b=new Set(f(en));const only=(x,y)=>[...x].filter(k=>!y.has(k));console.log('solo IT:',only(a,b));console.log('solo EN:',only(b,a));"
```
Expected: `solo IT: []` e `solo EN: []`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(i18n): stringhe recovery migrazione (B11)"
```

---

### Task 3: UI — pannello recovery in Unlock.tsx

**Files:** `src/renderer/src/pages/Unlock.tsx`

- [ ] **Step 1: Stato e import**

In `src/renderer/src/pages/Unlock.tsx`:
- Importa il tipo: `import type { BackupLocaleInfo } from '../types/api'` (verifica il percorso corretto del file dei tipi renderer; se i tipi sono globali via `api.d.ts`, usa `BackupLocaleInfo` senza import esplicito — controlla come gli altri componenti referenziano i tipi `Electron`/`shared`).
- Estendi lo stato:
```typescript
  const [recovery, setRecovery] = useState(false)
  const [backups, setBackups] = useState<BackupLocaleInfo[]>([])
  const [restoring, setRestoring] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')
```

- [ ] **Step 2: Attiva il recovery al MIGRATION_FAILED**

Nel `catch` di `handleSubmit`, nel ramo `message.includes('MIGRATION_FAILED')`, oltre a impostare il messaggio, attiva il recovery e carica la lista:
```typescript
      } else if (message.includes('MIGRATION_FAILED')) {
        setErrorMessage(t('unlock.migration_failed'))
        setRecovery(true)
        try {
          const lista = await window.api.backup.listLocale()
          setBackups(lista)
        } catch {
          setBackups([])
        }
      } else {
```

- [ ] **Step 3: Funzioni di ripristino**

Aggiungi nel componente:
```typescript
  function formatData(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(d)
  }

  async function eseguiRipristino(backupPath: string): Promise<void> {
    setRecoveryError('')
    setRestoring(true)
    try {
      await window.api.backup.ripristina({ backupPath, password })
      onReady()
    } catch {
      setRecoveryError(t('unlock.recovery_errore'))
    } finally {
      setRestoring(false)
    }
  }

  async function handleSfoglia(): Promise<void> {
    const res = await window.api.dialog.showOpenDialog({
      title: t('unlock.recovery_lista_titolo'),
      properties: ['openFile'],
      filters: [{ name: 'Database', extensions: ['db'] }],
    })
    if (!res.canceled && res.filePaths.length > 0) {
      await eseguiRipristino(res.filePaths[0])
    }
  }
```

- [ ] **Step 4: Render del pannello recovery**

Sostituisci il blocco di rendering del form quando `recovery === true`. Dopo il blocco `{errorMessage && (...)}` (o in alternativa al form), aggiungi un ramo condizionale. Concretamente, racchiudi il `<form>` esistente in `{!recovery && (...)}` e aggiungi dopo:
```tsx
        {recovery && (
          <div data-testid="recovery-panel">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {t('unlock.recovery_titolo')}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {t('unlock.recovery_spiegazione')}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mb-4">
              {t('unlock.recovery_limite')}
            </p>

            {recoveryError && (
              <div
                role="alert"
                className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
              >
                {recoveryError}
              </div>
            )}

            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('unlock.recovery_lista_titolo')}
            </p>

            {backups.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {t('unlock.recovery_vuota')}
              </p>
            ) : (
              <ul className="mb-4 divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                {backups.map((b) => (
                  <li key={b.path} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {formatData(b.createdAt)}
                      {b.appVersion ? ` · ${t('unlock.recovery_riga_versione', { versione: b.appVersion })}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => { void eseguiRipristino(b.path) }}
                      disabled={restoring}
                      className="ml-3 shrink-0 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white text-sm font-medium py-1.5 px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
                    >
                      {restoring ? t('unlock.recovery_in_corso') : t('unlock.recovery_ripristina')}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={() => { void handleSfoglia() }}
              disabled={restoring}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium py-2.5 px-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
            >
              {t('unlock.recovery_sfoglia')}
            </button>
          </div>
        )}
```
Mantieni invariato il resto (header/logo). Quando `recovery` è attivo, il messaggio di errore generico del form non è necessario (il pannello ha il proprio testo); va bene racchiudere il `<form>` in `{!recovery && (...)}` così sparisce in modalità recovery.

- [ ] **Step 5: Verifica**

Run: `npm run typecheck` → nessun errore (verifica che `window.api.backup.listLocale` e `BackupLocaleInfo` siano tipizzati da Task 1).
Run: `npm run lint` → 0 warning.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/pages/Unlock.tsx
git commit -m "feat(unlock): pannello recovery con ripristino backup al MIGRATION_FAILED (B11)"
```

---

### Task 4: Docs + verify finale

**Files:** `ANALYSYS.md`, `OPEN-QUESTIONS.md`

- [ ] **Step 1: Chiudi B11 in ANALYSYS.md**

Nella voce `### B11` (~riga 295), aggiungi in coda:
```markdown
- **Stato (2026-06-20):** **Chiuso.** Alla ricezione di `MIGRATION_FAILED`, la schermata Unlock mostra un pannello di recovery con l'elenco dei backup locali (`backup:listLocale` → `listBackupLocali`) e un'opzione "Sfoglia file…"; il ripristino riusa `backup:ripristina` con la password già inserita. Solo backup locali. Vedi `docs/superpowers/specs/2026-06-20-b11-recovery-migrazione-design.md`.
```

- [ ] **Step 2: Annota la verifica manuale in OPEN-QUESTIONS.md**

Aggiungi una voce:
```markdown
- **[Da verificare]** B11 — Recovery migrazione (2026-06-20): il flusso UI (pannello recovery al `MIGRATION_FAILED`, lista backup, ripristino con password riusata) non è coperto da unit test oltre a `listBackupLocali` (no DOM/component harness). Verificare su build reale con un fallimento di migrazione simulato e SQLCipher attivo: (1) appare il pannello con la lista; (2) "Ripristina" su un backup valido riporta l'app operativa; (3) "Sfoglia file…" funziona; (4) backup con migrazione ancora rotta → messaggio d'errore chiaro, l'utente può scegliere un altro backup. **Limite noto:** `eseguiRipristino` riesegue le migrazioni, quindi il recovery non risolve un bug deterministico di migrazione (serve una versione corretta dell'app).
```

- [ ] **Step 3: `npm run verify` finale**

Run: `npm run verify`
Expected: typecheck OK · lint 0 warning · test verdi (inclusi i `listBackupLocali`) · build OK. Se fallisce, NON committare: riporta l'output.

- [ ] **Step 4: Commit**

```bash
git add ANALYSYS.md OPEN-QUESTIONS.md
git commit -m "docs(b11): chiusura recovery migrazione + nota verifica manuale"
```

---

## Self-Review

- **Spec coverage:** `listBackupLocali` + IPC + tipi (Task 1) ✓; UX lista + Sfoglia, password riusata, success→onReady, errore gestito (Task 3) ✓; avviso limite (Task 2+3) ✓; solo backup locali ✓; i18n IT/EN (Task 2) ✓; test backend + verifica manuale annotata (Task 1, Task 4) ✓; docs (Task 4) ✓.
- **Placeholder scan:** nessun TBD; ogni step ha codice o comando. Promemoria di verifica: il percorso d'import di `BackupLocaleInfo` nel renderer (Task 3 Step 1) e la posizione esatta dell'oggetto `unlock` negli JSON (Task 2) vanno confermati leggendo i file.
- **Type consistency:** `BackupLocaleInfo { path, createdAt, appVersion, version }` definito identico in `shared.ts` e `api.d.ts`; `listBackupLocali(dir?: string): Promise<BackupLocaleInfo[]>` usata con la stessa firma in service, IPC (`listBackupLocali()`), test (con `dir` esplicito); `backup.listLocale: () => Promise<BackupLocaleInfo[]>` allineato in preload, `shared.ts`, `api.d.ts`; il ripristino usa l'IPC esistente `backup.ripristina({ backupPath, password })`.
