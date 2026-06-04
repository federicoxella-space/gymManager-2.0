# GymManager 2.0 — Fasi, Gate e Definition of Done

Per ogni fase: **DoD** = criteri verificabili di completamento; **Gate** = revisione `critic-reviewer` + test che devono passare. Non si passa alla fase successiva senza gate PASSATO. Eseguire il gate con `/gate <fase>`. Il dettaglio funzionale per sezione è in `docs/FUNZIONALITA.md`. «Verde» = `npm run verify` (typecheck + lint + test + build) che passa.

## F0 — Fondamenta
**Obiettivo**: scaffolding Electron+React+TS+Tailwind eseguibile su Windows; DB cifrato; migrazioni; i18n; tema; impostazioni.
**DoD**
- L'app compila ed esegue su Windows.
- DB cifrato con master password (KDF) impostata al primo avvio; reset password documentato.
- Framework di migrazioni attivo, con una migrazione di esempio applicata e reversibile.
- Scaffolding i18n (solo IT a runtime, stringhe esternalizzate); shell con tema/colori; store impostazioni.
- Tooling qualità: TypeScript strict, ESLint + Prettier; script npm `typecheck`, `lint`, `test`, `build` e `verify` (che li esegue in sequenza); lockfile committato e versioni pinnate.
- CI attiva (`.github/workflows/ci.yml`) che esegue le verifiche a ogni push.
**Gate**: `npm run verify` verde; test su apertura/chiusura DB cifrato e su migrazione avanti/indietro; cifratura e migrazioni verificate prima di scrivere dati di dominio.

## F1 — Clienti + certificato medico
**Obiettivo**: anagrafica clienti e tracciamento certificato medico.
**DoD**
- CRUD cliente con dati anagrafici e vista dettaglio.
- Certificato medico (tipo, scadenza) con stato derivato valido/in scadenza/scaduto.
- Procedura di anonimizzazione cliente progettata e implementata (preserva relazioni e ricevute).
**Gate**: unit su validazioni anagrafiche (incl. codice fiscale) e calcolo stato certificato; il reviewer verifica che l'anonimizzazione non rompa i vincoli referenziali/fiscali.

## F2 — Iscrizioni & abbonamenti (catalogo + associazioni + regole)
**Obiettivo**: cataloghi e associazioni cliente con le invarianti.
**DoD**
- CRUD tipi iscrizione/abbonamento; divieto di eliminazione se assegnati; invalidazione.
- Associazione cliente↔iscrizione (una sola attiva) e ↔abbonamenti (uno o più).
- Regola "abbonamento solo con iscrizione attiva"; segnalazione non bloccante se l'abbonamento supera la scadenza dell'iscrizione; modifica date; storico.
**Gate**: unit su tutte le invarianti e casi limite (iscrizione scaduta con abbonamenti attivi); il reviewer ripercorre gli scenari.

## F3 — Pagamenti & Ricevute (PDF)
**Obiettivo**: pagamenti e generazione ricevute.
**DoD**
- Stato pagamento (pagato/da incassare) e metodo (contanti/POS/bonifico).
- Ricevuta PDF con numerazione progressiva per anno della data di emissione (scelta dall'utente), numero iniziale configurabile, assegnazione al salvataggio e immutabilità sui re-download; **due copie per pagina**; ricevuta **multi-riga** da voci pagabili e **riga libera**; annullamento che mantiene il numero e riporta le voci coperte a «da incassare».
- Template con logo e dati attività; importi in € IVA inclusa.
**Gate**: unit sulla numerazione (reset annuale, numero iniziale, immutabilità, annullamento senza buchi); e2e "transazione → ricevuta salvata → re-download stesso numero"; il reviewer confronta il template con il riferimento.

## F4 — Dashboard
**Obiettivo**: pagina principale con i widget.
**DoD**
- I widget di `docs/FUNZIONALITA.md` (i due richiesti + concordati, incl. compleanni attivabile); selettore di periodo globale; finestre di scadenza dai parametri di configurazione; drill-down al click; widget mostra/nascondi dalla configurazione.
**Gate**: unit sui calcoli dei widget; il reviewer verifica la coerenza dei dati mostrati con lo stato del DB.

## F5 — Backup/Restore + Google Drive + sicurezza dati
**Obiettivo**: backup e restore robusti.
**DoD**
- Backup locale (file DB cifrato) e su Google Drive (scope `drive.file`); restore funzionante.
- Reset master password con cancellazione dati, avvisi e doppia conferma; vincoli documentati.
**Gate**: integration round-trip backup→restore (locale e Drive) con verifica integrità; il reviewer verifica che nessun dato in chiaro finisca su Drive.

## F6 — Auto-update (GitHub) + migrazioni in aggiornamento
**Obiettivo**: aggiornamento automatico sicuro per i dati.
**DoD**
- Auto-update da GitHub Releases; al primo avvio post-update le migrazioni si applicano sul DB locale.
- Avvisi SmartScreen documentati (niente code signing in v1).
**Gate**: test che simula update con cambio schema → dati migrati senza perdita; il reviewer verifica il percorso di ripristino in caso di migrazione fallita.

## F7 — Hardening, i18n, validazione finale, release
**Obiettivo**: chiusura qualità e pubblicazione.
**DoD**
- Copertura e2e dei flussi critici; checklist manuale eseguita.
- Aggiunta di una seconda lingua verificata come fattibile (a riprova dello scaffolding i18n).
- Pacchetto installabile e release pubblicata.
**Gate**: suite completa verde; il reviewer esegue un confronto finale specifica↔prodotto su tutte le caratteristiche e funzionalità.
