import { autoUpdater } from 'electron-updater'
import type { UpdateInfo, ProgressInfo, UpdateDownloadedEvent } from 'electron-updater'
import { BrowserWindow, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import log from 'electron-log'

/** Informazioni di progresso durante il download dell'aggiornamento. */
export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  total: number
  transferred: number
}

declare const __GITHUB_UPDATE_TOKEN__: string

/** Riferimento alla finestra principale, salvato da initAutoUpdater. */
let _mainWindow: BrowserWindow | null = null

/** macOS: serve un trattamento diverso perché senza firma Squirrel.Mac non auto-installa. */
const isMac = process.platform === 'darwin'

/**
 * Percorso del pacchetto di aggiornamento scaricato (macOS).
 * Su macOS non firmato non possiamo auto-installare: salviamo il file scaricato
 * così da poterlo rivelare in Finder e lasciare l'installazione manuale all'utente.
 */
let _downloadedFilePath: string | null = null

/**
 * Inizializza electron-updater e registra i listener degli eventi.
 * In ambiente di sviluppo non controlla gli aggiornamenti.
 */
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  _mainWindow = mainWindow
  // Usa electron-log come logger per l'updater
  autoUpdater.logger = log

  // Repo privato: per leggere le release serve l'API GitHub autenticata.
  // electron-updater sceglie il PrivateGitHubProvider SOLO se trova un token
  // nella config del provider (providerFactory): senza token usa il feed
  // pubblico `releases.atom`, che su un repo privato risponde 404.
  // requestHeaders da solo NON cambia la scelta del provider, quindi inseriamo
  // il token (PAT read-only iniettato a build time via Vite define) nella
  // config tramite setFeedURL; requestHeaders resta per le richieste dirette
  // (download degli asset).
  const updateToken = __GITHUB_UPDATE_TOKEN__
  if (updateToken) {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'federicoxella-space',
      repo: 'gymManager-2.0',
      private: true,
      token: updateToken
    })
    autoUpdater.requestHeaders = { Authorization: `token ${updateToken}` }
  }

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

  autoUpdater.on('update-downloaded', (info: UpdateDownloadedEvent) => {
    log.info(`[updater] Aggiornamento scaricato: v${info.version}`)
    // Su macOS conserviamo il percorso del pacchetto per rivelarlo in Finder:
    // l'app non firmata non può auto-installare (Squirrel.Mac richiede la firma).
    _downloadedFilePath = info.downloadedFile ?? null
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
 * Su macOS non firmato quitAndInstall fallirebbe (Squirrel.Mac richiede la firma):
 * in quel caso riveliamo il pacchetto in Finder per l'installazione manuale.
 */
export function installUpdate(): void {
  if (isMac) {
    revealDownloadedUpdate()
    return
  }
  autoUpdater.quitAndInstall()
}

/**
 * Rivela in Finder il pacchetto di aggiornamento scaricato (macOS).
 * L'utente lo apre, estrae GymManager.app e la trascina nella cartella Applicazioni.
 * Se per qualche motivo il percorso non è noto, apre la cartella dei download
 * dell'updater come fallback.
 */
export function revealDownloadedUpdate(): void {
  if (_downloadedFilePath) {
    shell.showItemInFolder(_downloadedFilePath)
  } else {
    log.warn('[updater] Nessun pacchetto scaricato da rivelare in Finder')
  }
}
