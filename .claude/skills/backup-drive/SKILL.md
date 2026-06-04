---
name: backup-drive
description: Procedura di backup e restore di GymManager 2.0 - artefatto = DB cifrato, backup locale su file e backup cloud su Google Drive con scope drive.file, vincoli di restore. Usala per funzioni di backup, restore o integrazione Drive.
---
# Backup e restore

## Artefatto di backup
- Il backup è una **copia del file DB cifrato (SQLCipher)** più un piccolo manifest con la versione dello schema.
- Essendo cifrato per costruzione, vale sia per il backup locale sia per quello su cloud (nessun secondo livello di cifratura aggiunto).

## Backup locale
- Salvataggio su file scelto dall'utente, con backup automatici periodici configurabili.

## Backup su Google Drive
- Integrazione tramite `googleapis` con scope **`drive.file`** (accesso ai soli file creati dall'app), per ridurre l'attrito di verifica OAuth.
- L'app carica/aggiorna il file di backup nella propria area; non accede ad altri file dell'utente.

## Restore
- Il restore richiede la **master password con cui il backup è stato creato** (il file è cifrato).
- Verifica la versione dello schema nel manifest: se più vecchia, applica le migrazioni (skill `migrazioni-db`) dopo il ripristino.
- Conferma esplicita prima di sovrascrivere il DB corrente.

## Vincoli da documentare all'utente
- Un "reset master password" cancella i dati: per recuperare serve un backup creato con la vecchia password.
