# GymManager 2.0 — Specifica

Remake di un gestionale desktop per palestre: gestione di clienti, iscrizioni, abbonamenti e ricevute.

> Dettaglio funzionale per sezione: vedi `docs/FUNZIONALITA.md`.

## Caratteristiche
- **Facile e intuitiva**: usabile da un utente non tecnico con poco sforzo.
- **Moderna e professionale**: interfaccia gradevole ma sobria.
- **Personalizzabile**: dati anagrafici dell'attività, logo, e impostazioni funzionali (es. intervallo di segnalazione delle scadenze).
- **Desktop installabile** su PC Windows.
- **Offline**: i dati restano sulla macchina dell'utente (singolo PC).
- **Sicura**: cifratura a riposo (SQLCipher) con master password, backup e restore.
- **Aggiornamenti automatici** via GitHub Releases (electron-updater), senza installazione manuale.

## Funzionalità
- **Gestione iscrizioni**: creare, modificare e invalidare i tipi di iscrizione (es. tesseramento annuale). Non eliminabili se assegnati.
- **Gestione abbonamenti**: creare, modificare e invalidare tipi di abbonamento (sala pesi, yoga, zumba, pilates, ...). Non eliminabili se assegnati.
- **Gestione clienti**: anagrafica con i dati necessari e vista dettaglio. Include tracciamento del **certificato medico** (tipo e scadenza).
- **Associazioni**: a ogni cliente una sola iscrizione attiva e uno o più abbonamenti, secondo le invarianti.
- **Pagamenti e ricevute**: stato pagamento (pagato / da incassare) e metodo (contanti / POS / bonifico); generazione ricevuta PDF.
- **Dashboard**: pagina principale con i widget più importanti.
- **Sicurezza dati**: backup locale (file) e su Google Drive; restore; reset master password (con perdita dati).
- **Cancellazione cliente** (diritto dell'interessato): anonimizzazione dei dati personali, conservando ricevute e integrità.

## Dashboard — widget
Richiesti:
- Certificati medici in scadenza / scaduti (finestra temporale configurabile; dettaglio clienti al click).
- Iscrizioni / abbonamenti in scadenza (finestra configurabile).

Proposti (utili):
- Incassi del periodo (con distinzione pagato / da incassare).
- Soci con iscrizione attiva (totale) e clienti con iscrizione scaduta da rinnovare.
- Nuovi tesseramenti nel periodo.
- Distribuzione abbonamenti per tipo.
- Ricevute emesse nel periodo e totale incassato via ricevuta.
- (Opzionale) compleanni della settimana.

## Fuori scope (v1)
- Fattura elettronica / SDI.
- Più postazioni / dati condivisi in rete.
- Code signing dell'eseguibile (si accettano gli avvisi SmartScreen).
