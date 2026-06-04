import { ipcMain, app } from 'electron'
import log from 'electron-log'
import { checkFirstRun, openDatabase, isDatabaseOpen } from '../db/database'
import { loadSettings, saveSettings } from '../settings/store'
import type { AppSettings, DbState } from '../../types/shared'

/**
 * Registra tutti gli handler IPC dell'applicazione.
 * Deve essere chiamata prima della creazione della finestra principale.
 */
export function registerIpcHandlers(): void {
  // ── Database ─────────────────────────────────────────────────────────────

  /**
   * Restituisce lo stato corrente del database:
   * - 'firstRun': nessun DB su disco (primo avvio)
   * - 'locked': DB esiste ma non è stato sbloccato
   * - 'ready': DB aperto e pronto
   */
  ipcMain.handle('db:getState', (): { state: DbState } => {
    try {
      if (isDatabaseOpen()) {
        return { state: 'ready' }
      }
      if (checkFirstRun()) {
        return { state: 'firstRun' }
      }
      return { state: 'locked' }
    } catch (err) {
      log.error('[ipc] db:getState errore:', err)
      throw new Error('Impossibile determinare lo stato del database')
    }
  })

  /**
   * Primo avvio: crea il database con la password scelta dall'utente.
   */
  ipcMain.handle('db:setup', async (_event, { password }: { password: string }): Promise<void> => {
    try {
      if (!password || password.trim().length === 0) {
        throw new Error('La password non può essere vuota')
      }
      openDatabase(password)
      log.info('[ipc] db:setup completato')
    } catch (err) {
      log.error('[ipc] db:setup errore:', err)
      if (err instanceof Error && err.message === 'PASSWORD_WRONG') {
        throw new Error('Password non valida')
      }
      throw err instanceof Error ? err : new Error('Errore durante la configurazione del database')
    }
  })

  /**
   * Avvii successivi: sblocca il database esistente con la master password.
   */
  ipcMain.handle(
    'db:unlock',
    async (_event, { password }: { password: string }): Promise<void> => {
      try {
        if (!password || password.trim().length === 0) {
          throw new Error('La password non può essere vuota')
        }
        openDatabase(password)
        log.info('[ipc] db:unlock completato')
      } catch (err) {
        log.error('[ipc] db:unlock errore:', err)
        if (err instanceof Error && err.message === 'PASSWORD_WRONG') {
          throw new Error('Password errata. Riprova.')
        }
        throw err instanceof Error ? err : new Error('Errore durante lo sblocco del database')
      }
    }
  )

  /**
   * Indica se il database è attualmente aperto.
   */
  ipcMain.handle('db:isOpen', (): boolean => {
    return isDatabaseOpen()
  })

  // ── Impostazioni ─────────────────────────────────────────────────────────

  /**
   * Restituisce le impostazioni correnti dell'applicazione.
   */
  ipcMain.handle('settings:get', (): AppSettings => {
    try {
      return loadSettings()
    } catch (err) {
      log.error('[ipc] settings:get errore:', err)
      throw new Error('Impossibile leggere le impostazioni')
    }
  })

  /**
   * Aggiorna (merge parziale) le impostazioni dell'applicazione.
   */
  ipcMain.handle(
    'settings:set',
    (_event, { settings }: { settings: Partial<AppSettings> }): void => {
      try {
        const current = loadSettings()
        const updated: AppSettings = { ...current, ...settings }
        saveSettings(updated)
      } catch (err) {
        log.error('[ipc] settings:set errore:', err)
        throw new Error('Impossibile salvare le impostazioni')
      }
    }
  )

  // ── App ──────────────────────────────────────────────────────────────────

  /**
   * Restituisce la versione dell'applicazione.
   */
  ipcMain.handle('app:getVersion', (): string => {
    return app.getVersion()
  })

  log.info('[ipc] Handler IPC registrati')
}
