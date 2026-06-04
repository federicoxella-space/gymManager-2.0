---
name: electron-sicurezza
description: Baseline di sicurezza per l'app Electron di GymManager 2.0 (isolamento del contesto, IPC via preload, gestione della master password e della cifratura, configurazione dell'auto-update). Usala lavorando su processo main, preload o packaging.
---
# Sicurezza Electron

## Isolamento
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox` attivo dove possibile.
- Il **renderer non accede mai** direttamente a Node, filesystem o DB.
- Tutta la comunicazione passa da un **preload** che espone un'API IPC ristretta e tipizzata (`contextBridge`).
- Valida gli input lato main; non esporre canali generici.

## Master password e cifratura
- Al primo avvio l'utente imposta una **master password**; da essa si deriva (KDF) la chiave per SQLCipher.
- La chiave/derivazione resta in memoria nel processo main per la sessione; non va scritta in chiaro su disco.
- **Reset password** = perdita dei dati (nessun recupero), con avviso esplicito e doppia conferma.

## Auto-update
- `electron-updater` con feed su GitHub Releases.
- Per ora **senza code signing**: documentare che Windows SmartScreen può mostrare avvisi finché l'eseguibile non acquista reputazione.
- L'update deve innescare le migrazioni (skill `migrazioni-db`) al primo avvio post-aggiornamento.

## Generale
- Nessun segreto hardcoded nel sorgente.
- Le credenziali OAuth di Google Drive vanno gestite secondo la skill `backup-drive`.
