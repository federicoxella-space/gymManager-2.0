/**
 * Test per il filtro età di listClienti e per contaClientiAttivi.
 * DB SQLite in-memory + runMigrations, getDatabase() mockato.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'

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
import { listClienti, contaClientiAttivi } from '../../src/main/db/clients-repository'

/** Inserisce un cliente con data di nascita e stato opzionali. */
function inserisci(
  db: Database.Database,
  cf: string,
  dataNascita: string | null,
  stato: 'attivo' | 'anonimizzato' = 'attivo'
): void {
  db.prepare(
    `INSERT INTO clienti (nome, cognome, codice_fiscale, data_nascita, stato)
     VALUES ('Nome', 'Cognome', ?, ?, ?)`
  ).run(cf, dataNascita, stato)
}

/** Restituisce una data ISO di `anni` fa rispetto a oggi. */
function isoAnniFa(anni: number): string {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - anni)
  return d.toISOString().slice(0, 10)
}

beforeEach(() => {
  _testDb = new Database(':memory:')
  _testDb.pragma('foreign_keys = ON')
  runMigrations(_testDb)
})

afterEach(() => {
  if (_testDb && _testDb.open) _testDb.close()
  _testDb = null
})

describe('listClienti — filtro eta', () => {
  beforeEach(() => {
    const db = _testDb!
    inserisci(db, 'MINORE', isoAnniFa(10)) // 10 anni → minorenne
    inserisci(db, 'ADULTO', isoAnniFa(30)) // 30 anni → maggiorenne
    inserisci(db, 'SENZADATA', null)       // data mancante → escluso da entrambi
  })

  it("eta='minorenne' restituisce solo i minorenni con data nota", () => {
    const rows = listClienti({ eta: 'minorenne' })
    const cf = rows.map((r) => r.codice_fiscale)
    expect(cf).toContain('MINORE')
    expect(cf).not.toContain('ADULTO')
    expect(cf).not.toContain('SENZADATA')
  })

  it("eta='maggiorenne' restituisce solo i maggiorenni con data nota", () => {
    const rows = listClienti({ eta: 'maggiorenne' })
    const cf = rows.map((r) => r.codice_fiscale)
    expect(cf).toContain('ADULTO')
    expect(cf).not.toContain('MINORE')
    expect(cf).not.toContain('SENZADATA')
  })

  it('senza filtro eta include tutti (anche senza data)', () => {
    const rows = listClienti()
    expect(rows).toHaveLength(3)
  })
})

describe('contaClientiAttivi', () => {
  it('conta solo i clienti con stato attivo', () => {
    const db = _testDb!
    inserisci(db, 'A1', isoAnniFa(20))
    inserisci(db, 'A2', isoAnniFa(25))
    inserisci(db, 'ANON', isoAnniFa(40), 'anonimizzato')
    expect(contaClientiAttivi()).toBe(2)
  })
})
