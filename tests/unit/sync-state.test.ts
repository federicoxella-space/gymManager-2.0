/**
 * Test unit per sync-state.ts.
 *
 * `electron` è mockato per puntare la userData su una tmp dir isolata.
 * `../../src/main/db/database` è mockato: DB_PATH su un file tmp reale,
 * isDatabaseOpen → false, getDatabase non viene mai chiamato
 * (isDatabaseOpen=false → il checkpoint WAL viene saltato).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'

// NOTA: vi.mock() è hoistato in cima al file prima di qualsiasi inizializzazione
// di variabili. Le factory NON possono referenziare costanti del modulo (temporal
// dead zone). Usiamo require() inline come già fatto in db.test.ts.

vi.mock('electron', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: pathJoin } = require('path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir: osTmpdir } = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdirSync: fsMkdir } = require('fs')
  const testDataDir = pathJoin(osTmpdir(), `gymmanager-sync-state-test-${process.pid}`)
  fsMkdir(testDataDir, { recursive: true })
  return {
    app: {
      getPath: (_name: string) => testDataDir,
    },
  }
})

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../../src/main/db/database', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: pathJoin } = require('path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir: osTmpdir } = require('os')
  const fakeDbPath = pathJoin(osTmpdir(), `gymmanager-sync-state-db-${process.pid}.db`)
  return {
    DB_PATH: fakeDbPath,
    isDatabaseOpen: vi.fn(() => false),
    getDatabase: vi.fn(() => {
      throw new Error('getDatabase non dovrebbe essere chiamato (isDatabaseOpen = false)')
    }),
  }
})

// Percorsi calcolati con la stessa logica delle mock — per usarli nei test.
// Calcolati DOPO le mock (dopo i vi.mock hoistati).
const TEST_USER_DATA = join(tmpdir(), `gymmanager-sync-state-test-${process.pid}`)
const FAKE_DB_PATH = join(tmpdir(), `gymmanager-sync-state-db-${process.pid}.db`)

// Import DOPO le mock
import {
  loadSyncState,
  saveSyncState,
  hashDbFile,
  isLocalDirty,
  type SyncState,
} from '../../src/main/sync/sync-state'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATE_FILE_PATH = join(TEST_USER_DATA, 'sync-state.json')

function cleanStateFile(): void {
  if (existsSync(STATE_FILE_PATH)) unlinkSync(STATE_FILE_PATH)
}

function cleanFakeDb(): void {
  if (existsSync(FAKE_DB_PATH)) unlinkSync(FAKE_DB_PATH)
}

// ---------------------------------------------------------------------------
// Suite: loadSyncState / saveSyncState
// ---------------------------------------------------------------------------

describe('loadSyncState', () => {
  beforeEach(() => {
    mkdirSync(TEST_USER_DATA, { recursive: true })
    cleanStateFile()
  })

  afterEach(() => {
    cleanStateFile()
  })

  it('restituisce i valori di default quando il file non esiste', () => {
    expect(existsSync(STATE_FILE_PATH)).toBe(false)
    const state = loadSyncState()
    expect(state.enabled).toBe(false)
    expect(state.syncFileId).toBeNull()
    expect(state.lastRemoteRevision).toBeNull()
    expect(state.lastLocalHash).toBeNull()
    expect(state.lastSyncAt).toBeNull()
    expect(state.pollingSec).toBe(60)
  })

  it('restituisce i valori di default se il file è JSON malformato', () => {
    writeFileSync(STATE_FILE_PATH, '{ invalid json ---', 'utf-8')
    const state = loadSyncState()
    expect(state.enabled).toBe(false)
    expect(state.pollingSec).toBe(60)
  })
})

describe('saveSyncState → loadSyncState (round-trip)', () => {
  beforeEach(() => {
    mkdirSync(TEST_USER_DATA, { recursive: true })
    cleanStateFile()
  })

  afterEach(() => {
    cleanStateFile()
  })

  it('persiste e ricarica correttamente tutti i campi', () => {
    const s: SyncState = {
      enabled: true,
      syncFileId: 'file-id-abc123',
      lastRemoteRevision: 'rev-xyz789',
      lastLocalHash: 'a'.repeat(64),
      lastSyncAt: '2026-06-14T10:00:00.000Z',
      pollingSec: 120,
    }
    saveSyncState(s)
    expect(existsSync(STATE_FILE_PATH)).toBe(true)
    const loaded = loadSyncState()
    expect(loaded).toEqual(s)
  })

  it('campi mancanti nel file vengono integrati con i default', () => {
    // Scrive un JSON parziale (manca pollingSec e altri campi)
    writeFileSync(STATE_FILE_PATH, JSON.stringify({ enabled: true, syncFileId: 'abc' }), 'utf-8')
    const loaded = loadSyncState()
    expect(loaded.enabled).toBe(true)
    expect(loaded.syncFileId).toBe('abc')
    expect(loaded.pollingSec).toBe(60) // default
    expect(loaded.lastLocalHash).toBeNull() // default
  })
})

// ---------------------------------------------------------------------------
// Suite: hashDbFile
// ---------------------------------------------------------------------------

describe('hashDbFile', () => {
  beforeEach(() => {
    cleanFakeDb()
  })

  afterEach(() => {
    cleanFakeDb()
  })

  it('produce lo stesso hash per lo stesso contenuto (stabile)', () => {
    writeFileSync(FAKE_DB_PATH, Buffer.from('contenuto-stabile-del-db'))
    const h1 = hashDbFile()
    const h2 = hashDbFile()
    expect(h1).toBe(h2)
  })

  it('produce hash diverso al variare del contenuto del file', () => {
    writeFileSync(FAKE_DB_PATH, Buffer.from('contenuto-originale'))
    const h1 = hashDbFile()
    writeFileSync(FAKE_DB_PATH, Buffer.from('contenuto-modificato'))
    const h2 = hashDbFile()
    expect(h1).not.toBe(h2)
  })

  it('restituisce una stringa esadecimale di 64 caratteri (SHA-256)', () => {
    writeFileSync(FAKE_DB_PATH, Buffer.from('qualsiasi-contenuto'))
    const h = hashDbFile()
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('non chiama getDatabase quando isDatabaseOpen è false', () => {
    // La mock di getDatabase lancia se chiamata — il test passa solo se non viene chiamata
    writeFileSync(FAKE_DB_PATH, Buffer.from('test'))
    expect(() => hashDbFile()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Suite: isLocalDirty
// ---------------------------------------------------------------------------

describe('isLocalDirty', () => {
  beforeEach(() => {
    cleanFakeDb()
  })

  afterEach(() => {
    cleanFakeDb()
  })

  it('true se lastLocalHash è null (mai sincronizzato)', () => {
    writeFileSync(FAKE_DB_PATH, Buffer.from('qualsiasi'))
    const state: SyncState = {
      enabled: true,
      syncFileId: null,
      lastRemoteRevision: null,
      lastLocalHash: null,
      lastSyncAt: null,
      pollingSec: 60,
    }
    expect(isLocalDirty(state)).toBe(true)
  })

  it("false se lastLocalHash coincide con l'hash corrente del file", () => {
    const content = Buffer.from('contenuto-sincronizzato')
    writeFileSync(FAKE_DB_PATH, content)
    const currentHash = hashDbFile()
    const state: SyncState = {
      enabled: true,
      syncFileId: 'fid',
      lastRemoteRevision: 'rev1',
      lastLocalHash: currentHash,
      lastSyncAt: '2026-06-14T10:00:00.000Z',
      pollingSec: 60,
    }
    expect(isLocalDirty(state)).toBe(false)
  })

  it("true se lastLocalHash è diverso dall'hash corrente del file", () => {
    writeFileSync(FAKE_DB_PATH, Buffer.from('versione-originale'))
    const oldHash = hashDbFile()
    // Modifica il file
    writeFileSync(FAKE_DB_PATH, Buffer.from('versione-modificata'))
    const state: SyncState = {
      enabled: true,
      syncFileId: 'fid',
      lastRemoteRevision: 'rev1',
      lastLocalHash: oldHash,
      lastSyncAt: '2026-06-14T10:00:00.000Z',
      pollingSec: 60,
    }
    expect(isLocalDirty(state)).toBe(true)
  })
})
