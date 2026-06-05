# GymManager 2.0 — Registro delle decisioni

Decisioni prese in fase di analisi (con motivazione). Le voci marcate "Da verificare" richiedono conferma esterna.

- **D1 — Ricevute, non fatture; niente SDI.** L'app gestisce ricevute (pagamenti in contanti); i pagamenti elettronici restano nell'applicativo dell'Agenzia delle Entrate usato dall'utente. *Da verificare col commercialista*: eventuali obblighi di fatturazione elettronica.
- **D2 — Numerazione ricevute.** Progressiva per anno solare di emissione, riparte ogni anno; numero iniziale configurabile; assegnato al salvataggio e immutabile; annullamento mantiene il numero (no buchi).
- **D3 — Cancellazione cliente = anonimizzazione.** Si anonimizzano i dati personali nell'anagrafica attiva, conservando relazioni e ricevute. Concilia diritto alla cancellazione e conservazione fiscale. *Da verificare col commercialista/DPO* l'approccio di conservazione.
- **D4 — Singolo PC, dati locali.** Nessuna condivisione in rete in v1.
- **D5 — Backup = file DB cifrato.** Vale per locale e cloud; nessun secondo livello di cifratura aggiunto. Cloud su Google Drive con scope `drive.file`. Il restore richiede la master password con cui il backup è stato creato.
- **D6 — Master password con reset distruttivo.** Impostata al primo avvio; il reset cancella i dati (nessun recupero), con avvisi e doppia conferma.
- **D7 — Windows senza code signing in v1.** Si accettano gli avvisi SmartScreen iniziali. Al primo lancio su Windows, SmartScreen può mostrare l'avviso "App non riconosciuta". L'utente deve fare clic su "Altre informazioni" → "Esegui comunque". La reputazione si costruisce nel tempo (più utenti eseguono l'app, meno avvisi vengono mostrati). In v1 nessun code signing (costo e complessità non giustificati per un'app single-user privata).
- **D8 — Stack.** Electron + React + TypeScript + Tailwind; SQLite/SQLCipher; electron-updater; PDF via printToPDF; i18next; test Vitest+Playwright; Drive via googleapis.
- **D9 — Pagamenti.** Tracciati stato (pagato/da incassare) e metodo (contanti/POS/bonifico); importi IVA inclusa.
- **D10 — i18n da subito.** IT a runtime, struttura pronta per altre lingue.

- **D11 — `verify` usa `build:electron`, non `build`.** Lo script `verify` esegue `electron-vite build` (compilazione sorgenti) ma non `electron-builder` (packaging installabile). Motivazione: il packaging richiede icone e risorse non ancora presenti (vedi BLOCKERS.md B4/B5) e impiega diversi minuti. La build Vite verifica la correttezza del codice; il packaging viene eseguito separatamente in fase di release.
- **D12 — `sandbox: false` nel BrowserWindow.** Il processo preload usa `require()` di Node.js per importare `ipcRenderer` da `electron` e moduli di `@electron-toolkit/preload`. Con `sandbox: true` questi require non sono disponibili nel preload. Il trade-off è accettabile perché `contextIsolation: true` isola il renderer da Node.js; il preload è trusted code del main process.

- **D13 — Recovery path in caso di migrazione fallita post-aggiornamento.** Se al primo avvio dopo un aggiornamento dell'app la migrazione dello schema DB fallisce, l'errore è separato da PASSWORD_WRONG: viene segnalato come MIGRATION_FAILED con un messaggio dedicato che invita l'utente a ripristinare da backup. Il DB rimane aperto con lo schema pre-aggiornamento (i dati non sono persi). La procedura consigliata: aprire Impostazioni → Backup → Ripristina da un backup recente. In assenza di backup, il recupero non è automatizzato (segnalato in BLOCKERS.md). Non viene eseguito un backup preventivo pre-migrazione automatico perché il backup automatico alla chiusura garantisce che esista sempre un backup recente se l'utente ha usato l'app normalmente.
