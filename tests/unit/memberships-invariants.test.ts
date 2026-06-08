/**
 * Test di integrazione per le invarianti di dominio F2 relative a
 * iscrizioni e abbonamenti (invarianti 1–4).
 *
 * Usa better-sqlite3 con DB in-memory, applica le migrazioni 001–003
 * tramite runMigrations, e sostituisce getDatabase() con il DB in-memory
 * tramite vi.mock — senza Electron runtime.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'

// ── Mock di electron-log (silenzia output) ────────────────────────────────────
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

// ── Mock di database.ts: getDatabase() ritorna il DB in-memory del test ───────
// Vitest hoista vi.mock prima dell'inizializzazione delle variabili di modulo;
// usiamo una factory che legge la variabile tramite closure sul modulo mock.
let _testDb: Database.Database | null = null

vi.mock('../../src/main/db/database', () => ({
  getDatabase: () => {
    if (!_testDb) throw new Error('Test DB non inizializzato')
    return _testDb
  }
}))

// Import DOPO le mock
import { runMigrations } from '../../src/main/db/migrations'
import {
  assegnaIscrizione,
  getIscrizioneAttiva,
  invalidaIscrizione,
  assegnaAbbonamento,
  updateIscrizioneDate,
  updateAbbonamentoDate,
  invalidaAbbonamento,
  getAbbonamento,
  aggiornaStatoIscrizioni,
  aggiornaStatoAbbonamenti
} from '../../src/main/db/memberships-repository'
import {
  createTipoIscrizione,
  deleteTipoIscrizione,
  getTipoIscrizione,
  createTipoAbbonamento,
  deleteTipoAbbonamento
} from '../../src/main/db/catalog-repository'
import { abbonamentoOltreScadenzaIscrizione } from '../../src/main/domain/iscrizione'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Inserisce un cliente di test e ritorna il suo id. */
function creaCliente(db: Database.Database, cf = 'RSSMRA85T10H501Z'): number {
  const info = db
    .prepare(`INSERT INTO clienti (nome, cognome, codice_fiscale) VALUES ('Mario', 'Rossi', ?)`)
    .run(cf)
  return info.lastInsertRowid as number
}

/** Crea un TipoIscrizione di test e ritorna il suo id. */
function creaTipoIscrizione(db: Database.Database): number {
  // Usiamo SQL direttamente per non dipendere da catalog-repository
  const info = db
    .prepare(`INSERT INTO tipi_iscrizione (nome, durata_mesi, prezzo_default) VALUES ('Annuale', 12, 30)`)
    .run()
  return info.lastInsertRowid as number
}

/** Crea un TipoAbbonamento di test e ritorna il suo id. */
function creaTipoAbbonamento(db: Database.Database): number {
  const info = db
    .prepare(`INSERT INTO tipi_abbonamento (nome, durata_mesi, prezzo_default, colore) VALUES ('Sala pesi', 1, 40, '#3B82F6')`)
    .run()
  return info.lastInsertRowid as number
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  _testDb = new Database(':memory:')
  _testDb.pragma('foreign_keys = ON')
  runMigrations(_testDb)
})

afterEach(() => {
  if (_testDb && _testDb.open) _testDb.close()
  _testDb = null
})

// ---------------------------------------------------------------------------
// Invariante 1: una sola iscrizione attiva per cliente
// ---------------------------------------------------------------------------

describe('Invariante 1: una sola iscrizione attiva', () => {
  it('assegnare una seconda iscrizione attiva allo stesso cliente lancia ISCRIZIONE_GIA_ATTIVA', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoIscrizione(db)

    // Prima iscrizione: ok
    assegnaIscrizione({
      cliente_id: clienteId,
      tipo_iscrizione_id: tipoId,
      data_inizio: '2025-01-01',
      data_scadenza: '2025-12-31',
      prezzo: 30,
      stato_pagamento: 'pagato'
    })

    // Seconda iscrizione sullo stesso cliente: deve lanciare
    expect(() =>
      assegnaIscrizione({
        cliente_id: clienteId,
        tipo_iscrizione_id: tipoId,
        data_inizio: '2025-06-01',
        data_scadenza: '2026-05-31',
        prezzo: 30,
        stato_pagamento: 'da_incassare'
      })
    ).toThrow('ISCRIZIONE_GIA_ATTIVA')
  })

  it('dopo invalidaIscrizione si può assegnare una nuova iscrizione', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoIscrizione(db)

    const prima = assegnaIscrizione({
      cliente_id: clienteId,
      tipo_iscrizione_id: tipoId,
      data_inizio: '2025-01-01',
      data_scadenza: '2025-12-31',
      prezzo: 30,
      stato_pagamento: 'pagato'
    })

    invalidaIscrizione(prima.id)

    // Ora non c'è più un'iscrizione attiva: la nuova deve riuscire
    expect(() =>
      assegnaIscrizione({
        cliente_id: clienteId,
        tipo_iscrizione_id: tipoId,
        data_inizio: '2026-01-01',
        data_scadenza: '2026-12-31',
        prezzo: 30,
        stato_pagamento: 'da_incassare'
      })
    ).not.toThrow()

    const attiva = getIscrizioneAttiva(clienteId)
    expect(attiva).not.toBeNull()
    expect(attiva?.data_inizio).toBe('2026-01-01')
  })

  it('clienti diversi possono avere ciascuno la propria iscrizione attiva', () => {
    const db = _testDb!
    const c1 = creaCliente(db, 'RSSMRA85T10H501Z')
    const c2 = creaCliente(db, 'BNCNNA90A41H501X')
    const tipoId = creaTipoIscrizione(db)

    expect(() => {
      assegnaIscrizione({ cliente_id: c1, tipo_iscrizione_id: tipoId, data_inizio: '2025-01-01', data_scadenza: '2025-12-31', prezzo: 30, stato_pagamento: 'pagato' })
      assegnaIscrizione({ cliente_id: c2, tipo_iscrizione_id: tipoId, data_inizio: '2025-01-01', data_scadenza: '2025-12-31', prezzo: 30, stato_pagamento: 'pagato' })
    }).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Invariante 2: nessun abbonamento senza iscrizione attiva
// ---------------------------------------------------------------------------

describe('Invariante 2: nessun abbonamento senza iscrizione attiva', () => {
  it('assegnare un abbonamento senza iscrizione lancia NESSUNA_ISCRIZIONE_ATTIVA', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoAbbId = creaTipoAbbonamento(db)

    expect(() =>
      assegnaAbbonamento({
        cliente_id: clienteId,
        tipo_abbonamento_id: tipoAbbId,
        data_inizio: '2025-01-01',
        data_scadenza: '2025-01-31',
        prezzo: 40,
        stato_pagamento: 'da_incassare'
      })
    ).toThrow('NESSUNA_ISCRIZIONE_ATTIVA')
  })

  it('con iscrizione attiva l\'abbonamento viene creato senza errori', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoIscId = creaTipoIscrizione(db)
    const tipoAbbId = creaTipoAbbonamento(db)

    assegnaIscrizione({
      cliente_id: clienteId,
      tipo_iscrizione_id: tipoIscId,
      data_inizio: '2025-01-01',
      data_scadenza: '2025-12-31',
      prezzo: 30,
      stato_pagamento: 'pagato'
    })

    expect(() =>
      assegnaAbbonamento({
        cliente_id: clienteId,
        tipo_abbonamento_id: tipoAbbId,
        data_inizio: '2025-01-01',
        data_scadenza: '2025-01-31',
        prezzo: 40,
        stato_pagamento: 'da_incassare'
      })
    ).not.toThrow()
  })

  it('con iscrizione invalidata (non attiva) lancia NESSUNA_ISCRIZIONE_ATTIVA', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoIscId = creaTipoIscrizione(db)
    const tipoAbbId = creaTipoAbbonamento(db)

    const isc = assegnaIscrizione({
      cliente_id: clienteId,
      tipo_iscrizione_id: tipoIscId,
      data_inizio: '2025-01-01',
      data_scadenza: '2025-12-31',
      prezzo: 30,
      stato_pagamento: 'pagato'
    })

    invalidaIscrizione(isc.id)

    expect(() =>
      assegnaAbbonamento({
        cliente_id: clienteId,
        tipo_abbonamento_id: tipoAbbId,
        data_inizio: '2025-02-01',
        data_scadenza: '2025-02-28',
        prezzo: 40,
        stato_pagamento: 'da_incassare'
      })
    ).toThrow('NESSUNA_ISCRIZIONE_ATTIVA')
  })
})

// ---------------------------------------------------------------------------
// Invariante 3: abbonamento oltre scadenza iscrizione — segnalazione non bloccante
// ---------------------------------------------------------------------------

describe('Invariante 3: abbonamento oltre scadenza iscrizione — segnalazione non bloccante', () => {
  it('assegnaAbbonamento con scadenza > iscrizione NON lancia errore (non bloccante)', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoIscId = creaTipoIscrizione(db)
    const tipoAbbId = creaTipoAbbonamento(db)

    assegnaIscrizione({
      cliente_id: clienteId,
      tipo_iscrizione_id: tipoIscId,
      data_inizio: '2025-01-01',
      data_scadenza: '2025-06-30', // iscrizione scade a giugno
      prezzo: 30,
      stato_pagamento: 'pagato'
    })

    // Abbonamento che scade dopo l'iscrizione: permesso, solo segnalazione
    expect(() =>
      assegnaAbbonamento({
        cliente_id: clienteId,
        tipo_abbonamento_id: tipoAbbId,
        data_inizio: '2025-01-01',
        data_scadenza: '2025-12-31', // oltre la scadenza iscrizione
        prezzo: 40,
        stato_pagamento: 'da_incassare'
      })
    ).not.toThrow()
  })

  it('abbonamentoOltreScadenzaIscrizione() ritorna true quando abbonamento supera l\'iscrizione', () => {
    expect(
      abbonamentoOltreScadenzaIscrizione('2025-12-31', '2025-06-30')
    ).toBe(true)
  })

  it('abbonamentoOltreScadenzaIscrizione() ritorna false quando coincidono', () => {
    expect(
      abbonamentoOltreScadenzaIscrizione('2025-06-30', '2025-06-30')
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Invariante 4: tipo non eliminabile se assegnato
// ---------------------------------------------------------------------------

describe('Invariante 4: tipo non eliminabile se assegnato', () => {
  it('deleteTipoIscrizione con clienti assegnati lancia TIPO_ASSEGNATO', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)

    // Crea tipo tramite catalog-repository (usa getDatabase() mockata)
    const tipo = createTipoIscrizione({ nome: 'Annuale', durata_mesi: 12, prezzo_default: 30 })

    assegnaIscrizione({
      cliente_id: clienteId,
      tipo_iscrizione_id: tipo.id,
      data_inizio: '2025-01-01',
      data_scadenza: '2025-12-31',
      prezzo: 30,
      stato_pagamento: 'pagato'
    })

    expect(() => deleteTipoIscrizione(tipo.id)).toThrow('TIPO_ASSEGNATO')
  })

  it('deleteTipoIscrizione senza assegnazioni elimina il tipo senza errori', () => {
    const tipo = createTipoIscrizione({ nome: 'Trimestrale', durata_mesi: 3, prezzo_default: 15 })

    expect(() => deleteTipoIscrizione(tipo.id)).not.toThrow()
  })

  it('dopo deleteTipoIscrizione il tipo non si trova più', () => {
    const tipo = createTipoIscrizione({ nome: 'Semestrale', durata_mesi: 6, prezzo_default: 20 })
    deleteTipoIscrizione(tipo.id)

    expect(getTipoIscrizione(tipo.id)).toBeNull()
  })

  it('deleteTipoAbbonamento con abbonamenti assegnati lancia TIPO_ASSEGNATO', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoIscId = creaTipoIscrizione(db)

    const tipoAbb = createTipoAbbonamento({
      nome: 'Sala pesi',
      durata_mesi: 1,
      prezzo_default: 40,
      colore: '#FF0000'
    })

    assegnaIscrizione({
      cliente_id: clienteId,
      tipo_iscrizione_id: tipoIscId,
      data_inizio: '2025-01-01',
      data_scadenza: '2025-12-31',
      prezzo: 30,
      stato_pagamento: 'pagato'
    })

    assegnaAbbonamento({
      cliente_id: clienteId,
      tipo_abbonamento_id: tipoAbb.id,
      data_inizio: '2025-01-01',
      data_scadenza: '2025-01-31',
      prezzo: 40,
      stato_pagamento: 'da_incassare'
    })

    expect(() => deleteTipoAbbonamento(tipoAbb.id)).toThrow('TIPO_ASSEGNATO')
  })

  it('deleteTipoAbbonamento senza assegnazioni funziona', () => {
    const tipoAbb = createTipoAbbonamento({
      nome: 'Yoga',
      durata_mesi: 3,
      prezzo_default: 60
    })

    expect(() => deleteTipoAbbonamento(tipoAbb.id)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// WP1 — Modifica date iscrizione (N1/N2/A3)
// ---------------------------------------------------------------------------

/** Inserisce un'iscrizione con date e stato espliciti, ritorna l'id. */
function inserisciIscrizione(
  db: Database.Database,
  clienteId: number,
  tipoIscId: number,
  dataInizio: string,
  dataScadenza: string,
  stato: 'attiva' | 'scaduta' | 'invalidata'
): number {
  const info = db
    .prepare(
      `INSERT INTO iscrizioni_cliente
        (cliente_id, tipo_iscrizione_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, ?, ?, 30, 'da_incassare', ?)`
    )
    .run(clienteId, tipoIscId, dataInizio, dataScadenza, stato)
  return info.lastInsertRowid as number
}

describe('updateIscrizioneDate (WP1: N1/N2/A3)', () => {
  it('ricalcola lo stato a "scaduta" se la nuova scadenza è nel passato', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoIscrizione(db)
    const id = inserisciIscrizione(db, clienteId, tipoId, '2999-01-01', '2999-12-31', 'attiva')

    const updated = updateIscrizioneDate(id, '2000-01-01', '2000-12-31')

    expect(updated.stato).toBe('scaduta')
  })

  it('ricalcola lo stato a "attiva" se la nuova scadenza è nel futuro', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoIscrizione(db)
    const id = inserisciIscrizione(db, clienteId, tipoId, '2000-01-01', '2000-12-31', 'scaduta')

    const updated = updateIscrizioneDate(id, '2999-01-01', '2999-12-31')

    expect(updated.stato).toBe('attiva')
  })

  it('N1: NON riporta in vita un\'iscrizione invalidata modificandone le date', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoIscrizione(db)
    const id = inserisciIscrizione(db, clienteId, tipoId, '2000-01-01', '2000-12-31', 'invalidata')

    const updated = updateIscrizioneDate(id, '2999-01-01', '2999-12-31')

    expect(updated.stato).toBe('invalidata')
    // Le date devono comunque essere state aggiornate (guardia contro UPDATE no-op)
    expect(updated.data_inizio).toBe('2999-01-01')
    expect(updated.data_scadenza).toBe('2999-12-31')
  })

  it('invariante 1: rifiuta se la modifica produrrebbe una seconda iscrizione attiva', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoIscrizione(db)
    // Una già attiva
    inserisciIscrizione(db, clienteId, tipoId, '2999-01-01', '2999-12-31', 'attiva')
    // Una scaduta da riportare in futuro → diventerebbe la seconda attiva
    const scaduta = inserisciIscrizione(db, clienteId, tipoId, '2000-01-01', '2000-12-31', 'scaduta')

    expect(() => updateIscrizioneDate(scaduta, '2998-01-01', '2998-12-31')).toThrow(
      'ISCRIZIONE_GIA_ATTIVA'
    )
  })
})

// ---------------------------------------------------------------------------
// WP1 — Modifica date abbonamento (N1/A3)
// ---------------------------------------------------------------------------

/** Inserisce un abbonamento con date e stato espliciti, ritorna l'id. */
function inserisciAbbonamento(
  db: Database.Database,
  clienteId: number,
  tipoAbbId: number,
  dataInizio: string,
  dataScadenza: string,
  stato: 'attivo' | 'scaduto' | 'invalidato'
): number {
  const info = db
    .prepare(
      `INSERT INTO abbonamenti_cliente
        (cliente_id, tipo_abbonamento_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, ?, ?, 40, 'da_incassare', ?)`
    )
    .run(clienteId, tipoAbbId, dataInizio, dataScadenza, stato)
  return info.lastInsertRowid as number
}

describe('updateAbbonamentoDate (WP1: N1/A3)', () => {
  it('ricalcola lo stato a "scaduto" se la nuova scadenza è nel passato', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoAbbonamento(db)
    const id = inserisciAbbonamento(db, clienteId, tipoId, '2999-01-01', '2999-12-31', 'attivo')

    const updated = updateAbbonamentoDate(id, '2000-01-01', '2000-12-31')

    expect(updated.stato).toBe('scaduto')
  })

  it('N1: NON riporta in vita un abbonamento invalidato modificandone le date', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoAbbonamento(db)
    const id = inserisciAbbonamento(db, clienteId, tipoId, '2000-01-01', '2000-12-31', 'invalidato')

    const updated = updateAbbonamentoDate(id, '2999-01-01', '2999-12-31')

    expect(updated.stato).toBe('invalidato')
    // Le date devono comunque essere state aggiornate (guardia contro UPDATE no-op)
    expect(updated.data_inizio).toBe('2999-01-01')
    expect(updated.data_scadenza).toBe('2999-12-31')
  })
})

// ---------------------------------------------------------------------------
// WP1 — Transizione automatica stati scaduti (A2, guardia di regressione)
// ---------------------------------------------------------------------------

describe('aggiornaStatoIscrizioni / aggiornaStatoAbbonamenti (WP1: A2)', () => {
  it('porta a "scaduta" un\'iscrizione attiva con scadenza passata', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoIscrizione(db)
    const id = inserisciIscrizione(db, clienteId, tipoId, '2000-01-01', '2000-12-31', 'attiva')

    aggiornaStatoIscrizioni()

    const row = db
      .prepare('SELECT stato FROM iscrizioni_cliente WHERE id = ?')
      .get(id) as { stato: string }
    expect(row.stato).toBe('scaduta')
  })

  it('NON tocca un\'iscrizione attiva con scadenza futura', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoIscrizione(db)
    const id = inserisciIscrizione(db, clienteId, tipoId, '2999-01-01', '2999-12-31', 'attiva')

    aggiornaStatoIscrizioni()

    const row = db
      .prepare('SELECT stato FROM iscrizioni_cliente WHERE id = ?')
      .get(id) as { stato: string }
    expect(row.stato).toBe('attiva')
  })

  it('porta a "scaduto" un abbonamento attivo con scadenza passata', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoAbbonamento(db)
    const id = inserisciAbbonamento(db, clienteId, tipoId, '2000-01-01', '2000-12-31', 'attivo')

    aggiornaStatoAbbonamenti()

    const row = db
      .prepare('SELECT stato FROM abbonamenti_cliente WHERE id = ?')
      .get(id) as { stato: string }
    expect(row.stato).toBe('scaduto')
  })
})
