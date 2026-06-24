# Recovery da migrazione fallita guidato dalla UI (B11) — Design

**Data:** 2026-06-20 · **Stato:** approvato in brainstorming, in attesa di review della spec scritta · **Origine:** rilievo B11 in `ANALYSYS.md`; decisione D13 in `docs/DECISIONS.md`; Gate F6 (`PHASES.md:58`).

## Contesto e problema

Al primo avvio dopo un aggiornamento dell'app, se le migrazioni dello schema falliscono, `openDatabase` lascia il DB **aperto allo schema pre-aggiornamento** (dati intatti) e l'handler `db:unlock` rilancia `MIGRATION_FAILED` (`handlers.ts`). Il renderer resta sulla schermata **Unlock** (`onReady()` non viene chiamato) mostrando solo un messaggio di errore (`unlock.migration_failed`). La procedura consigliata da D13 — «Impostazioni → Backup → Ripristina» — **non è raggiungibile** in questo stato, perché l'app non diventa mai "ready". Manca quindi un percorso di recupero guidato dalla UI.

Fatti verificati:
- Al `MIGRATION_FAILED` la password digitata è **già verificata corretta**: il fallimento avviene nella fase 2 (migrazioni), dopo la fase 1 (verifica chiave) che ha avuto successo.
- Esistono gli IPC `backup:verifica` e `backup:ripristina` (`{ backupPath, password }` → `ripristinaBackup` → `eseguiRipristino`), già usati da `RestoreDialog` in Impostazioni. **Non** esiste un IPC per elencare i backup locali.
- `eseguiRipristino` riapre il DB con `openDatabase`, che **riesegue le migrazioni**. Quindi ripristinare un backup pre-aggiornamento ri-tenta la stessa migrazione: il recovery risolve i fallimenti **transitori/da corruzione** (caso tipico del backup-on-close), ma non un bug deterministico nella migrazione.
- B8 ha reso configurabile la cartella di backup; `risolviCartellaBackup(settings.backup_dir, userData/backups)` risolve la cartella effettiva. I backup (auto e manuali) hanno prefisso `backup_` e un sidecar `.manifest.json` con `{ version, createdAt, appVersion, dbPath }`.

## Decisioni di dominio (prese in brainstorming)

1. **UX recovery:** lista dei backup locali (data + versione app, più recente in cima) con "Ripristina" per riga, più un fallback "Sfoglia file…" per backup esterni.
2. **Password:** riusata silenziosamente dalla schermata Unlock (è già verificata corretta); nessuna nuova richiesta.
3. **Scope:** solo backup **locali** (no Google Drive nel recovery — possibile follow-up).
4. **Nuovo IPC:** `backup:listLocale` per elencare i backup locali.
5. **Limite dichiarato:** se il ripristino ri-fallisce (migrazione deterministicamente rotta), messaggio chiaro che invita ad aggiornare l'app / contattare il supporto.

## Progettazione per componente

### 1. Backend — `src/main/backup/backup-service.ts`
- Nuova `listBackupLocali(): BackupLocaleInfo[]`:
  - cartella = `risolviCartellaBackup(loadSettings().backup_dir, join(app.getPath('userData'), 'backups'))`;
  - se la cartella non esiste → `[]`;
  - elenca i file `backup_*.db`; per ciascuno legge il sidecar `<file>.manifest.json` se presente (`createdAt`, `appVersion`, `version`); se assente/illeggibile, usa `statSync(file).mtime` come `createdAt`, `appVersion=''`, `version=0`;
  - ordina per `createdAt` **decrescente** (più recente in cima);
  - ritorna `BackupLocaleInfo[]`.

### 2. Tipo — `src/types/shared.ts` (+ mirror `src/renderer/src/types/api.d.ts`)
```typescript
export interface BackupLocaleInfo {
  path: string
  createdAt: string   // ISO datetime
  appVersion: string
  version: number     // user_version dello schema al backup
}
```

### 3. IPC — `src/main/ipc/handlers.ts` + preload + tipo `ElectronAPI`
- Handler `backup:listLocale` (nessun parametro) → `return listBackupLocali()`; try/catch con log come gli altri handler backup.
- `src/preload/index.ts`: `backup.listLocale(): Promise<BackupLocaleInfo[]>` → `ipcRenderer.invoke('backup:listLocale')`.
- `ElectronAPI.backup` in `shared.ts` e `api.d.ts`: aggiungere `listLocale: () => Promise<BackupLocaleInfo[]>`.

### 4. UI — `src/renderer/src/pages/Unlock.tsx`
- Nuovo sotto-stato di recovery attivato quando `db.unlock` fallisce con `MIGRATION_FAILED`.
- Al passaggio in recovery: chiama `window.api.backup.listLocale()` e memorizza la lista (gestendo loading/errore).
- Render del pannello recovery (sostituisce/estende il box errore):
  - titolo + spiegazione (dati non persi) + **avviso sul limite** (`unlock.recovery_limite`);
  - se la lista ha elementi: per ciascuno una riga con data formattata `gg/mm/aaaa hh:mm` (Intl, locale it) + versione app + pulsante **Ripristina**;
  - **"Sfoglia file…"**: `window.api.dialog.showOpenDialog({ title, properties: ['openFile'], filters: [{ name: 'Database', extensions: ['db'] }] })`; se non annullato, usa `filePaths[0]`;
  - se la lista è vuota: messaggio "nessun backup locale trovato" + solo Sfoglia.
- **Ripristino** (riga o file scelto): `await window.api.backup.ripristina({ backupPath, password })` con la `password` già nello stato del componente; on success → `onReady()`; on error → mostra messaggio (`unlock.recovery_errore`) e resta nel pannello (l'utente può scegliere un altro backup).
- Stato di "ripristino in corso" che disabilita i pulsanti.
- Nuove stringhe i18n IT/EN (titolo, spiegazione, limite, label Ripristina/Sfoglia, riga "{{data}} · v{{app}}", lista vuota, errore).

## Test (Vitest)
- `listBackupLocali` (estende `tests/unit/backup.test.ts`, che già mocka `electron`/`app.getPath`):
  - crea alcuni `backup_*.db` con manifest (date diverse) → ritorna ordinati dal più recente, con `createdAt`/`appVersion`/`version` dai manifest;
  - file `backup_*.db` **senza** manifest → incluso con fallback su `mtime`;
  - file non-backup (es. `altro.db`) → escluso;
  - cartella inesistente → `[]`.
- La UI di Unlock non è unit-testabile (niente DOM/component harness, coerente con WP1–WP5): copertura via `npm run verify` verde + **verifica manuale** documentata.

## Fuori scope (confermato)
- Restore da **Google Drive** dal recovery (richiede connessione/OAuth).
- Modifiche a `eseguiRipristino` / al re-run delle migrazioni in restore (resta invariato; il limite è gestito col messaggio).
- Backup preventivo pre-migrazione automatico (escluso da D13).

## Impatti trasversali
- Chiude B11; aggiorna `ANALYSYS.md` e annota in `OPEN-QUESTIONS.md` la verifica manuale del flusso recovery (non riproducibile in dev: richiede un fallimento di migrazione reale + SQLCipher) e il limite del re-run.
- Stringhe nuove esternalizzate (IT/EN allineate).
- DoD: `npm run verify` verde; test unit per `listBackupLocali`.
- Sicurezza Electron invariata: nuovo IPC di sola lettura via preload; la password resta nel renderer solo il tempo della sessione di unlock (come già avviene), passata al main via l'IPC `backup:ripristina` esistente.
