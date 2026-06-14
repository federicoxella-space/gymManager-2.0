# Sincronizzazione multi-dispositivo via Google Drive — Design

**Data:** 2026-06-14 · **Stato:** approvato in brainstorming, in attesa di review della spec scritta · **Origine:** necessità emersa durante B8–B11 (sync tra dispositivi sfruttando l'account Google e il backup su Drive).

## Contesto e problema

L'app è un gestionale desktop con DB **SQLite singolo file cifrato (SQLCipher)**. Esiste già un'integrazione Google Drive (`src/main/backup/drive-service.ts`, scope `drive.file`, OAuth desktop, token per-dispositivo) che fa backup **a file intero**: `backupSuDrive` carica l'intero DB come **nuovo file timestamped**, `ripristinaDaDrive` scarica e sovrascrive, `listBackupDrive` elenca.

Si vuole **sincronizzare i dati tra più dispositivi** dello stesso operatore tramite l'account Google. Poiché il DB è un singolo file cifrato, il sync è intrinsecamente **a livello di file intero** (non merge per-record): senza accorgimenti, due dispositivi che modificano causerebbero perdita di dati (last-writer-wins).

## Decisioni di dominio (prese in brainstorming)

1. **Modello d'uso:** mono-operatore, **sequenziale** (una macchina alla volta: chiudo su un PC, riapro sull'altro), MA con **polling** per rilevare modifiche fatte sull'altro dispositivo mentre un'istanza resta aperta (es. app aperta a casa mentre si lavora in palestra) → l'istanza "vecchia" non deve sovrascrivere ciecamente.
2. **Conflitto** (remoto avanzato rispetto al mio ultimo sync **e** ho modifiche locali non caricate): **blocca e chiedi** all'utente — 3 scelte: (a) ricarica dal remoto scartando le modifiche locali, (b) sovrascrivi il remoto con i dati locali, (c) salva una copia di conflitto. **Nessuna perdita silenziosa.**
3. **Struttura su Drive:** un **file di sync dedicato** (`gymmanager_sync.db`) sovrascritto in-place (stesso `fileId`), con versione tracciata via metadati Drive; i **backup timestamped** esistenti restano una funzione separata (storico ripristinabile).
4. **Policy all'apertura:** se il remoto è più recente e **non** ci sono modifiche locali → **download automatico silenzioso**; se ci sono modifiche locali → conflitto (blocca e chiedi).
5. **Policy durante l'uso (polling):** modifiche remote senza conflitto (locale pulito) → **banner non bloccante "Ricarica"** (nessuna ricarica a sorpresa); con modifiche locali → conflitto bloccante.

## Approccio (scelto: 1)

**Sync a file intero con guardia di versione ottimistica + polling.** Riusa il backend Drive esistente, aggiungendo: overwrite-in-place di un file stabile, lettura dei metadati di versione, un servizio di sync che orchestra i flussi e mantiene lo stato locale. (Scartati: sync manuale senza polling — non soddisfa il requisito; sync record-level/backend — overkill per mono-operatore.)

## Progettazione per componente

### 1. Modello su Drive
- File di sync dedicato `gymmanager_sync.db` nella cartella `GymManager Backup` (o cartella dedicata), creato una volta e **sovrascritto in-place** (PATCH sullo stesso `fileId`) a ogni upload. Drive aggiorna `headRevisionId`/`modifiedTime` ad ogni update → fungono da **token di versione**.
- È il DB SQLCipher **cifrato** (cifrato a riposo su Drive).
- I backup timestamped (`backupSuDrive`/`listBackupDrive`/`ripristinaDaDrive`) restano invariati come storico separato.

### 2. Token di versione & stato locale
- Sidecar locale `sync-state.json` in `userData`: `{ syncFileId: string | null, lastRemoteRevision: string | null, localDirty: boolean, lastSyncAt: string | null }`.
- `lastRemoteRevision` = `headRevisionId` (fallback `modifiedTime`) del file di sync all'ultimo download/upload riuscito.
- `localDirty` = `true` dopo qualunque operazione che modifica il DB; `false` dopo un upload riuscito.
  - **Meccanismo dirty:** flag impostato a valle delle IPC di scrittura (un punto centralizzato che marca `localDirty=true`), oppure euristica su `mtime`/`size` del file DB dopo un checkpoint WAL. Scelta esatta demandata al piano; requisito: deve diventare `true` su ogni mutazione e tornare `false` solo dopo upload riuscito.

### 3. Flussi
- **Apertura/unlock (post-unlock DB):** leggi metadati remoti del file di sync.
  - `remoteRevision == lastRemoteRevision` → usa il locale.
  - remoto più recente **e** `localDirty == false` → **download automatico** del file di sync, sostituzione del DB locale (ciclo close→overwrite→open, come il restore), aggiorna `lastRemoteRevision`.
  - remoto più recente **e** `localDirty == true` → **conflitto** (§4).
  - nessun file di sync remoto → vedi §6 (primo avvio).
- **Polling mentre aperto** (intervallo configurabile, default ~60s; trigger anche al focus della finestra):
  - rileggi metadati; se `remoteRevision != lastRemoteRevision`:
    - `localDirty == false` → **banner non bloccante** "Dati aggiornati su un altro dispositivo — Ricarica" (download su click, non automatico).
    - `localDirty == true` → **conflitto bloccante** (§4).
- **Upload** (alla chiusura app, su "Sincronizza ora", e — opzionale/configurabile — auto-upload periodico):
  - **concorrenza ottimistica**: prima dell'overwrite ri-verifica `remoteRevision == lastRemoteRevision`.
    - uguale → overwrite-in-place; aggiorna `lastRemoteRevision` con la nuova revisione; `localDirty=false`.
    - avanzato → **conflitto** (§4) (non sovrascrivere ciecamente).

### 4. Conflitto — blocca e chiedi
Dialog modale con 3 azioni:
- **(a) Ricarica dal remoto** — scarta le modifiche locali, scarica e apre il file di sync remoto, aggiorna `lastRemoteRevision`, `localDirty=false`.
- **(b) Sovrascrivi il remoto** — carica il locale forzando l'overwrite del file di sync (accetta la nuova revisione), `localDirty=false`.
- **(c) Salva copia di conflitto** — carica i dati locali come **file di conflitto separato** su Drive (es. `gymmanager_conflict_<iso>.db`) e/o copia locale; poi adotta il remoto come base (come (a)). La riconciliazione è manuale.

### 5. Password / cifratura
Entrambi i dispositivi devono usare la **stessa master password** (il file di sync è SQLCipher). Se il file scaricato non si apre con la password locale → errore chiaro (`SYNC_PASSWORD_MISMATCH`, "password diversa tra i dispositivi"), **senza** sovrascrivere il DB locale.

### 6. Primo avvio del sync (attivazione)
All'attivazione del sync in Impostazioni:
- se esiste già un file di sync remoto → chiedi: **adotta il remoto** (download) oppure **carica il locale** (overwrite remoto).
- se non esiste → crea il file di sync dal DB locale.

### 7. Componenti & UI
- **`drive-service.ts`** (estensione): `getOrCreateSyncFile()` (trova/crea il file stabile, ritorna `fileId`), `getSyncMetadata(fileId)` (ritorna `headRevisionId`/`modifiedTime`/`size`), `uploadSync(fileId, path)` (PATCH overwrite-in-place, ritorna nuova revisione), `downloadSync(fileId, destPath)`. I metodi di backup timestamped restano invariati.
- **`sync-service.ts`** (nuovo): gestione `sync-state.json`, confronto versioni, orchestrazione dei flussi (apertura, polling-check, upload con guardia ottimistica, risoluzione conflitto), gestione `localDirty`.
- **IPC**: `sync:status` (stato corrente: abilitato, ultimo sync, dirty, revisione, eventuale conflitto pendente), `sync:now` (sync manuale), `sync:check` (poll on-demand, usato dal renderer/timer), `sync:resolve` (`{ scelta: 'remoto' | 'locale' | 'copia' }`), `sync:enable`/`sync:disable`, `sync:setPolling(intervalloSec)`. Tutte via preload/`ElectronAPI`.
- **UI (Settings → Sincronizzazione)**: toggle on/off, stato "ultimo sync / dispositivo aggiornato", pulsante "Sincronizza ora", selettore intervallo polling. **Banner non bloccante** globale "Dati aggiornati — Ricarica". **Dialog conflitto** con le 3 scelte.
- **Ricarica-mentre-aperto**: riusa il ciclo close→overwrite→open del restore (`eseguiRipristino`), seguito da refresh del renderer (ricaricare le viste correnti).

### 8. Edge case & errori
- **Offline / token assente/scaduto non rinnovabile** → sync in **pausa** con stato visibile; l'app funziona in locale; ritenta al ritorno online / prossimo poll.
- **Reload con un form aperto con modifiche pendenti** → avvisa prima di ricaricare (riusa il concetto di "modifiche non salvate" di C10) o posticipa la ricarica.
- **App chiusa bruscamente con `localDirty=true`** → al prossimo avvio, `localDirty` resta `true` (sidecar persistito) → comportamento conflitto/asimmetria gestito dai flussi §3.
- **Due upload ravvicinati dallo stesso dispositivo** → la guardia ottimistica usa la propria `lastRemoteRevision`, coerente.

### 9. Test (Vitest, dove unit-testabile)
- Confronto versioni e decisione di stato (usa-locale / download-auto / banner / conflitto) come **funzione pura** su input `{lastRemoteRevision, remoteRevision, localDirty}` → tabella di casi.
- Transizioni di `localDirty` (set su mutazione simulata, clear su upload simulato).
- Logica di risoluzione conflitto (mappa scelta→azione) con i metodi Drive **mockati**.
- `SYNC_PASSWORD_MISMATCH`: download di un file cifrato con password diversa → errore, nessun overwrite (riusa il probe SQLCipher dei test esistenti; gated come gli altri test cipher in dev).
- **Verifica manuale** (non unit-testabile): round-trip OAuth/rete reale tra due dispositivi (come per B3).

## Fuori scope (confermato)
- Sync a livello di record / merge automatico (multi-utente concorrente).
- Risoluzione automatica dei conflitti senza intervento utente.
- Sync di file diversi dal DB (es. impostazioni locali, token Drive restano per-dispositivo).

## Impatti trasversali
- Assorbe la parte Drive di **B8** (configurazione backup); B9/B10/B11 restano separati.
- Stringhe UI nuove esternalizzate in i18n (IT/EN allineate).
- DoD: `npm run verify` verde; test unit per la logica pura/orchestrazione (Drive mockato). OAuth/rete = verifica manuale documentata.
- Sicurezza Electron invariata (IPC solo via preload; nessun segreto nel renderer).
