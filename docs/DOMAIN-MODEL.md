# GymManager 2.0 — Modello di dominio

## Entità principali
- **ImpostazioniAttivita**: ragione sociale, indirizzo, Cod.Fis./P.IVA, logo, colore primario, intervalli di segnalazione scadenze, numero iniziale ricevute per anno.
- **Cliente**: dati anagrafici (nome, cognome, codice fiscale, indirizzo, contatti), eventuale tutore (per minori), stato (attivo / anonimizzato).
- **CertificatoMedico**: appartiene a un Cliente; tipo, data di scadenza. Stato derivato: valido / in scadenza / scaduto.
- **TipoIscrizione** (catalogo): es. tesseramento annuale; descrizione, durata/prezzo di riferimento; invalidabile; non eliminabile se assegnato.
- **TipoAbbonamento** (catalogo): es. sala pesi, yoga; descrizione, durata/prezzo di riferimento; invalidabile; non eliminabile se assegnato.
- **IscrizioneCliente**: associazione Cliente–TipoIscrizione con periodo (inizio/scadenza) e stato (attiva / scaduta / invalidata). Storico dei rinnovi.
- **AbbonamentoCliente**: associazione Cliente–TipoAbbonamento con periodo e stato.
- **Ricevuta**: documento immutabile; numero (progressivo per anno), data emissione, destinatario (snapshot dati cliente), righe, totale, metodo/stato pagamento, stato (emessa / annullata).
- **RigaRicevuta**: voce, periodo, prezzo.

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
4. TipoIscrizione/TipoAbbonamento non eliminabili se hanno associazioni; restano modificabili.
5. Ricevuta immutabile: solo annullamento (mantiene numero, niente buchi).
6. Numerazione ricevute progressiva per anno solare, numero iniziale configurabile, assegnato al salvataggio e poi invariato.
7. Cancellazione Cliente = anonimizzazione dei campi personali nell'anagrafica; relazioni e ricevute integre. (Nota legale: la conservazione delle ricevute risponde a obblighi fiscali — da verificare col commercialista.)
8. Stati di scadenza calcolati rispetto alla data odierna e agli intervalli configurati.

## Glossario
- **Iscrizione**: tesseramento (tipicamente annuale) richiesto per poter avere abbonamenti.
- **Abbonamento**: accesso a una specifica attività (pesi, yoga, ...).
- **Ricevuta**: documento di pagamento (non fattura; niente SDI).
- **Invalidare**: portare un'entità/associazione a stato non valido senza cancellarla (preserva storico).
