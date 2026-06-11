import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'

vi.mock('electron', () => ({
  app: {
    getPath: (_name: string) => '/tmp/gymmanager-test-settings'
  }
}))

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

let _testDb: Database.Database | null = null
vi.mock('../../src/main/db/database', () => ({
  getDatabase: () => {
    if (!_testDb) throw new Error('Test DB non inizializzato')
    return _testDb
  }
}))

import { runMigrations } from '../../src/main/db/migrations'
import { applyAppSettingsToDb } from '../../src/main/settings/store'

beforeEach(() => {
  _testDb = new Database(':memory:')
  _testDb.pragma('foreign_keys = ON')
  runMigrations(_testDb)
})
afterEach(() => {
  if (_testDb && _testDb.open) _testDb.close()
  _testDb = null
})

describe('applyAppSettingsToDb (WP2: A14)', () => {
  it('fa upsert dei soli campi presenti in app_settings', () => {
    const db = _testDb!
    applyAppSettingsToDb(db, { receipt_start_number: 5, ragione_sociale: 'ASD Test' })

    const n = db.prepare(`SELECT value FROM app_settings WHERE key = 'receipt_start_number'`).get() as { value: string }
    const r = db.prepare(`SELECT value FROM app_settings WHERE key = 'ragione_sociale'`).get() as { value: string }
    expect(n.value).toBe('5')
    expect(r.value).toBe('ASD Test')
  })

  it('è idempotente: ri-applicare aggiorna senza creare duplicati', () => {
    const db = _testDb!
    applyAppSettingsToDb(db, { receipt_start_number: 1 })
    applyAppSettingsToDb(db, { receipt_start_number: 2 })
    const rows = db.prepare(`SELECT COUNT(*) AS c FROM app_settings WHERE key = 'receipt_start_number'`).get() as { c: number }
    const val = db.prepare(`SELECT value FROM app_settings WHERE key = 'receipt_start_number'`).get() as { value: string }
    expect(rows.c).toBe(1)
    expect(val.value).toBe('2')
  })

  it('non scrive nulla per i campi non presenti', () => {
    const db = _testDb!
    applyAppSettingsToDb(db, { receipt_start_number: 7 })
    const r = db.prepare(`SELECT value FROM app_settings WHERE key = 'ragione_sociale'`).get()
    expect(r).toBeUndefined()
  })
})
