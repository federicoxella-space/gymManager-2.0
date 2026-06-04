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

/** Controlla se SQLCipher è attivo (cipher_version restituisce un valore). */
function isCipherEnabled(): boolean {
  // Accediamo al DB già aperto tramite getDatabase, oppure apriamo temporaneamente
  // un in-memory DB per controllare cipher_version.
  // Usiamo better-sqlite3 direttamente per non sporcare lo stato del modulo.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSQLite = require('better-sqlite3')
  const tmp = new BetterSQLite(':memory:')
  const result = tmp.pragma('cipher_version') as Array<{ cipher_version: string }>
  tmp.close()
  return result.length > 0
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
