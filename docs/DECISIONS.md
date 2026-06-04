# GymManager 2.0 — Registro delle decisioni

Decisioni prese in fase di analisi (con motivazione). Le voci marcate "Da verificare" richiedono conferma esterna.

- **D1 — Ricevute, non fatture; niente SDI.** L'app gestisce ricevute (pagamenti in contanti); i pagamenti elettronici restano nell'applicativo dell'Agenzia delle Entrate usato dall'utente. *Da verificare col commercialista*: eventuali obblighi di fatturazione elettronica.
- **D2 — Numerazione ricevute.** Progressiva per anno solare di emissione, riparte ogni anno; numero iniziale configurabile; assegnato al salvataggio e immutabile; annullamento mantiene il numero (no buchi).
- **D3 — Cancellazione cliente = anonimizzazione.** Si anonimizzano i dati personali nell'anagrafica attiva, conservando relazioni e ricevute. Concilia diritto alla cancellazione e conservazione fiscale. *Da verificare col commercialista/DPO* l'approccio di conservazione.
- **D4 — Singolo PC, dati locali.** Nessuna condivisione in rete in v1.
- **D5 — Backup = file DB cifrato.** Vale per locale e cloud; nessun secondo livello di cifratura aggiunto. Cloud su Google Drive con scope `drive.file`. Il restore richiede la master password con cui il backup è stato creato.
- **D6 — Master password con reset distruttivo.** Impostata al primo avvio; il reset cancella i dati (nessun recupero), con avvisi e doppia conferma.
- **D7 — Windows senza code signing in v1.** Si accettano gli avvisi SmartScreen iniziali.
- **D8 — Stack.** Electron + React + TypeScript + Tailwind; SQLite/SQLCipher; electron-updater; PDF via printToPDF; i18next; test Vitest+Playwright; Drive via googleapis.
- **D9 — Pagamenti.** Tracciati stato (pagato/da incassare) e metodo (contanti/POS/bonifico); importi IVA inclusa.
- **D10 — i18n da subito.** IT a runtime, struttura pronta per altre lingue.
