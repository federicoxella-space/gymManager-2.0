import { autoUpdater } from 'electron-updater'
import type { UpdateInfo, ProgressInfo } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import log from 'electron-log'

/** Informazioni di progresso durante il download dell'aggiornamento. */
export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  total: number
  transferred: number
}

/** Riferimento alla finestra principale, salvato da initAutoUpdater. */
let _mainWindow: BrowserWindow | null = null

/**
 * Inizializza electron-updater e registra i listener degli eventi.
 * In ambiente di sviluppo non controlla gli aggiornamenti.
 */
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  _mainWindow = mainWindow
  // Usa electron-log come logger per l'updater
  autoUpdater.logger = log

  autoUpdater.on('checking-for-update', () => {
    log.info('[updater] Verifica aggiornamenti in corso...')
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info(`[updater] Aggiornamento disponibile: v${info.version}`)
    mainWindow.webContents.send('update:available', info)
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    log.info(`[updater] Nessun aggiornamento disponibile (versione corrente: v${info.version})`)
    mainWindow.webContents.send('update:not-available')
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    const progressData: UpdateProgress = {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      total: progress.total,
      transferred: progress.transferred
    }
    log.info(`[updater] Download: ${progress.percent.toFixed(1)}%`)
    mainWindow.webContents.send('update:progress', progressData)
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log.info(`[updater] Aggiornamento scaricato: v${info.version}`)
    mainWindow.webContents.send('update:downloaded', info)
  })

  autoUpdater.on('error', (err: Error) => {
    log.error('[updater] Errore:', err.message)
    mainWindow.webContents.send('update:error', err.message)
  })

  // In produzione avvia il controllo automatico degli aggiornamenti
  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
      log.error('[updater] Errore nel controllo aggiornamenti:', err.message)
    })
  } else {
    log.info('[updater] Ambiente di sviluppo: controllo aggiornamenti disabilitato')
  }
}

/**
 * Avvia manualmente il controllo degli aggiornamenti.
 * In dev mode non esiste app-update.yml (generato solo da electron-builder),
 * quindi electron-updater emetterebbe un errore inutile: in quel caso
 * notifichiamo direttamente il renderer che non ci sono aggiornamenti.
 */
export function checkForUpdates(): void {
  if (is.dev) {
    log.info('[updater] checkForUpdates ignorato in modalità sviluppo')
    _mainWindow?.webContents.send('update:not-available')
    return
  }
  autoUpdater.checkForUpdates().catch((err: Error) => {
    log.error('[updater] Errore nel controllo aggiornamenti:', err.message)
  })
}

/**
 * Installa l'aggiornamento già scaricato e riavvia l'applicazione.
 * Deve essere chiamato solo dopo che l'evento 'update-downloaded' è stato emesso.
 */
export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
