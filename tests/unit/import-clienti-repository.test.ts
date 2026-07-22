/**
 * Test di integrazione per le funzioni repository di deduplica e inserimento
 * batch usate dall'import clienti da CSV (clients-repository).
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
  createCliente,
  getClienteByCodiceFiscale,
  getTuttiCodiciFiscali,
  getTutteTessere,
  importClienti,
} from '../../src/main/db/clients-repository'
import type { CreateClienteInput } from '../../src/types/shared'

beforeEach(() => {
  _testDb = new Database(':memory:')
  _testDb.pragma('foreign_keys = ON')
  runMigrations(_testDb)
})

afterEach(() => {
  if (_testDb && _testDb.open) _testDb.close()
  _testDb = null
})

describe('getTuttiCodiciFiscali', () => {
  it('restituisce i CF esistenti in maiuscolo anche se salvati in minuscolo', () => {
    // Inserimento diretto (bypassa createCliente/validazioni) per simulare un CF
    // salvato in minuscolo/misto: la funzione deve comunque normalizzarlo in maiuscolo.
    if (!_testDb) throw new Error('Test DB non inizializzato')
    _testDb
      .prepare(`INSERT INTO clienti (nome, cognome, codice_fiscale) VALUES ('Mario', 'Rossi', ?)`)
      .run('rssmra85m01h501q')

    const set = getTuttiCodiciFiscali()
    expect(set.has('RSSMRA85M01H501Q')).toBe(true)
    expect(set.has('rssmra85m01h501q')).toBe(false)
  })
})

describe('importClienti', () => {
  const nuovi: CreateClienteInput[] = [
    { codice_fiscale: 'RSSMRA85M01H501Q', nome: 'Mario', cognome: 'Rossi' },
    { codice_fiscale: 'VRDLGI90A41H501K', nome: 'Luigi', cognome: 'Verdi' },
  ]

  it('inserisce tutti i clienti nuovi e ritorna il conteggio', () => {
    const n = importClienti(nuovi)
    expect(n).toBe(2)
    expect(getClienteByCodiceFiscale('RSSMRA85M01H501Q')).not.toBeNull()
    expect(getClienteByCodiceFiscale('VRDLGI90A41H501K')).not.toBeNull()
  })

  it('assegna numeri tessera automatici distinti', () => {
    importClienti(nuovi)
    const t = getTutteTessere()
    expect(t.size).toBe(2)
  })

  it('è atomico: se una riga successiva viola UNIQUE, anche le righe precedenti valide vengono annullate', () => {
    // CF_B è già presente in anagrafica: collide con la SECONDA riga del batch.
    // La PRIMA riga (CF_A) è nuova e valida: se la transazione fosse assente,
    // verrebbe inserita comunque. Il rollback deve rimuoverla.
    createCliente({ codice_fiscale: 'VRDLGI90A41H501K', nome: 'Luigi', cognome: 'Verdi' })

    const batch: CreateClienteInput[] = [
      { codice_fiscale: 'RSSMRA85M01H501Q', nome: 'Mario', cognome: 'Rossi' },
      { codice_fiscale: 'VRDLGI90A41H501K', nome: 'Luigi', cognome: 'Verdi' },
    ]

    expect(() => importClienti(batch)).toThrow()
    // La prima riga (valida) NON deve essere rimasta persistita: prova il rollback.
    expect(getClienteByCodiceFiscale('RSSMRA85M01H501Q')).toBeNull()
  })
})
