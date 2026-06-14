/**
 * Test per changePassword (rekey SQLCipher).
 * Riusa il pattern di db.test.ts: electron mockato su tmpdir, DB_PATH fisso.
 * Le asserzioni che dipendono dalla cifratura reale sono gated da CIPHER_ENABLED.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { unlinkSync, existsSync } from 'fs'

vi.mock('electron', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: pathJoin } = require('path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir: osTmpdir } = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdirSync: fsMkdir } = require('fs')
  const testDataDir = pathJoin(osTmpdir(), `gymmanager-cpw-${process.pid}`)
  fsMkdir(testDataDir, { recursive: true })
  return { app: { getPath: (_n: string) => testDataDir } }
})
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { openDatabase, closeDatabase, isDatabaseOpen, changePassword, DB_PATH } from '../../src/main/db/database'

function isCipherEnabled(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSQLite = require('better-sqlite3-multiple-ciphers')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: pjoin } = require('path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir: ostmpdir } = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { unlinkSync: fsUnlink, existsSync: fsExists } = require('fs')
  const tempFile = pjoin(ostmpdir(), `cipher-probe-cpw-${process.pid}-${Date.now()}.db`)
  try {
    const dbA = new BetterSQLite(tempFile)
    dbA.pragma("key='alpha'")
    dbA.prepare('CREATE TABLE IF NOT EXISTS _p (id INTEGER PRIMARY KEY)').run()
    dbA.close()
    const dbB = new BetterSQLite(tempFile)
    dbB.pragma("key='beta'")
    try {
      const res = dbB.prepare('PRAGMA integrity_check').all()
      dbB.close()
      const ok = Array.isArray(res) && res.length === 1 && (res[0] as Record<string, string>)['integrity_check'] === 'ok'
      return !ok
    } catch {
      try { dbB.close() } catch { /* ignore */ }
      return true
    }
  } catch {
    return false
  } finally {
    if (fsExists(tempFile)) { try { fsUnlink(tempFile) } catch { /* ignore */ } }
  }
}
const CIPHER_ENABLED = isCipherEnabled()

function cleanup(): void {
  if (isDatabaseOpen()) closeDatabase()
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
    if (existsSync(f)) { try { unlinkSync(f) } catch { /* ignore */ } }
  }
}
beforeEach(cleanup)
afterEach(cleanup)

describe('changePassword', () => {
  it('lancia se il DB non è aperto', () => {
    expect(() => changePassword('a', 'newpass12')).toThrow()
  })

  it('lancia PASSWORD_WRONG se la vecchia password non corrisponde', () => {
    openDatabase('vecchia-password')
    expect(() => changePassword('sbagliata', 'nuova-password')).toThrow('PASSWORD_WRONG')
  })

  it('con la vecchia password corretta non lancia', () => {
    openDatabase('vecchia-password')
    expect(() => changePassword('vecchia-password', 'nuova-password')).not.toThrow()
    expect(isDatabaseOpen()).toBe(true)
  })

  it.skipIf(!CIPHER_ENABLED)(
    '[CIPHER] dopo il rekey il DB si riapre con la NUOVA password e non con la vecchia',
    () => {
      openDatabase('vecchia-password')
      changePassword('vecchia-password', 'nuova-password')
      closeDatabase()
      expect(() => openDatabase('nuova-password')).not.toThrow()
      closeDatabase()
      expect(() => openDatabase('vecchia-password')).toThrow('PASSWORD_WRONG')
    }
  )
})
