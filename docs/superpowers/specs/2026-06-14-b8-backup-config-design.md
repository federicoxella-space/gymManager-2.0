# Configurazione backup locale (B8) — Design

**Data:** 2026-06-14 · **Stato:** approvato in brainstorming, in attesa di review della spec scritta · **Origine:** rilievo B8 in `ANALYSYS.md` (configurazione backup: percorso locale e frequenza non configurabili). La parte Drive di B8 è già coperta dalla feature Sync/backup Drive; questo spec copre il **residuo locale**.

## Contesto e problema

Oggi il backup locale è rigido:
- "Backup ora" (`SettingsPage` → IPC `backup:automatico`) e il backup-on-close scrivono entrambi nella cartella **fissa** `userData/backups` (`backup-service.ts:88`), con rotazione fissa a **5** file (`MAX_AUTO_BACKUPS`).
- L'unica configurazione esposta è il toggle booleano `backup_on_close`.
- L'IPC `backup:locale(path)` esiste ma **non è cablato** in UI.

`FUNZIONALITA.md:56` richiede: «Backup: **percorso locale**; **frequenza automatica configurabile** (default: a ogni chiusura dell'app) + backup manuale on-demand». Mancano quindi: percorso locale scegliibile, frequenza automatica configurabile, e l'uso del percorso scelto per "Backup ora".

## Decisioni di dominio (prese in brainstorming)

1. **Frequenza:** mantieni il toggle «backup alla chiusura» **e** aggiungi un **timer periodico** opzionale che esegue un backup ogni N ore mentre l'app è aperta. (Scartati: selettore a scelte discrete; solo-percorso senza frequenza.)
2. **Percorso:** **un'unica cartella configurabile**, usata da tutti i backup (chiusura, periodico, "Backup ora"). Se vuota → fallback alla cartella predefinita `userData/backups`. (Scartati: dialog "salva con nome" per il manuale; override del solo manuale.)
3. **Conservazione:** **numero massimo configurabile** "Conserva ultimi N backup" (default 10), rotazione automatica dei più vecchi. I backup manuali ("Backup ora") **rientrano nella stessa rotazione** (stesso prefisso file). (Scartati: manuali protetti dalla rotazione; fisso a 5.)
4. **Default confermati:** intervallo periodico **6 ore**; retention **10**; il primo scatto periodico avviene **dopo** N ore dall'avvio (non immediatamente — la chiusura copre il resto).

## Approccio

Estensione locale del backend di backup esistente. Tre pezzi: nuove chiavi nelle impostazioni; il servizio di backup reso **parametrico** su cartella + retention; uno **scheduler** nel processo main per il timer periodico. UI in `SettingsPage` per esporre cartella, frequenza e retention. Nessuna rete, nessuna cifratura aggiuntiva (il file è già SQLCipher).

## Progettazione per componente

### 1. Modello impostazioni

Nuove chiavi in `app_settings` e nel tipo `AppSettings` (tre copie da allineare: `src/types/shared.ts`, `src/renderer/src/types/api.d.ts`, default in `src/main/settings/store.ts`):

| Chiave | Tipo | Default | Significato |
|---|---|---|---|
| `backup_dir` | string | `''` | cartella di destinazione; vuoto = `userData/backups` |
| `backup_on_close` | boolean | `true` | *(esistente)* backup alla chiusura |
| `backup_periodic_enabled` | boolean | `false` | abilita il timer periodico |
| `backup_periodic_hours` | number | `6` | intervallo in ore (range 1–168) |
| `backup_retention` | number | `10` | numero di backup da conservare (range 1–100) |

- Coercizione/serializzazione in `applyAppSettingsToDb` (e lettura in `loadSettings`/`store.ts`) coerente con le chiavi esistenti (i numeri come stringhe, i boolean come `'true'`/`'false'`).
- Validazione dei range lato UI (clamp) come per `expiry_warning_days_*`.

### 2. Servizio di backup (`src/main/backup/backup-service.ts`)

- `risolviCartellaBackup(backupDir: string, defaultDir: string): string` — **puro**: ritorna `backupDir.trim()` se non vuoto, altrimenti `defaultDir`. Testabile senza filesystem.
- `backupAutomatico(opts?: { dir?: string; retention?: number }): Promise<string>` — se `opts` non fornisce i valori, li legge da `loadSettings()` (cartella via `risolviCartellaBackup`, retention via `backup_retention`). Scrive `backup_YYYYMMDD_HHMMSS.db` + `.manifest.json` nella cartella risolta; ruota mantenendo gli ultimi `retention` file con prefisso `backup_` (manuali e automatici condividono la rotazione). La costante `MAX_AUTO_BACKUPS` viene sostituita dal parametro `retention` (default 10 se non risolvibile).
- `backupLocale(destinazionePath)` resta invariato (copia diretta verso un percorso esplicito, usato internamente).
- "Backup ora" continua a invocare l'IPC `backup:automatico` → ora scrive nella cartella configurata con la retention configurata.

### 3. Scheduler periodico (`src/main/backup/backup-scheduler.ts`, nuovo)

- `intervalloMs(ore: number): number` — **puro**: `ore * 3600 * 1000` con clamp difensivo del minimo.
- `initBackupScheduler(): void` / `restartBackupScheduler(): void` — leggono le impostazioni; se `backup_periodic_enabled`, impostano `setInterval(() => backupAutomatico(), intervalloMs(ore))`; altrimenti azzerano l'eventuale timer esistente. Idempotenti (cancellano il timer precedente prima di crearne uno nuovo). Il primo scatto avviene dopo N ore (nessun backup immediato).
- **Avvio:** chiamato dopo l'apertura del DB (`db:unlock` in `src/main/index.ts`, accanto a `syncOnOpen`).
- **Riavvio:** l'handler IPC di salvataggio impostazioni chiama `restartBackupScheduler()` dopo aver persistito, così un cambio di `backup_periodic_enabled`/`backup_periodic_hours` ha effetto immediato.
- Il backup-on-close in `index.ts` resta invariato (eredita cartella + retention dal servizio parametrico).
- Errori del timer: best-effort e loggati (come il backup-on-close), mai bloccanti.

### 4. UI (`src/renderer/src/pages/SettingsPage.tsx`, sezione "Backup locale")

- Campo **Cartella backup** (input di sola lettura) + pulsante **"Sfoglia…"** → `window.api.dialog.showOpenDialog({ properties: ['openDirectory'] })`; il path scelto popola `backup_dir`. Testo d'aiuto: vuoto = cartella predefinita dell'app.
- Checkbox **"Backup alla chiusura"** (esistente, `backup_on_close`).
- Checkbox **"Backup periodico"** (`backup_periodic_enabled`) + input numerico **ore** (`backup_periodic_hours`, visibile/abilitato solo se il checkbox è attivo).
- Input numerico **"Conserva ultimi N backup"** (`backup_retention`).
- Tutti i campi confluiscono nello stato `form` e nel salvataggio impostazioni esistente; nessun nuovo IPC oltre al riavvio interno dello scheduler.
- Stringhe nuove esternalizzate in i18n IT/EN (allineate).

### 5. Test (Vitest)

- `risolviCartellaBackup` — puro: vuoto/whitespace → default; valore → valore.
- `intervalloMs` — puro: conversione ore→ms; clamp del minimo.
- `backupAutomatico({ dir, retention })` — estende `tests/unit/backup.test.ts`: scrive nella `dir` passata; rotazione mantiene esattamente `retention` file (manuali inclusi, ordinati per mtime); manifest corretto.
- Coercizione settings: le nuove chiavi numeriche/boolean serializzate/lette correttamente (estende `settings-sync.test.ts`).
- Lo scheduler reale (timer) non è unit-testato oltre `intervalloMs`/enable-disable della logica; il funzionamento end-to-end del timer è verifica leggera (manuale/integrazione), documentata.

## Edge case & errori

- **Cartella inesistente/non scrivibile:** `backupLocale` già crea la dir con `mkdirSync(recursive)`; se la scrittura fallisce, "Backup ora" mostra l'errore esistente e gli automatici loggano senza bloccare.
- **`backup_dir` puntato a una cartella poi rimossa:** ricreata da `mkdirSync` al backup successivo; nessun crash.
- **Retention impostata a 1:** mantiene solo l'ultimo; comportamento atteso.
- **Cambio impostazioni mentre un backup è in corso:** lo scheduler riavviato cancella solo il timer; il backup in volo completa.
- **App chiusa prima del primo scatto periodico:** il backup-on-close (se attivo) copre comunque la chiusura.

## Fuori scope (confermato)

- Backup verso Google Drive (coperto dalla feature Sync/backup Drive esistente).
- Cifratura aggiuntiva del file di backup (è già SQLCipher).
- Backup incrementali, compressione, o naming personalizzato dei file.
- Protezione dei backup manuali dalla rotazione (scartata in brainstorming).

## Impatti trasversali

- Chiude il residuo locale di **B8**; aggiorna `ANALYSYS.md`/`OPEN-QUESTIONS.md`.
- Stringhe UI nuove esternalizzate in i18n (IT/EN allineate).
- DoD: `npm run verify` verde; test unit per la logica pura e la rotazione parametrica. Il timer periodico reale è verifica leggera documentata.
- Sicurezza Electron invariata (IPC solo via preload; il path cartella è scelto via dialog nativo).
