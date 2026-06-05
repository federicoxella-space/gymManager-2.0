import { contextBridge, ipcRenderer } from 'electron'
import { exposeElectronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  ElectronAPI,
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
  VocePagabile,
  CreaRicevutaInput
} from '../types/shared'

// Espone le API standard di electron-toolkit su window.electron
exposeElectronAPI()

// Costruisce l'API applicativa personalizzata
const api: ElectronAPI = {
  db: {
    getState(): Promise<{ state: DbState }> {
      return ipcRenderer.invoke('db:getState')
    },
    setup(password: string): Promise<void> {
      return ipcRenderer.invoke('db:setup', { password })
    },
    unlock(password: string): Promise<void> {
      return ipcRenderer.invoke('db:unlock', { password })
    },
    isOpen(): Promise<boolean> {
      return ipcRenderer.invoke('db:isOpen')
    }
  },

  settings: {
    get(): Promise<AppSettings> {
      return ipcRenderer.invoke('settings:get')
    },
    set(settings: Partial<AppSettings>): Promise<void> {
      return ipcRenderer.invoke('settings:set', { settings })
    }
  },

  app: {
    getVersion(): Promise<string> {
      return ipcRenderer.invoke('app:getVersion')
    }
  },

  clienti: {
    list(filters?: ClientiFilters): Promise<ClienteRow[]> {
      return ipcRenderer.invoke('clienti:list', filters)
    },
    get(id: number): Promise<ClienteRow | null> {
      return ipcRenderer.invoke('clienti:get', id)
    },
    create(data: CreateClienteInput): Promise<ClienteRow> {
      return ipcRenderer.invoke('clienti:create', data)
    },
    update(id: number, data: UpdateClienteInput): Promise<ClienteRow> {
      return ipcRenderer.invoke('clienti:update', id, data)
    },
    anonimizza(id: number): Promise<void> {
      return ipcRenderer.invoke('clienti:anonimizza', id)
    }
  },

  certificati: {
    list(clienteId: number): Promise<CertificatoRow[]> {
      return ipcRenderer.invoke('certificati:list', clienteId)
    },
    add(data: CreateCertificatoInput): Promise<CertificatoRow> {
      return ipcRenderer.invoke('certificati:add', data)
    }
  },

  catalogo: {
    tipiIscrizione: {
      list(includeNonValidi?: boolean): Promise<TipoIscrizioneRow[]> {
        return ipcRenderer.invoke('catalogo:tipiIscrizione:list', includeNonValidi)
      },
      create(data: CreateTipoIscrizioneInput): Promise<TipoIscrizioneRow> {
        return ipcRenderer.invoke('catalogo:tipiIscrizione:create', data)
      },
      update(id: number, data: UpdateTipoIscrizioneInput): Promise<TipoIscrizioneRow> {
        return ipcRenderer.invoke('catalogo:tipiIscrizione:update', { id, data })
      },
      delete(id: number): Promise<void> {
        return ipcRenderer.invoke('catalogo:tipiIscrizione:delete', { id })
      },
      invalida(id: number): Promise<void> {
        return ipcRenderer.invoke('catalogo:tipiIscrizione:invalida', { id })
      }
    },
    tipiAbbonamento: {
      list(includeNonValidi?: boolean): Promise<TipoAbbonamentoRow[]> {
        return ipcRenderer.invoke('catalogo:tipiAbbonamento:list', includeNonValidi)
      },
      create(data: CreateTipoAbbonamentoInput): Promise<TipoAbbonamentoRow> {
        return ipcRenderer.invoke('catalogo:tipiAbbonamento:create', data)
      },
      update(id: number, data: UpdateTipoAbbonamentoInput): Promise<TipoAbbonamentoRow> {
        return ipcRenderer.invoke('catalogo:tipiAbbonamento:update', { id, data })
      },
      delete(id: number): Promise<void> {
        return ipcRenderer.invoke('catalogo:tipiAbbonamento:delete', { id })
      },
      invalida(id: number): Promise<void> {
        return ipcRenderer.invoke('catalogo:tipiAbbonamento:invalida', { id })
      }
    }
  },

  iscrizioni: {
    assegna(data: AssegnaIscrizioneInput): Promise<IscrizioneClienteRow> {
      return ipcRenderer.invoke('iscrizioni:assegna', data)
    },
    getAttiva(clienteId: number): Promise<IscrizioneClienteRow | null> {
      return ipcRenderer.invoke('iscrizioni:getAttiva', { clienteId })
    },
    list(clienteId: number): Promise<IscrizioneClienteRow[]> {
      return ipcRenderer.invoke('iscrizioni:list', { clienteId })
    },
    updateDate(id: number, dataInizio: string, dataScadenza: string): Promise<IscrizioneClienteRow> {
      return ipcRenderer.invoke('iscrizioni:updateDate', { id, dataInizio, dataScadenza })
    },
    invalida(id: number): Promise<IscrizioneClienteRow> {
      return ipcRenderer.invoke('iscrizioni:invalida', { id })
    }
  },

  abbonamenti: {
    assegna(data: AssegnaAbbonamentoInput): Promise<AbbonamentoClienteRow> {
      return ipcRenderer.invoke('abbonamenti:assegna', data)
    },
    list(clienteId: number, soloAttivi?: boolean): Promise<AbbonamentoClienteRow[]> {
      return ipcRenderer.invoke('abbonamenti:list', { clienteId, soloAttivi })
    },
    updateDate(id: number, dataInizio: string, dataScadenza: string): Promise<AbbonamentoClienteRow> {
      return ipcRenderer.invoke('abbonamenti:updateDate', { id, dataInizio, dataScadenza })
    },
    invalida(id: number): Promise<AbbonamentoClienteRow> {
      return ipcRenderer.invoke('abbonamenti:invalida', { id })
    }
  },

  ricevute: {
    crea(data: CreaRicevutaInput): Promise<RicevutaConRighe> {
      return ipcRenderer.invoke('ricevute:crea', data)
    },
    get(id: number): Promise<RicevutaConRighe | null> {
      return ipcRenderer.invoke('ricevute:get', { id })
    },
    list(filters?: RicevutaFilters): Promise<RicevutaRow[]> {
      return ipcRenderer.invoke('ricevute:list', filters)
    },
    annulla(id: number): Promise<RicevutaRow> {
      return ipcRenderer.invoke('ricevute:annulla', { id })
    },
    vociPagabili(clienteId: number): Promise<VocePagabile[]> {
      return ipcRenderer.invoke('ricevute:vociPagabili', { clienteId })
    }
  },

  pdf: {
    genera(args: { ricevutaId: number }): Promise<string> {
      return ipcRenderer.invoke('pdf:genera', args)
    }
  },

  on(channel: string, callback: (...args: unknown[]) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
      callback(...args)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  off(channel: string, callback: (...args: unknown[]) => void): void {
    ipcRenderer.removeListener(channel, callback as Parameters<typeof ipcRenderer.removeListener>[1])
  }
}

// Espone window.api al renderer in modo sicuro tramite contextBridge
contextBridge.exposeInMainWorld('api', api)

// Re-esporta i tipi per l'uso nel renderer (tree-shaken in produzione)
export type {
  AppSettings,
  ElectronAPI,
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
  VocePagabile,
  CreaRicevutaInput
}
