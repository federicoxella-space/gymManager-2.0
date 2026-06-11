/**
 * Test di integrazione per i filtri di listClienti (clients-repository).
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
import { listClienti, createCliente, getNextNumeroTessera } from '../../src/main/db/clients-repository'

function creaCliente(db: Database.Database, cf: string): number {
  const info = db
    .prepare(`INSERT INTO clienti (nome, cognome, codice_fiscale) VALUES ('Mario', 'Rossi', ?)`)
    .run(cf)
  return info.lastInsertRowid as number
}

function creaTipoIscrizione(db: Database.Database): number {
  const info = db
    .prepare(`INSERT INTO tipi_iscrizione (nome, durata_mesi, prezzo_default) VALUES ('Annuale', 12, 30)`)
    .run()
  return info.lastInsertRowid as number
}

function inserisciIscrizione(
  db: Database.Database,
  clienteId: number,
  tipoId: number,
  stato: 'attiva' | 'scaduta' | 'invalidata'
): void {
  db.prepare(
    `INSERT INTO iscrizioni_cliente
      (cliente_id, tipo_iscrizione_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
     VALUES (?, ?, '2000-01-01', '2000-12-31', 30, 'da_incassare', ?)`
  ).run(clienteId, tipoId, stato)
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

describe('listClienti — filtro stato_iscrizione="scaduta" (WP1: A15a)', () => {
  it('include un cliente con un\'iscrizione scaduta', () => {
    const db = _testDb!
    const tipoId = creaTipoIscrizione(db)
    const c = creaCliente(db, 'RSSMRA85T10H501Z')
    inserisciIscrizione(db, c, tipoId, 'scaduta')

    const result = listClienti({ stato_iscrizione: 'scaduta' })

    expect(result.map((r) => r.id)).toContain(c)
  })

  it('A15a: NON include un cliente con sole iscrizioni invalidate', () => {
    const db = _testDb!
    const tipoId = creaTipoIscrizione(db)
    const c = creaCliente(db, 'BNCNNA10A01H501X')
    inserisciIscrizione(db, c, tipoId, 'invalidata')

    const result = listClienti({ stato_iscrizione: 'scaduta' })

    expect(result.map((r) => r.id)).not.toContain(c)
  })

  it('NON include un cliente con iscrizione attiva', () => {
    const db = _testDb!
    const tipoId = creaTipoIscrizione(db)
    const c = creaCliente(db, 'VRDLGU90A01H501A')
    inserisciIscrizione(db, c, tipoId, 'attiva')

    const result = listClienti({ stato_iscrizione: 'scaduta' })

    expect(result.map((r) => r.id)).not.toContain(c)
  })

  it('NON include un cliente con iscrizione scaduta MA anche una attiva (già rinnovato)', () => {
    const db = _testDb!
    const tipoId = creaTipoIscrizione(db)
    const c = creaCliente(db, 'TSTCLN99A01H501Q')
    inserisciIscrizione(db, c, tipoId, 'scaduta') // vecchia
    inserisciIscrizione(db, c, tipoId, 'attiva') // rinnovata

    const result = listClienti({ stato_iscrizione: 'scaduta' })

    expect(result.map((r) => r.id)).not.toContain(c)
  })
})

describe('createCliente — numero_tessera (WP2: A8)', () => {
  it('assegna numeri tessera progressivi quando non specificati', () => {
    const a = createCliente({ nome: 'Mario', cognome: 'Rossi', codice_fiscale: 'RSSMRA85T10H501Z' })
    const b = createCliente({ nome: 'Lucia', cognome: 'Verdi', codice_fiscale: 'VRDLCU90A41H501B' })
    expect(a.numero_tessera).toBe('1')
    expect(b.numero_tessera).toBe('2')
  })

  it('A8: un numero_tessera duplicato (override) lancia NUMERO_TESSERA_DUPLICATO', () => {
    createCliente({ numero_tessera: '100', nome: 'Mario', cognome: 'Rossi', codice_fiscale: 'RSSMRA85T10H501Z' })
    expect(() =>
      createCliente({ numero_tessera: '100', nome: 'Lucia', cognome: 'Verdi', codice_fiscale: 'VRDLCU90A41H501B' })
    ).toThrow('NUMERO_TESSERA_DUPLICATO')
  })

  it('getNextNumeroTessera tiene conto del massimo numerico esistente', () => {
    createCliente({ numero_tessera: '50', nome: 'Mario', cognome: 'Rossi', codice_fiscale: 'RSSMRA85T10H501Z' })
    expect(getNextNumeroTessera()).toBe('51')
  })
})
