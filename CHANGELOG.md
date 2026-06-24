# Changelog

Tutte le modifiche rilevanti di GymManager 2.0. Formato ispirato a [Keep a Changelog](https://keepachangelog.com/it/1.1.0/); versionamento [SemVer](https://semver.org/lang/it/) (pre-1.0).

## [0.1.5] — 2026-06-25

### Aggiunto
- **"Emetti ricevuta" per riga** nel dettaglio cliente: sulle iscrizioni/abbonamenti attivi compare un pulsante che apre il form di emissione con quella voce **già preselezionata**, senza doverla cercare nella sezione Ricevute. Funziona **anche per le voci già "pagato"** (la ricevuta documenta il pagamento già registrato): il form generale continua però a elencare solo le voci da incassare.
- **Stato di pagamento negli abbonamenti**: la tabella Abbonamenti del dettaglio cliente ora mostra, accanto al prezzo, se la voce è "pagato" o "da incassare" (come già avviene per l'iscrizione).

### Corretto
- **Auto-update da repo privato**: il controllo aggiornamenti falliva con `404` su `releases.atom`. Su repository privati electron-updater seleziona il provider autenticato (API GitHub) **solo** se trova un token nella configurazione del provider; il solo `requestHeaders` non bastava. Ora il token (PAT read-only iniettato a build time) viene passato via `setFeedURL({ provider: 'github', private: true, token })`, così l'updater usa l'API autenticata invece del feed pubblico.
- **Messaggio d'errore aggiornamento non chiudibile**: il banner d'errore dell'updater (in basso) e il riquadro d'errore in Impostazioni → Informazioni app ora hanno un pulsante di chiusura (✕) per essere rimossi.
- **Sincronizzazione Drive che falliva in silenzio**: l'abilitazione inghiottiva gli errori (sync "abilitato" ma non funzionante, senza messaggio). Ora `enableSync` verifica che Drive sia connesso, fa rollback in caso di errore e **mostra il motivo** in Impostazioni → Sincronizzazione (messaggio chiudibile).

> **Nota:** le installazioni **0.1.4** non possono auto-aggiornarsi a 0.1.5 (contengono ancora l'updater difettoso): installare la 0.1.5 **manualmente** una volta; da lì in avanti l'auto-update funziona.

## [0.1.4] — 2026-06-20

Consolidamento post-F7: robustezza backend, funzionalità P1, accessibilità (WCAG 2.1), rifiniture UX e sincronizzazione multi-dispositivo. Raccoglie il lavoro WP1–WP5 e i rilievi B1–B12.

### Aggiunto
- **Sincronizzazione multi-dispositivo via Google Drive**: file di sync dedicato con guardia di versione ottimistica e polling; download automatico all'apertura se il locale è pulito, banner "Ricarica" non bloccante durante l'uso, e gestione conflitti "blocca e chiedi" con 3 scelte (ricarica / sovrascrivi / copia di conflitto). Password mismatch tra dispositivi segnalato senza perdita dati (`SYNC_PASSWORD_MISMATCH`).
- **Tutore come cliente registrato** (B7): il tutore di un minore è ora un cliente collegato via FK `tutore_id` (ricerca/selezione nel form); ricevuta intestata al tutore con indirizzo del tutore e `assistito_cf` del minore. Migrazione `007` (rimozione vecchi campi free-text `tutore_*`).
- **Configurazione backup locale** (B8): cartella di destinazione configurabile, backup periodico opzionale ogni N ore, retention configurabile, oltre al backup alla chiusura.
- **Recovery da migrazione fallita** (B11): alla schermata di accesso, in caso di `MIGRATION_FAILED`, pannello con elenco dei backup locali e "Sfoglia file…" per ripristinare riusando la password inserita.
- **Cambio master password** non distruttivo (B2, PRAGMA rekey) con UI dedicata.
- **Backup e ripristino su Google Drive** dall'app (B3).
- **Comune di nascita con autocompletamento e calcolo del codice fiscale** (B4, dataset `comuni-json`).
- **Emissione ricevuta contestuale** all'assegnazione di iscrizione/abbonamento (B1).
- **Selettore cliente** nella pagina Ricevute (B12) e ricerca per nome nelle tab del Catalogo (B12).
- **Rinnovo iscrizione atomico** via IPC dedicato (C12).
- Personalizzazione tema: derivazione dell'intera scala primaria 50–900 dal colore scelto (N5).

### Modificato
- **Dashboard**: la card "Incassi" degli Indicatori segue il selettore di periodo (B10); il drill-down "Certificati" porta ai certificati **da gestire** (in scadenza + scaduti) con card e lista coerenti (B9).
- **Accessibilità (WP5, WCAG 2.1)**: focus-trap e ripristino del focus nei modali, errori di validazione collegati ai campi, label associate e `aria-required`/`aria-invalid`, stati di caricamento con `role=status`, contrasto migliorato, navigazione da tastiera e `focus-visible` uniformi, tabelle con `scope`/`caption`.
- **UX**: messaggi di validazione specifici per campo e validazione client-side nel form cliente (C7/C8), conferma di scarto alla chiusura dei modali con modifiche non salvate (C10), scroll orizzontale sulle tabelle (C11), blocco/avviso se manca l'indirizzo dell'intestatario all'emissione (B6/C9), file picker nativo e conferma di successo nel ripristino (C6).
- Modifica delle date di iscrizioni/abbonamenti dalla UI (B12).

### Sicurezza
- Cifratura del DB con SQLCipher e gestione della master password in memoria; cambio password senza perdita dati.
- IPC esclusivamente via preload; nessun segreto nel renderer.

### Note
- Alcune funzionalità richiedono verifica manuale su build di produzione (rekey, Google Drive, sync multi-dispositivo, backup periodico, recovery migrazione): vedi `docs/VERIFICHE-MANUALI.md`.
- **Caveat migrazione 007 (B7):** i minori già presenti in DB rilasciati perdono il collegamento al tutore (rimozione dei vecchi campi free-text) e vanno **ri-collegati a mano** selezionando il cliente-tutore; le ricevute già emesse (snapshot) non cambiano.

## [0.1.3] e precedenti
Versioni di sviluppo iniziali (fasi F0–F7): impianto Electron + React + SQLCipher, anagrafica clienti, catalogo, iscrizioni/abbonamenti, ricevute, dashboard, backup locale e impianto auto-update.

[0.1.5]: https://github.com/federicoxella-space/gymManager-2.0/releases/tag/v0.1.5
[0.1.4]: https://github.com/federicoxella-space/gymManager-2.0/releases/tag/v0.1.4
