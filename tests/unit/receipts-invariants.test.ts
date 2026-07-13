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
  getVociPagabili,
  setStatoPagamentoIscrizione,
  setStatoPagamentoAbbonamento,
  getUltimoNumeroRicevuta
} from '../../src/main/db/receipts-repository'
import { createCliente } from '../../src/main/db/clients-repository'
import type { CreaRicevutaInput } from '../../src/types/shared'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Inserisce un cliente di test e ritorna il suo id. */
function creaCliente(
  db: Database.Database,
  cf = 'RSSMRA85T10H501Z',
  opts: { tutore_id?: number | null; data_nascita?: string } = {}
): number {
  const info = db
    .prepare(
      `INSERT INTO clienti (nome, cognome, codice_fiscale, data_nascita, tutore_id)
       VALUES ('Mario', 'Rossi', ?, ?, ?)`
    )
    .run(cf, opts.data_nascita ?? null, opts.tutore_id ?? null)
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

/** Imposta numero iniziale ricevute e l'anno a cui è ancorato in app_settings. */
function setNumeroIniziale(db: Database.Database, numero: number, anno: number): void {
  db.prepare(`UPDATE app_settings SET value = ? WHERE key = 'receipt_start_number'`).run(
    String(numero)
  )
  db.prepare(`UPDATE app_settings SET value = ? WHERE key = 'receipt_start_number_year'`).run(
    String(anno)
  )
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

  it('rispetta numero_inizio configurato in app_settings se ancorato allo stesso anno', () => {
    const db = _testDb!
    // Numero iniziale = 100 ancorato all'anno 2025 (anno vuoto → caso adozione)
    setNumeroIniziale(db, 100, 2025)
    const clienteId = creaCliente(db)
    const r = creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-05-01' }))
    expect(r.numero).toBe(100)
  })

  it('il numero_inizio ancorato a un anno NON si applica a un anno diverso (riparte da 1)', () => {
    const db = _testDb!
    // Numero iniziale 100 ancorato al 2025, ma la ricevuta è emessa nel 2026
    setNumeroIniziale(db, 100, 2025)
    const clienteId = creaCliente(db)
    const r = creaRicevuta(buildInput(clienteId, { dataEmissione: '2026-03-01' }))
    expect(r.numero).toBe(1)
    expect(r.anno).toBe(2026)
  })

  it('cambiando il numero con uno maggiore dell\'ultimo emesso, la serie salta in avanti', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    // Emette ricevute 1, 2, 3 nel 2025
    creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-01-10' }))
    creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-02-10' }))
    const r3 = creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-03-10' }))
    expect(r3.numero).toBe(3)
    // L'utente imposta il numero iniziale a 8 per il 2025 → la prossima è la 8
    setNumeroIniziale(db, 8, 2025)
    const r4 = creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-04-10' }))
    expect(r4.numero).toBe(8)
    // E la successiva prosegue da 9
    const r5 = creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-05-10' }))
    expect(r5.numero).toBe(9)
  })

  it('un numero_inizio minore/uguale all\'ultimo emesso viene ignorato (continua da MAX+1)', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-01-10' }))
    creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-02-10' }))
    creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-03-10' }))
    // Numero iniziale 2 (≤ ultimo emesso 3): deve essere ignorato
    setNumeroIniziale(db, 2, 2025)
    const r4 = creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-04-10' }))
    expect(r4.numero).toBe(4)
  })

  it('getUltimoNumeroRicevuta ritorna l\'ultimo numero dell\'anno (0 se nessuno)', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    expect(getUltimoNumeroRicevuta(2025)).toBe(0)
    creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-01-10' }))
    creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-02-10' }))
    expect(getUltimoNumeroRicevuta(2025)).toBe(2)
    expect(getUltimoNumeroRicevuta(2026)).toBe(0)
  })

  it('getUltimoNumeroRicevuta include le ricevute annullate (numero resta nella serie)', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-01-10' }))
    const r2 = creaRicevuta(buildInput(clienteId, { dataEmissione: '2025-02-10' }))
    annullaRicevuta(r2.id)
    expect(getUltimoNumeroRicevuta(2025)).toBe(2)
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
// Disaccoppiamento ricevuta ↔ pagamento
// ---------------------------------------------------------------------------

describe('Disaccoppiamento ricevuta ↔ pagamento', () => {
  it('getVociPagabili include voci da_incassare senza ricevuta', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoIscId = creaTipoIscrizione(db)
    const tipoAbbId = creaTipoAbbonamento(db)

    assegnaIscrizione(db, clienteId, tipoIscId, 'da_incassare')
    assegnaAbbonamento(db, clienteId, tipoAbbId, 'da_incassare')

    const voci = getVociPagabili(clienteId)
    expect(voci.length).toBe(2)
  })

  it('getVociPagabili include anche voci già pagate se non hanno ricevuta emessa', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoIscId = creaTipoIscrizione(db)
    const tipoAbbId = creaTipoAbbonamento(db)

    // Pagate ma senza ricevuta: devono comparire
    assegnaIscrizione(db, clienteId, tipoIscId, 'pagato')
    assegnaAbbonamento(db, clienteId, tipoAbbId, 'pagato')

    const voci = getVociPagabili(clienteId)
    expect(voci.length).toBe(2)
  })

  it('creaRicevuta NON cambia stato_pagamento dell\'iscrizione (pagato rimane pagato)', () => {
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

    // lo stato_pagamento dell'iscrizione NON deve essere cambiato
    const isc = db
      .prepare('SELECT stato_pagamento FROM iscrizioni_cliente WHERE id = ?')
      .get(iscId) as { stato_pagamento: string }
    expect(isc.stato_pagamento).toBe('da_incassare')
  })

  it('creaRicevuta esclude la voce da getVociPagabili (è ora su ricevuta emessa)', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoIscId = creaTipoIscrizione(db)
    const iscId = assegnaIscrizione(db, clienteId, tipoIscId, 'da_incassare')

    expect(getVociPagabili(clienteId).length).toBe(1)

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

    expect(getVociPagabili(clienteId).length).toBe(0)
  })

  it('annullaRicevuta NON cambia stato_pagamento dell\'iscrizione', () => {
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

    annullaRicevuta(r.id)

    const isc = db
      .prepare('SELECT stato_pagamento FROM iscrizioni_cliente WHERE id = ?')
      .get(iscId) as { stato_pagamento: string }
    // l'annullamento NON deve ripristinare da_incassare: il pagamento è rimasto invariato
    expect(isc.stato_pagamento).toBe('da_incassare')
  })

  it('dopo annullaRicevuta la voce torna in getVociPagabili', () => {
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

    expect(getVociPagabili(clienteId).length).toBe(0)
    annullaRicevuta(r.id)
    expect(getVociPagabili(clienteId).length).toBe(1)
  })

  it('annullaRicevuta NON cambia stato_pagamento dell\'abbonamento', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoAbbId = creaTipoAbbonamento(db)
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

    annullaRicevuta(r.id)

    const abb = db
      .prepare('SELECT stato_pagamento FROM abbonamenti_cliente WHERE id = ?')
      .get(abbId) as { stato_pagamento: string }
    expect(abb.stato_pagamento).toBe('da_incassare')
  })

  it('getVociPagabili esclude voci invalidate (iscrizione invalidata)', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoIscId = creaTipoIscrizione(db)
    const iscId = assegnaIscrizione(db, clienteId, tipoIscId, 'da_incassare')

    db.prepare(`UPDATE iscrizioni_cliente SET stato = 'invalidata' WHERE id = ?`).run(iscId)

    expect(getVociPagabili(clienteId).length).toBe(0)
  })

  it('getVociPagabili esclude voci invalidate (abbonamento invalidato)', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoAbbId = creaTipoAbbonamento(db)
    const abbId = assegnaAbbonamento(db, clienteId, tipoAbbId, 'da_incassare')

    db.prepare(`UPDATE abbonamenti_cliente SET stato = 'invalidato' WHERE id = ?`).run(abbId)

    expect(getVociPagabili(clienteId).length).toBe(0)
  })

  it('setStatoPagamentoIscrizione aggiorna il campo stato_pagamento', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoIscId = creaTipoIscrizione(db)
    const iscId = assegnaIscrizione(db, clienteId, tipoIscId, 'da_incassare')

    setStatoPagamentoIscrizione(iscId, 'pagato')

    const isc = db
      .prepare('SELECT stato_pagamento FROM iscrizioni_cliente WHERE id = ?')
      .get(iscId) as { stato_pagamento: string }
    expect(isc.stato_pagamento).toBe('pagato')

    setStatoPagamentoIscrizione(iscId, 'da_incassare')
    const isc2 = db
      .prepare('SELECT stato_pagamento FROM iscrizioni_cliente WHERE id = ?')
      .get(iscId) as { stato_pagamento: string }
    expect(isc2.stato_pagamento).toBe('da_incassare')
  })

  it('setStatoPagamentoAbbonamento aggiorna il campo stato_pagamento', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoAbbId = creaTipoAbbonamento(db)
    const abbId = assegnaAbbonamento(db, clienteId, tipoAbbId, 'da_incassare')

    setStatoPagamentoAbbonamento(abbId, 'pagato')

    const abb = db
      .prepare('SELECT stato_pagamento FROM abbonamenti_cliente WHERE id = ?')
      .get(abbId) as { stato_pagamento: string }
    expect(abb.stato_pagamento).toBe('pagato')

    setStatoPagamentoAbbonamento(abbId, 'da_incassare')
    const abb2 = db
      .prepare('SELECT stato_pagamento FROM abbonamenti_cliente WHERE id = ?')
      .get(abbId) as { stato_pagamento: string }
    expect(abb2.stato_pagamento).toBe('da_incassare')
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

  it('A4: per un minore con tutore collegato (tutore_id), l\'intestatario è il tutore', () => {
    const db = _testDb!
    // Crea prima il tutore come cliente
    const tutoreId = db
      .prepare(
        `INSERT INTO clienti (nome, cognome, codice_fiscale) VALUES ('Giuseppe', 'Verdi', 'RSSMRA80T10H501Z')`
      )
      .run().lastInsertRowid as number
    // Crea il minore con tutore_id collegato
    const clienteId = creaCliente(db, 'BNCNNA10A01H501X', {
      data_nascita: '2015-01-01', // minorenne nel 2026
      tutore_id: tutoreId
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

  it('A5: per un MAGGIORENNE con tutore_id valorizzato, l\'intestatario è il cliente (non il tutore)', () => {
    const db = _testDb!
    // Crea il tutore come cliente
    const tutoreId = db
      .prepare(
        `INSERT INTO clienti (nome, cognome, codice_fiscale) VALUES ('Anna', 'Bianchi', 'BNCNNA10A01H501X')`
      )
      .run().lastInsertRowid as number
    // Crea il maggiorenne con tutore_id (non deve influire sull'intestatario)
    const clienteId = creaCliente(db, 'RSSMRA85T10H501Z', {
      data_nascita: '1985-01-01', // maggiorenne
      tutore_id: tutoreId
    })
    const r = creaRicevuta(buildInput(clienteId))

    expect(r.intestatario_cf).toBe('RSSMRA85T10H501Z')
    expect(r.intestatario_nome).toBe('Mario')
    expect(r.intestatario_cognome).toBe('Rossi')
    // Nessuna intestazione al tutore né CF assistito
    expect(r.tutore_cf).toBeNull()
    expect(r.assistito_cf).toBeNull()
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
// WP2 — Validazioni creaRicevuta (A9/A10)
// ---------------------------------------------------------------------------

describe('creaRicevuta — validazioni (WP2: A9/A10)', () => {
  it('A10: rifiuta l\'emissione per un cliente anonimizzato', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    db.prepare("UPDATE clienti SET stato = 'anonimizzato' WHERE id = ?").run(clienteId)

    expect(() => creaRicevuta(buildInput(clienteId))).toThrow('CLIENTE_ANONIMIZZATO')
  })

  it('A9: rifiuta una ricevuta senza righe', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    expect(() => creaRicevuta(buildInput(clienteId, { righe: [] }))).toThrow('RICEVUTA_SENZA_RIGHE')
  })

  it('A9: rifiuta una riga il cui riferimentoId non appartiene al cliente', () => {
    const db = _testDb!
    const tipoIscId = creaTipoIscrizione(db)
    const clienteA = creaCliente(db, 'RSSMRA85T10H501Z')
    const clienteB = creaCliente(db, 'VRDLCU90A41H501B')
    const iscB = assegnaIscrizione(db, clienteB, tipoIscId)

    const input = buildInput(clienteA, {
      righe: [
        { tipo: 'iscrizione', riferimentoId: iscB, descrizione: 'Iscrizione', prezzo: 30 }
      ]
    })
    expect(() => creaRicevuta(input)).toThrow('RIFERIMENTO_NON_VALIDO')
  })

  it('A9: rifiuta una riga abbonamento il cui riferimentoId non appartiene al cliente', () => {
    const db = _testDb!
    const tipoAbbId = creaTipoAbbonamento(db)
    const clienteA = creaCliente(db, 'RSSMRA85T10H501Z')
    const clienteB = creaCliente(db, 'VRDLCU90A41H501B')
    const abbB = assegnaAbbonamento(db, clienteB, tipoAbbId)

    const input = buildInput(clienteA, {
      righe: [
        { tipo: 'abbonamento', riferimentoId: abbB, descrizione: 'Abbonamento', prezzo: 40 }
      ]
    })
    expect(() => creaRicevuta(input)).toThrow('RIFERIMENTO_NON_VALIDO')
  })

  it('accetta una riga il cui riferimentoId appartiene al cliente', () => {
    const db = _testDb!
    const tipoIscId = creaTipoIscrizione(db)
    const clienteA = creaCliente(db, 'RSSMRA85T10H501Z')
    const iscA = assegnaIscrizione(db, clienteA, tipoIscId)

    const input = buildInput(clienteA, {
      righe: [
        { tipo: 'iscrizione', riferimentoId: iscA, descrizione: 'Iscrizione', prezzo: 30 }
      ]
    })
    const r = creaRicevuta(input)
    expect(r.righe.length).toBe(1)
  })

  it('rifiuta un clienteId inesistente con CLIENTE_NOT_FOUND', () => {
    expect(() => creaRicevuta(buildInput(99999))).toThrow('CLIENTE_NOT_FOUND')
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

    // Verifica: lo stato_pagamento dell'iscrizione NON è stato modificato dall'emissione
    const iscRow = db
      .prepare('SELECT stato_pagamento FROM iscrizioni_cliente WHERE id = ?')
      .get(iscId) as { stato_pagamento: string }
    expect(iscRow.stato_pagamento).toBe('da_incassare')

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

// ---------------------------------------------------------------------------
// B7 — ricevute con tutore come cliente collegato (FK)
// ---------------------------------------------------------------------------

describe('B7 — ricevute: tutore come cliente collegato', () => {
  it('ricevuta a minore con tutore collegato: intestatario = tutore, assistito_cf = CF minore', () => {
    const tutore = createCliente({
      nome: 'Anna',
      cognome: 'Bianchi',
      codice_fiscale: 'BNCNNA80A41H501Y',
      via: 'Via Po',
      civico: '2',
      citta: 'Roma',
      cap: '00100'
    })
    const minore = createCliente({
      nome: 'Sara',
      cognome: 'Bianchi',
      codice_fiscale: 'BNCSRA15A41H501W',
      data_nascita: '2015-01-01',
      tutore_id: tutore.id,
      via: 'Via Po',
      civico: '2',
      citta: 'Roma',
      cap: '00100'
    })
    const ric = creaRicevuta(
      buildInput(minore.id, {
        dataEmissione: '2026-01-10',
        righe: [{ tipo: 'libera', descrizione: 'Quota', prezzo: 50 }]
      })
    )
    expect(ric.intestatario_cf).toBe('BNCNNA80A41H501Y') // CF tutore
    expect(ric.assistito_cf).toBe('BNCSRA15A41H501W')    // CF minore
    expect(ric.intestatario_nome).toBe('Anna')
    expect(ric.intestatario_cognome).toBe('Bianchi')
  })

  it('ricevuta a minore SENZA tutore collegato: emissione bloccata con TUTORE_RICHIESTO', () => {
    const minore = createCliente({
      nome: 'Gino',
      cognome: 'Verdi',
      codice_fiscale: 'VRDGNI15A01H501B',
      data_nascita: '2015-01-01',
      via: 'Via X',
      civico: '1',
      citta: 'Roma',
      cap: '00100'
    })
    expect(() =>
      creaRicevuta(
        buildInput(minore.id, {
          dataEmissione: '2026-01-10',
          righe: [{ tipo: 'libera', descrizione: 'Quota', prezzo: 50 }]
        })
      )
    ).toThrow('TUTORE_RICHIESTO')
  })

  it('ricevuta a maggiorenne con tutore_id valorizzato: intestatario = cliente, assistito_cf null', () => {
    const tutoreAdulto = createCliente({
      nome: 'T',
      cognome: 'T',
      codice_fiscale: 'TTTAAA80A01H501U'
    })
    const adulto = createCliente({
      nome: 'Paolo',
      cognome: 'Neri',
      codice_fiscale: 'NREPLA80A01H501Z',
      data_nascita: '1980-01-01',
      tutore_id: tutoreAdulto.id,
      via: 'Via Y',
      civico: '3',
      citta: 'Roma',
      cap: '00100'
    })
    const ric = creaRicevuta(
      buildInput(adulto.id, {
        dataEmissione: '2026-01-10',
        righe: [{ tipo: 'libera', descrizione: 'Quota', prezzo: 50 }]
      })
    )
    expect(ric.intestatario_cf).toBe('NREPLA80A01H501Z')
    expect(ric.assistito_cf).toBeNull()
    expect(ric.tutore_cf).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// B12 — regressione filtro clienteId in listRicevute
// ---------------------------------------------------------------------------

describe('listRicevute — filtro clienteId (B12)', () => {
  it('ritorna solo le ricevute del cliente indicato', () => {
    const db = _testDb!
    const c1 = creaCliente(db, 'AAAAAA80A01H501A')
    const c2 = creaCliente(db, 'BBBBBB80A01H501B')
    creaRicevuta(buildInput(c1, { dataEmissione: '2026-03-01' }))
    creaRicevuta(buildInput(c1, { dataEmissione: '2026-04-01' }))
    creaRicevuta(buildInput(c2, { dataEmissione: '2026-03-15' }))

    const soloC1 = listRicevute({ clienteId: c1 })
    expect(soloC1.length).toBe(2)
    expect(soloC1.every((r) => r.cliente_id === c1)).toBe(true)

    const soloC2 = listRicevute({ clienteId: c2 })
    expect(soloC2.length).toBe(1)
    expect(soloC2[0].cliente_id).toBe(c2)
  })

  it('combina clienteId e anno', () => {
    const db = _testDb!
    const c1 = creaCliente(db, 'CCCCCC80A01H501C')
    creaRicevuta(buildInput(c1, { dataEmissione: '2025-12-01' }))
    creaRicevuta(buildInput(c1, { dataEmissione: '2026-01-01' }))

    const r2026 = listRicevute({ clienteId: c1, anno: 2026 })
    expect(r2026.length).toBe(1)
    expect(r2026[0].anno).toBe(2026)
  })
})
