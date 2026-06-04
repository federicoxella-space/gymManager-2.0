import { ipcMain, app } from 'electron'
import log from 'electron-log'
import { checkFirstRun, openDatabase, isDatabaseOpen } from '../db/database'
import { loadSettings, saveSettings } from '../settings/store'
import {
  createCliente,
  getCliente,
  updateCliente,
  listClienti,
  anonimizzaCliente
} from '../db/clients-repository'
import { addCertificato, listCertificati } from '../db/certificates-repository'
import {
  createTipoIscrizione,
  updateTipoIscrizione,
  listTipiIscrizione,
  deleteTipoIscrizione,
  invalidaTipoIscrizione,
  createTipoAbbonamento,
  updateTipoAbbonamento,
  listTipiAbbonamento,
  deleteTipoAbbonamento,
  invalidaTipoAbbonamento
} from '../db/catalog-repository'
import {
  assegnaIscrizione,
  getIscrizioneAttiva,
  listIscrizioni,
  updateIscrizioneDate,
  invalidaIscrizione,
  assegnaAbbonamento,
  listAbbonamenti,
  updateAbbonamentoDate,
  invalidaAbbonamento
} from '../db/memberships-repository'
import { validaCliente, validaClienteUpdate } from '../domain/cliente'
import type {
  AppSettings,
  DbState,
  ClienteRow,
  CreateClienteInput,
  UpdateClienteInput,
  ClientiFilters,
  CertificatoRow,
  CreateCertificatoInput,
  TipoIscrizioneRow,
  TipoAbbonamentoRow,
  CreateTipoIscrizioneInput,
  UpdateTipoIscrizioneInput,
  CreateTipoAbbonamentoInput,
  UpdateTipoAbbonamentoInput,
  IscrizioneClienteRow,
  AbbonamentoClienteRow,
  AssegnaIscrizioneInput,
  AssegnaAbbonamentoInput
} from '../../types/shared'

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

  // ── Clienti ──────────────────────────────────────────────────────────────

  ipcMain.handle(
    'clienti:list',
    (_event, filters?: ClientiFilters): ClienteRow[] => {
      try {
        return listClienti(filters)
      } catch (err) {
        log.error('[ipc] clienti:list errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero clienti')
      }
    }
  )

  ipcMain.handle(
    'clienti:get',
    (_event, id: number): ClienteRow | null => {
      try {
        return getCliente(id)
      } catch (err) {
        log.error('[ipc] clienti:get errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero cliente')
      }
    }
  )

  ipcMain.handle(
    'clienti:create',
    (_event, data: CreateClienteInput): ClienteRow => {
      try {
        const validation = validaCliente(data)
        if (!validation.valid) {
          const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
          throw new Error(`VALIDATION_ERROR: ${errorMsg}`)
        }
        return createCliente(data)
      } catch (err) {
        log.error('[ipc] clienti:create errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante la creazione del cliente')
      }
    }
  )

  ipcMain.handle(
    'clienti:update',
    (_event, id: number, data: UpdateClienteInput): ClienteRow => {
      try {
        const validation = validaClienteUpdate(data)
        if (!validation.valid) {
          const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
          throw new Error(`VALIDATION_ERROR: ${errorMsg}`)
        }
        return updateCliente(id, data)
      } catch (err) {
        log.error('[ipc] clienti:update errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'aggiornamento del cliente")
      }
    }
  )

  ipcMain.handle(
    'clienti:anonimizza',
    (_event, id: number): void => {
      try {
        anonimizzaCliente(id)
      } catch (err) {
        log.error('[ipc] clienti:anonimizza errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante l\'anonimizzazione del cliente')
      }
    }
  )

  // ── Certificati ──────────────────────────────────────────────────────────

  ipcMain.handle(
    'certificati:list',
    (_event, clienteId: number): CertificatoRow[] => {
      try {
        return listCertificati(clienteId)
      } catch (err) {
        log.error('[ipc] certificati:list errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero certificati')
      }
    }
  )

  ipcMain.handle(
    'certificati:add',
    (_event, data: CreateCertificatoInput): CertificatoRow => {
      try {
        return addCertificato(data)
      } catch (err) {
        log.error('[ipc] certificati:add errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante l\'aggiunta del certificato')
      }
    }
  )

  // ── Catalogo: TipiIscrizione ──────────────────────────────────────────────

  ipcMain.handle(
    'catalogo:tipiIscrizione:list',
    (_event, includeNonValidi?: boolean): TipoIscrizioneRow[] => {
      try {
        return listTipiIscrizione(includeNonValidi)
      } catch (err) {
        log.error('[ipc] catalogo:tipiIscrizione:list errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero tipi iscrizione')
      }
    }
  )

  ipcMain.handle(
    'catalogo:tipiIscrizione:create',
    (_event, data: CreateTipoIscrizioneInput): TipoIscrizioneRow => {
      try {
        return createTipoIscrizione(data)
      } catch (err) {
        log.error('[ipc] catalogo:tipiIscrizione:create errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante la creazione del tipo iscrizione')
      }
    }
  )

  ipcMain.handle(
    'catalogo:tipiIscrizione:update',
    (_event, { id, data }: { id: number; data: UpdateTipoIscrizioneInput }): TipoIscrizioneRow => {
      try {
        return updateTipoIscrizione(id, data)
      } catch (err) {
        log.error('[ipc] catalogo:tipiIscrizione:update errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'aggiornamento del tipo iscrizione")
      }
    }
  )

  ipcMain.handle(
    'catalogo:tipiIscrizione:delete',
    (_event, { id }: { id: number }): void => {
      try {
        deleteTipoIscrizione(id)
      } catch (err) {
        log.error('[ipc] catalogo:tipiIscrizione:delete errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'eliminazione del tipo iscrizione")
      }
    }
  )

  ipcMain.handle(
    'catalogo:tipiIscrizione:invalida',
    (_event, { id }: { id: number }): void => {
      try {
        invalidaTipoIscrizione(id)
      } catch (err) {
        log.error('[ipc] catalogo:tipiIscrizione:invalida errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'invalidazione del tipo iscrizione")
      }
    }
  )

  // ── Catalogo: TipiAbbonamento ─────────────────────────────────────────────

  ipcMain.handle(
    'catalogo:tipiAbbonamento:list',
    (_event, includeNonValidi?: boolean): TipoAbbonamentoRow[] => {
      try {
        return listTipiAbbonamento(includeNonValidi)
      } catch (err) {
        log.error('[ipc] catalogo:tipiAbbonamento:list errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero tipi abbonamento')
      }
    }
  )

  ipcMain.handle(
    'catalogo:tipiAbbonamento:create',
    (_event, data: CreateTipoAbbonamentoInput): TipoAbbonamentoRow => {
      try {
        return createTipoAbbonamento(data)
      } catch (err) {
        log.error('[ipc] catalogo:tipiAbbonamento:create errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante la creazione del tipo abbonamento')
      }
    }
  )

  ipcMain.handle(
    'catalogo:tipiAbbonamento:update',
    (_event, { id, data }: { id: number; data: UpdateTipoAbbonamentoInput }): TipoAbbonamentoRow => {
      try {
        return updateTipoAbbonamento(id, data)
      } catch (err) {
        log.error('[ipc] catalogo:tipiAbbonamento:update errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'aggiornamento del tipo abbonamento")
      }
    }
  )

  ipcMain.handle(
    'catalogo:tipiAbbonamento:delete',
    (_event, { id }: { id: number }): void => {
      try {
        deleteTipoAbbonamento(id)
      } catch (err) {
        log.error('[ipc] catalogo:tipiAbbonamento:delete errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'eliminazione del tipo abbonamento")
      }
    }
  )

  ipcMain.handle(
    'catalogo:tipiAbbonamento:invalida',
    (_event, { id }: { id: number }): void => {
      try {
        invalidaTipoAbbonamento(id)
      } catch (err) {
        log.error('[ipc] catalogo:tipiAbbonamento:invalida errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'invalidazione del tipo abbonamento")
      }
    }
  )

  // ── Iscrizioni ────────────────────────────────────────────────────────────

  ipcMain.handle(
    'iscrizioni:assegna',
    (_event, data: AssegnaIscrizioneInput): IscrizioneClienteRow => {
      try {
        return assegnaIscrizione(data)
      } catch (err) {
        log.error('[ipc] iscrizioni:assegna errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'assegnazione dell'iscrizione")
      }
    }
  )

  ipcMain.handle(
    'iscrizioni:getAttiva',
    (_event, { clienteId }: { clienteId: number }): IscrizioneClienteRow | null => {
      try {
        return getIscrizioneAttiva(clienteId)
      } catch (err) {
        log.error('[ipc] iscrizioni:getAttiva errore:', err)
        throw err instanceof Error ? err : new Error("Errore nel recupero dell'iscrizione attiva")
      }
    }
  )

  ipcMain.handle(
    'iscrizioni:list',
    (_event, { clienteId }: { clienteId: number }): IscrizioneClienteRow[] => {
      try {
        return listIscrizioni(clienteId)
      } catch (err) {
        log.error('[ipc] iscrizioni:list errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero iscrizioni')
      }
    }
  )

  ipcMain.handle(
    'iscrizioni:updateDate',
    (
      _event,
      { id, dataInizio, dataScadenza }: { id: number; dataInizio: string; dataScadenza: string }
    ): IscrizioneClienteRow => {
      try {
        return updateIscrizioneDate(id, dataInizio, dataScadenza)
      } catch (err) {
        log.error('[ipc] iscrizioni:updateDate errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'aggiornamento delle date iscrizione")
      }
    }
  )

  ipcMain.handle(
    'iscrizioni:invalida',
    (_event, { id }: { id: number }): IscrizioneClienteRow => {
      try {
        return invalidaIscrizione(id)
      } catch (err) {
        log.error('[ipc] iscrizioni:invalida errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'invalidazione dell'iscrizione")
      }
    }
  )

  // ── Abbonamenti ───────────────────────────────────────────────────────────

  ipcMain.handle(
    'abbonamenti:assegna',
    (_event, data: AssegnaAbbonamentoInput): AbbonamentoClienteRow => {
      try {
        return assegnaAbbonamento(data)
      } catch (err) {
        log.error('[ipc] abbonamenti:assegna errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'assegnazione dell'abbonamento")
      }
    }
  )

  ipcMain.handle(
    'abbonamenti:list',
    (
      _event,
      { clienteId, soloAttivi }: { clienteId: number; soloAttivi?: boolean }
    ): AbbonamentoClienteRow[] => {
      try {
        return listAbbonamenti(clienteId, soloAttivi)
      } catch (err) {
        log.error('[ipc] abbonamenti:list errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero abbonamenti')
      }
    }
  )

  ipcMain.handle(
    'abbonamenti:updateDate',
    (
      _event,
      { id, dataInizio, dataScadenza }: { id: number; dataInizio: string; dataScadenza: string }
    ): AbbonamentoClienteRow => {
      try {
        return updateAbbonamentoDate(id, dataInizio, dataScadenza)
      } catch (err) {
        log.error('[ipc] abbonamenti:updateDate errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'aggiornamento delle date abbonamento")
      }
    }
  )

  ipcMain.handle(
    'abbonamenti:invalida',
    (_event, { id }: { id: number }): AbbonamentoClienteRow => {
      try {
        return invalidaAbbonamento(id)
      } catch (err) {
        log.error('[ipc] abbonamenti:invalida errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'invalidazione dell'abbonamento")
      }
    }
  )

  log.info('[ipc] Handler IPC registrati')
}
