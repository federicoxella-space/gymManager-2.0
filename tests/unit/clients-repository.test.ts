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
import {
  listClienti,
  createCliente,
  getCliente,
  updateCliente,
  getNextNumeroTessera
} from '../../src/main/db/clients-repository'

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

  it('A8: un codice_fiscale duplicato NON viene etichettato come NUMERO_TESSERA_DUPLICATO', () => {
    createCliente({ nome: 'Mario', cognome: 'Rossi', codice_fiscale: 'RSSMRA85T10H501Z' })
    // Stesso CF, tessera diversa (auto) → deve violare il UNIQUE su codice_fiscale, non su numero_tessera
    expect(() =>
      createCliente({ nome: 'Luigi', cognome: 'Bianchi', codice_fiscale: 'RSSMRA85T10H501Z' })
    ).toThrow(/UNIQUE constraint failed: clienti\.codice_fiscale/i)
  })
})

describe('listClienti — filtro certificato in scadenza oggi (WP2: A11)', () => {
  it('un certificato che scade OGGI è "in_scadenza", non "scaduto"', () => {
    const db = _testDb!
    const c = creaCliente(db, 'RSSMRA85T10H501Z')
    // Schema reale di certificati_medici: id, cliente_id, tipo, data_scadenza, data_inserimento.
    // NON esiste data_rilascio — adattato rispetto alla spec del task.
    // tipo è NOT NULL, nessun CHECK constraint rilevato: usiamo 'agonistico'.
    db.prepare(
      `INSERT INTO certificati_medici (cliente_id, tipo, data_scadenza)
       VALUES (?, 'agonistico', date('now'))`
    ).run(c)

    const inScadenza = listClienti({ stato_certificato: 'in_scadenza' }, 30)
    const scaduti = listClienti({ stato_certificato: 'scaduto' }, 30)

    expect(inScadenza.map((r) => r.id)).toContain(c)
    expect(scaduti.map((r) => r.id)).not.toContain(c)
  })

  it('un certificato scaduto IERI è "scaduto", non "in_scadenza"', () => {
    const db = _testDb!
    const c = creaCliente(db, 'VRDMRA00T10H501K')
    db.prepare(
      `INSERT INTO certificati_medici (cliente_id, tipo, data_scadenza)
       VALUES (?, 'agonistico', date('now','-1 day'))`
    ).run(c)

    const scaduti = listClienti({ stato_certificato: 'scaduto' }, 30)
    const inScadenza = listClienti({ stato_certificato: 'in_scadenza' }, 30)

    expect(scaduti.map((r) => r.id)).toContain(c)
    expect(inScadenza.map((r) => r.id)).not.toContain(c)
  })
})

describe('listClienti — filtro certificato "da_gestire" (B9)', () => {
  it('include in scadenza E scaduti, esclude validi e senza certificato', () => {
    const db = _testDb!
    const inScad = creaCliente(db, 'AAAINS80A01H501A')
    const scaduto = creaCliente(db, 'AAASCA80A01H501B')
    const valido = creaCliente(db, 'AAAVAL80A01H501C')
    const senza = creaCliente(db, 'AAANES80A01H501D')

    db.prepare(
      `INSERT INTO certificati_medici (cliente_id, tipo, data_scadenza)
       VALUES (?, 'agonistico', date('now','+10 day'))`
    ).run(inScad)
    db.prepare(
      `INSERT INTO certificati_medici (cliente_id, tipo, data_scadenza)
       VALUES (?, 'agonistico', date('now','-1 day'))`
    ).run(scaduto)
    db.prepare(
      `INSERT INTO certificati_medici (cliente_id, tipo, data_scadenza)
       VALUES (?, 'agonistico', date('now','+100 day'))`
    ).run(valido)

    const daGestire = listClienti({ stato_certificato: 'da_gestire' }, 30).map((r) => r.id)

    expect(daGestire).toContain(inScad)
    expect(daGestire).toContain(scaduto)
    expect(daGestire).not.toContain(valido)
    expect(daGestire).not.toContain(senza)
  })

  it('rispetta la finestra di preavviso passata', () => {
    const db = _testDb!
    const c = creaCliente(db, 'AAAWIN80A01H501E')
    db.prepare(
      `INSERT INTO certificati_medici (cliente_id, tipo, data_scadenza)
       VALUES (?, 'agonistico', date('now','+20 day'))`
    ).run(c)

    expect(listClienti({ stato_certificato: 'da_gestire' }, 10).map((r) => r.id)).not.toContain(c)
    expect(listClienti({ stato_certificato: 'da_gestire' }, 30).map((r) => r.id)).toContain(c)
  })
})

// ---------------------------------------------------------------------------
// B7 — tutore_id: JOIN derivato e validazioni
// ---------------------------------------------------------------------------

describe('B7 — tutore_id: campi derivati via JOIN e validazioni', () => {
  it('collega un tutore via tutore_id ed espone i campi tutore_* derivati in getCliente', () => {
    const tutore = createCliente({
      nome: 'Mario',
      cognome: 'Rossi',
      codice_fiscale: 'RSSMRA80A01H501U',
      via: 'Via Roma',
      civico: '1',
      citta: 'Roma',
      cap: '00100'
    })
    const minore = createCliente({
      nome: 'Luca',
      cognome: 'Rossi',
      codice_fiscale: 'RSSLCU15A01H501A',
      data_nascita: '2015-01-01',
      tutore_id: tutore.id
    })
    const letto = getCliente(minore.id)!
    expect(letto.tutore_id).toBe(tutore.id)
    expect(letto.tutore_nome).toBe('Mario')
    expect(letto.tutore_cf).toBe('RSSMRA80A01H501U')
    expect(letto.tutore_via).toBe('Via Roma')
  })

  it('rifiuta un tutore inesistente con TUTORE_NON_TROVATO', () => {
    expect(() =>
      createCliente({
        nome: 'X',
        cognome: 'Y',
        codice_fiscale: 'XYXXYX80A01H501V',
        tutore_id: 999999
      })
    ).toThrow('TUTORE_NON_TROVATO')
  })

  it('rifiuta il self-reference in updateCliente con TUTORE_SE_STESSO', () => {
    const c = createCliente({
      nome: 'Alberto',
      cognome: 'Belli',
      codice_fiscale: 'BLLLRT80A01H501W'
    })
    expect(() => updateCliente(c.id, { tutore_id: c.id })).toThrow('TUTORE_SE_STESSO')
  })
})
