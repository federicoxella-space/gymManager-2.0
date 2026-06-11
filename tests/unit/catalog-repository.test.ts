/**
 * Test di integrazione per catalog-repository.
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
import {
  createTipoIscrizione,
  listTipiIscrizione,
  createTipoAbbonamento,
  listTipiAbbonamento
} from '../../src/main/db/catalog-repository'

function creaCliente(db: Database.Database, cf: string): number {
  const info = db
    .prepare(`INSERT INTO clienti (nome, cognome, codice_fiscale) VALUES ('Mario', 'Rossi', ?)`)
    .run(cf)
  return info.lastInsertRowid as number
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

describe('listTipiIscrizione — assegnati_count (B5)', () => {
  it('è 0 per un tipo non assegnato', () => {
    createTipoIscrizione({ nome: 'Annuale', durata_mesi: 12, prezzo_default: 30 })
    const tipi = listTipiIscrizione(true)
    expect(tipi).toHaveLength(1)
    expect(tipi[0].assegnati_count).toBe(0)
  })

  it('conta i clienti assegnati (incluse iscrizioni non attive)', () => {
    const db = _testDb!
    const tipo = createTipoIscrizione({ nome: 'Annuale', durata_mesi: 12, prezzo_default: 30 })
    const c1 = creaCliente(db, 'RSSMRA85T10H501Z')
    const c2 = creaCliente(db, 'BNCLRA90A41H501B')
    db.prepare(
      `INSERT INTO iscrizioni_cliente (cliente_id, tipo_iscrizione_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, '2000-01-01', '2000-12-31', 30, 'da_incassare', 'attiva')`
    ).run(c1, tipo.id)
    db.prepare(
      `INSERT INTO iscrizioni_cliente (cliente_id, tipo_iscrizione_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, '2000-01-01', '2000-12-31', 30, 'da_incassare', 'scaduta')`
    ).run(c2, tipo.id)

    const tipo2 = listTipiIscrizione(true).find((t) => t.id === tipo.id)!
    expect(tipo2.assegnati_count).toBe(2)
  })
})

describe('listTipiAbbonamento — assegnati_count (B5)', () => {
  it('conta i clienti assegnati', () => {
    const db = _testDb!
    const tipo = createTipoAbbonamento({ nome: 'Sala pesi', durata_mesi: 1, prezzo_default: 40 })
    const c1 = creaCliente(db, 'RSSMRA85T10H501Z')
    db.prepare(
      `INSERT INTO abbonamenti_cliente (cliente_id, tipo_abbonamento_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, '2000-01-01', '2000-01-31', 40, 'da_incassare', 'attivo')`
    ).run(c1, tipo.id)

    const tipo2 = listTipiAbbonamento(true).find((t) => t.id === tipo.id)!
    expect(tipo2.assegnati_count).toBe(1)
  })
})

describe('createTipoIscrizione — assegnati_count nel valore di ritorno', () => {
  it('restituisce assegnati_count = 0 al momento della creazione', () => {
    const tipo = createTipoIscrizione({ nome: 'X', durata_mesi: 12, prezzo_default: 10 })
    expect(tipo.assegnati_count).toBe(0)
  })
})

describe('createTipoAbbonamento — assegnati_count nel valore di ritorno', () => {
  it('restituisce assegnati_count = 0 al momento della creazione', () => {
    const tipo = createTipoAbbonamento({ nome: 'Y', durata_mesi: 1, prezzo_default: 10 })
    expect(tipo.assegnati_count).toBe(0)
  })
})
