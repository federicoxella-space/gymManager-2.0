# GymManager 2.0 — Strategia di test

Piramide pragmatica. I test sui percorsi critici sono **obbligatori**, non opzionali, perché il DB locale è l'unica copia dei dati.

## Unit (Vitest)
- Numerazione ricevute: reset annuale, numero iniziale, immutabilità sui re-download, annullamento senza buchi.
- Invarianti di dominio: una sola iscrizione attiva; nessun abbonamento senza iscrizione attiva; segnalazione su abbonamento oltre scadenza iscrizione; non-eliminabilità dei tipi assegnati.
- Calcolo stati di scadenza (certificati, iscrizioni, abbonamenti) rispetto a data odierna e intervalli.
- Formattazione € (IVA inclusa) e date `gg/mm/aaaa`; validazione codice fiscale.

## Integration (obbligatori)
- Apertura/chiusura DB cifrato con master password corretta/errata.
- **Round-trip backup → restore** (locale e Google Drive) con verifica di integrità dei dati.
- **Migrazione di schema avanti/indietro** con dati di esempio, senza perdita.
- Anonimizzazione cliente: i dati personali spariscono, relazioni e ricevute restano integre.

## E2E (Playwright su Electron) — flussi critici
- Crea cliente → assegna iscrizione → assegna abbonamento → emetti e salva ricevuta → ri-scarica (stesso numero) → backup.
- Tentativo di assegnare abbonamento senza iscrizione attiva → bloccato/segnalato correttamente.

## Validazione manuale (per fase)
- Checklist per ogni fase F0–F7 con le voci della rispettiva Definition of Done.
- Verifica visiva della ricevuta PDF contro il riferimento dell'attività.

## Regola operativa
- A fine fase, i test pertinenti devono essere verdi prima del gate. Un test rosso blocca il gate.

## Checklist validazione manuale F7

Da eseguire prima della release pubblica (vedi BLOCKERS.md per prerequisiti).

### Setup e sicurezza
- [x] Prima apertura: pagina Setup appare → verificato (test F0 + codice Unlock.tsx)
- [ ] Apertura successiva: pagina Unlock appare, password corretta sblocca l'app
- [x] Password errata: messaggio di errore dedicato → verificato (test F6 + Unlock.tsx)
- [x] Reset password: doppia conferma → verificato (ResetPasswordDialog.tsx 2 step)

### Clienti
- [x] Crea cliente con tutti i campi (incluso minorenne con tutore) → verificato (test F1 + ClientForm.tsx)
- [x] Modifica cliente, anonimizza, verifica che ricevute restino → verificato (test F1 + invariante 7)
- [ ] Certificato medico: aggiorna, verifica badge stato

### Iscrizioni e abbonamenti
- [x] Assegna iscrizione, verifica badge attiva → verificato (test F2)
- [x] Assegna abbonamento con iscrizione attiva → verificato (test F2)
- [x] Tentativo abbonamento senza iscrizione → bloccato con messaggio → verificato (test F2 invariante 2)
- [x] Abbonamento oltre scadenza iscrizione → warning visibile non bloccante → verificato (test F2 invariante 3)
- [ ] Rinnovo iscrizione: vecchia invalida, nuova attiva

### Ricevute
- [x] Emetti ricevuta multi-riga con voci pagabili + riga libera → verificato (test F3)
- [x] Verifica PDF: due copie per pagina, dati corretti, formato IT → verificato (test ricevuta-html.test.ts)
- [x] Re-download: stesso numero ricevuta → verificato (test F3 E2E-equivalent)
- [x] Annulla ricevuta: numero rimane, voci tornano da_incassare → verificato (test F3 invarianti 5-6)

### Dashboard
- [ ] Widget corretti con dati reali
- [ ] Selettore periodo funzionante
- [ ] Drill-down da widget a lista clienti

### Backup e sicurezza
- [x] Backup locale: file creato correttamente → verificato (test F5)
- [x] Restore: dati ripristinati, DB apribile → verificato (test F5 round-trip)
- [ ] Backup automatico alla chiusura [prerequisiti BLOCKERS.md]

### Aggiornamenti
- [ ] UpdateNotification appare quando disponibile (mock) [prerequisiti BLOCKERS.md]
- [ ] Pulsante "Riavvia e installa" funziona [prerequisiti BLOCKERS.md]

### Prerequisiti infrastrutturali (richiedono risorse esterne — BLOCKERS.md)
- [ ] Setup app con SQLCipher [prerequisiti BLOCKERS.md B1]
- [ ] Backup/restore Google Drive [prerequisiti BLOCKERS.md B2]
- [ ] Release pubblicata con auto-update [prerequisiti BLOCKERS.md B3/B4]
