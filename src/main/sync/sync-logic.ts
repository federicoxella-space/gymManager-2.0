/**
 * sync-logic.ts — Logica PURA di decisione per la sincronizzazione Drive.
 *
 * Nessuna importazione di I/O: questo modulo è puramente funzionale e
 * può essere testato in isolamento senza dipendenze da Electron o filesystem.
 */

export type AzioneApertura = 'usa-locale' | 'download-auto' | 'conflitto' | 'primo-avvio'
export type AzionePolling = 'nessuna' | 'banner-reload' | 'conflitto'

export interface StatoConfronto {
  /** Revisione remota corrente (headRevisionId) o null se il file di sync non esiste. */
  remoteRevision: string | null
  /** Revisione all'ultimo sync riuscito (dallo stato locale) o null se mai sincronizzato. */
  lastRemoteRevision: string | null
  /** true se il DB locale ha modifiche non ancora caricate. */
  localDirty: boolean
}

/** Decide l'azione all'apertura/unlock. */
export function decideAzioneApertura(s: StatoConfronto): AzioneApertura {
  if (s.remoteRevision === null) return 'primo-avvio' // nessun file di sync remoto
  if (s.remoteRevision === s.lastRemoteRevision) return 'usa-locale'
  // remoto avanzato rispetto al mio ultimo sync
  return s.localDirty ? 'conflitto' : 'download-auto'
}

/** Decide l'azione durante il polling (app aperta). */
export function decideAzionePolling(s: StatoConfronto): AzionePolling {
  if (s.remoteRevision === null) return 'nessuna'
  if (s.remoteRevision === s.lastRemoteRevision) return 'nessuna'
  return s.localDirty ? 'conflitto' : 'banner-reload'
}

/** Guardia ottimistica prima dell'upload: true se è sicuro sovrascrivere. */
export function uploadConsentito(remoteRevision: string | null, lastRemoteRevision: string | null): boolean {
  // sicuro se nessuno ha toccato il remoto dal mio ultimo sync (o il file non esiste ancora)
  return remoteRevision === null || remoteRevision === lastRemoteRevision
}
