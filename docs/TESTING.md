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
