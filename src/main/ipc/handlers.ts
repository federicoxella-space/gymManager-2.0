import { ipcMain, app } from 'electron'
import { checkForUpdates, installUpdate } from '../updater/auto-updater'
import { backupLocale, backupAutomatico } from '../backup/backup-service'
import { verificaBackup, ripristinaBackup, resetDatabase } from '../backup/restore-service'
import {
  connectDrive,
  isDriveConnected,
  disconnectDrive,
  backupSuDrive,
  listBackupDrive
} from '../backup/drive-service'
import type { BackupManifest, DriveBackupItem } from '../../types/shared'
import { generaHTMLRicevuta } from '../domain/ricevuta'
import { generaPDFInElectron } from '../pdf/generator'
import { getDatabase } from '../db/database'
import type { ImpostazioniAttivitaSnapshot } from '../domain/ricevuta'
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
  invalidaAbbonamento,
  aggiornaStatoIscrizioni,
  aggiornaStatoAbbonamenti
} from '../db/memberships-repository'
import {
  getRicevuta,
  creaRicevuta,
  listRicevute,
  annullaRicevuta,
  getVociPagabili,
  listAnniRicevute
} from '../db/receipts-repository'
import {
  getIndicatori,
  getClientiInScadenza,
  getDistribuzioneAbbonamenti,
  getIncassiPeriodo,
  getNuoviTesseramenti,
  getCompleanni
} from '../db/dashboard-repository'
import { validaCliente, validaClienteUpdate } from '../domain/cliente'
import { validaTipoIscrizione, validaTipoAbbonamento, validaTipoUpdate } from '../domain/catalogo'
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
  AssegnaAbbonamentoInput,
  RicevutaRow,
  RicevutaConRighe,
  RicevutaFilters,
  CreaRicevutaInput,
  VocePagabile,
  WidgetIndicatori,
  ClienteInScadenza,
  AbbonamentoPerTipo,
  IncassiPeriodo,
  NuoviTesseramenti,
  CompleannoDellaSett,
  DashboardPeriodo
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
      aggiornaStatoIscrizioni()
      aggiornaStatoAbbonamenti()
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
        aggiornaStatoIscrizioni()
        aggiornaStatoAbbonamenti()
        log.info('[ipc] db:unlock completato')
      } catch (err) {
        log.error('[ipc] db:unlock errore:', err)
        if (err instanceof Error && err.message === 'PASSWORD_WRONG') {
          throw new Error('Password errata. Riprova.')
        }
        if (err instanceof Error && err.message.startsWith('MIGRATION_FAILED')) {
          // Migrazione fallita post-aggiornamento: DB aperto ma schema non aggiornato.
          // L'utente deve ripristinare da un backup o contattare il supporto.
          throw new Error('MIGRATION_FAILED')
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

        // Sincronizza i campi che vivono anche nella tabella SQLite app_settings
        if (isDatabaseOpen()) {
          const db = getDatabase()
          const upsert = db.prepare(
            `INSERT INTO app_settings (key, value, updated_at)
             VALUES (?, ?, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
          )
          if (settings.receipt_start_number !== undefined) {
            upsert.run('receipt_start_number', String(settings.receipt_start_number))
          }
          if (settings.dicitura_pie !== undefined) {
            upsert.run('dicitura_pie', settings.dicitura_pie)
          }
          const fieldsToSync = ['ragione_sociale', 'indirizzo_attivita', 'codice_fiscale_piva', 'logo_base64', 'backup_on_close'] as const
          for (const field of fieldsToSync) {
            if (settings[field] !== undefined) {
              upsert.run(field, String(settings[field]))
            }
          }
        }
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
        const settings = loadSettings()
        return listClienti(filters, settings.expiry_warning_days_certificates)
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
        const validation = validaTipoIscrizione(data)
        if (!validation.valid) {
          const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
          throw new Error(`VALIDATION_ERROR: ${errorMsg}`)
        }
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
        const validation = validaTipoUpdate(data)
        if (!validation.valid) {
          const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
          throw new Error(`VALIDATION_ERROR: ${errorMsg}`)
        }
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
        const validation = validaTipoAbbonamento(data)
        if (!validation.valid) {
          const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
          throw new Error(`VALIDATION_ERROR: ${errorMsg}`)
        }
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
        const validation = validaTipoUpdate(data)
        if (!validation.valid) {
          const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
          throw new Error(`VALIDATION_ERROR: ${errorMsg}`)
        }
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

  // ── Ricevute ──────────────────────────────────────────────────────────────

  ipcMain.handle(
    'ricevute:crea',
    (_event, data: CreaRicevutaInput): RicevutaConRighe => {
      try {
        return creaRicevuta(data)
      } catch (err) {
        log.error('[ipc] ricevute:crea errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante la creazione della ricevuta')
      }
    }
  )

  ipcMain.handle(
    'ricevute:get',
    (_event, { id }: { id: number }): RicevutaConRighe | null => {
      try {
        return getRicevuta(id)
      } catch (err) {
        log.error('[ipc] ricevute:get errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero della ricevuta')
      }
    }
  )

  ipcMain.handle(
    'ricevute:list',
    (_event, filters?: RicevutaFilters): RicevutaRow[] => {
      try {
        return listRicevute(filters)
      } catch (err) {
        log.error('[ipc] ricevute:list errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero ricevute')
      }
    }
  )

  ipcMain.handle(
    'ricevute:annulla',
    (_event, { id }: { id: number }): RicevutaRow => {
      try {
        return annullaRicevuta(id)
      } catch (err) {
        log.error('[ipc] ricevute:annulla errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'annullamento della ricevuta")
      }
    }
  )

  ipcMain.handle(
    'ricevute:vociPagabili',
    (_event, { clienteId }: { clienteId: number }): VocePagabile[] => {
      try {
        return getVociPagabili(clienteId)
      } catch (err) {
        log.error('[ipc] ricevute:vociPagabili errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero voci pagabili')
      }
    }
  )

  /**
   * Restituisce gli anni per cui esistono ricevute (per il filtro anno).
   */
  ipcMain.handle('ricevute:anni', (): number[] => {
    try {
      return listAnniRicevute()
    } catch (err) {
      log.error('[ipc] ricevute:anni errore:', err)
      return []
    }
  })

  // ── PDF ───────────────────────────────────────────────────────────────────

  /**
   * Genera il PDF di una ricevuta.
   * Flusso:
   *   1. Carica la ricevuta (con righe) dal DB.
   *   2. Legge i dati attività da app_settings.
   *   3. Genera l'HTML tramite generaHTMLRicevuta.
   *   4. Produce il PDF con generaPDFInElectron.
   *   5. Restituisce il Buffer come stringa base64 (IPC serializza solo dati primitivi).
   */
  ipcMain.handle(
    'pdf:genera',
    async (_event, { ricevutaId }: { ricevutaId: number }): Promise<string> => {
      try {
        const ricevuta = getRicevuta(ricevutaId)
        if (!ricevuta) {
          throw new Error(`Ricevuta con id ${ricevutaId} non trovata`)
        }

        // Legge le impostazioni attività: loadSettings() (sorgente primaria)
        // con fallback su app_settings SQLite per compatibilità con dati precedenti.
        const appSettings = loadSettings()
        const db = getDatabase()
        const getSetting = (key: string, def = ''): string => {
          const row = db
            .prepare('SELECT value FROM app_settings WHERE key = ?')
            .get(key) as { value: string } | undefined
          return row?.value ?? def
        }

        const impostazioni: ImpostazioniAttivitaSnapshot = {
          ragione_sociale: appSettings.ragione_sociale || getSetting('ragione_sociale', 'Palestra'),
          indirizzo: appSettings.indirizzo_attivita || getSetting('indirizzo', ''),
          codice_fiscale_piva: appSettings.codice_fiscale_piva || getSetting('codice_fiscale_piva', ''),
          logo_base64: (appSettings.logo_base64 || getSetting('logo_base64')) || undefined,
          dicitura_pie_default: appSettings.dicitura_pie || getSetting('dicitura_pie', ''),
        }

        const html = generaHTMLRicevuta(ricevuta, impostazioni)
        const pdfBuffer = await generaPDFInElectron(html)

        log.info(`[ipc] pdf:genera completato per ricevuta ${ricevutaId}`)
        return pdfBuffer.toString('base64')
      } catch (err) {
        log.error('[ipc] pdf:genera errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante la generazione del PDF')
      }
    }
  )

  // ── Dashboard ─────────────────────────────────────────────────────────────

  ipcMain.handle(
    'dashboard:indicatori',
    (
      _event,
      {
        oggi,
        giorniCert,
        giorniIsc,
        giorniAbb
      }: { oggi: string; giorniCert: number; giorniIsc: number; giorniAbb: number }
    ): WidgetIndicatori => {
      try {
        return getIndicatori(oggi, giorniCert, giorniIsc, giorniAbb)
      } catch (err) {
        log.error('[ipc] dashboard:indicatori errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero indicatori dashboard')
      }
    }
  )

  ipcMain.handle(
    'dashboard:scadenze',
    (
      _event,
      {
        oggi,
        giorniCert,
        giorniIsc,
        giorniAbb
      }: { oggi: string; giorniCert: number; giorniIsc: number; giorniAbb: number }
    ): ClienteInScadenza[] => {
      try {
        return getClientiInScadenza(oggi, giorniCert, giorniIsc, giorniAbb)
      } catch (err) {
        log.error('[ipc] dashboard:scadenze errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero scadenze dashboard')
      }
    }
  )

  ipcMain.handle(
    'dashboard:abbonamenti',
    (_event, { soloAttivi }: { soloAttivi?: boolean }): AbbonamentoPerTipo[] => {
      try {
        return getDistribuzioneAbbonamenti(soloAttivi)
      } catch (err) {
        log.error('[ipc] dashboard:abbonamenti errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero distribuzione abbonamenti')
      }
    }
  )

  ipcMain.handle(
    'dashboard:incassi',
    (_event, { periodo }: { periodo: DashboardPeriodo }): IncassiPeriodo => {
      try {
        return getIncassiPeriodo(periodo)
      } catch (err) {
        log.error('[ipc] dashboard:incassi errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero incassi periodo')
      }
    }
  )

  ipcMain.handle(
    'dashboard:tesseramenti',
    (_event, { periodo }: { periodo: DashboardPeriodo }): NuoviTesseramenti => {
      try {
        return getNuoviTesseramenti(periodo)
      } catch (err) {
        log.error('[ipc] dashboard:tesseramenti errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero nuovi tesseramenti')
      }
    }
  )

  ipcMain.handle(
    'dashboard:compleanni',
    (
      _event,
      { dalGiorno, alGiorno }: { dalGiorno: string; alGiorno: string }
    ): CompleannoDellaSett[] => {
      try {
        return getCompleanni(dalGiorno, alGiorno)
      } catch (err) {
        log.error('[ipc] dashboard:compleanni errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero compleanni')
      }
    }
  )

  // ── Backup ───────────────────────────────────────────────────────────────

  /**
   * Esegue il backup locale del file DB verso il percorso scelto dall'utente.
   */
  ipcMain.handle(
    'backup:locale',
    async (_event, { destinazionePath }: { destinazionePath: string }): Promise<BackupManifest> => {
      try {
        return await backupLocale(destinazionePath)
      } catch (err) {
        log.error('[ipc] backup:locale errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante il backup locale')
      }
    }
  )

  /**
   * Esegue il backup automatico nella cartella di default.
   * Restituisce il percorso del file creato.
   */
  ipcMain.handle('backup:automatico', async (): Promise<string> => {
    try {
      return await backupAutomatico()
    } catch (err) {
      log.error('[ipc] backup:automatico errore:', err)
      throw err instanceof Error ? err : new Error('Errore durante il backup automatico')
    }
  })

  /**
   * Verifica un file di backup e restituisce il suo manifest.
   */
  ipcMain.handle(
    'backup:verifica',
    async (_event, { backupPath }: { backupPath: string }): Promise<BackupManifest> => {
      try {
        return await verificaBackup(backupPath)
      } catch (err) {
        log.error('[ipc] backup:verifica errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante la verifica del backup')
      }
    }
  )

  /**
   * Ripristina un backup nel DB corrente.
   */
  ipcMain.handle(
    'backup:ripristina',
    async (
      _event,
      { backupPath, password }: { backupPath: string; password: string }
    ): Promise<void> => {
      try {
        await ripristinaBackup(backupPath, password)
      } catch (err) {
        log.error('[ipc] backup:ripristina errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante il ripristino del backup')
      }
    }
  )

  /**
   * Reset DISTRUTTIVO del database con nuova password.
   * D6: cancella tutti i dati, nessun recupero possibile.
   */
  ipcMain.handle(
    'backup:reset',
    async (_event, { nuovaPassword }: { nuovaPassword: string }): Promise<void> => {
      try {
        await resetDatabase(nuovaPassword)
      } catch (err) {
        log.error('[ipc] backup:reset errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante il reset del database')
      }
    }
  )

  /**
   * STUB: connette Google Drive tramite OAuth.
   */
  ipcMain.handle('backup:drive:connect', async (): Promise<void> => {
    try {
      await connectDrive()
    } catch (err) {
      log.error('[ipc] backup:drive:connect errore:', err)
      throw err instanceof Error ? err : new Error('Errore durante la connessione a Drive')
    }
  })

  /**
   * Indica se Google Drive è connesso (token salvati su disco).
   */
  ipcMain.handle('backup:drive:isConnected', (): boolean => {
    return isDriveConnected()
  })

  /**
   * Disconnette Google Drive rimuovendo i token locali.
   */
  ipcMain.handle('backup:drive:disconnect', async (): Promise<void> => {
    try {
      await disconnectDrive()
    } catch (err) {
      log.error('[ipc] backup:drive:disconnect errore:', err)
      throw err instanceof Error ? err : new Error('Errore durante la disconnessione da Drive')
    }
  })

  /**
   * STUB: carica un backup su Google Drive.
   */
  ipcMain.handle(
    'backup:drive:backup',
    async (_event, { backupPath }: { backupPath: string }): Promise<string> => {
      try {
        return await backupSuDrive(backupPath)
      } catch (err) {
        log.error('[ipc] backup:drive:backup errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante il backup su Drive')
      }
    }
  )

  /**
   * STUB: elenca i backup su Google Drive.
   */
  ipcMain.handle('backup:drive:list', async (): Promise<DriveBackupItem[]> => {
    try {
      return await listBackupDrive()
    } catch (err) {
      log.error('[ipc] backup:drive:list errore:', err)
      throw err instanceof Error ? err : new Error('Errore durante il recupero lista backup Drive')
    }
  })

  // ── Auto-updater ─────────────────────────────────────────────────────────

  /**
   * Avvia manualmente il controllo degli aggiornamenti disponibili.
   */
  ipcMain.handle('updater:check', (): void => {
    try {
      checkForUpdates()
      log.info('[ipc] updater:check avviato')
    } catch (err) {
      log.error('[ipc] updater:check errore:', err)
      throw err instanceof Error ? err : new Error('Errore durante il controllo aggiornamenti')
    }
  })

  /**
   * Installa l'aggiornamento già scaricato e riavvia l'applicazione.
   * Deve essere chiamato solo dopo aver ricevuto l'evento 'update:downloaded'.
   */
  ipcMain.handle('updater:install', (): void => {
    try {
      log.info('[ipc] updater:install avviato')
      installUpdate()
    } catch (err) {
      log.error('[ipc] updater:install errore:', err)
      throw err instanceof Error ? err : new Error("Errore durante l'installazione dell'aggiornamento")
    }
  })

  log.info('[ipc] Handler IPC registrati')
}
