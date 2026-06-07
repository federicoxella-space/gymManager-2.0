/**
 * Test di integrazione per le invarianti di dominio F3 relative a
 * ricevute e pagamenti (invarianti 5 e 6).
 *
 * Usa better-sqlite3 con DB in-memory, applica le migrazioni 001–004
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
  creaRicevuta,
  getRicevuta,
  listRicevute,
  annullaRicevuta,
  getVociPagabili
} from '../../src/main/db/receipts-repository'
import type { CreaRicevutaInput } from '../../src/types/shared'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Inserisce un cliente di test e ritorna il suo id. */
function creaCliente(
  db: Database.Database,
  cf = 'RSSMRA85T10H501Z',
  opts: { tutore_cf?: string; tutore_nome?: string; tutore_cognome?: string; data_nascita?: string } = {}
): number {
  const info = db
    .prepare(
      `INSERT INTO clienti (nome, cognome, codice_fiscale, data_nascita, tutore_nome, tutore_cognome, tutore_cf)
       VALUES ('Mario', 'Rossi', ?, ?, ?, ?, ?)`
    )
    .run(cf, opts.data_nascita ?? null, opts.tutore_nome ?? null, opts.tutore_cognome ?? null, opts.tutore_cf ?? null)
  return info.lastInsertRowid as number
}

/** Crea un TipoIscrizione di test e ritorna il suo id. */
function creaTipoIscrizione(db: Database.Database): number {
  const info = db
    .prepare(
      `INSERT INTO tipi_iscrizione (nome, durata_mesi, prezzo_default) VALUES ('Annuale', 12, 30)`
    )
    .run()
  return info.lastInsertRowid as number
}

/** Crea un TipoAbbonamento di test e ritorna il suo id. */
function creaTipoAbbonamento(db: Database.Database): number {
  const info = db
    .prepare(
      `INSERT INTO tipi_abbonamento (nome, durata_mesi, prezzo_default, colore) VALUES ('Sala pesi', 1, 40, '#3B82F6')`
    )
    .run()
  return info.lastInsertRowid as number
}

/** Assegna un'iscrizione direttamente via SQL e ritorna l'id. */
function assegnaIscrizione(
  db: Database.Database,
  clienteId: number,
  tipoIscId: number,
  statoPagamento: 'pagato' | 'da_incassare' = 'da_incassare'
): number {
  const info = db
    .prepare(
      `INSERT INTO iscrizioni_cliente
        (cliente_id, tipo_iscrizione_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, '2025-01-01', '2025-12-31', 30, ?, 'attiva')`
    )
    .run(clienteId, tipoIscId, statoPagamento)
  return info.lastInsertRowid as number
}

/** Assegna un abbonamento direttamente via SQL e ritorna l'id. */
function assegnaAbbonamento(
  db: Database.Database,
  clienteId: number,
  tipoAbbId: number,
  statoPagamento: 'pagato' | 'da_incassare' = 'da_incassare'
): number {
  const info = db
    .prepare(
      `INSERT INTO abbonamenti_cliente
        (cliente_id, tipo_abbonamento_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, '2025-01-01', '2025-01-31', 40, ?, 'attivo')`
    )
    .run(clienteId, tipoAbbId, statoPagamento)
  return info.lastInsertRowid as number
}

/** Input base per creaRicevuta. */
function buildInput(
  clienteId: number,
  overrides: Partial<CreaRicevutaInput> = {}
): CreaRicevutaInput {
  return {
    clienteId,
    dataEmissione: '2025-03-15',
    metodo_pagamento: 'contanti',
    stato_pagamento: 'pagato',
    righe: [
      {
        tipo: 'libera',
        descrizione: 'Servizio extra',
        prezzo: 10
      }
    ],
    ...overrides
  }
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
// Invariante 6 — Numerazione
// ---------------------------------------------------------------------------

describe('Invariante 6: numerazione progressiva per anno', () => {
  it('la prima ricevuta dell\'anno ha numero 1 (numero_inizio default 1)', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const r = creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-03-15' }))
    expect(r.numero).toBe(1)
    expect(r.anno).toBe(2025)
  })

  it('la seconda ricevuta dello stesso anno ha numero 2', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-01-10' }))
    const r2 = creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-06-01' }))
    expect(r2.numero).toBe(2)
  })

  it('la prima ricevuta dell\'anno successivo riparte da 1', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-12-31' }))
    creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-06-01' }))
    const r3 = creaRicevuta(buildInput(clienteId, { dataEmissione: '2026-01-01' }))
    expect(r3.numero).toBe(1)
    expect(r3.anno).toBe(2026)
  })

  it('rispetta numero_inizio configurato in app_settings', () => {
    const db = _testDb!
    // Imposta numero_inizio = 100
    db.prepare(`UPDATE app_settings SET value = '100' WHERE key = 'receipt_start_number'`).run()
    const clienteId = creaCliente(db)
    const r = creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-05-01' }))
    expect(r.numero).toBe(100)
  })

  it('getRicevuta (re-download) restituisce lo stesso numero', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const r = creaRicevuta(buildInput(clienteId))
    const fetched = getRicevuta(r.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.numero).toBe(r.numero)
  })

  it('il numero non cambia dopo l\'annullamento', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const r = creaRicevuta(buildInput(clienteId))
    const numeroOriginale = r.numero
    const annullata = annullaRicevuta(r.id)
    expect(annullata.numero).toBe(numeroOriginale)
  })
})

// ---------------------------------------------------------------------------
// Invariante 5 — Immutabilità / Annullamento
// ---------------------------------------------------------------------------

describe('Invariante 5: immutabilità e annullamento ricevute', () => {
  it('creaRicevuta produce una ricevuta in stato "emessa"', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const r = creaRicevuta(buildInput(clienteId))
    expect(r.stato).toBe('emessa')
  })

  it('annullaRicevuta porta la ricevuta in stato "annullata" con numero invariato', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const r = creaRicevuta(buildInput(clienteId))
    const annullata = annullaRicevuta(r.id)
    expect(annullata.stato).toBe('annullata')
    expect(annullata.numero).toBe(r.numero)
    expect(annullata.data_annullamento).not.toBeNull()
  })

  it('annullare una ricevuta già annullata lancia RICEVUTA_GIA_ANNULLATA', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const r = creaRicevuta(buildInput(clienteId))
    annullaRicevuta(r.id)
    expect(() => annullaRicevuta(r.id)).toThrow('RICEVUTA_GIA_ANNULLATA')
  })

  it('la ricevuta annullata è ancora presente nel DB (nessuna cancellazione)', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const r = creaRicevuta(buildInput(clienteId))
    annullaRicevuta(r.id)
    const fetched = getRicevuta(r.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.stato).toBe('annullata')
  })

  it('listRicevute restituisce la ricevuta annullata (il numero rimane nella serie)', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const r = creaRicevuta(buildInput(clienteId))
    annullaRicevuta(r.id)
    const lista = listRicevute({ anno: 2025 })
    expect(lista.find((x) => x.id === r.id)).toBeDefined()
  })

  it('nessuna riga viene eliminata dopo l\'annullamento', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const r = creaRicevuta(buildInput(clienteId))
    annullaRicevuta(r.id)
    const righe = db
      .prepare('SELECT * FROM righe_ricevuta WHERE ricevuta_id = ?')
      .all(r.id) as unknown[]
    expect(righe.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Pagamento voci
// ---------------------------------------------------------------------------

describe('Pagamento voci collegate', () => {
  it('creaRicevuta con stato_pagamento=pagato marca l\'iscrizione come pagata', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoIscId = creaTipoIscrizione(db)
    const iscId = assegnaIscrizione(db, clienteId, tipoIscId, 'da_incassare')

    creaRicevuta(
      buildInput(clienteId, {
        stato_pagamento: 'pagato',
        righe: [
          {
            tipo: 'iscrizione',
            riferimentoId: iscId,
            descrizione: 'Iscrizione annuale',
            dataInizio: '2025-01-01',
            dataFine: '2025-12-31',
            prezzo: 30
          }
        ]
      })
    )

    const isc = db
      .prepare('SELECT stato_pagamento FROM iscrizioni_cliente WHERE id = ?')
      .get(iscId) as { stato_pagamento: string }
    expect(isc.stato_pagamento).toBe('pagato')
  })

  it('creaRicevuta con stato_pagamento=da_incassare NON marca l\'iscrizione come pagata', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoIscId = creaTipoIscrizione(db)
    const iscId = assegnaIscrizione(db, clienteId, tipoIscId, 'da_incassare')

    creaRicevuta(
      buildInput(clienteId, {
        stato_pagamento: 'da_incassare',
        righe: [
          {
            tipo: 'iscrizione',
            riferimentoId: iscId,
            descrizione: 'Iscrizione annuale',
            dataInizio: '2025-01-01',
            dataFine: '2025-12-31',
            prezzo: 30
          }
        ]
      })
    )

    const isc = db
      .prepare('SELECT stato_pagamento FROM iscrizioni_cliente WHERE id = ?')
      .get(iscId) as { stato_pagamento: string }
    expect(isc.stato_pagamento).toBe('da_incassare')
  })

  it('dopo annullamento, l\'iscrizione torna a da_incassare', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoIscId = creaTipoIscrizione(db)
    const iscId = assegnaIscrizione(db, clienteId, tipoIscId, 'da_incassare')

    const r = creaRicevuta(
      buildInput(clienteId, {
        stato_pagamento: 'pagato',
        righe: [
          {
            tipo: 'iscrizione',
            riferimentoId: iscId,
            descrizione: 'Iscrizione annuale',
            dataInizio: '2025-01-01',
            dataFine: '2025-12-31',
            prezzo: 30
          }
        ]
      })
    )

    // Verifica che sia pagata
    const iscPagata = db
      .prepare('SELECT stato_pagamento FROM iscrizioni_cliente WHERE id = ?')
      .get(iscId) as { stato_pagamento: string }
    expect(iscPagata.stato_pagamento).toBe('pagato')

    // Annulla la ricevuta
    annullaRicevuta(r.id)

    // L'iscrizione deve tornare da_incassare
    const iscRipristinata = db
      .prepare('SELECT stato_pagamento FROM iscrizioni_cliente WHERE id = ?')
      .get(iscId) as { stato_pagamento: string }
    expect(iscRipristinata.stato_pagamento).toBe('da_incassare')
  })

  it('dopo annullamento, l\'abbonamento torna a da_incassare', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoIscId = creaTipoIscrizione(db)
    const tipoAbbId = creaTipoAbbonamento(db)
    assegnaIscrizione(db, clienteId, tipoIscId, 'pagato')
    const abbId = assegnaAbbonamento(db, clienteId, tipoAbbId, 'da_incassare')

    const r = creaRicevuta(
      buildInput(clienteId, {
        stato_pagamento: 'pagato',
        righe: [
          {
            tipo: 'abbonamento',
            riferimentoId: abbId,
            descrizione: 'Sala pesi',
            dataInizio: '2025-01-01',
            dataFine: '2025-01-31',
            prezzo: 40
          }
        ]
      })
    )

    // Verifica che sia pagato
    const abbPagato = db
      .prepare('SELECT stato_pagamento FROM abbonamenti_cliente WHERE id = ?')
      .get(abbId) as { stato_pagamento: string }
    expect(abbPagato.stato_pagamento).toBe('pagato')

    // Annulla la ricevuta
    annullaRicevuta(r.id)

    // L'abbonamento deve tornare da_incassare
    const abbRipristinato = db
      .prepare('SELECT stato_pagamento FROM abbonamenti_cliente WHERE id = ?')
      .get(abbId) as { stato_pagamento: string }
    expect(abbRipristinato.stato_pagamento).toBe('da_incassare')
  })

  it('getVociPagabili restituisce solo le voci da_incassare con stato attivo/attiva', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoIscId = creaTipoIscrizione(db)
    const tipoAbbId = creaTipoAbbonamento(db)

    // Iscrizione da incassare (attiva)
    assegnaIscrizione(db, clienteId, tipoIscId, 'da_incassare')
    // Abbonamento da incassare (attivo)
    assegnaAbbonamento(db, clienteId, tipoAbbId, 'da_incassare')

    const voci = getVociPagabili(clienteId)
    expect(voci.length).toBe(2)
    expect(voci.every((v) => v.stato_pagamento === 'da_incassare')).toBe(true)
  })

  it('getVociPagabili esclude le voci già pagate', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoIscId = creaTipoIscrizione(db)

    // Iscrizione già pagata
    assegnaIscrizione(db, clienteId, tipoIscId, 'pagato')

    const voci = getVociPagabili(clienteId)
    expect(voci.length).toBe(0)
  })

  it('getVociPagabili esclude le voci pagate dopo aver creato la ricevuta', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoIscId = creaTipoIscrizione(db)
    const iscId = assegnaIscrizione(db, clienteId, tipoIscId, 'da_incassare')

    // Prima della ricevuta: voce presente
    const voceAnticipata = getVociPagabili(clienteId)
    expect(voceAnticipata.length).toBe(1)

    // Crea la ricevuta pagata
    creaRicevuta(
      buildInput(clienteId, {
        stato_pagamento: 'pagato',
        righe: [
          {
            tipo: 'iscrizione',
            riferimentoId: iscId,
            descrizione: 'Iscrizione annuale',
            dataInizio: '2025-01-01',
            dataFine: '2025-12-31',
            prezzo: 30
          }
        ]
      })
    )

    // Dopo la ricevuta: voce non più presente
    const voceSuccessiva = getVociPagabili(clienteId)
    expect(voceSuccessiva.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Snapshot intestatario
// ---------------------------------------------------------------------------

describe('Snapshot intestatario', () => {
  it('snapshot intestatario copiato dal cliente al momento dell\'emissione', () => {
    const db = _testDb!
    const clienteId = creaCliente(db, 'RSSMRA85T10H501Z')
    const r = creaRicevuta(buildInput(clienteId))
    expect(r.intestatario_nome).toBe('Mario')
    expect(r.intestatario_cognome).toBe('Rossi')
    expect(r.intestatario_cf).toBe('RSSMRA85T10H501Z')
  })

  it('per un minore con tutore, l\'intestatario è il tutore', () => {
    const db = _testDb!
    const clienteId = creaCliente(db, 'BNCNNA10A01H501X', {
      data_nascita: '2015-01-01', // minorenne nel 2026
      tutore_cf: 'RSSMRA80T10H501Z',
      tutore_nome: 'Giuseppe',
      tutore_cognome: 'Verdi'
    })
    const r = creaRicevuta(buildInput(clienteId))
    expect(r.intestatario_cf).toBe('RSSMRA80T10H501Z')
    expect(r.intestatario_nome).toBe('Giuseppe')
    expect(r.intestatario_cognome).toBe('Verdi')
    // Il tutore è presente anche nei campi tutore_*
    expect(r.tutore_cf).toBe('RSSMRA80T10H501Z')
    // Il CF del minore è salvato in assistito_cf (A4)
    expect(r.assistito_cf).toBe('BNCNNA10A01H501X')
  })
})

// ---------------------------------------------------------------------------
// Filtri listRicevute
// ---------------------------------------------------------------------------

describe('listRicevute con filtri', () => {
  it('filtra per anno', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-01-01' }))
    creaRicevuta(buildInput(clienteId, { dataEmissione: '2026-01-01' }))

    const lista2025 = listRicevute({ anno: 2025 })
    const lista2026 = listRicevute({ anno: 2026 })

    expect(lista2025.every((r) => r.anno === 2025)).toBe(true)
    expect(lista2026.every((r) => r.anno === 2026)).toBe(true)
  })

  it('filtra per stato', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const r1 = creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-01-01' }))
    creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-02-01' }))
    annullaRicevuta(r1.id)

    const annullate = listRicevute({ stato: 'annullata' })
    const emesse = listRicevute({ stato: 'emessa' })

    expect(annullate.every((r) => r.stato === 'annullata')).toBe(true)
    expect(emesse.every((r) => r.stato === 'emessa')).toBe(true)
  })

  it('filtra per clienteId', () => {
    const db = _testDb!
    const c1 = creaCliente(db, 'RSSMRA85T10H501Z')
    const c2 = creaCliente(db, 'BNCNNA90A41H501X')
    creaRicevuta(buildInput(c1))
    creaRicevuta(buildInput(c2))

    const listaC1 = listRicevute({ clienteId: c1 })
    expect(listaC1.every((r) => r.cliente_id === c1)).toBe(true)
    expect(listaC1.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Flusso end-to-end equivalente: transazione → ricevuta salvata → re-download
// (criterio gate F3: "e2e transazione → ricevuta salvata → re-download stesso numero")
// ---------------------------------------------------------------------------

describe('Flusso E2E-equivalent: transazione → ricevuta salvata → re-download', () => {
  it('assegna iscrizione, crea ricevuta, ri-scarica la ricevuta: numero invariato', () => {
    const db = _testDb!
    const clienteId = creaCliente(db, 'TSTRNT80A01H501T')
    const tipoIscId = creaTipoIscrizione(db)
    const iscId = assegnaIscrizione(db, clienteId, tipoIscId, 'da_incassare')

    // Transazione: emissione ricevuta con la voce iscrizione
    const ricevuta = creaRicevuta(
      buildInput(clienteId, {
        stato_pagamento: 'pagato',
        dataEmissione: '2025-06-01',
        righe: [
          {
            tipo: 'iscrizione',
            riferimentoId: iscId,
            descrizione: 'Tesseramento annuale',
            dataInizio: '2025-06-01',
            dataFine: '2026-06-01',
            prezzo: 50
          }
        ]
      })
    )

    // Verifica: la voce è stata marcata come pagata
    const iscRow = db
      .prepare('SELECT stato_pagamento FROM iscrizioni_cliente WHERE id = ?')
      .get(iscId) as { stato_pagamento: string }
    expect(iscRow.stato_pagamento).toBe('pagato')

    // Re-download: ri-legge la stessa ricevuta
    const ridownload = getRicevuta(ricevuta.id)
    expect(ridownload).not.toBeNull()

    // Il numero non cambia
    expect(ridownload!.numero).toBe(ricevuta.numero)
    expect(ridownload!.anno).toBe(ricevuta.anno)

    // I dati sono identici (generazione deterministica)
    expect(ridownload!.totale).toBe(ricevuta.totale)
    expect(ridownload!.intestatario_nome).toBe(ricevuta.intestatario_nome)
    expect(ridownload!.stato).toBe('emessa')
    expect(ridownload!.righe).toHaveLength(ricevuta.righe.length)
  })

  it('il numero rimane invariato dopo più re-download', () => {
    const db = _testDb!
    const clienteId = creaCliente(db, 'TSTVNC90B02H501X')
    const r = creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-07-15' }))
    const numeroOriginal = r.numero

    // Simula 3 re-download
    for (let i = 0; i < 3; i++) {
      const reletta = getRicevuta(r.id)
      expect(reletta!.numero).toBe(numeroOriginal)
    }
  })
})
