# GymManager 2.0 — Blocchi e risorse da fornire

Questo file documenta le risorse mancanti, le dipendenze esterne e i debiti tecnici
che richiedono azione manuale dell'utente prima del deploy in produzione.

---

## B1 — SQLCipher: compilazione nativa di better-sqlite3

**Cosa serve**: `better-sqlite3` ricompilato con supporto SQLCipher per l'ambiente Electron.

**Perché**: Il binario standard `better-sqlite3` usa SQLite puro. Per la cifratura del DB con
master password (PRAGMA key) è necessario compilare contro la libreria SQLCipher.

**Come attivare**:

### Windows (sviluppo)
1. Installare SQLCipher:
   ```powershell
   # Con vcpkg
   vcpkg install sqlcipher:x64-windows
   # oppure scaricare i prebuilt da https://www.zetetic.net/sqlcipher/
   ```
2. Impostare le variabili d'ambiente di build:
   ```powershell
   $env:SQLCIPHER = 1
   $env:SQLCIPHER_INCLUDE = "C:\path\to\sqlcipher\include"
   $env:SQLCIPHER_LIBDIR = "C:\path\to\sqlcipher\lib"
   ```
3. Eseguire:
   ```powershell
   npx electron-rebuild -f -w better-sqlite3
   ```

### macOS / Linux (CI — già configurato in .github/workflows/ci.yml)
```bash
sudo apt-get install -y libsqlcipher-dev   # Ubuntu/Debian
brew install sqlcipher                      # macOS
SQLCIPHER=1 npx electron-rebuild -f -w better-sqlite3
```

**Dove impatta**: `src/main/db/database.ts` — la funzione `openDatabase` applica già
`PRAGMA key` con la chiave derivata. Senza SQLCipher compilato il PRAGMA viene ignorato
silenziosamente (DB non cifrato). Con SQLCipher il DB è cifrato a riposo.

**Test interessato**: `tests/unit/db.test.ts` — test `[CIPHER] apre con password errata`
è attualmente skippato; verrà abilitato automaticamente quando SQLCipher è disponibile.

---

## B2 — GitHub OAuth: credenziali per backup su Google Drive (F5)

**Cosa serve**: Client ID e Client Secret OAuth 2.0 di Google Cloud Console per il
backup su Google Drive (scope `drive.file`).

**Come ottenere**:
1. Accedere a https://console.cloud.google.com/
2. Creare un progetto (es. "GymManager")
3. Abilitare l'API Google Drive
4. Creare credenziali OAuth 2.0 per "Applicazione desktop"
5. Scaricare il file `credentials.json`

**Dove inserire**: da definire nella fase F5. Le credenziali NON vanno nel sorgente;
andranno in una variabile d'ambiente o nel file di configurazione cifrato dell'app.

**Nota sicurezza (D5)**: il backup è il file DB già cifrato con SQLCipher, quindi
non richiede ulteriore cifratura lato Drive.

---

## B3 — GitHub Release: token PAT per auto-update (F6/F7)

**Cosa serve**: Personal Access Token GitHub con permesso `repo` (write) per
pubblicare le release su cui punta `electron-updater`.

**Come ottenere**: GitHub → Settings → Developer settings → Personal access tokens →
Generate new token (classic) con scope `repo`.

**Dove inserire**: segreto `GH_TOKEN` nel repository GitHub (Settings → Secrets → Actions).

---

## B4 — electron-builder: owner GitHub corretto

**Cosa serve**: aggiornare `owner` in `electron-builder.yml` con il nome utente/organizzazione
GitHub reale che ospita il repository.

**File**: `electron-builder.yml`, campo `publish.owner` (attualmente `GymManagerOwner`).

---

## B5 — Risorse grafiche: icone e logo

**Cosa serve**:
- `resources/icon.ico` — icona Windows (richiesta da electron-builder per l'installer NSIS)
- Logo dell'attività (formato PNG, min 256×256) — usato nella ricevuta PDF e nell'interfaccia

**Dove inserire**: directory `resources/` per le icone; la configurazione del logo avviene
tramite la pagina Impostazioni → Logo all'interno dell'app.
