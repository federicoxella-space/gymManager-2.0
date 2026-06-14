/**
 * sync-service.ts — Orchestratore della sincronizzazione Drive.
 *
 * Coordina sync-logic (decisioni pure), sync-state (sidecar + hash),
 * drive-service (I/O rete) e restore-service (reload DB).
 * Emette eventi al renderer via mainWindow.webContents.send
 * (stesso pattern di auto-updater.ts).
 *
 * Nessun token/segreto passa al renderer: tutto resta nel processo main.
 */

import type { BrowserWindow } from 'electron'
import log from 'electron-log'
import type { SyncStatus } from '../../types/shared'
import { DB_PATH } from '../db/database'
import { eseguiRipristinoConChiaveCorrente } from '../backup/restore-service'
import * as drive from '../backup/drive-service'
import {
  loadSyncState,
  saveSyncState,
  hashDbFile,
  isLocalDirty,
  type SyncState,
} from './sync-state'
import {
  decideAzioneApertura,
  decideAzionePolling,
  uploadConsentito,
} from './sync-logic'

// ── Costanti ──────────────────────────────────────────────────────────────────

/** Percorso temporaneo per il file scaricato prima del reload. */
const TMP_DOWNLOAD = DB_PATH + '.sync-download.db'

// ── Stato interno ─────────────────────────────────────────────────────────────

/** Riferimento alla finestra principale, impostato da initSyncService. */
let mainWindow: BrowserWindow | null = null

/**
 * Flag in-memory: true se c'è un conflitto pendente non ancora risolto.
 * Viene settato quando si emette 'sync:conflict', azzerato a risoluzione.
 */
let conflictPending = false

// ── Init ──────────────────────────────────────────────────────────────────────

/** Inizializza il servizio con il riferimento alla finestra principale. */
export function initSyncService(win: BrowserWindow): void {
  mainWindow = win
  log.info('[sync] sync-service inizializzato')
}

/** Emette un evento IPC verso il renderer (best-effort: se la finestra è chiusa ignora). */
function emit(channel: string, payload?: unknown): void {
  mainWindow?.webContents.send(channel, payload)
}

// ── Interfacce pubbliche ──────────────────────────────────────────────────────

export type { SyncStatus }

// ── getStatus ─────────────────────────────────────────────────────────────────

/**
 * Legge lo stato corrente della sincronizzazione.
 * Non lancia mai: in caso di errore I/O ritorna uno stato sicuro.
 */
export async function getStatus(): Promise<SyncStatus> {
  const st = loadSyncState()
  let connected = false
  try {
    connected = drive.isDriveConnected()
  } catch (err) {
    log.warn('[sync] getStatus: errore isDriveConnected', err)
  }
  let dirty = false
  try {
    dirty = isLocalDirty(st)
  } catch (err) {
    log.warn('[sync] getStatus: errore isLocalDirty', err)
  }
  return {
    enabled: st.enabled,
    connected,
    lastSyncAt: st.lastSyncAt,
    dirty,
    conflict: conflictPending,
    pollingSec: st.pollingSec,
  }
}

// ── upload ────────────────────────────────────────────────────────────────────

/**
 * Upload con guardia ottimistica.
 * - Risolve (o crea) il file di sync su Drive.
 * - Se il remoto ha avanzato dal nostro ultimo sync → emette 'sync:conflict', non sovrascrive.
 * - Altrimenti sovrascrive e aggiorna lo stato locale.
 */
export async function upload(): Promise<void> {
  const st = loadSyncState()

  // Risolvi il fileId (crea il placeholder se non esiste ancora)
  const fileId = st.syncFileId ?? (await drive.getOrCreateSyncFile())

  // Leggi i metadati remoti (null se il file non ha ancora contenuto o errore temporaneo)
  let meta: drive.SyncMetadata | null = null
  try {
    meta = await drive.getSyncMetadata(fileId)
  } catch {
    meta = null
  }

  // Guardia ottimistica: se il remoto è avanzato dal nostro ultimo sync, non sovrascrivere
  if (!uploadConsentito(meta?.revision ?? null, st.lastRemoteRevision)) {
    log.warn('[sync] upload: conflitto rilevato — remoto avanzato, upload bloccato')
    conflictPending = true
    emit('sync:conflict', { reason: 'remote-advanced' })
    return
  }

  // Sovrascrittura sicura
  log.info(`[sync] upload: carico DB locale su Drive (fileId=${fileId})`)
  const newRevision = await drive.uploadSync(fileId, DB_PATH)
  const newHash = hashDbFile()
  const now = new Date().toISOString()

  saveSyncState({
    ...st,
    syncFileId: fileId,
    lastRemoteRevision: newRevision,
    lastLocalHash: newHash,
    lastSyncAt: now,
  })
  log.info(`[sync] upload completato — revisione=${newRevision}`)
}

// ── syncOnOpen ────────────────────────────────────────────────────────────────

/**
 * Eseguito dopo l'unlock del DB (apertura sessione).
 * Decide cosa fare in base allo stato remoto vs locale:
 * - usa-locale: nessuna azione.
 * - download-auto: scarica il remoto e ricarica il DB (richiede stessa password).
 * - conflitto: emette 'sync:conflict'.
 * - primo-avvio: nessuna azione qui; gestito da enableSync.
 */
export async function syncOnOpen(): Promise<void> {
  const st = loadSyncState()
  if (!st.enabled) return

  log.info('[sync] syncOnOpen: verifica stato remoto')

  // Risolvi il fileId se mancante
  let fileId = st.syncFileId
  if (fileId === null) {
    try {
      fileId = await drive.getOrCreateSyncFile()
      saveSyncState({ ...st, syncFileId: fileId })
    } catch (err) {
      log.warn('[sync] syncOnOpen: impossibile risolvere fileId', err)
      return
    }
  }

  let meta: drive.SyncMetadata | null = null
  try {
    meta = await drive.getSyncMetadata(fileId)
  } catch (err) {
    log.warn('[sync] syncOnOpen: impossibile leggere metadati remoti', err)
    return
  }

  const localDirty = isLocalDirty(st)
  const azione = decideAzioneApertura({
    remoteRevision: meta.revision,
    lastRemoteRevision: st.lastRemoteRevision,
    localDirty,
  })

  log.info(`[sync] syncOnOpen: azione=${azione}`)

  switch (azione) {
    case 'usa-locale':
      // Tutto aggiornato, niente da fare
      break

    case 'download-auto':
      await _eseguiDownloadEReload(fileId, meta.revision, st)
      break

    case 'conflitto':
      conflictPending = true
      emit('sync:conflict', { reason: 'open-conflict' })
      break

    case 'primo-avvio':
      // Gestito da enableSync quando l'utente abilita il sync
      break
  }
}

// ── checkRemote ───────────────────────────────────────────────────────────────

/**
 * Verifica non distruttiva (polling): non scarica né carica.
 * Emette 'sync:remote-changed' (banner) o 'sync:conflict' secondo lo stato.
 */
export async function checkRemote(): Promise<void> {
  const st = loadSyncState()
  if (!st.enabled) return

  let fileId = st.syncFileId
  if (fileId === null) {
    try {
      fileId = await drive.getOrCreateSyncFile()
      saveSyncState({ ...st, syncFileId: fileId })
    } catch (err) {
      log.warn('[sync] checkRemote: impossibile risolvere fileId', err)
      return
    }
  }

  let meta: drive.SyncMetadata | null = null
  try {
    meta = await drive.getSyncMetadata(fileId)
  } catch (err) {
    log.warn('[sync] checkRemote: impossibile leggere metadati remoti', err)
    return
  }

  const localDirty = isLocalDirty(st)
  const azione = decideAzionePolling({
    remoteRevision: meta.revision,
    lastRemoteRevision: st.lastRemoteRevision,
    localDirty,
  })

  log.info(`[sync] checkRemote: azione=${azione}`)

  switch (azione) {
    case 'nessuna':
      break
    case 'banner-reload':
      emit('sync:remote-changed', { remoteRevision: meta.revision })
      break
    case 'conflitto':
      conflictPending = true
      emit('sync:conflict', { reason: 'poll-conflict' })
      break
  }
}

// ── resolveConflict ───────────────────────────────────────────────────────────

/**
 * Risolve il conflitto pendente secondo la scelta dell'utente:
 * - 'remoto': scarica il file remoto e ricarica il DB.
 * - 'locale': forza l'upload locale (sovrascrive il remoto senza guardia).
 * - 'copia': carica il locale come copia di conflitto (timestamped) poi adotta il remoto.
 */
export async function resolveConflict(scelta: 'remoto' | 'locale' | 'copia'): Promise<void> {
  const st = loadSyncState()
  log.info(`[sync] resolveConflict: scelta=${scelta}`)

  const fileId = st.syncFileId ?? (await drive.getOrCreateSyncFile())
  const meta = await drive.getSyncMetadata(fileId)

  switch (scelta) {
    case 'remoto': {
      // Adotta il remoto: download + reload
      await _eseguiDownloadEReload(fileId, meta.revision, st)
      break
    }

    case 'locale': {
      // Forza upload locale (senza guardia ottimistica)
      log.info('[sync] resolveConflict locale: forzo upload senza guardia')
      const newRevision = await drive.uploadSync(fileId, DB_PATH)
      const newHash = hashDbFile()
      saveSyncState({
        ...st,
        syncFileId: fileId,
        lastRemoteRevision: newRevision,
        lastLocalHash: newHash,
        lastSyncAt: new Date().toISOString(),
      })
      conflictPending = false
      log.info('[sync] resolveConflict locale: upload forzato completato')
      break
    }

    case 'copia': {
      // Carica il locale come copia di conflitto, poi adotta il remoto
      log.info('[sync] resolveConflict copia: carico copia di conflitto')
      await drive.uploadConflictCopy(DB_PATH)
      log.info('[sync] resolveConflict copia: copia caricata, adotto il remoto')
      // Rilegge i metadati dopo l'upload della copia (il file stabile non è cambiato)
      const freshMeta = await drive.getSyncMetadata(fileId)
      await _eseguiDownloadEReload(fileId, freshMeta.revision, st)
      break
    }
  }
}

// ── enableSync ────────────────────────────────────────────────────────────────

/**
 * Abilita la sincronizzazione.
 *
 * Logica primo avvio (KISS):
 * - Se esiste un file remoto con una revisione (già caricato da un altro dispositivo)
 *   E il locale non è mai stato sincronizzato (lastRemoteRevision === null),
 *   emette 'sync:conflict' riusando le 3 scelte standard (remoto/locale/copia).
 *   L'utente sceglie se adottare il remoto o caricare il locale.
 * - Se il file remoto non esiste (null revision, es. file appena creato vuoto)
 *   o il locale è già allineato, esegue un upload del locale.
 *
 * Scelta documentata: riusare 'sync:conflict' per il primo avvio evita di aggiungere
 * un nuovo evento e una nuova dialog; le 3 scelte hanno semantica identica:
 * "remoto" = adotta l'altro dispositivo, "locale" = questo dispositivo è il master.
 */
export async function enableSync(): Promise<void> {
  const st = loadSyncState()
  const updatedSt: SyncState = { ...st, enabled: true }
  saveSyncState(updatedSt)
  log.info('[sync] enableSync: sync abilitato')

  let fileId: string
  try {
    fileId = await drive.getOrCreateSyncFile()
  } catch (err) {
    log.error('[sync] enableSync: impossibile risolvere fileId', err)
    return
  }

  // Salva il fileId
  saveSyncState({ ...updatedSt, syncFileId: fileId })

  let meta: drive.SyncMetadata | null = null
  try {
    meta = await drive.getSyncMetadata(fileId)
  } catch {
    meta = null
  }

  // Se il file remoto ha già contenuto (revision presente) e non abbiamo mai sincronizzato,
  // c'è un potenziale conflitto primo-avvio → delega all'utente via sync:conflict
  if (meta !== null && meta.revision !== null && updatedSt.lastRemoteRevision === null) {
    log.info('[sync] enableSync: file remoto esistente — chiedo all\'utente (sync:conflict primo-avvio)')
    conflictPending = true
    emit('sync:conflict', { reason: 'first-run' })
    return
  }

  // Nessun file remoto con contenuto → upload del locale come sorgente di verità
  try {
    await upload()
    log.info('[sync] enableSync: upload locale completato')
  } catch (err) {
    log.error('[sync] enableSync: upload fallito', err)
  }
}

// ── disableSync ───────────────────────────────────────────────────────────────

/** Disabilita la sincronizzazione. Non tocca il file remoto. */
export async function disableSync(): Promise<void> {
  const st = loadSyncState()
  saveSyncState({ ...st, enabled: false })
  conflictPending = false
  log.info('[sync] sync disabilitato')
}

// ── setPolling ────────────────────────────────────────────────────────────────

/** Aggiorna l'intervallo di polling (in secondi) e persiste lo stato. */
export function setPolling(sec: number): void {
  const st = loadSyncState()
  saveSyncState({ ...st, pollingSec: sec })
  log.info(`[sync] intervallo polling aggiornato: ${sec}s`)
}

// ── Helper privato ─────────────────────────────────────────────────────────────

/**
 * Download del file remoto + reload del DB + aggiornamento stato.
 * Emette 'sync:reloaded' al renderer al completamento.
 */
async function _eseguiDownloadEReload(
  fileId: string,
  remoteRevision: string,
  st: SyncState
): Promise<void> {
  log.info(`[sync] download + reload — fileId=${fileId}, revision=${remoteRevision}`)
  await drive.downloadSync(fileId, TMP_DOWNLOAD)
  await eseguiRipristinoConChiaveCorrente(TMP_DOWNLOAD)

  const newHash = hashDbFile()
  saveSyncState({
    ...st,
    syncFileId: fileId,
    lastRemoteRevision: remoteRevision,
    lastLocalHash: newHash,
    lastSyncAt: new Date().toISOString(),
  })
  conflictPending = false
  emit('sync:reloaded', { revision: remoteRevision })
  log.info('[sync] reload completato')
}
