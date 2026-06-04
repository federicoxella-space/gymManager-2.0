import { contextBridge, ipcRenderer } from 'electron'
import { exposeElectronAPI } from '@electron-toolkit/preload'
import type { AppSettings, ElectronAPI, DbState } from '../types/shared'

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
export type { AppSettings, ElectronAPI, DbState }
