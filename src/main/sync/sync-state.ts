/**
 * sync-state.ts — Sidecar JSON + hash DB + flag localDirty.
 *
 * Gestisce la persistenza dello stato di sincronizzazione su disco
 * (sync-state.json nella userData di Electron) e il calcolo dell'hash
 * del file DB per rilevare modifiche locali non ancora caricate.
 */

import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { DB_PATH, getDatabase, isDatabaseOpen } from '../db/database'

export interface SyncState {
  enabled: boolean
  syncFileId: string | null
  lastRemoteRevision: string | null
  /** hash del file DB all'ultimo sync riuscito; usato per calcolare localDirty. */
  lastLocalHash: string | null
  lastSyncAt: string | null
  pollingSec: number
}

const STATE_FILE = 'sync-state.json'
const DEFAULT_STATE: SyncState = {
  enabled: false,
  syncFileId: null,
  lastRemoteRevision: null,
  lastLocalHash: null,
  lastSyncAt: null,
  pollingSec: 60,
}

function statePath(): string {
  return join(app.getPath('userData'), STATE_FILE)
}

export function loadSyncState(): SyncState {
  if (!existsSync(statePath())) return { ...DEFAULT_STATE }
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(readFileSync(statePath(), 'utf-8')) as Partial<SyncState> }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function saveSyncState(s: SyncState): void {
  writeFileSync(statePath(), JSON.stringify(s, null, 2), 'utf-8')
}

/** Hash del contenuto del DB: forza un checkpoint WAL così il file principale è completo, poi SHA-256. */
export function hashDbFile(): string {
  if (isDatabaseOpen()) {
    try {
      getDatabase().pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      /* best effort */
    }
  }
  const buf = readFileSync(DB_PATH)
  return createHash('sha256').update(buf).digest('hex')
}

/** true se il DB locale è cambiato rispetto all'ultimo sync. */
export function isLocalDirty(s: SyncState): boolean {
  if (s.lastLocalHash === null) return true // mai sincronizzato → consideralo dirty
  return hashDbFile() !== s.lastLocalHash
}
