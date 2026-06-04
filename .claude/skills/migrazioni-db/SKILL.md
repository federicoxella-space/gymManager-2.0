---
name: migrazioni-db
description: Come scrivere ed eseguire migrazioni SQLite/SQLCipher versionate e reversibili, e la migrazione automatica dei dati all'aggiornamento dell'app. Usala per ogni modifica allo schema del database.
---
# Migrazioni del database

Il DB locale è l'**unica copia** dei dati: ogni cambio di schema deve essere sicuro e tracciato.

## Principi
- Le migrazioni sono **versionate** e applicate in ordine; il DB memorizza la versione corrente dello schema.
- Ogni migrazione ha `up` (applica) e, dove possibile, `down` (reverte).
- All'avvio l'app confronta versione schema vs versione attesa e applica le migrazioni mancanti.
- **Mai** operazioni distruttive senza percorso sicuro: per cambi rischiosi, esegui prima un backup automatico (vedi skill `backup-drive`).

## Migrazione all'aggiornamento
- Dopo un auto-update che cambia lo schema, le migrazioni si applicano automaticamente al primo avvio sul DB esistente, **preservando i dati**.
- In caso di errore di migrazione: interrompi, non lasciare il DB in stato incoerente, ripristina dal backup pre-migrazione e segnala.

## SQLCipher
- Le migrazioni operano sul DB già aperto/cifrato con la chiave derivata dalla master password.
- Non scrivere mai la chiave o dati in chiaro su disco durante il processo.

## Stile
- Migrazioni piccole e atomiche; una preoccupazione per migrazione.
- Test obbligatori di migrazione avanti/indietro con dati di esempio (vedi `docs/TESTING.md`).
