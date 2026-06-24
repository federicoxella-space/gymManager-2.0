# GymManager 2.0 — Piano di verifica manuale

Checklist guidata per le funzionalità **non riproducibili in dev/test** (richiedono una build di produzione con SQLCipher attivo, rete/OAuth reali, o più dispositivi). Le voci derivano dalle note `[Da verificare]` di `OPEN-QUESTIONS.md`. La logica pura e i repository sono già coperti dagli unit test (`npm run verify`); qui si verifica solo ciò che i test automatici non possono toccare.

**Come usarla:** eseguire su una **build di produzione/pacchettizzata** (non sul dev server: in dev il binario `better-sqlite3-multiple-ciphers` è SQLite senza cifratura attiva). Per ogni passo segnare l'esito in `Esito` (`OK` / `KO`) e annotare eventuali problemi in `Note`. Riportare i KO come issue collegando l'ID (es. `MV3.2`).

## Prerequisiti generali
- [ ] Build di produzione installata/avviata (SQLCipher attivo).
- [ ] Un **account Google di test** (per le voci Drive/Sync).
- [ ] Dove indicato, **due dispositivi** (o due installazioni separate) collegati allo stesso account Google.
- [ ] Alcuni dati di esempio nel DB (clienti, iscrizioni, abbonamenti, ricevute) per rendere i backup significativi.
- [ ] Un backup recente disponibile prima di test distruttivi (rekey/restore/reset).

---

## Riepilogo

| ID | Area | Origine | Esito |
|----|------|---------|-------|
| MV1 | Cambio master password (rekey) | WP3/B2 | ☐ |
| MV2 | Google Drive: backup / list / restore | WP3/B3 | ☐ |
| MV3 | Sync multi-dispositivo via Drive | Sync (2026-06-14) | ☐ |
| MV4 | Backup periodico (timer) e cartella configurabile | B8 | ☐ |
| MV5 | Recovery da migrazione fallita | B11 | ☐ |
| MV6 | Conferme di business (GDPR / SDI) | — | ☐ |
| MV7 | (Opzionale) Rifinitura test e2e `aria-disabled` | WP5/D8 | ☐ |

---

## MV1 — Cambio master password (rekey)
**Obiettivo:** il cambio password mantiene i dati e invalida la vecchia password.
**Precondizioni:** build di produzione; DB con dati; **backup recente** prima di iniziare.

| # | Passo | Atteso | Esito | Note |
|---|-------|--------|-------|------|
| 1.1 | Impostazioni → Sicurezza → cambia master password (vecchia → nuova). | Operazione conclusa senza errori. | ☐ | |
| 1.2 | Chiudi e riapri l'app; sblocca con la **nuova** password. | Accesso OK; tutti i dati presenti e integri. | ☐ | |
| 1.3 | Riavvia e prova a sbloccare con la **vecchia** password. | Rifiutata ("Password errata"). | ☐ | |

---

## MV2 — Google Drive: backup / list / restore
**Obiettivo:** round-trip completo del backup su Drive con account reale.
**Precondizioni:** account Google di test; rete attiva.

| # | Passo | Atteso | Esito | Note |
|---|-------|--------|-------|------|
| 2.1 | Impostazioni → Backup → connetti Google Drive (OAuth). | Connessione riuscita; stato "connesso". | ☐ | |
| 2.2 | Esegui "Backup su Drive". | Backup caricato; nessun errore; voce visibile nell'elenco backup Drive. | ☐ | |
| 2.3 | Apri l'elenco dei backup Drive. | Mostra il backup appena creato (data/nome) e **non** i file di sync/conflitto. | ☐ | |
| 2.4 | Ripristina dal backup Drive (con la password corretta). | DB ripristinato; dati coerenti col momento del backup. | ☐ | |
| 2.5 | Disconnetti Drive. | Stato "non connesso"; token rimosso. | ☐ | |

---

## MV3 — Sync multi-dispositivo via Drive
**Obiettivo:** sincronizzazione sequenziale tra due dispositivi con gestione conflitti.
**Precondizioni:** due dispositivi (A e B) con la **stessa master password** e lo stesso account Google.

| # | Passo | Atteso | Esito | Note |
|---|-------|--------|-------|------|
| 3.1 | Su A: abilita il Sync. | File di sync creato su Drive; stato sync visibile. | ☐ | |
| 3.2 | Su B: abilita il Sync. | B propone di **adottare il remoto**; dopo l'adozione, B mostra i dati di A. | ☐ | |
| 3.3 | Su A: modifica un dato e sincronizza; su B (aperto) attendi il polling o usa "Sincronizza ora". | Su B compare il banner "Ricarica"; alla ricarica B mostra la modifica di A. | ☐ | |
| 3.4 | Crea un **conflitto**: modifica su A **e** su B senza sincronizzare, poi sincronizza. | Dialog conflitto con 3 scelte (ricarica remoto / sovrascrivi remoto / copia di conflitto); nessuna perdita silenziosa. | ☐ | |
| 3.5 | Prova ognuna delle 3 scelte di conflitto (ripetendo lo scenario). | Comportamento coerente: (a) scarta locali, (b) sovrascrive remoto, (c) salva copia di conflitto su Drive e adotta il remoto. | ☐ | |
| 3.6 | Imposta una **password diversa** tra A e B e tenta il sync/adozione. | Errore `SYNC_PASSWORD_MISMATCH`; il DB locale **non** viene sovrascritto/perso. | ☐ | |
| 3.7 | Chiudi l'app con modifiche locali non sincronizzate. | Tentativo di upload alla chiusura (best-effort); al riavvio lo stato è coerente. | ☐ | |

---

## MV4 — Backup periodico (timer) e cartella configurabile
**Obiettivo:** il backup automatico periodico e la cartella/retention configurabili funzionano nella realtà.
**Precondizioni:** build di produzione. Per abbreviare i tempi, impostare l'intervallo periodico al minimo (1 ora) o verificare a fine giornata.

| # | Passo | Atteso | Esito | Note |
|---|-------|--------|-------|------|
| 4.1 | Impostazioni → Backup → imposta una **cartella** di destinazione con "Sfoglia…". | La cartella scelta viene salvata; "Ripristina predefinita" la svuota (torna alla cartella di default). | ☐ | |
| 4.2 | "Backup ora". | File `backup_*.db` creato **nella cartella configurata** (non in quella di default). | ☐ | |
| 4.3 | Abilita "Backup periodico" con intervallo basso; lascia l'app aperta per il tempo dell'intervallo. | Dopo l'intervallo viene creato un nuovo backup nella cartella configurata. | ☐ | |
| 4.4 | Cambia cartella/intervallo da Impostazioni mentre l'app è aperta. | Il cambiamento ha effetto **immediato** (scheduler riavviato); il backup successivo usa i nuovi valori. | ☐ | |
| 4.5 | Imposta "Conserva ultimi N" e genera più di N backup. | La rotazione mantiene **esattamente N** file (i più vecchi rimossi). | ☐ | |
| 4.6 | Abilita "Backup alla chiusura" e chiudi l'app. | Un backup viene creato alla chiusura nella cartella configurata. | ☐ | |

---

## MV5 — Recovery da migrazione fallita
**Obiettivo:** alla schermata di accesso, in caso di migrazione fallita, l'utente può ripristinare un backup.
**Precondizioni:** build con SQLCipher attivo; serve **simulare un fallimento di migrazione** (es. una build di test con una migrazione che fallisce volutamente, oppure un DB il cui schema manda in errore la migrazione corrente) e disporre di almeno un backup locale valido.

| # | Passo | Atteso | Esito | Note |
|---|-------|--------|-------|------|
| 5.1 | Avvia l'app con un DB che fa fallire la migrazione; inserisci la password corretta. | Compare il **pannello di recovery** sulla schermata Unlock con l'elenco dei backup locali (data + versione). | ☐ | |
| 5.2 | Clicca "Ripristina" su un backup **valido** (precedente al problema). | L'app si ripristina e diventa operativa (accesso completato). | ☐ | |
| 5.3 | Ripeti il fallimento e usa "Sfoglia file…" scegliendo un backup `.db`. | Il ripristino da file scelto manualmente funziona. | ☐ | |
| 5.4 | Ripeti scegliendo un backup che **ri-fallisce** la migrazione. | Messaggio d'errore chiaro; il pannello resta e si può scegliere un altro backup (nessuno stato bloccato). | ☐ | |
| 5.5 | Caso lista vuota (nessun backup locale). | Messaggio "Nessun backup locale trovato" + opzione "Sfoglia file…". | ☐ | |

> **Limite noto:** `eseguiRipristino` riesegue le migrazioni; quindi se il fallimento è un **bug deterministico** della migrazione, ripristinare un backup pre-aggiornamento lo ri-attiva. Il recovery risolve i casi transitori/da corruzione; per un bug deterministico serve una versione corretta dell'app.

---

## MV6 — Conferme di business (non tecniche)
Da chiudere con gli stakeholder (commercialista/DPO), non tramite l'app.

| # | Voce | Atteso | Esito | Note |
|---|------|--------|-------|------|
| 6.1 | **GDPR**: l'anonimizzazione del cliente conserva le ricevute emesse per obblighi fiscali. | Approccio confermato dal commercialista/DPO. | ☐ | |
| 6.2 | **Fatturazione elettronica/SDI**: la v1 emette solo ricevute. | Confermato che non sussistono obblighi SDI per l'ASD (o pianificare l'estensione). | ☐ | |

---

## MV7 — (Opzionale) Rifinitura test e2e `aria-disabled`
**Contesto:** il bottone "assegna abbonamento" è passato da `disabled` ad `aria-disabled` (WCAG). Il test e2e `critical-flow.spec.ts` resta verde tramite il ramo OR (messaggio "Assegna prima un'iscrizione" visibile), ma non verifica esplicitamente il nuovo attributo.

| # | Passo | Atteso | Esito | Note |
|---|-------|--------|-------|------|
| 7.1 | (Facoltativo) Rendere il test e2e esplicito su `getAttribute('aria-disabled')`. | Il test asserisce direttamente `aria-disabled="true"` senza iscrizione attiva. | ☐ | |

---

## Esito complessivo
- Data verifica: __________  · Versione app: __________  · Tester: __________
- Risultato: ☐ Tutte OK · ☐ Con eccezioni (vedi Note) · ☐ Bloccanti aperti
- Alla chiusura di una voce con esito OK su build reale, spostare la relativa nota in `OPEN-QUESTIONS.md` da `[Da verificare]` a `[Chiusa]` con data ed esito.
