# GymManager 2.0 — Modello di dominio

## Entità principali
- **ImpostazioniAttivita**: ragione sociale, indirizzo, Cod.Fis./P.IVA, logo, colore primario, intervalli di segnalazione scadenze (distinti per certificati/iscrizioni/abbonamenti), numero iniziale ricevute per anno, dicitura a piè di ricevuta, configurazione backup, widget dashboard visibili.
- **Cliente**: dati anagrafici (nome, cognome, codice fiscale, indirizzo, contatti), numero tessera (automatico, sovrascrivibile, univoco), eventuale tutore (per minori), stato (attivo / anonimizzato).
- **CertificatoMedico**: appartiene a un Cliente; tipo, data di scadenza. Stato derivato: valido / in scadenza / scaduto.
- **TipoIscrizione** (catalogo): es. tesseramento annuale; descrizione, durata (mesi) e prezzo di default; invalidabile; non eliminabile se assegnato.
- **TipoAbbonamento** (catalogo): es. sala pesi, yoga; descrizione, durata (mesi) e prezzo di default, categoria/colore (per la dashboard); invalidabile; non eliminabile se assegnato.
- **IscrizioneCliente**: associazione Cliente–TipoIscrizione con periodo (inizio/scadenza), prezzo e stato pagamento copiati all'assegnazione, stato (attiva / scaduta / invalidata). Storico dei rinnovi.
- **AbbonamentoCliente**: associazione Cliente–TipoAbbonamento con periodo, prezzo e stato pagamento, stato.
- **Ricevuta**: documento immutabile; numero (progressivo per anno della data di emissione, scelta dall'utente), data emissione, destinatario (snapshot dati cliente, o tutore se minore), righe, totale, metodo/stato pagamento, stato (emessa / annullata).
- **RigaRicevuta**: voce, periodo, prezzo. Origine: una voce pagabile (iscrizione/abbonamento) oppure una riga libera (addebito una tantum).

## Relazioni
- Cliente 1—N CertificatoMedico (storico) ; 1—1 certificato corrente.
- Cliente 1—N IscrizioneCliente (storico) ; al più 1 attiva per volta.
- Cliente 1—N AbbonamentoCliente.
- Cliente 1—N Ricevuta.
- TipoIscrizione/TipoAbbonamento 1—N associazioni cliente.

## Invarianti (autorevoli — vedi anche CLAUDE.md)
1. Al più una IscrizioneCliente **attiva** per Cliente in un dato momento.
2. Nessun AbbonamentoCliente assegnabile se il Cliente non ha un'iscrizione attiva.
3. Abbonamento con scadenza oltre quella dell'iscrizione: ammesso con **segnalazione non bloccante**.
4. TipoIscrizione/TipoAbbonamento non eliminabili se hanno associazioni; restano modificabili. Le modifiche a prezzo/durata di default non sono retroattive (le assegnazioni copiano i valori all'atto dell'assegnazione).
5. Ricevuta immutabile: solo annullamento (mantiene numero, niente buchi); le voci coperte tornano «da incassare».
6. Numerazione ricevute progressiva per anno della data di emissione (scelta dall'utente), numero iniziale configurabile, assegnato al salvataggio e poi invariato.
7. Cancellazione Cliente = anonimizzazione dei campi personali nell'anagrafica; relazioni e ricevute integre. (Nota legale: la conservazione delle ricevute risponde a obblighi fiscali — da verificare col commercialista.)
8. Stati di scadenza calcolati rispetto alla data odierna e agli intervalli configurati.

## Glossario
- **Iscrizione**: tesseramento (tipicamente annuale) richiesto per poter avere abbonamenti.
- **Abbonamento**: accesso a una specifica attività (pesi, yoga, ...).
- **Ricevuta**: documento di pagamento (non fattura; niente SDI).
- **Invalidare**: portare un'entità/associazione a stato non valido senza cancellarla (preserva storico).
