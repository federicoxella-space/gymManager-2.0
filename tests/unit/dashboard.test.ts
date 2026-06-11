/**
 * Test di integrazione per il dashboard-repository (F4).
 *
 * Usa better-sqlite3 con DB in-memory, applica le migrazioni 001–004
 * tramite runMigrations, e sostituisce getDatabase() con il DB in-memory
 * tramite vi.mock — senza Electron runtime.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'

// ── Mock di electron-log ──────────────────────────────────────────────────────
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

// ── Mock di database.ts ───────────────────────────────────────────────────────
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
  getIndicatori,
  getClientiInScadenza,
  getDistribuzioneAbbonamenti,
  getIncassiPeriodo,
  getNuoviTesseramenti,
  getCompleanni
} from '../../src/main/db/dashboard-repository'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function creaCliente(
  db: Database.Database,
  cf: string,
  opts: { data_nascita?: string; nome?: string; cognome?: string } = {}
): number {
  const info = db
    .prepare(
      `INSERT INTO clienti (nome, cognome, codice_fiscale, data_nascita)
       VALUES (?, ?, ?, ?)`
    )
    .run(
      opts.nome ?? 'Mario',
      opts.cognome ?? 'Rossi',
      cf,
      opts.data_nascita ?? null
    )
  return info.lastInsertRowid as number
}

function creaTipoIscrizione(db: Database.Database, nome = 'Annuale'): number {
  const info = db
    .prepare(
      `INSERT INTO tipi_iscrizione (nome, durata_mesi, prezzo_default) VALUES (?, 12, 30)`
    )
    .run(nome)
  return info.lastInsertRowid as number
}

function creaTipoAbbonamento(
  db: Database.Database,
  nome = 'Sala pesi',
  colore = '#3B82F6'
): number {
  const info = db
    .prepare(
      `INSERT INTO tipi_abbonamento (nome, durata_mesi, prezzo_default, colore) VALUES (?, 1, 40, ?)`
    )
    .run(nome, colore)
  return info.lastInsertRowid as number
}

function assegnaIscrizione(
  db: Database.Database,
  clienteId: number,
  tipoId: number,
  opts: {
    stato?: 'attiva' | 'scaduta' | 'invalidata'
    statoPagamento?: 'pagato' | 'da_incassare'
    dataInizio?: string
    dataScadenza?: string
    prezzo?: number
  } = {}
): number {
  const info = db
    .prepare(
      `INSERT INTO iscrizioni_cliente
         (cliente_id, tipo_iscrizione_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      clienteId,
      tipoId,
      opts.dataInizio ?? '2026-01-01',
      opts.dataScadenza ?? '2026-12-31',
      opts.prezzo ?? 30,
      opts.statoPagamento ?? 'da_incassare',
      opts.stato ?? 'attiva'
    )
  return info.lastInsertRowid as number
}

function assegnaAbbonamento(
  db: Database.Database,
  clienteId: number,
  tipoAbbId: number,
  opts: {
    stato?: 'attivo' | 'scaduto' | 'invalidato'
    statoPagamento?: 'pagato' | 'da_incassare'
    dataInizio?: string
    dataScadenza?: string
    prezzo?: number
  } = {}
): number {
  const info = db
    .prepare(
      `INSERT INTO abbonamenti_cliente
         (cliente_id, tipo_abbonamento_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      clienteId,
      tipoAbbId,
      opts.dataInizio ?? '2026-01-01',
      opts.dataScadenza ?? '2026-01-31',
      opts.prezzo ?? 40,
      opts.statoPagamento ?? 'da_incassare',
      opts.stato ?? 'attivo'
    )
  return info.lastInsertRowid as number
}

function creaCertificato(
  db: Database.Database,
  clienteId: number,
  dataScadenza: string,
  tipo = 'Non agonistico'
): void {
  db.prepare(
    `INSERT INTO certificati_medici (cliente_id, tipo, data_scadenza) VALUES (?, ?, ?)`
  ).run(clienteId, tipo, dataScadenza)
}

function creaRicevuta(
  db: Database.Database,
  clienteId: number,
  opts: {
    dataEmissione?: string
    totale?: number
    stato?: 'emessa' | 'annullata'
    statoPagamento?: 'pagato' | 'da_incassare'
  } = {}
): number {
  // numero progressivo nell'anno
  const anno = parseInt((opts.dataEmissione ?? '2026-01-01').slice(0, 4))
  const { maxN } = db
    .prepare(`SELECT COALESCE(MAX(numero), 0) AS maxN FROM ricevute WHERE anno = ?`)
    .get(anno) as { maxN: number }

  const info = db
    .prepare(
      `INSERT INTO ricevute
         (numero, anno, data_emissione, cliente_id,
          intestatario_nome, intestatario_cognome, intestatario_cf,
          totale, metodo_pagamento, stato_pagamento, stato)
       VALUES (?, ?, ?, ?, 'Mario', 'Rossi', 'RSSMRA85T10H501Z', ?, 'contanti', ?, ?)`
    )
    .run(
      maxN + 1,
      anno,
      opts.dataEmissione ?? '2026-01-01',
      clienteId,
      opts.totale ?? 100,
      opts.statoPagamento ?? 'pagato',
      opts.stato ?? 'emessa'
    )
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
// getIndicatori
// ---------------------------------------------------------------------------

describe('getIndicatori: soci_attivi e da_rinnovare', () => {
  it('conta solo iscrizioni con stato=attiva come soci_attivi', () => {
    const db = _testDb!
    const tipoId = creaTipoIscrizione(db)

    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    const c2 = creaCliente(db, 'AAABBB80A02H501Z')
    const c3 = creaCliente(db, 'AAABBB80A03H501Z')

    assegnaIscrizione(db, c1, tipoId, { stato: 'attiva' })
    assegnaIscrizione(db, c2, tipoId, { stato: 'attiva' })
    assegnaIscrizione(db, c3, tipoId, { stato: 'scaduta' })

    const result = getIndicatori('2026-06-05', 30, 30, 30)
    expect(result.soci_attivi).toBe(2)
  })

  it('conta solo iscrizioni con stato=scaduta (senza attive) come da_rinnovare', () => {
    const db = _testDb!
    const tipoId = creaTipoIscrizione(db)

    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    const c2 = creaCliente(db, 'AAABBB80A02H501Z')

    assegnaIscrizione(db, c1, tipoId, { stato: 'scaduta' })
    assegnaIscrizione(db, c2, tipoId, { stato: 'attiva' })

    const result = getIndicatori('2026-06-05', 30, 30, 30)
    expect(result.da_rinnovare).toBe(1)
  })

  it('da_rinnovare non conta clienti con iscrizione attiva (anche se hanno anche una scaduta)', () => {
    const db = _testDb!
    const tipoId = creaTipoIscrizione(db)

    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    // due iscrizioni: una scaduta e una attiva (normale storico dopo rinnovo)
    assegnaIscrizione(db, c1, tipoId, { stato: 'scaduta', dataInizio: '2025-01-01', dataScadenza: '2025-12-31' })
    assegnaIscrizione(db, c1, tipoId, { stato: 'attiva', dataInizio: '2026-01-01', dataScadenza: '2026-12-31' })

    const result = getIndicatori('2026-06-05', 30, 30, 30)
    expect(result.da_rinnovare).toBe(0)
    expect(result.soci_attivi).toBe(1)
  })

  it('calcola correttamente certificati_in_scadenza con la finestra di preavviso', () => {
    const db = _testDb!
    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    const c2 = creaCliente(db, 'AAABBB80A02H501Z')

    // c1: scade tra 10 giorni — entro finestra 30gg
    creaCertificato(db, c1, '2026-06-15')
    // c2: scade tra 60 giorni — oltre finestra 30gg
    creaCertificato(db, c2, '2026-08-04')

    const result = getIndicatori('2026-06-05', 30, 30, 30)
    expect(result.certificati_in_scadenza).toBe(1)
  })

  it('calcola correttamente certificati_scaduti', () => {
    const db = _testDb!
    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    const c2 = creaCliente(db, 'AAABBB80A02H501Z')

    creaCertificato(db, c1, '2026-05-01') // scaduto
    creaCertificato(db, c2, '2026-06-10') // non ancora scaduto

    const result = getIndicatori('2026-06-05', 30, 30, 30)
    expect(result.certificati_scaduti).toBe(1)
  })

  it('incassi_da_incassare somma iscrizioni e abbonamenti attivi non pagati', () => {
    const db = _testDb!
    const tipoIscId = creaTipoIscrizione(db)
    const tipoAbbId = creaTipoAbbonamento(db)

    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    assegnaIscrizione(db, c1, tipoIscId, { stato: 'attiva', statoPagamento: 'da_incassare', prezzo: 50 })
    assegnaAbbonamento(db, c1, tipoAbbId, { stato: 'attivo', statoPagamento: 'da_incassare', prezzo: 40 })

    const result = getIndicatori('2026-06-05', 30, 30, 30)
    expect(result.incassi_da_incassare).toBe(90)
  })

  it('incassi_pagati somma le ricevute emesse e pagate', () => {
    const db = _testDb!
    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    creaRicevuta(db, c1, { totale: 100, stato: 'emessa', statoPagamento: 'pagato' })
    creaRicevuta(db, c1, { totale: 50, stato: 'emessa', statoPagamento: 'pagato' })
    // annullata non conta
    creaRicevuta(db, c1, { totale: 200, stato: 'annullata', statoPagamento: 'pagato', dataEmissione: '2026-02-01' })

    const result = getIndicatori('2026-06-05', 30, 30, 30)
    expect(result.incassi_pagati).toBe(150)
  })
})

// ---------------------------------------------------------------------------
// getClientiInScadenza
// ---------------------------------------------------------------------------

describe('getClientiInScadenza', () => {
  it('include certificati in scadenza entro il range', () => {
    const db = _testDb!
    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    creaCertificato(db, c1, '2026-06-10') // 5 giorni dopo 2026-06-05

    const lista = getClientiInScadenza('2026-06-05', 30, 30, 30)
    const trovato = lista.find((r) => r.tipo === 'certificato' && r.cliente_id === c1)
    expect(trovato).toBeDefined()
    expect(trovato!.giorni_alla_scadenza).toBe(5)
  })

  it('include iscrizioni in scadenza entro il range', () => {
    const db = _testDb!
    const tipoId = creaTipoIscrizione(db)
    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    assegnaIscrizione(db, c1, tipoId, { stato: 'attiva', dataScadenza: '2026-06-20' })

    const lista = getClientiInScadenza('2026-06-05', 30, 30, 30)
    const trovato = lista.find((r) => r.tipo === 'iscrizione' && r.cliente_id === c1)
    expect(trovato).toBeDefined()
    expect(trovato!.giorni_alla_scadenza).toBe(15)
  })

  it('include abbonamenti in scadenza entro il range', () => {
    const db = _testDb!
    const tipoIscId = creaTipoIscrizione(db)
    const tipoAbbId = creaTipoAbbonamento(db)
    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    assegnaIscrizione(db, c1, tipoIscId, { stato: 'attiva' })
    assegnaAbbonamento(db, c1, tipoAbbId, { stato: 'attivo', dataScadenza: '2026-06-12' })

    const lista = getClientiInScadenza('2026-06-05', 30, 30, 30)
    const trovato = lista.find((r) => r.tipo === 'abbonamento' && r.cliente_id === c1)
    expect(trovato).toBeDefined()
  })

  it('esclude elementi oltre il range di preavviso', () => {
    const db = _testDb!
    const tipoId = creaTipoIscrizione(db)
    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    // scade tra 60 giorni, preavviso 30
    assegnaIscrizione(db, c1, tipoId, { stato: 'attiva', dataScadenza: '2026-08-04' })

    const lista = getClientiInScadenza('2026-06-05', 30, 30, 30)
    const trovato = lista.find((r) => r.tipo === 'iscrizione' && r.cliente_id === c1)
    expect(trovato).toBeUndefined()
  })

  it('include certificati scaduti (giorni_alla_scadenza < 0) nel risultato', () => {
    const db = _testDb!
    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    creaCertificato(db, c1, '2026-05-01') // scaduto 35 giorni fa, entro preavviso cert

    // Con preavviso cert = 60, lo include (julianday(05-01) - julianday(06-05) = -35, BETWEEN... <= 60)
    const lista = getClientiInScadenza('2026-06-05', 60, 30, 30)
    const trovato = lista.find((r) => r.tipo === 'certificato' && r.cliente_id === c1)
    expect(trovato).toBeDefined()
    expect(trovato!.giorni_alla_scadenza).toBeLessThan(0)
  })
})

// ---------------------------------------------------------------------------
// getDistribuzioneAbbonamenti
// ---------------------------------------------------------------------------

describe('getDistribuzioneAbbonamenti', () => {
  it('raggruppa per tipo con conteggio corretto', () => {
    const db = _testDb!
    const tipoIscId = creaTipoIscrizione(db)
    const tipoYogaId = creaTipoAbbonamento(db, 'Yoga', '#FF0000')
    const tipoPesiId = creaTipoAbbonamento(db, 'Sala pesi', '#00FF00')

    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    const c2 = creaCliente(db, 'AAABBB80A02H501Z')
    const c3 = creaCliente(db, 'AAABBB80A03H501Z')

    assegnaIscrizione(db, c1, tipoIscId)
    assegnaIscrizione(db, c2, tipoIscId)
    assegnaIscrizione(db, c3, tipoIscId)

    assegnaAbbonamento(db, c1, tipoYogaId, { stato: 'attivo' })
    assegnaAbbonamento(db, c2, tipoYogaId, { stato: 'attivo' })
    assegnaAbbonamento(db, c3, tipoPesiId, { stato: 'attivo' })

    const dist = getDistribuzioneAbbonamenti(true)
    const yoga = dist.find((r) => r.tipo_abbonamento_id === tipoYogaId)
    const pesi = dist.find((r) => r.tipo_abbonamento_id === tipoPesiId)

    expect(yoga).toBeDefined()
    expect(yoga!.totale).toBe(2)
    expect(pesi).toBeDefined()
    expect(pesi!.totale).toBe(1)
  })

  it('soloAttivi=true esclude abbonamenti scaduti', () => {
    const db = _testDb!
    const tipoIscId = creaTipoIscrizione(db)
    const tipoAbbId = creaTipoAbbonamento(db)

    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    assegnaIscrizione(db, c1, tipoIscId)
    assegnaAbbonamento(db, c1, tipoAbbId, { stato: 'scaduto' })

    const dist = getDistribuzioneAbbonamenti(true)
    const tipo = dist.find((r) => r.tipo_abbonamento_id === tipoAbbId)
    expect(tipo).toBeUndefined()
  })

  it('soloAttivi=false include tutti gli abbonamenti', () => {
    const db = _testDb!
    const tipoIscId = creaTipoIscrizione(db)
    const tipoAbbId = creaTipoAbbonamento(db)

    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    assegnaIscrizione(db, c1, tipoIscId)
    assegnaAbbonamento(db, c1, tipoAbbId, { stato: 'scaduto' })

    const dist = getDistribuzioneAbbonamenti(false)
    const tipo = dist.find((r) => r.tipo_abbonamento_id === tipoAbbId)
    expect(tipo).toBeDefined()
    expect(tipo!.totale).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// getIncassiPeriodo
// ---------------------------------------------------------------------------

describe('getIncassiPeriodo', () => {
  it('somma correttamente i pagati nel periodo', () => {
    const db = _testDb!
    const c1 = creaCliente(db, 'AAABBB80A01H501Z')

    creaRicevuta(db, c1, { dataEmissione: '2026-03-01', totale: 100, statoPagamento: 'pagato' })
    creaRicevuta(db, c1, { dataEmissione: '2026-03-15', totale: 50, statoPagamento: 'pagato' })
    // Fuori periodo
    creaRicevuta(db, c1, { dataEmissione: '2026-04-10', totale: 200, statoPagamento: 'pagato' })

    const result = getIncassiPeriodo({ dal: '2026-03-01', al: '2026-03-31' })
    expect(result.totale_pagato).toBe(150)
  })

  it('conta le ricevute emesse nel periodo', () => {
    const db = _testDb!
    const c1 = creaCliente(db, 'AAABBB80A01H501Z')

    creaRicevuta(db, c1, { dataEmissione: '2026-03-01', stato: 'emessa' })
    creaRicevuta(db, c1, { dataEmissione: '2026-03-10', stato: 'emessa' })
    creaRicevuta(db, c1, { dataEmissione: '2026-03-20', stato: 'annullata' })
    // Fuori periodo
    creaRicevuta(db, c1, { dataEmissione: '2026-04-01', stato: 'emessa' })

    const result = getIncassiPeriodo({ dal: '2026-03-01', al: '2026-03-31' })
    expect(result.ricevute_emesse).toBe(2)
  })

  it('restituisce zeri per un periodo senza ricevute', () => {
    const result = getIncassiPeriodo({ dal: '2020-01-01', al: '2020-12-31' })
    expect(result.totale_pagato).toBe(0)
    expect(result.totale_da_incassare).toBe(0)
    expect(result.ricevute_emesse).toBe(0)
    expect(result.totale_ricevute).toBe(0)
  })

  it('somma correttamente le ricevute da incassare nel periodo', () => {
    const db = _testDb!
    const c1 = creaCliente(db, 'CCCDDD85B02H501Z')

    creaRicevuta(db, c1, { dataEmissione: '2026-03-05', totale: 80, statoPagamento: 'da_incassare' })
    creaRicevuta(db, c1, { dataEmissione: '2026-03-12', totale: 40, statoPagamento: 'da_incassare' })

    const result = getIncassiPeriodo({ dal: '2026-03-01', al: '2026-03-31' })
    expect(result.totale_da_incassare).toBe(120)
  })

  it('le ricevute annullate NON contribuiscono al totale da incassare (DC-B)', () => {
    const db = _testDb!
    const c1 = creaCliente(db, 'EEEFFF90C03H501Z')

    creaRicevuta(db, c1, {
      dataEmissione: '2026-03-07',
      totale: 60,
      statoPagamento: 'da_incassare',
      stato: 'annullata'
    })
    // Solo questa deve contare
    creaRicevuta(db, c1, { dataEmissione: '2026-03-14', totale: 30, statoPagamento: 'da_incassare' })

    const result = getIncassiPeriodo({ dal: '2026-03-01', al: '2026-03-31' })
    expect(result.totale_da_incassare).toBe(30)  // solo la non annullata
    expect(result.ricevute_emesse).toBe(1)        // l'annullata non conta
  })
})

// ---------------------------------------------------------------------------
// getNuoviTesseramenti
// ---------------------------------------------------------------------------

describe('getNuoviTesseramenti', () => {
  it('conta iscrizioni con data_inizio nel periodo', () => {
    const db = _testDb!
    const tipoId = creaTipoIscrizione(db)

    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    const c2 = creaCliente(db, 'AAABBB80A02H501Z')
    const c3 = creaCliente(db, 'AAABBB80A03H501Z')

    assegnaIscrizione(db, c1, tipoId, { dataInizio: '2026-03-05' })
    assegnaIscrizione(db, c2, tipoId, { dataInizio: '2026-03-20' })
    // Fuori periodo
    assegnaIscrizione(db, c3, tipoId, { dataInizio: '2026-04-01' })

    const result = getNuoviTesseramenti({ dal: '2026-03-01', al: '2026-03-31' })
    expect(result.totale).toBe(2)
  })

  it('restituisce 0 per un periodo senza tesseramenti', () => {
    const result = getNuoviTesseramenti({ dal: '2020-01-01', al: '2020-12-31' })
    expect(result.totale).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// getCompleanni
// ---------------------------------------------------------------------------

describe('getCompleanni', () => {
  it('restituisce clienti con compleanno nel range indicato', () => {
    const db = _testDb!
    // Compleanno il 10 giugno
    const c1 = creaCliente(db, 'AAABBB80A01H501Z', { data_nascita: '1990-06-10' })
    // Compleanno il 20 giugno — fuori range
    creaCliente(db, 'AAABBB80A02H501Z', { data_nascita: '1990-06-20' })

    const lista = getCompleanni('2026-06-05', '2026-06-12')
    const trovato = lista.find((r) => r.cliente_id === c1)
    expect(trovato).toBeDefined()
    expect(trovato!.giorno_mese).toBe('10/06')
    expect(lista.length).toBe(1)
  })

  it('gestisce il caso a cavallo di anno (fine dicembre - inizio gennaio)', () => {
    const db = _testDb!
    // Compleanno il 30 dicembre
    const c1 = creaCliente(db, 'AAABBB80A01H501Z', { data_nascita: '1990-12-30' })
    // Compleanno il 2 gennaio
    const c2 = creaCliente(db, 'AAABBB80A02H501Z', { data_nascita: '1990-01-02' })
    // Compleanno il 15 giugno — non incluso
    creaCliente(db, 'AAABBB80A03H501Z', { data_nascita: '1990-06-15' })

    const lista = getCompleanni('2026-12-28', '2027-01-03')
    const ids = lista.map((r) => r.cliente_id)
    expect(ids).toContain(c1)
    expect(ids).toContain(c2)
    expect(ids).not.toContain(
      // Il cliente con compleanno 15/06 non deve apparire
      lista.find((r) => r.giorno_mese === '15/06')?.cliente_id
    )
  })

  it('formatta giorno_mese come gg/mm', () => {
    const db = _testDb!
    creaCliente(db, 'AAABBB80A01H501Z', { data_nascita: '1985-06-07' })

    const lista = getCompleanni('2026-06-05', '2026-06-10')
    expect(lista[0].giorno_mese).toBe('07/06')
  })

  it('esclude clienti senza data_nascita', () => {
    const db = _testDb!
    // Nessuna data_nascita
    creaCliente(db, 'AAABBB80A01H501Z')

    const lista = getCompleanni('2026-06-01', '2026-06-30')
    expect(lista.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// getIndicatori — in scadenza iscrizioni/abbonamenti (WP2: A13)
// ---------------------------------------------------------------------------

describe('getIndicatori — in scadenza iscrizioni/abbonamenti (WP2: A13)', () => {
  it('conta iscrizioni e abbonamenti in scadenza entro la finestra di preavviso', () => {
    const db = _testDb!
    const tipoIsc = creaTipoIscrizione(db)
    const tipoAbb = creaTipoAbbonamento(db)

    const clienteId = creaCliente(db, 'XLLFRC91A06E730O')

    // Iscrizione che scade tra 5 giorni (entro finestra di 30gg)
    db.prepare(
      `INSERT INTO iscrizioni_cliente (cliente_id, tipo_iscrizione_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, date('now','-30 days'), date('now','+5 days'), 30, 'da_incassare', 'attiva')`
    ).run(clienteId, tipoIsc)

    // Abbonamento che scade tra 5 giorni (entro finestra di 30gg)
    db.prepare(
      `INSERT INTO abbonamenti_cliente (cliente_id, tipo_abbonamento_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, date('now','-30 days'), date('now','+5 days'), 40, 'da_incassare', 'attivo')`
    ).run(clienteId, tipoAbb)

    const oggi = new Date().toISOString().slice(0, 10)
    const ind = getIndicatori(oggi, 30, 30, 30)
    expect(ind.iscrizioni_in_scadenza).toBe(1)
    expect(ind.abbonamenti_in_scadenza).toBe(1)
  })
})
