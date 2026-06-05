import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import log from 'electron-log'
import { closeDatabase, isDatabaseOpen } from './db/database'
import { registerIpcHandlers } from './ipc/handlers'
import { loadSettings } from './settings/store'
import { backupAutomatico } from './backup/backup-service'

function createWindow(): BrowserWindow {
  const preloadPath = join(__dirname, '../preload/index.js')

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox:false necessario perché il preload usa require() di Node.js
      // (ipcRenderer da 'electron', @electron-toolkit/preload). Con sandbox:true
      // il preload avrebbe accesso solo alle API Electron esposte come globali.
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Apri i link esterni nel browser di sistema invece che in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // In sviluppo usa il dev server di Vite; in produzione carica il file statico
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// Inizializzazione dell'app
app.whenReady().then(() => {
  // Imposta l'App User Model ID (usato da Windows per notifiche/taskbar)
  electronApp.setAppUserModelId('it.gymmanager.app')

  // Ottimizzazioni (DevTools con F12 in dev, ignora Ctrl+R in prod, ecc.)
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Registra tutti gli handler IPC prima di creare la finestra
  registerIpcHandlers()

  createWindow()

  app.on('activate', () => {
    // Su macOS è comune ricreare la finestra quando si clicca sull'icona nel dock
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  log.info('[main] Tutte le finestre chiuse')

  // Backup automatico alla chiusura se settings.backup_on_close === 'true' e DB aperto
  if (isDatabaseOpen()) {
    try {
      const settings = loadSettings()
      const backupOnClose = (settings as unknown as Record<string, unknown>)['backup_on_close']
      if (backupOnClose !== false && backupOnClose !== 'false') {
        // Esegui in modo sincrono tramite void: non blocca la chiusura
        backupAutomatico()
          .then((p) => log.info(`[main] Backup automatico chiusura completato: ${p}`))
          .catch((err) => log.warn('[main] Backup automatico chiusura fallito (non bloccante):', err))
      }
    } catch (err) {
      log.warn('[main] Errore lettura settings per backup chiusura:', err)
    }
  }

  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Gestione errori non catturati nel main process
process.on('uncaughtException', (err) => {
  log.error('[main] Errore non catturato:', err)
})

process.on('unhandledRejection', (reason) => {
  log.error('[main] Promise rejection non gestita:', reason)
})
