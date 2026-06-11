# GymManager 2.0 — Analisi: problemi e soluzioni proposte

> Analisi statica (sola lettura) del codice in `F:\gymManager-2.0\src`, confrontato con la
> documentazione autorevole (`docs/SPEC.md`, `docs/FUNZIONALITA.md`, `docs/DOMAIN-MODEL.md`,
> `docs/PHASES.md`, `CLAUDE.md`) e con i debiti noti (`BLOCKERS.md`, `OPEN-QUESTIONS.md`).
> Ogni voce riporta **gravità**, **evidenza** (file:riga), **descrizione** e **soluzione proposta**.
> Le voci a gravità ALTA/CRITICA sono state verificate leggendo direttamente il codice.

**Data analisi:** 2026-06-07 · **Versione progetto:** 0.1.3

## Indice
- [Sintesi esecutiva](#sintesi-esecutiva)
- [A. Problemi con le funzionalità (logica e dati)](#a-problemi-con-le-funzionalità-logica-e-dati)
- [B. Funzionalità mancanti o incomplete](#b-funzionalità-mancanti-o-incomplete)
- [C. Problemi UI/UX](#c-problemi-uiux)
- [D. Problemi di accessibilità](#d-problemi-di-accessibilità)
- [Priorità di intervento consigliata](#priorità-di-intervento-consigliata)
- [Note positive (per contesto)](#note-positive-per-contesto)

---

## Sintesi esecutiva

Le **invarianti di dominio critiche (1–6)** sono implementate e coperte da test
(`memberships-invariants.test.ts`, `receipts-invariants.test.ts`): blocco della seconda
iscrizione attiva, blocco abbonamento senza iscrizione, divieto di eliminazione tipi assegnati,
annullamento ricevute non distruttivo, numerazione progressiva per anno. L'i18n è completo
(IT/EN, 397 chiavi entrambe) e le migrazioni in aggiornamento sono correttamente cablate.

I problemi principali si concentrano su:
1. **Correttezza in casi limite**: race condition sulla numerazione ricevute, stati di
   iscrizione/abbonamento mai aggiornati a runtime, gestione del fuso orario nel calcolo della
   minore età, bug nella dicitura "Tutore di …".
2. **Flussi previsti dalla spec ma incompleti o irraggiungibili dalla UI**: "emetti ricevuta ora"
   in assegnazione, cambio master password non distruttivo, backup/restore su Google Drive
   (backend pronto ma senza UI), calcolo CF bidirezionale dati→CF.
3. **UX**: feedback d'errore mancante sulle azioni distruttive, personalizzazione (tema/colore)
   non applicata senza riavvio, label di "Riprova" errate.
4. **Accessibilità**: assenza di focus-trap nei modali, contrasti insufficienti, errori di
   validazione non collegati ai campi.

---

## A. Problemi con le funzionalità (logica e dati)

### A1 — [CRITICA] Race condition sulla numerazione ricevute (transazione non `IMMEDIATE`)
- **Evidenza:** `src/main/db/receipts-repository.ts:96-102`
- **Descrizione:** il numero progressivo è calcolato con `SELECT COALESCE(MAX(numero), …)` dentro
  `db.transaction(() => …)`. better-sqlite3 apre per default una transazione **DEFERRED**: la
  lettura non acquisisce alcun write-lock finché non arriva l'`INSERT`. Due emissioni concorrenti
  possono leggere lo stesso `MAX(numero)` e calcolare lo stesso numero; la `UNIQUE(numero, anno)`
  (`004_receipts.ts`) fa fallire la seconda con un errore SQLite grezzo invece di riprovare.
  Mette a rischio l'invariante 6 ("nessun buco/duplicato") e l'utente vede un errore opaco.
- **Soluzione:** aprire la transazione in modalità immediata:
  `const esegui = db.transaction(() => {…}); esegui.immediate()`. In alternativa intercettare
  `SQLITE_CONSTRAINT_UNIQUE` e riprovare il calcolo in un loop limitato. `IMMEDIATE` è la via più
  semplice (acquisisce subito il write-lock). Stesso pattern da applicare a `getNextNumeroTessera`
  + `createCliente` (vedi A8).

### A2 — [ALTA] Stati di iscrizione/abbonamento mai aggiornati a runtime
- **Evidenza:** `src/main/db/memberships-repository.ts:128` e `:258` (definizioni di
  `aggiornaStatoIscrizioni`/`aggiornaStatoAbbonamenti`); **nessuna chiamata** in `src/` (verificato
  con grep: solo definizioni e test).
- **Descrizione:** la transizione automatica `attiva → scaduta` non avviene mai durante l'uso
  dell'app. Conseguenza: la dashboard "da rinnovare" (che filtra `stato='scaduta'`,
  `dashboard-repository.ts`) e `getVociPagabili` (che filtra `stato='attiva'`) lavorano su stati
  stantii; un'iscrizione scaduta da settimane resta `attiva` finché non si interviene a mano.
- **Soluzione:** richiamare `aggiornaStatoIscrizioni()` e `aggiornaStatoAbbonamenti()` all'apertura
  del DB (in `openDatabase`/post-unlock) e/o all'avvio della dashboard. Coprire con un test che
  inserisce un'iscrizione scaduta e verifica la transizione automatica.

### A3 — [ALTA] `updateIscrizioneDate`/`updateAbbonamentoDate` non ricalcolano lo stato né l'invariante
- **Evidenza:** `src/main/db/memberships-repository.ts:83-102` e `:213-232`
- **Descrizione:** la modifica delle date aggiorna solo `data_inizio`/`data_scadenza` senza
  ricalcolare `stato`. Spostando la scadenza nel passato l'iscrizione resta `attiva`; estendendola
  nel futuro un'iscrizione `scaduta` resta `scaduta`. Inoltre, se l'aggiornamento può produrre una
  seconda iscrizione attiva, l'invariante 1 non viene verificata.
- **Soluzione:** in entrambe le funzioni ricalcolare lo stato dalle nuove date riusando
  `calcolaStatoIscrizione`/equivalente; se l'esito è una seconda `attiva`, rifiutare l'operazione.

### A4 — [ALTA] Bug nella dicitura "Tutore di [CF del minore]": stampa il CF del tutore
- **Evidenza:** `src/main/db/receipts-repository.ts:73-86` (snapshot) + `src/main/domain/ricevuta.ts:80-81`
- **Descrizione:** quando `haTutore`, i campi `intestatario_*` vengono riempiti con i **dati del
  tutore** (riga 74-81) e `intestatario_cf` contiene quindi il **CF del tutore**. Il template
  stampa `Tutore di ${ricevuta.intestatario_cf}: …` (`ricevuta.ts:81`), producendo «Tutore di
  [CF del tutore]» invece del **CF del minore** richiesto da `FUNZIONALITA.md:13,65`. Il CF del
  minore non viene mai persistito sulla ricevuta.
- **Soluzione:** salvare il CF del minore in una colonna dedicata (es. `assistito_cf`) e usarla
  nella dicitura; oppure adottare il modello concettuale del `DOMAIN-MODEL.md` (intestatario =
  tutore, riga separata con il CF del minore). Richiede una migrazione e la correzione del template.

### A5 — [ALTA] `haTutore` basato solo su `tutore_cf`, ignora la minore età reale
- **Evidenza:** `src/main/db/receipts-repository.ts:73` (`const haTutore = Boolean(cliente.tutore_cf)`)
- **Descrizione:** la spec intesta la ricevuta al tutore **solo per i minori**
  (`FUNZIONALITA.md:13`). Se un cliente con dati tutore diventa maggiorenne (o il tutore è stato
  compilato per errore), la ricevuta viene comunque intestata al tutore. Manca qualsiasi controllo
  su `data_nascita`/minore età al momento dell'emissione.
- **Soluzione:** calcolare `haTutore` combinando presenza tutore **e** minore età (coerente con
  `isMinorenne`), oppure persistere un flag esplicito. Allineare con A4.

### A6 — [ALTA] `isMinorenne` confronta date in fuso orario locale (resto del dominio in UTC)
- **Evidenza:** `src/main/domain/cliente.ts:34-48`
- **Descrizione:** `new Date(dataNascita)` su `YYYY-MM-DD` è interpretata come mezzanotte **UTC**,
  mentre `oggi`/i confronti usano l'ora locale. Gli altri moduli (`iscrizione.ts`,
  `certificato-medico.ts`) normalizzano esplicitamente a mezzanotte UTC con `Date.UTC(...)`. Nel
  giorno del 18° compleanno il risultato può sbagliare di un giorno, abilitando/disabilitando
  erroneamente l'obbligo del tutore (e l'intestazione della ricevuta).
- **Soluzione:** normalizzare come negli altri moduli (parse e confronto in UTC, riusando
  `parseData`/`normalizzaData`).

### A7 — [ALTA] Algoritmo CF privo di copertura contro un riferimento esterno; commenti tabelle invertiti
- **Evidenza:** `src/main/domain/codice-fiscale.ts:10-32, 63-73`; test `codice-fiscale.test.ts`
- **Descrizione:** l'assegnazione per indice del carattere di controllo è corretta, **ma** i
  commenti alle righe 10/22 etichettano le tabelle in modo invertito. Più rilevante: i test
  verificano solo il **round-trip interno** (`calcolaCF → isCodiceFiscaleValid`): un eventuale
  errore sistematico nelle tabelle non verrebbe rilevato, perché calcolo e validazione usano la
  stessa tabella. Non esiste alcun test contro un CF reale noto (invariante 9 — "validazione CF").
- **Soluzione:** (a) correggere i commenti; (b) aggiungere fixture con almeno un CF reale di fonte
  ufficiale (documentando la fonte) per validare l'intera catena contro un riferimento esterno,
  come già previsto in `OPEN-QUESTIONS.md`.

### A8 — [MEDIA] `numero_tessera`: nessuna univocità su override e race in creazione concorrente
- **Evidenza:** `src/main/db/clients-repository.ts:9-19` (`getNextNumeroTessera`), `:21-24`
  (`createCliente`); `cliente.ts` (`validaCliente` non controlla la tessera); migrazione
  `002_clients.ts`
- **Descrizione:** l'auto-assegnazione è corretta, ma quando l'utente **sovrascrive** il numero non
  c'è alcun controllo di unicità applicativo. Inoltre `MAX+1` fuori transazione consente a due
  creazioni concorrenti di leggere lo stesso valore. La spec richiede tessera **univoca**
  (`FUNZIONALITA.md:12`).
- **Soluzione:** aggiungere vincolo `UNIQUE` su `numero_tessera` (nuova migrazione) **e** un
  controllo in `validaCliente`/`createCliente` con messaggio dedicato; eseguire lettura+insert in
  `transaction().immediate()`.

### A9 — [MEDIA] `creaRicevuta` non valida nulla (indirizzo, righe vuote, appartenenza voci)
- **Evidenza:** `src/main/db/receipts-repository.ts:42-198`; `handlers.ts` (`ricevute:crea`)
- **Descrizione:**
  - l'indirizzo intestatario è richiesto all'emissione (`FUNZIONALITA.md:10,64`) ma non è validato;
  - non si verifica che `input.righe` sia non vuoto (possibile ricevuta con totale 0);
  - `riferimentoId` non è verificato come appartenente al `clienteId` della ricevuta: si può marcare
    "pagata" una voce di un altro cliente passando un id arbitrario.
- **Soluzione:** funzione di validazione (analoga a `validaCliente`) richiamata nell'handler:
  indirizzo obbligatorio, ≥1 riga, ogni `riferimentoId` esistente e appartenente al cliente.

### A10 — [MEDIA] Operazioni consentite su clienti anonimizzati
- **Evidenza:** `src/main/db/clients-repository.ts:202-251` (`anonimizzaCliente`);
  `receipts-repository.ts:42`, `memberships-repository.ts:15,144` (nessun check su `cliente.stato`)
- **Descrizione:** `anonimizzaCliente` azzera l'anagrafica ma lascia iscrizioni/abbonamenti attivi e
  non impedisce nuove operazioni: si può ancora assegnare iscrizioni/abbonamenti o emettere ricevute
  a un cliente anonimizzato (intestatario "ANONIMIZZATO …"). L'invariante 7 preserva lo storico ma
  non prevede nuove operazioni su un soggetto cancellato.
- **Soluzione:** in assegnazioni e `creaRicevuta` verificare `cliente.stato === 'attivo'` e lanciare
  `CLIENTE_ANONIMIZZATO`. Valutare se all'anonimizzazione chiudere le associazioni attive
  (decisione di dominio → annotare in `OPEN-QUESTIONS.md`).

### A11 — [MEDIA] Filtro certificati in `listClienti` usa `julianday('now')` (con ora, in UTC)
- **Evidenza:** `src/main/db/clients-repository.ts:140-154`
- **Descrizione:** `julianday('now')` include la frazione di giorno (e usa UTC), mentre
  `julianday(data_scadenza)` è mezzanotte. La differenza non è un intero di giorni: un certificato
  che scade "oggi" nel pomeriggio dà differenza negativa e può finire tra gli "scaduti" anziché "in
  scadenza". La dashboard usa invece `julianday(:oggi)` passato dal renderer: doppia incoerenza.
- **Soluzione:** passare `oggi` (YYYY-MM-DD) anche a `listClienti` e usare `julianday(:oggi)`, oppure
  `date('now')` troncato al giorno, allineandosi alle query della dashboard.

### A12 — [MEDIA] `updateTipoIscrizione`/`updateTipoAbbonamento` senza validazione di dominio
- **Evidenza:** `src/main/db/catalog-repository.ts:41-66, 137-162`; `handlers.ts` (catalogo create/update)
- **Descrizione:** gli update costruiscono `SET ${f} = @${f}` iterando su `Object.keys(data)` (input
  IPC non tipizzato a runtime) e **non chiamano** `validaTipoIscrizione`/`validaTipoAbbonamento`
  (`catalogo.ts:39-100`), che peraltro non sono invocate nemmeno in creazione. Si possono impostare
  `durata_mesi`/`prezzo` ≤ 0 o negativi.
- **Soluzione:** chiamare le funzioni di validazione negli handler create/update; usare una whitelist
  esplicita di colonne aggiornabili invece di `Object.keys`.

### A13 — [MEDIA] `getIndicatori` riceve ma ignora i preavvisi di iscrizioni/abbonamenti
- **Evidenza:** `src/main/db/dashboard-repository.ts:74-79, 164-165` (`void giorniPreavvisoIsc`)
- **Descrizione:** la spec richiede intervalli di segnalazione **distinti** per
  certificati/iscrizioni/abbonamenti (`FUNZIONALITA.md:55,98`); i due parametri arrivano ma sono
  scartati. Gli indicatori sintetici non espongono "iscrizioni/abbonamenti in scadenza".
- **Soluzione:** o aggiungere i conteggi in scadenza agli indicatori usando quei valori, o rimuovere
  i parametri morti dalla firma. Allineare con `SPEC.md`.

### A14 — [MEDIA] `settings:set` scrive file JSON e SQLite senza atomicità
- **Evidenza:** `src/main/ipc/handlers.ts` (`settings:set`); `receipts-repository.ts:18-25`
  (`getReceiptStartNumber` legge da `app_settings`)
- **Descrizione:** il file JSON viene salvato prima dell'upsert su `app_settings`; se l'upsert
  fallisce, file e DB divergono (es. `receipt_start_number` aggiornato nel JSON ma non nella tabella).
- **Soluzione:** definire un ordine sicuro (prima SQLite, poi file) o incapsulare entrambe in una
  routine con rollback/compensazione; documentare la fonte autorevole del valore.

### A15 — [BASSA] Dettagli minori
- `ricevuta-format.ts:55-57`: `formatNumeroRicevuta` non azzera il numero (`2025-3` invece di
  `2025-0003`). Confermare con il committente se serve padding fiscale.
- `receipts-repository.ts:231-243`: la ricerca per numero ignora l'anno (cercando "1" trova la n.1 di
  ogni anno). Combinare numero+anno o documentare.
- `dashboard-repository.ts:338-402`: `getCompleanni` non normalizza il 29/02 negli anni non bisestili
  (widget opzionale, edge case raro).
- `migrations.ts`: la migrazione `005_update_test` è nell'array di produzione — verificarne lo scopo
  e rimuoverla/rinominarla se è solo un artefatto di test.
- `clients-repository.ts:129-133`: il filtro `stato_iscrizione = 'scaduta'` include anche le iscrizioni
  `invalidata` (seleziona "ha iscrizioni ma nessuna attiva"); restringere a `EXISTS(... stato='scaduta')`.

---

## B. Funzionalità mancanti o incomplete

> Gap rispetto a `docs/FUNZIONALITA.md` usato come checklist. Stato: ASSENTE / PARZIALE / STUB.

### B1 — [ALTA] "Emetti ricevuta ora" in fase di assegnazione (STUB)
- **Evidenza:** `src/renderer/src/components/memberships/AssegnaIscrizioneForm.tsx:295-310`
  (checkbox **`disabled`**, commento «placeholder F3»); assente del tutto in
  `AssegnaAbbonamentoForm.tsx`.
- **Spec:** `FUNZIONALITA.md:32,34,63` prevede l'opzione "emetti ricevuta ora" in assegnazione.
- **Soluzione:** dopo `assegna`, se la checkbox è attiva, aprire `EmittiRicevutaForm` (o invocare
  `ricevute.crea`) preselezionando la voce appena creata; abilitare/aggiungere la checkbox in
  entrambi i form. Se fuori scope ora, rimuovere il controllo morto dalla UI.

### B2 — [ALTA] Cambio master password **non distruttivo** ASSENTE
- **Evidenza:** nessun `rekey`/`PRAGMA rekey`/`changePassword` in `src/` (verificato con grep);
  esiste solo il reset distruttivo (`ResetPasswordDialog.tsx` → `backup:reset` → `resetDatabase`,
  `restore-service.ts:137`).
- **Spec:** `SPEC.md:58`/`FUNZIONALITA.md:58`: «Sicurezza: **cambio master password**; reset con
  avviso di perdita dati» — due funzioni distinte. Oggi cambiare password = perdere tutti i dati.
- **Soluzione:** implementare il rekey SQLCipher (`better-sqlite3-multiple-ciphers` supporta
  `PRAGMA rekey`) con handler IPC `db:changePassword(oldPwd, newPwd)` e UI separata dal reset.

### B3 — [ALTA] Backup/Restore su Google Drive non utilizzabile dalla UI
- **Evidenza:** backend completo (`drive-service.ts`: OAuth, `backupSuDrive`, `listBackupDrive`,
  `ripristinaDaDrive` a `:340`), ma `SettingsPage.tsx:985-1044` espone **solo Connetti/Disconnetti**;
  `ripristinaDaDrive` **non ha handler IPC** (nessun `backup:drive:restore`) né voce in
  `preload`/`api.d.ts`.
- **Spec:** `SPEC.md:23`/`PHASES.md:48-49` (F5): backup su Drive e restore funzionante. Il round-trip
  del Gate F5 **non è eseguibile dall'utente**.
- **Soluzione:** aggiungere in Settings i pulsanti "Backup su Drive", "Elenca backup Drive",
  "Ripristina da Drive"; esporre `ripristinaDaDrive` con un nuovo handler IPC e nel preload/`ElectronAPI`.

### B4 — [ALTA] Calcolo CF bidirezionale: direzione "dati → CF" ASSENTE
- **Evidenza:** esiste solo CF→dati (`ClientForm.tsx:116-136`, `decodeCFBasic`). `calcolaCF` esiste
  (`codice-fiscale.ts:144`) ma **non è esposto via IPC** né chiamato; manca il campo "Comune di
  nascita" nel form (`FormData` non ha `comune_nascita`).
- **Spec:** `FUNZIONALITA.md:9`: calcolo **bidirezionale** con precompilazione reciproca.
- **Soluzione:** aggiungere il campo "Comune di nascita" con autocompletamento (richiede il dizionario
  Belfiore comune→codice, già tracciato in `OPEN-QUESTIONS.md`); handler IPC `cf:calcola`; in
  `ClientForm` calcolare il CF da nome/cognome/data/sesso/comune con override manuale sempre possibile.

### B5 — [MEDIA] "Elimina" tipo catalogo sempre attivo + errore non mostrato
- **Evidenza:** `CatalogoPage.tsx:323-331, 608-616` (pulsante sempre cliccabile, tooltip sempre
  presente); `handleElimina`/`handleInvalida` privi di `catch` (`:112-136`, `:396-420`).
- **Spec:** `FUNZIONALITA.md:45`: "Elimina" disabilitato se assegnato, offrendo "Invalida". Il backend
  rifiuta correttamente (`TIPO_ASSEGNATO`), ma la UI chiude il dialog come se fosse riuscito e non
  mostra nulla.
- **Soluzione:** esporre un flag/conteggio `assegnato` per tipo (nuovo campo/handler), disabilitare
  "Elimina" quando >0 con tooltip esplicativo solo in quel caso; aggiungere `catch` che mostri
  l'errore di vincolo senza chiudere il dialog. (Cross-ref C2/C3.)

### B6 — [MEDIA] Indirizzo non richiesto all'emissione ricevuta
- **Evidenza:** né `EmittiRicevutaForm.tsx` né `creaRicevuta` verificano l'indirizzo intestatario;
  il PDF semplicemente omette la riga (`ricevuta.ts`). (Stesso tema di A9.)
- **Spec:** `FUNZIONALITA.md:10`: l'indirizzo è richiesto al momento di emettere la ricevuta.
- **Soluzione:** in `EmittiRicevutaForm` (o in `creaRicevuta`) bloccare/avvisare se l'indirizzo è
  assente, offrendo di completarlo prima di emettere.

### B7 — [MEDIA] Indirizzo del tutore non inseribile nel form cliente
- **Evidenza:** le colonne `tutore_via/civico/citta/provincia/cap` esistono (`api.d.ts:50-54`), ma
  `ClientForm.tsx` (`FormData`, `:13-31`) include solo `tutore_nome/cognome/cf`.
- **Spec:** `FUNZIONALITA.md:13`: tutore con «indirizzo se diverso». La ricevuta al tutore userà
  l'indirizzo del minore.
- **Soluzione:** aggiungere i campi indirizzo tutore nella sezione Tutore (mostrati per i minorenni).

### B8 — [MEDIA] Configurazione backup: percorso locale e frequenza non configurabili
- **Evidenza:** `SettingsPage.tsx:936-946` offre solo il toggle `backup_on_close`; il backup "ora"
  scrive nella cartella fissa `userData/backups` (`backup-service.ts:88`); l'IPC `backup:locale`
  (verso percorso scelto) non è cablato in UI.
- **Spec:** `FUNZIONALITA.md:56`: «percorso locale; frequenza automatica configurabile».
- **Soluzione:** aggiungere selezione cartella (dialog `showOpenDialog`) e selettore frequenza;
  collegare "Backup ora" a `backup:locale` con il percorso scelto.

### B9 — [MEDIA] Drill-down certificati dalla dashboard non filtra la lista clienti
- **Evidenza:** `DashboardPage.tsx:154-156` naviga con `{ filtro: 'certificato' }`, ma `ClientsPage`
  accetta solo `stato_certificato` ∈ {`valido`,`in_scadenza`,`scaduto`}: il valore `'certificato'`
  non mappa nulla.
- **Spec:** `FUNZIONALITA.md:99`: "certificati in scadenza → lista clienti filtrata".
- **Soluzione:** navigare con `stato_certificato: 'in_scadenza'` (o combinato in_scadenza+scaduto) e
  gestirlo in `ClientsPage`.

### B10 — [MEDIA] Card "incassi" degli Indicatori ignora il selettore di periodo
- **Evidenza:** `dashboard-repository.ts:133-160`: `getIndicatori` calcola `incassi_pagati` su **tutte**
  le ricevute pagate senza filtro data. Il widget `IncassiWidget` (via `getIncassiPeriodo`) è invece
  corretto.
- **Spec:** `SPEC.md:91`/`FUNZIONALITA.md:91,98`: l'incasso "del periodo" deve seguire il selettore.
- **Soluzione:** passare il periodo a `getIndicatori` per la voce incassi, o rimuovere l'incasso dalla
  card indicatori affidandolo al solo widget di periodo.

### B11 — [MEDIA] Recovery da migrazione fallita non guidato dalla UI
- **Evidenza:** `handlers.ts` rilancia `MIGRATION_FAILED`, ma nessuna schermata propone il restore;
  il "percorso di ripristino" (Gate F6, `PHASES.md:58`) è solo documentale (`DECISIONS.md` D13).
- **Soluzione:** alla ricezione di `MIGRATION_FAILED` nella schermata Unlock, mostrare un'opzione
  "Ripristina dall'ultimo backup automatico" (backup auto in `userData/backups`).

### B12 — [BASSA] Gap minori
- **Ricerca tipi catalogo ASSENTE** (`FUNZIONALITA.md:42`): in `CatalogoPage.tsx` c'è solo il toggle
  "mostra non validi", manca il campo di ricerca. → aggiungere un `SearchInput` per tab.
- **Modifica date abbonamento non in UI**: la tabella abbonamenti (`ClientDetail.tsx:872-881`) ha solo
  "Invalida", benché esista l'IPC `abbonamenti.updateDate`. → aggiungere "Modifica date" per riga.
- **Filtro cliente dedicato nella pagina Ricevute**: solo ricerca testuale (`ReceiptsPage.tsx`), non un
  selettore (`FUNZIONALITA.md:75`). → opzionale: aggiungere selettore o documentare la scelta.
- **Poche stringhe hardcoded**: `'mese'/'mesi'` in `AssegnaIscrizioneForm.tsx:183`,
  `AssegnaAbbonamentoForm.tsx:219-221`, `CatalogoPage.tsx:291`. → esternalizzare in i18n (plurale).
- **Decodifica anno CF euristica** (`utils/dominio.ts:46`, `annoRaw < 30 ? 2000 : 1900`): documentare
  l'assunzione in `OPEN-QUESTIONS.md`.

---

## C. Problemi UI/UX

### C1 — [ALTA] Etichetta "Riprova" errata negli stati di errore
- **Evidenza:** `ReceiptsPage.tsx:257`, `EmittiRicevutaForm.tsx:214`, `CatalogoPage.tsx:156`
- **Descrizione:** il pulsante di ricarica usa come label `t('common.error_generic')` = "Si è
  verificato un errore. Riprova.", quindi il messaggio d'errore compare due volte (testo + bottone)
  e l'utente non riconosce l'azione.
- **Soluzione:** introdurre `common.riprova` ("Riprova") e usarla come label dei retry; lasciare
  `error_generic` solo come messaggio.

### C2 — [ALTA] Azioni distruttive del Catalogo senza feedback d'errore
- **Evidenza:** `CatalogoPage.tsx:112-136` e `:396-420` (`try/finally` **senza `catch`**)
- **Descrizione:** se il backend rifiuta l'eliminazione di un tipo assegnato (invariante 4), il dialog
  si chiude come se fosse riuscito, l'elemento resta in lista e l'eccezione resta non gestita.
- **Soluzione:** aggiungere `catch` che mostri il messaggio nel dialog (mantenendolo aperto): es.
  "Impossibile eliminare: tipo già assegnato a dei clienti". (Cross-ref B5.)

### C3 — [ALTA] Pulsante "Elimina" sempre attivo con tooltip sempre presente
- **Evidenza:** `CatalogoPage.tsx:323-331, 608-616` (commento esplicito alle righe 276-279)
- **Descrizione:** il pulsante è sempre cliccabile e mostra **sempre** "Non eliminabile: tipo già
  assegnato", anche per tipi mai assegnati — anti-pattern (azione che il sistema poi rifiuta).
- **Soluzione:** vedi B5 (flag `assegnato` dal backend → disabilitare e mostrare il tooltip solo
  quando pertinente).

### C4 — [ALTA] Tema e colore primario non applicati senza riavvio
- **Evidenza:** `App.tsx:39-76` (uniche chiamate a `applyTheme`/`applyPrimaryColor`, solo all'init);
  `SettingsPage.tsx:419` (`settings.set` non riapplica nulla)
- **Descrizione:** dopo il salvataggio in Impostazioni, tema chiaro/scuro e colore restano invariati
  fino al riavvio. Per un utente non tecnico equivale a "il cambio colore non funziona". L'app è
  dichiarata "personalizzabile" (`SPEC.md:10`).
- **Soluzione:** esportare `applyTheme`/`applyPrimaryColor` (o un piccolo modulo theme) e richiamarli
  in `handleSubmit` subito dopo `settings.set`.

### C5 — [ALTA] Soglie di scadenza salvate non aggiornano i badge senza riavvio
- **Evidenza:** `SettingsContext.tsx:29-43` (fetch solo al mount, nessun refresh) usato in
  `ClientList.tsx:74`, `ClientDetail.tsx:99`, `DashboardPage.tsx:119-121`
- **Descrizione:** modificando i giorni di preavviso, il context non si aggiorna: stato certificati e
  widget continuano a usare le soglie vecchie.
- **Soluzione:** esporre `refresh()` da `SettingsContext` e chiamarlo dopo il salvataggio in
  `SettingsPage`.

### C6 — [ALTA] Restore locale: percorso da digitare a mano (nessun file picker)
- **Evidenza:** `RestoreDialog.tsx:76-84` (`<input type="text">` per il path)
- **Descrizione:** operazione critica con UX inadatta a utenti non tecnici; nessun feedback di
  successo (vedi C13).
- **Soluzione:** pulsante "Sfoglia…" che apre `dialog.showOpenDialog` (via IPC) e popola il campo.

### C7 — [MEDIA] Messaggi di validazione non specifici ("Si è verificato un errore. Riprova.")
- **Evidenza:** `AssegnaIscrizioneForm.tsx:93-116`, `AssegnaAbbonamentoForm.tsx:98-122`,
  `TipoAbbonamentoForm.tsx:68-86`, `TipoIscrizioneForm.tsx`, `CertificatoForm.tsx:43,49`
  (in quest'ultimo si concatena label + generico → "Tipo Si è verificato un errore…").
- **Soluzione:** chiavi i18n dedicate (`validazione.obbligatorio`, `validazione.prezzo_non_valido`,
  `validazione.data_obbligatoria`, …) usate nei rispettivi `setXxxError`.

### C8 — [MEDIA] `ClientForm`: nessuna validazione client-side dei campi obbligatori
- **Evidenza:** `ClientForm.tsx:159-204` (submit senza validazione locale; form `noValidate`, input
  non `required`)
- **Descrizione:** nome/cognome/CF (obbligatori) sono inviati anche vuoti, con errore generico in cima
  e senza evidenziare i campi mancanti; manca anche la validazione di formato CF al submit.
- **Soluzione:** validare localmente prima della chiamata, popolando `apiErrors` per-campo e bloccando
  il submit.

### C9 — [MEDIA] Emissione ricevuta: nessuna conferma di successo né intestatario/minore mostrato
- **Evidenza:** `EmittiRicevutaForm.tsx` (form), `ClientDetail.tsx:305-309` (`handleRicevutaCreata`
  chiude e basta)
- **Descrizione:** il form non mostra l'intestatario calcolato né la gestione tutore/minore
  (`FUNZIONALITA.md:65,80`); dopo il salvataggio (numero immutabile assegnato, PDF generato) l'unico
  feedback è la chiusura del modale: nessuna conferma con il numero ottenuto.
- **Soluzione:** mostrare in testa al form l'intestatario calcolato (con riga "Tutore di …" se minore);
  dopo il salvataggio una conferma con `AAAA-N` e un'azione "Visualizza PDF".

### C10 — [MEDIA] Modale chiudibile con ESC/backdrop anche con dati non salvati
- **Evidenza:** `Modal.tsx:25-30` (ESC) e `:54-58` (backdrop); usato da `ClientForm`,
  `EmittiRicevutaForm`, ecc.
- **Descrizione:** i form lunghi si chiudono e scartano a un click fuori o a ESC, senza conferma →
  rischio di perdita dati involontaria.
- **Soluzione:** per i form con modifiche pendenti, chiedere conferma prima di chiudere su
  backdrop/ESC, o disabilitare la chiusura da backdrop nei form di inserimento.

### C11 — [MEDIA] Tabelle senza scroll orizzontale: overflow su finestre strette
- **Evidenza:** `ClientList.tsx:107-108`, `ReceiptsPage.tsx:265-266` (8 colonne),
  `ClientDetail.tsx:927-928` (6 colonne) — tabelle dentro `div … overflow-hidden` senza `overflow-x-auto`.
- **Soluzione:** wrappare le tabelle in `overflow-x-auto` e dare alla `table` un `min-w-[…]` adeguato.

### C12 — [MEDIA] Rinnovo iscrizione lato UI non atomico
- **Evidenza:** `AssegnaIscrizioneForm.tsx:125-142` (`invalida` la vecchia poi `assegna` la nuova)
- **Descrizione:** se la seconda chiamata fallisce, il cliente resta senza iscrizione attiva e con la
  precedente invalidata; il messaggio è solo "errore_salvataggio" generico. (Collegato ad A3 e alla
  mancanza di un `rinnovaIscrizione` atomico lato backend.)
- **Soluzione:** implementare il rinnovo come singola IPC atomica lato backend; in subordine, avvisare
  esplicitamente lo stato risultante in caso di errore.

### C13 — [MEDIA/BASSA] Altri problemi UX
- **Lista clienti — empty state unico** (`ClientList.tsx:156-166`): non distingue "DB vuoto" (CTA
  "Crea il primo cliente") da "nessun risultato del filtro" (CTA "Azzera filtri"). → differenziare in
  base a search/filtri attivi.
- **Banner errore aggiornamento ignora il messaggio reale** (`UpdateNotification.tsx:59-61, 134-139`):
  mostra sempre `aggiornamento.errore` generico, mentre `SettingsPage.tsx:1133-1137` mostra il dettaglio
  → incoerenza; mostrare anche qui `stato.messaggio`.
- **`RestoreDialog` senza conferma di successo** (`RestoreDialog.tsx:40-42`): a differenza di
  `ResetPasswordDialog`; mostrare esito (ed eventuale riavvio).
- **Incoerenza ordine Nome/Cognome**: widget dashboard "Nome Cognome" (`ScadenzeWidget.tsx:94`) vs liste
  "Cognome Nome" (`ClientList.tsx:181`, `ClientDetail.tsx:413`) → helper condiviso `formatNomeCliente`.
- **CF: warning di formato riusa la chiave placeholder** (`ClientForm.tsx:271-275` usa `cf_hint`):
  aggiungere `clienti.form.cf_formato_invalido`.
- **`ResetPasswordDialog` step 2 senza hint requisiti** (`:48-55`): mostrare "min 8 caratteri" sotto il
  campo, come in Setup.
- **Personalizzazione colore parziale** (`App.tsx:27-33`): viene sovrascritto solo
  `--color-primary-500`, ma bottoni/header usano `primary-600/700` (`Shell.tsx:34`), quindi il colore
  scelto **non** si riflette sugli elementi principali. → derivare l'intera scala 50–900 dal colore
  scelto e impostare tutte le variabili `--color-primary-*`.

---

## D. Problemi di accessibilità

> Valutazione su base WCAG 2.1. Punti già corretti: `lang="it"`, `:focus-visible` globale,
> `role="dialog"`/`aria-modal`/`aria-labelledby` sul Modal, ESC per chiudere, `aria-label` sui bottoni
> icona, `scope="col"` nella lista clienti, label associate nei form principali, `aria-live` su toast.

### D1 — [ALTA] Modal senza focus-trap né ripristino del focus (WCAG 2.4.3, 2.1.2)
- **Evidenza:** `src/renderer/src/components/ui/Modal.tsx:46-99`
- **Descrizione:** all'apertura il focus non entra nel dialog, con Tab si esce sugli elementi
  sottostanti, e alla chiusura il focus non torna al trigger. Impatta tutti i dialog (ConfirmDialog,
  RestoreDialog, ResetPasswordDialog, form modali). L'`id="modal-title"` fisso può duplicarsi con più
  modali montati.
- **Soluzione:** al mount salvare `document.activeElement`, spostare il focus nel dialog
  (`ref` + `tabIndex={-1}`); intercettare `Tab`/`Shift+Tab` nel `keydown` già presente per ciclare tra
  primo e ultimo focusabile; al unmount ripristinare il focus; rendere univoco l'id del titolo.

### D2 — [ALTA] `aria-describedby` mancante nei dialog di conferma (WCAG 4.1.2)
- **Evidenza:** `Modal.tsx:47-52`, `ConfirmDialog.tsx:32-34`
- **Descrizione:** il dialog ha `aria-labelledby` ma il corpo (`<p>{message}</p>`) non è associato:
  lo screen reader annuncia il titolo ma non il messaggio — rilevante per le azioni distruttive.
- **Soluzione:** prop opzionale `describedById` sul Modal applicata al `role="dialog"`; nel
  ConfirmDialog dare `id` al `<p>` del messaggio e passarlo al Modal.

### D3 — [ALTA] Riga tabella clienti cliccabile non raggiungibile da tastiera (WCAG 2.1.1)
- **Evidenza:** `ClientList.tsx:171-175` (`<tr onClick=…>` senza `role`/`tabIndex`/`onKeyDown`)
- **Descrizione:** la riga è interattiva col mouse ma invisibile alla tastiera (esiste già un bottone
  chevron focusabile che duplica l'azione → comportamento incoerente).
- **Soluzione (KISS):** rimuovere `onClick` dal `<tr>` lasciando il bottone chevron (già accessibile)
  come azione; in alternativa rendere la riga `role="button"` + `tabIndex={0}` + `onKeyDown` Enter/Space.

### D4 — [ALTA] `role="button"` su div senza gestione dello Spazio (WCAG 2.1.1)
- **Evidenza:** `IncassiWidget.tsx:28-37` (`onKeyDown` gestisce solo `Enter`)
- **Descrizione:** un elemento `role="button"` deve attivarsi anche con **Spazio** (e fare
  `preventDefault` per non scrollare). Gli altri widget usano correttamente `<button>`.
- **Soluzione:** usare un vero `<button>` (coerente con `ScadenzeWidget`/`AbbonamentiWidget`); se si
  mantiene il div, gestire `Enter` **e** `' '` con `preventDefault`.

### D5 — [MEDIA] Contrasto insufficiente del testo grigio chiaro e dei placeholder (WCAG 1.4.3)
- **Evidenza:** `text-gray-400` (#9ca3af, ~2.85:1 su bianco) in `ClientList.tsx:37`,
  `ScadenzeWidget.tsx:96`, `SettingsPage.tsx:694,1134`, stati di loading vari; `placeholder-gray-400`
  in `SearchInput.tsx:47`, `ClientForm.tsx:93`.
- **Soluzione:** portare il testo informativo ad almeno `text-gray-600` (#4b5563, ~7:1) e i
  placeholder a `placeholder-gray-500`; in dark mode verificare i corrispettivi.

### D6 — [MEDIA] Contrasto dei badge in dark mode da verificare (WCAG 1.4.3)
- **Evidenza:** `Badge.tsx:12-18` (testo `*-800` su `*-100`, `text-xs`; in dark mode `dark:text-*-400`
  su sfondi semi-trasparenti `dark:bg-*-900/30`).
- **Descrizione:** i badge chiari sono al limite; in dark mode la trasparenza `/30` riduce il contrasto
  del fondo, rendendo il calcolo non garantito (in particolare `warning`/`info`).
- **Soluzione:** verificare con strumento; se necessario aumentare l'opacità del fondo (`/40`–`/50`) o
  usare tinte di testo più chiare (`*-300`).

### D7 — [MEDIA] Stati di caricamento senza `role="status"`/`aria-live` (WCAG 4.1.3)
- **Evidenza:** `ClientList.tsx:147-154`, `ReceiptsPage.tsx:244-248`, `CatalogoPage.tsx:138-144`,
  `ClientDetail.tsx:352-358`, `EmittiRicevutaForm.tsx:195-201` (a differenza di `App.tsx:81-85`, corretto).
- **Soluzione:** avvolgere lo stato di loading in un contenitore `role="status"` `aria-live="polite"`;
  per le liste, annunciare "N risultati" al termine.

### D8 — [MEDIA] Motivo del pulsante disabilitato solo nel `title` (WCAG 1.3.1/4.1.2)
- **Evidenza:** `ClientDetail.tsx:894-908` ("assegna abbonamento" disabilitato con motivo solo in
  `title`; un elemento `disabled` non riceve focus, quindi il tooltip non viene mai annunciato).
- **Soluzione:** associare il motivo con `aria-describedby` al messaggio già presente
  (`errore-no-iscrizione`, `:778-783`), o usare `aria-disabled="true"` mantenendo il bottone focusabile.

### D9 — [MEDIA] `aria-required` mancante sui campi obbligatori (WCAG 3.3.2)
- **Evidenza:** `ClientForm.tsx:71-86` (componente `Field`, `required` usato solo per l'asterisco
  visivo); `CertificatoForm.tsx:84-87,107-109`.
- **Soluzione:** propagare `required`/`aria-required="true"` all'input; rendere l'asterisco
  `aria-hidden` con nota testuale "campi obbligatori".

### D10 — [MEDIA] Errori di validazione non collegati ai campi (WCAG 3.3.1/4.1.2)
- **Evidenza:** `ClientForm.tsx:79-83`, `TipoAbbonamentoForm.tsx:150-154,188-192,208-212`,
  `AssegnaIscrizioneForm.tsx:187-191`, `AssegnaAbbonamentoForm.tsx:224-228`,
  `CertificatoForm.tsx:98-102,118-122` (il `<p role="alert">` non ha `id`; l'input non ha
  `aria-invalid`/`aria-describedby`). **Il pattern corretto esiste già** in `SettingsPage.tsx:720-733`.
- **Soluzione:** replicare il pattern di `SettingsPage`: `id` sull'errore, `aria-invalid={!!error}` +
  `aria-describedby={errorId}` sull'input; centralizzare nel componente `Field`.

### D11 — [MEDIA] Label non associate in `ClientForm` e `CertificatoForm` (WCAG 1.3.1/3.3.2)
- **Evidenza:** `ClientForm.tsx:71-86` (componente `Field`: `<label>` senza `htmlFor`, input senza
  `id`); `CertificatoForm.tsx:84-97,107-117`. Gli altri form (Setup, Unlock, SettingsPage, Assegna*,
  TipoAbbonamento) associano correttamente.
- **Soluzione:** generare un `id` (`useId()` o dal `name`) nel `Field` e applicarlo a `htmlFor`/`id`;
  in `CertificatoForm` aggiungere `htmlFor`/`id` ai due campi.

### D12 — [BASSA] Dettagli minori
- **Tabelle senza `scope`/`<caption>`**: solo `ClientList` usa `scope="col"`; mancano in
  `ClientDetail.tsx:700-712,792-810,928-949`, `CatalogoPage.tsx:184-202,460-481`,
  `ReceiptsPage.tsx:267-293`. → aggiungere `scope="col"` e `<caption className="sr-only">`.
- **`focus:` invece di `focus-visible:`**: diffuso (es. `CatalogoPage.tsx:664`, `ClientsPage.tsx:197`);
  standardizzare su `focus-visible:` per coerenza con la regola globale; verificare il ring sulle card
  colorate degli indicatori.
- **Bottoni-icona con `title` + `sr-only` discordanti** (`CatalogoPage.tsx:303-331,588-616`): per il
  bottone "elimina", nome accessibile ("elimina") e tooltip ("tipo assegnato") divergono → allineare.
- **`PeriodSelector` `role="group"` con `aria-label` non pertinente** (`:70-74`, usa `dashboard.titolo`):
  usare un'etichetta "Seleziona periodo"; valutare `role="radiogroup"` + `aria-checked` (selezione
  mutuamente esclusiva) al posto di `aria-pressed`.
- **PDF in nuova finestra senza preavviso** (`ClientDetail.tsx:277`, `ReceiptsPage.tsx:24`,
  `window.open(..., '_blank')`): aggiungere "(apre in nuova finestra)" al testo accessibile.
- **Barra incassi `role="img"` con `aria-label` generico** (`IncassiWidget.tsx:84`): includere le
  percentuali o marcare `aria-hidden` (i valori testuali sono già esposti sotto).

---

## Priorità di intervento consigliata

| Priorità | Voci | Tema |
|---|---|---|
| **P0 — Correttezza dati** | A1, A2, A3, A4, A5, A6 | Race numerazione, stati stantii, dicitura tutore, fuso orario minore età |
| **P1 — Funzioni mancanti chiave** | B1, B2, B3, B4 | Emetti ricevuta ora, cambio password non distruttivo, Drive in UI, CF bidirezionale |
| **P2 — Robustezza & validazione** | A7, A8, A9, A10, A11, A12, B5, B6, B7 | Validazioni mancanti, anonimizzati, univocità tessera, copertura CF |
| **P3 — UX bloccanti percepiti** | C1, C2, C3, C4, C5, C6 | Feedback errori, personalizzazione live, file picker restore |
| **P4 — Accessibilità** | D1, D2, D3, D4, D5, D7, D9, D10, D11 | Focus-trap, contrasti, errori collegati, label |
| **P5 — Rifiniture** | A13–A15, B8–B12, C7–C13, D6, D12 | Dettagli, coerenza, edge case |

### Note di metodo
- Le invarianti di dominio (1–6) risultano implementate e testate; i gap principali sono di
  **completezza funzionale/UI** e alcuni **bug di correttezza in casi limite**.
- Diverse soluzioni richiedono **migrazioni** (A4 colonna `assistito_cf`, A8 `UNIQUE` su
  `numero_tessera`): seguire la skill `migrazioni-db` (versionate e reversibili).
- Le decisioni di dominio ancora aperte (A10 chiusura associazioni all'anonimizzazione; A15 padding
  numero ricevuta) vanno registrate in `OPEN-QUESTIONS.md` prima dell'implementazione.
- Per le voci P0/P1 aggiungere test (Vitest) prima del fix dove non già coperti; rispettare la
  Definition of Done: `npm run verify` verde.

## Note positive (per contesto)
- Invarianti 1, 2, 4, 5 implementate e coperte da test; annullamento ricevute non distruttivo con
  ripristino voci a «da incassare».
- Numerazione progressiva per anno della data di emissione, doppia copia PDF, `formatImporto` in
  formato italiano (`1.234,56 €`) e date `gg/mm/aaaa` corretti.
- Migrazioni applicate in transazione atomica e cablate ad ogni apertura/aggiornamento del DB.
- i18n completo (IT/EN, 397 chiavi) con cambio lingua a runtime — DoD F7 sulla seconda lingua
  soddisfatto.
- Backend Drive completo (OAuth, backup, list, restore) — manca solo l'esposizione in UI (B3).
- Buon uso di `ConfirmDialog` variante `danger` e del flusso a due step per il reset password.

---

## Verifica dei fix applicati (aggiornamento 2026-06-08)

> Verifica del commit `d2c199f` *"fix(p0-p3): corregge correttezza dati, stati, ricevute minori e UX"*
> contro il codice attuale, confermata da `npm run verify` **verde** (typecheck + lint + 272 test +
> build OK). Ogni voce è stata controllata leggendo direttamente i file citati.

### Stato delle voci dell'analisi

| Voce | Stato | Evidenza della verifica |
|---|---|---|
| **A1** Race numerazione | ✅ **RISOLTO** | `receipts-repository.ts:202` usa `esegui.immediate()` (write-lock immediato). |
| **A2** Stati stantii | ✅ **RISOLTO** | `aggiornaStatoIscrizioni()`/`aggiornaStatoAbbonamenti()` chiamati in `handlers.ts:140-141` (`db:setup`) e `:163-164` (`db:unlock`). |
| **A3** Date senza ricalcolo stato | ✅ **RISOLTO** | `memberships-repository.ts:92` e `:242` ricalcolano lo stato; `updateIscrizioneDate` verifica invariante 1 (`:94-109`). |
| **A4** Dicitura "Tutore di [CF tutore]" | ✅ **RISOLTO** | Migrazione `006_receipts_assistito_cf.ts` (col. `assistito_cf`), `receipts-repository.ts:96,151`, template `ricevuta.ts:80`. Test `receipts-invariants.test.ts:497`. |
| **A5** `haTutore` ignora minore età | ✅ **RISOLTO** (test parziale → N3) | `receipts-repository.ts:81` combina `tutore_cf` **e** `isMinorenne(...)`. |
| **A6** `isMinorenne` in fuso locale | ✅ **RISOLTO** | `cliente.ts:41-54` normalizza in UTC (`Date.UTC`). Test boundary 18° compleanno `cliente.test.ts:32-41`. |
| **C1** Label "Riprova" errata | ✅ **RISOLTO** | Chiave `common.riprova` (it/en:50) usata in `CatalogoPage.tsx:156`, `ReceiptsPage.tsx:257`, `EmittiRicevutaForm.tsx:214`. |
| **C4** Tema/colore non live | ✅ **RISOLTO** (parziale → N5) | Estratto `theme.ts`; `applyTheme`/`applyPrimaryColor` richiamati in `SettingsPage.tsx:428-431` dopo `settings.set`. |
| **C5** Soglie non aggiornate | ✅ **RISOLTO** | `SettingsContext.tsx:15,56` espone `refresh()`; chiamato in `SettingsPage.tsx:433`. |
| B5, C2, C3, C6, B6, C9, N5 | ✅ **RISOLTO** (WP4, 2026-06-11) | Catalogo: `assegnati_count` dal backend (`catalog-repository.ts`), "Elimina" disabilitato se assegnato + banner errore nel `ConfirmDialog` (`CatalogoPage.tsx`, `ConfirmDialog.tsx`). Tema: scala primaria 50–900 derivata dal colore scelto (`theme.ts`, `scalaPrimaria`). Restore: file picker nativo `dialog:showOpenDialog` + conferma di successo (`handlers.ts`, `preload`, `RestoreDialog.tsx`). Ricevute: intestatario in testa, blocco se indirizzo incompleto, conferma con `AAAA-N` + "Visualizza PDF" (`EmittiRicevutaForm.tsx`, `utils/dominio.ts`, `utils/pdf.ts`). |
| B1, B2, B3, B4, B7–B12, C7, C8, C10, C11, C12, C13(residui), D1–D12, N4 | ⬜ **APERTO** | Non toccati. Nota storica: il commit `d2c199f` (titolo "p0-p3") corresse solo P0 + C1/C4/C5. A15a risolto in WP1; A15b/A15c registrati come decisioni (OPEN-QUESTIONS / DECISIONS D14). A7–A14 risolti in WP2. **B5/C2/C3/C6/B6/C9/N5 risolti in WP4.** B7 (indirizzo tutore) registrato in OPEN-QUESTIONS come follow-up di B6. |

**Conclusione:** i 9 fix dichiarati sono implementati correttamente e `verify` è verde. Restano aperti
i punti P1–P2–P4 e parte di P3, oltre ai nuovi rilievi sotto.

### Nuovi rilievi emersi dalla verifica

#### N1 — [MEDIA] ✅ RISOLTO (WP1) — `updateIscrizioneDate`/`updateAbbonamentoDate` possono "resuscitare" un record invalidato
- **Evidenza:** `memberships-repository.ts:92` e `:242`
- **Descrizione:** il fix A3 ricalcola lo stato **solo** dalle date (`attiva`/`scaduta`), senza considerare
  lo stato corrente. Modificando le date di un'iscrizione/abbonamento `invalidata`/`invalidato`, il
  record torna `attiva`/`attivo` (o `scaduta`). L'invariante 1 resta comunque protetta perché si
  controlla la presenza di **altre** attive, ma riportare in vita un record invalidato è
  semanticamente errato (annullerebbe di fatto un'invalidazione voluta).
- **Soluzione:** se lo stato corrente è `invalidata`/`invalidato`, conservarlo (o rifiutare l'update);
  ricalcolare `attiva`/`scaduta` solo se il record non era invalidato.

#### N2 — [BASSA] ✅ RISOLTO (WP1) — Check invariante 1 in `updateIscrizioneDate` non transazionale (TOCTOU)
- **Evidenza:** `memberships-repository.ts:94-115` (SELECT `altraAttiva` separato dall'UPDATE)
- **Descrizione:** la lettura di un'eventuale altra iscrizione attiva e l'UPDATE non sono nella stessa
  transazione. In un'app desktop monoutente il rischio è trascurabile, ma è incoerente con l'approccio
  `immediate()` adottato per A1.
- **Soluzione:** avvolgere check+UPDATE in `db.transaction(...).immediate()`.

#### N3 — [MEDIA] ✅ RISOLTO (WP1) — Copertura test mancante per i fix P0 (A2, A3, A5-negativo)
- **Evidenza:** nessun test su `aggiornaStatoIscrizioni/Abbonamenti` né su `updateIscrizioneDate/`
  `updateAbbonamentoDate` (grep in `tests/`); `receipts-invariants.test.ts:482` copre solo il caso
  **positivo** del minore con tutore, non quello del **maggiorenne con dati tutore** (cuore del fix A5).
- **Descrizione:** la Definition of Done richiede test sui fix P0 (l'analisi stessa lo chiedeva per A2).
  Oggi un'eventuale regressione su transizione automatica degli stati, ricalcolo date o
  intestazione di un adulto non verrebbe intercettata.
- **Soluzione:** aggiungere test Vitest: (a) iscrizione/abbonamento scaduti che dopo
  `aggiornaStato*` passano a `scaduta`/`scaduto`; (b) `updateIscrizioneDate` che ricalcola lo stato e
  rifiuta la seconda attiva (invariante 1); (c) ricevuta a un **maggiorenne** con `tutore_cf`
  valorizzato → intestatario = cliente, `assistito_cf` nullo. *(Nota minore: i test `isMinorenne`
  passano `new Date('YYYY-MM-DD')` (mezzanotte UTC); poiché il dominio normalizza `oggi` con i getter
  **locali**, in fusi a offset negativo il giorno potrebbe slittare — usare `new Date(Y, M, D)` per
  robustezza cross-timezone.)*

#### N4 — [BASSA] Ricevute storiche dei minori: `assistito_cf` nullo, dicitura ancora con CF tutore
- **Evidenza:** migrazione `006` aggiunge la colonna senza backfill; `ricevuta.ts:80`
  (`assistito_cf ?? intestatario_cf`)
- **Descrizione:** le ricevute di minori emesse **prima** della migrazione hanno `assistito_cf = NULL`;
  il template ripiega su `intestatario_cf`, che per quelle ricevute è il CF del tutore. Continueranno
  quindi a stampare "Tutore di [CF tutore]". Accettabile perché le ricevute sono **immutabili**
  (invariante 5), ma va documentato per evitare segnalazioni.
- **Soluzione:** nessuna azione sui dati (immutabilità); eventualmente annotare in `DECISIONS.md` che
  il fix A4 vale dalle nuove emissioni in poi.

#### N5 — [MEDIA] Il fix C4 resta parziale: il colore primario non si applica agli elementi principali
- **Evidenza:** `theme.ts:19-21` (`applyPrimaryColor` imposta **solo** `--color-primary-500`);
  `Shell.tsx:34` e bottoni usano `primary-600/700` (cfr. C13, ultimo punto)
- **Descrizione:** anche dopo C4 (applicazione live), cambiando il colore primario si aggiorna solo la
  tinta 500, mentre header e bottoni usano 600/700: per l'utente "il cambio colore non si vede" sugli
  elementi principali. Il fix C4 risolve il "serve riavvio" ma non l'inefficacia di fondo già segnalata
  in C13.
- **Soluzione:** in `applyPrimaryColor` derivare l'intera scala 50–900 dal colore scelto e impostare
  tutte le variabili `--color-primary-*` (non solo la 500).

### Verifica «verde»
`npm run verify` eseguito il 2026-06-08: **typecheck OK · lint 0 warning · 272 test passati (1 skip) ·
build OK**. La Definition of Done è soddisfatta per i fix applicati; i nuovi rilievi N1–N5 non bloccano
il verde ma andrebbero pianificati (N3 prioritario per allineamento alla DoD sui fix P0). **WP1 chiuso il 2026-06-08:** N1, N2, N3, A15a risolti e verificati; A15b/A15c registrati come decisioni. `npm run verify` verde. **WP2 chiuso il 2026-06-11:** A7–A14 risolti e verificati (validazioni, univocità tessera, blocco anonimizzati, date certificati, indicatori in scadenza, atomicità settings, commenti+fixture CF); `npm run verify` verde. **WP4 chiuso il 2026-06-11:** B5/C2/C3 (Elimina disabilitato se assegnato + feedback errore nel dialog), N5 (scala colore primaria 50–900), C6 + conferma di successo nel restore (file picker nativo), B6/C9 (intestatario in testa, blocco indirizzo incompleto, conferma con numero + Visualizza PDF) risolti e verificati; `npm run verify` verde (330 test, 1 skip, build OK). B7 (indirizzo tutore) registrato in OPEN-QUESTIONS come follow-up.
