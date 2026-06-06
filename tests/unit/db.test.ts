/**
 * Test unit per il database layer (database.ts).
 *
 * Ambiente: Vitest con Node puro. `electron` è mockato per evitare
 * la dipendenza da Electron runtime. `better-sqlite3` è standard SQLite
 * (senza SQLCipher) ricompilato per il sistema Node corrente.
 *
 * Nota sull'assenza di SQLCipher:
 * Il binary installato è standard SQLite (cipher_version restituisce vuoto).
 * Il PRAGMA key viene accettato ma ignorato: aprire un DB con password errata
 * NON genera errore. I test cipher-specific sono saltati condizionalmente.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { unlinkSync, existsSync } from 'fs'

// NOTA: vi.mock() è hoistato da Vitest in cima al file prima di qualsiasi
// inizializzazione di variabili. Perciò la factory NON può referenziare
// costanti del modulo (temporal dead zone). Usiamo require() inline o
// calcoliamo il path direttamente dentro la factory senza riferimenti esterni.
vi.mock('electron', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: pathJoin } = require('path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir: osTmpdir } = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdirSync: fsMkdir } = require('fs')
  const testDataDir = pathJoin(osTmpdir(), `gymmanager-test-${process.pid}`)
  fsMkdir(testDataDir, { recursive: true })
  return {
    app: {
      getPath: (_name: string) => testDataDir
    }
  }
})

// Mocking electron-log per silenziare l'output nei test
vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

// La cartella reale usata dalla mock — calcolata con la stessa logica
const TEST_USER_DATA = join(tmpdir(), `gymmanager-test-${process.pid}`)

// Import DOPO le mock (Vitest le hoista comunque, ma è buona pratica)
import {
  openDatabase,
  closeDatabase,
  isDatabaseOpen,
  checkFirstRun,
  deriveKey,
  DB_PATH
} from '../../src/main/db/database'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Controlla se la cifratura è attiva verificando che openDatabase lanci
 * per password errata (comportamento definitivo rispetto a probe su PRAGMA).
 *
 * Con better-sqlite3-multiple-ciphers la cifratura è sempre attiva;
 * il check usa lo stesso openDatabase importato dal modulo.
 */
function isCipherEnabled(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: pjoin } = require('path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir: ostmpdir } = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { unlinkSync: fsUnlink, existsSync: fsExists } = require('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSQLite = require('better-sqlite3-multiple-ciphers')

  const tempFile = pjoin(ostmpdir(), `cipher-probe-${process.pid}-${Date.now()}.db`)
  try {
    // Crea DB con passphrase A, poi scrivi una tabella reale
    const dbA: { pragma: (s: string) => unknown; prepare: (s: string) => { run: () => void }; close: () => void } = new BetterSQLite(tempFile)
    dbA.pragma("key='passphrase-ALPHA'")
    dbA.prepare('CREATE TABLE IF NOT EXISTS _probe (id INTEGER PRIMARY KEY)').run()
    dbA.close()

    // Apri con passphrase diversa B e tenta di leggere la tabella
    const dbB: { pragma: (s: string) => unknown; prepare: (s: string) => { all: () => unknown[] }; close: () => void } = new BetterSQLite(tempFile)
    dbB.pragma("key='passphrase-BETA'")
    try {
      // Con cipher attivo questa legge dati corrotti e POTREBBE lanciare;
      // con SQLite Multiple Ciphers usa PRAGMA integrity_check per forzare lettura
      const res = dbB.prepare('PRAGMA integrity_check').all()
      dbB.close()
      // Se integrity_check restituisce solo 'ok' il cipher NON è attivo
      const ok = Array.isArray(res) && res.length === 1 && (res[0] as Record<string, string>)['integrity_check'] === 'ok'
      return !ok  // se non è ok, il cipher è attivo (dati corrotti)
    } catch {
      try { dbB.close() } catch { /* ignore */ }
      return true  // lancio → cipher attivo
    }
  } catch {
    return false
  } finally {
    if (fsExists(tempFile)) { try { fsUnlink(tempFile) } catch { /* ignore */ } }
  }
}

const CIPHER_ENABLED = isCipherEnabled()

// ---------------------------------------------------------------------------
// Suite: deriveKey
// ---------------------------------------------------------------------------

describe('deriveKey', () => {
  it('produce sempre la stessa chiave dalla stessa password (deterministico)', () => {
    const k1 = deriveKey('mypassword')
    const k2 = deriveKey('mypassword')
    expect(k1).toBe(k2)
  })

  it('produce chiavi diverse da password diverse', () => {
    const k1 = deriveKey('password1')
    const k2 = deriveKey('password2')
    expect(k1).not.toBe(k2)
  })

  it('restituisce una stringa esadecimale di 64 caratteri (32 byte)', () => {
    const key = deriveKey('test')
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })

  it('gestisce password vuota senza eccezioni', () => {
    expect(() => deriveKey('')).not.toThrow()
    expect(deriveKey('')).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ---------------------------------------------------------------------------
// Suite: openDatabase / closeDatabase / isDatabaseOpen
// ---------------------------------------------------------------------------

describe('openDatabase / closeDatabase / isDatabaseOpen', () => {
  // Ogni test usa il DB_PATH globale del modulo; chiudiamo sempre dopo.
  // Nota: DB_PATH è fisso e punta a TEST_USER_DATA/gymmanager.db
  // Per isolare i test, eliminiamo il file prima e dopo ogni test.

  beforeEach(() => {
    // Assicurarsi che il DB sia chiuso e il file non esista
    if (isDatabaseOpen()) {
      closeDatabase()
    }
    if (existsSync(DB_PATH)) {
      unlinkSync(DB_PATH)
    }
  })

  afterEach(() => {
    if (isDatabaseOpen()) {
      closeDatabase()
    }
    if (existsSync(DB_PATH)) {
      unlinkSync(DB_PATH)
    }
    // Rimuovi anche il WAL e SHM se esistono
    const wal = DB_PATH + '-wal'
    const shm = DB_PATH + '-shm'
    if (existsSync(wal)) unlinkSync(wal)
    if (existsSync(shm)) unlinkSync(shm)
  })

  it('apre un nuovo DB (primo avvio) con una password → isDatabaseOpen() === true', () => {
    expect(isDatabaseOpen()).toBe(false)
    openDatabase('password123')
    expect(isDatabaseOpen()).toBe(true)
  })

  it('chiude il DB → isDatabaseOpen() === false', () => {
    openDatabase('password123')
    expect(isDatabaseOpen()).toBe(true)
    closeDatabase()
    expect(isDatabaseOpen()).toBe(false)
  })

  it('apre di nuovo lo stesso file con la stessa password → funziona', () => {
    openDatabase('password123')
    closeDatabase()
    // Il file ora esiste; riaprirlo deve funzionare
    openDatabase('password123')
    expect(isDatabaseOpen()).toBe(true)
  })

  it('openDatabase è idempotente: chiamata doppia con DB già aperto non lancia errore', () => {
    openDatabase('password123')
    // Seconda chiamata deve essere silenziosa (già aperto)
    expect(() => openDatabase('password123')).not.toThrow()
    expect(isDatabaseOpen()).toBe(true)
  })

  it('closeDatabase è idempotente: chiamata su DB non aperto non lancia errore', () => {
    expect(isDatabaseOpen()).toBe(false)
    expect(() => closeDatabase()).not.toThrow()
  })

  it.skipIf(!CIPHER_ENABLED)(
    '[CIPHER] apre con password errata → lancia Error("PASSWORD_WRONG")',
    () => {
      // Crea DB con password A
      openDatabase('passwordA')
      closeDatabase()
      // Riapri con password B → deve lanciare PASSWORD_WRONG
      expect(() => openDatabase('passwordB')).toThrow('PASSWORD_WRONG')
    }
  )

  it.skipIf(CIPHER_ENABLED)(
    '[NO-CIPHER] apre con password diversa → non lancia (SQLite standard ignora PRAGMA key)',
    () => {
      // Comportamento atteso in assenza di SQLCipher: nessun errore
      openDatabase('passwordA')
      closeDatabase()
      expect(() => openDatabase('passwordB')).not.toThrow()
      expect(isDatabaseOpen()).toBe(true)
    }
  )
})

// ---------------------------------------------------------------------------
// Suite: checkFirstRun
// ---------------------------------------------------------------------------

describe('checkFirstRun', () => {
  beforeEach(() => {
    if (isDatabaseOpen()) closeDatabase()
    if (existsSync(DB_PATH)) unlinkSync(DB_PATH)
  })

  afterEach(() => {
    if (isDatabaseOpen()) closeDatabase()
    if (existsSync(DB_PATH)) unlinkSync(DB_PATH)
    const wal = DB_PATH + '-wal'
    const shm = DB_PATH + '-shm'
    if (existsSync(wal)) unlinkSync(wal)
    if (existsSync(shm)) unlinkSync(shm)
  })

  it('con file DB non esistente → true (primo avvio)', () => {
    expect(existsSync(DB_PATH)).toBe(false)
    expect(checkFirstRun()).toBe(true)
  })

  it('con file DB esistente (dopo openDatabase) → false', () => {
    openDatabase('password123')
    closeDatabase()
    expect(existsSync(DB_PATH)).toBe(true)
    expect(checkFirstRun()).toBe(false)
  })
})
