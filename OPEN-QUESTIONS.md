# GymManager 2.0 — Domande aperte e assunzioni

Registro delle questioni non risolte nella specifica e delle assunzioni adottate.
Regola: se un requisito non è in `docs/`, **non inventarlo** — annotalo qui con un'assunzione chiaramente marcata e prosegui.

Formato:
- **[Aperta]** descrizione — assunzione adottata — dove impatta.
- **[Da verificare]** descrizione — chi/cosa serve per chiudere.

Voci iniziali:
- **[Da verificare]** Conservazione delle ricevute vs diritto alla cancellazione (GDPR): l'anonimizzazione del cliente conserva le ricevute emesse per obblighi fiscali. Confermare l'approccio col commercialista/DPO.
- **[Da verificare]** Eventuali obblighi di fatturazione elettronica/SDI per l'ASD: la v1 emette solo ricevute. Confermare col commercialista.
- **[Aperta]** Tabella codici catastali Belfiore richiesta da `calcolaCF` in `src/main/domain/codice-fiscale.ts`: la funzione accetta già il codice Belfiore come parametro (es. "H501" per Roma), ma l'interfaccia utente che guida l'utente alla selezione del comune ha bisogno di un dizionario comune→codice. Assunzione adottata: il dizionario sarà caricato come asset JSON esterno (non embeddato nel codice); la funzione `calcolaCF` continuerà a ricevere il codice già risolto. Impatta: form anagrafica cliente (campo "Comune di nascita" con autocompletamento), calcolo CF bidirezionale (F1 / UX).
- **[Assunzione]** Algoritmo CF — consistenza interna: i test di `codice-fiscale.ts` verificano la correttezza dell'algoritmo tramite round-trip (calcolaCF → isCodiceFiscaleValid → decodificaCF) senza dipendere da CF di persone reali. Se in futuro si vogliono aggiungere CF campione verificati da fonti ufficiali (es. sito Agenzia delle Entrate), aggiungerli come fixture separate documentando la fonte.
- **[Aperta]** A15b — Ricerca ricevute per numero senza vincolo d'anno in `listRicevute` (`src/main/db/receipts-repository.ts:242-254`): cercando "1" via parametro `search` numerico si troverebbe la ricevuta n.1 di ogni anno. Assunzione adottata: in pratica la pagina Ricevute (`ReceiptsPage.tsx`) passa **sempre** un `filtroAnno` e applica un ulteriore filtro testuale client-side su `AAAA-N`, quindi il caso è latente. Si lascia il comportamento backend invariato (documentato a codice). Impatta: ricerca ricevute (UX). Da chiudere: se in futuro si esporrà una ricerca cross-anno, combinare numero+anno nella query.
- **[Da verificare]** A15c — Migrazione `005_update_test` (`src/main/db/migrations/005_update_test.ts`) in produzione: aggiunge la colonna `note_interne` a `clienti`, nata come verifica del percorso di aggiornamento F6. È già stata applicata ai DB rilasciati (0.1.x), quindi **non va rimossa** dall'array (creerebbe divergenza tra DB esistenti e nuove installazioni). Decisione da confermare: promuovere `note_interne` a campo reale (note interne sul cliente, da esporre in UI) oppure lasciarla come colonna nullable inerte. Vedi nota in `docs/DECISIONS.md`.
