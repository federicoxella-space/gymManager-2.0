/**
 * Test unit per il sistema di migrazioni (migrations.ts + 001_initial.ts).
 *
 * Questi test usano better-sqlite3 direttamente su DB in-memory o file
 * temporanei, senza dipendenze da Electron.
 * `electron-log` è mockato per silenziare l'output.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { join } from 'path'
import { tmpdir } from 'os'
import { unlinkSync, existsSync } from 'fs'

// Mocking electron-log per silenziare output nei test
vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

import { runMigrations, rollbackMigration } from '../../src/main/db/migrations'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Restituisce il path unico per un file DB temporaneo. */
function tempDbPath(): string {
  return join(tmpdir(), `gymmanager-mig-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

/** Ritorna tutti i nomi delle tabelle utente presenti nel DB. */
function getTables(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[]
  return rows.map((r) => r.name)
}

/** Ritorna le versioni delle migrazioni già applicate. */
function getAppliedVersions(db: Database.Database): number[] {
  const rows = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all() as { version: number }[]
  return rows.map((r) => r.version)
}

/** Ritorna tutte le righe di app_settings come oggetto key→value. */
function getSettings(db: Database.Database): Record<string, string> {
  const rows = db
    .prepare('SELECT key, value FROM app_settings')
    .all() as { key: string; value: string }[]
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.key] = row.value
  }
  return result
}

// ---------------------------------------------------------------------------
// Suite principale
// ---------------------------------------------------------------------------

describe('runMigrations', () => {
  let db: Database.Database

  beforeEach(() => {
    // DB in-memory: fresco per ogni test, nessun file su disco
    db = new Database(':memory:')
  })

  afterEach(() => {
    if (db.open) db.close()
  })

  // -------------------------------------------------------------------------
  // 1. Applicazione su DB vuoto
  // -------------------------------------------------------------------------

  it('crea la tabella schema_migrations se non esiste', () => {
    runMigrations(db)
    expect(getTables(db)).toContain('schema_migrations')
  })

  it('applica migrazione 001 e crea la tabella app_settings', () => {
    runMigrations(db)
    expect(getTables(db)).toContain('app_settings')
  })

  it('inserisce i valori di default in app_settings', () => {
    runMigrations(db)
    const settings = getSettings(db)

    expect(settings).toHaveProperty('theme', 'system')
    expect(settings).toHaveProperty('language', 'it')
    expect(settings).toHaveProperty('primary_color', '59,130,246')
    expect(settings).toHaveProperty('receipt_start_number', '1')
    expect(settings).toHaveProperty('expiry_warning_days_certificates', '30')
    expect(settings).toHaveProperty('expiry_warning_days_memberships', '30')
    expect(settings).toHaveProperty('expiry_warning_days_subscriptions', '30')
    expect(settings).toHaveProperty('backup_on_close', 'true')
    expect(settings).toHaveProperty(
      'dashboard_widgets',
      '["expiring_certs","expiring_memberships","active_members","revenue"]'
    )
  })

  it('registra la versione 1 nella tabella schema_migrations', () => {
    runMigrations(db)
    expect(getAppliedVersions(db)).toContain(1)
  })

  // -------------------------------------------------------------------------
  // 2. Idempotenza
  // -------------------------------------------------------------------------

  it('eseguendo runMigrations due volte non lancia errori', () => {
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
  })

  it('eseguendo runMigrations due volte non duplica le righe in schema_migrations', () => {
    runMigrations(db)
    runMigrations(db)
    expect(getAppliedVersions(db)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('eseguendo runMigrations due volte non duplica le righe in app_settings', () => {
    runMigrations(db)
    runMigrations(db)
    const rows = db.prepare('SELECT key FROM app_settings').all() as { key: string }[]
    const keys = rows.map((r) => r.key)
    // Nessuna chiave duplicata
    const uniqueKeys = [...new Set(keys)]
    expect(keys.length).toBe(uniqueKeys.length)
  })
})

// ---------------------------------------------------------------------------
// Suite: rollbackMigration
// ---------------------------------------------------------------------------

describe('rollbackMigration', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db) // Parte sempre con migrazione applicata
  })

  afterEach(() => {
    if (db.open) db.close()
  })

  it('rimuove la tabella app_settings dopo il rollback di v1', () => {
    rollbackMigration(db, 1)
    expect(getTables(db)).not.toContain('app_settings')
  })

  it('rimuove la voce dalla tabella schema_migrations dopo rollback', () => {
    rollbackMigration(db, 1)
    expect(getAppliedVersions(db)).not.toContain(1)
  })

  it('lancia errore se la versione non esiste nel registro delle migrazioni', () => {
    expect(() => rollbackMigration(db, 999)).toThrow(/non trovata/)
  })

  it('lancia errore se la migrazione non risulta applicata', () => {
    rollbackMigration(db, 1) // Primo rollback OK
    // Secondo rollback: v1 non è più applicata
    expect(() => rollbackMigration(db, 1)).toThrow(/non risulta applicata/)
  })
})

// ---------------------------------------------------------------------------
// Suite: ciclo completo up → down → up con dati di esempio
// ---------------------------------------------------------------------------

describe('migrazione con dati di esempio (up → down → up)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    if (db.open) db.close()
  })

  it('applica, popola, rollback, riapplica: la tabella esiste di nuovo', () => {
    // 1. Applica
    runMigrations(db)
    expect(getTables(db)).toContain('app_settings')

    // 2. Inserisci dati aggiuntivi di esempio
    db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('custom_key', 'custom_val')").run()
    expect(getSettings(db)).toHaveProperty('custom_key', 'custom_val')

    // 3. Rollback — i dati vengono persi (expected: DOWN fa DROP TABLE)
    rollbackMigration(db, 1)
    expect(getTables(db)).not.toContain('app_settings')

    // 4. Riapplica — la tabella viene ricreata con i default
    runMigrations(db)
    expect(getTables(db)).toContain('app_settings')
    const settings = getSettings(db)
    expect(settings).toHaveProperty('theme', 'system')
    // Il dato custom inserito prima non esiste più (aspettato dopo DROP + recreate)
    expect(settings).not.toHaveProperty('custom_key')
  })
})

// ---------------------------------------------------------------------------
// Suite: test con file temporaneo su disco (round-trip persist)
// ---------------------------------------------------------------------------

describe('migrazioni su file temporaneo (persistenza)', () => {
  let dbPath: string
  let db: Database.Database

  beforeEach(() => {
    dbPath = tempDbPath()
    db = new Database(dbPath)
  })

  afterEach(() => {
    if (db.open) db.close()
    if (existsSync(dbPath)) unlinkSync(dbPath)
    const wal = dbPath + '-wal'
    const shm = dbPath + '-shm'
    if (existsSync(wal)) unlinkSync(wal)
    if (existsSync(shm)) unlinkSync(shm)
  })

  it('le migrazioni sopravvivono a chiusura e riapertura del file', () => {
    runMigrations(db)
    db.close()

    // Riapri il file
    db = new Database(dbPath)
    // Non eseguire runMigrations: le tabelle devono già esserci
    expect(getTables(db)).toContain('app_settings')
    expect(getTables(db)).toContain('schema_migrations')
    expect(getAppliedVersions(db)).toContain(1)
  })

  it('runMigrations su file già migrato è idempotente (no duplicazioni)', () => {
    runMigrations(db)
    db.close()

    db = new Database(dbPath)
    runMigrations(db) // Seconda esecuzione su file esistente
    expect(getAppliedVersions(db)).toEqual([1, 2, 3, 4, 5, 6])
  })
})

// ---------------------------------------------------------------------------
// Suite: migrazione 002 — tabelle clienti e certificati_medici
// ---------------------------------------------------------------------------

describe('migrazione 002: clienti e certificati_medici', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    if (db.open) db.close()
  })

  it('crea la tabella clienti dopo runMigrations', () => {
    runMigrations(db)
    expect(getTables(db)).toContain('clienti')
  })

  it('crea la tabella certificati_medici dopo runMigrations', () => {
    runMigrations(db)
    expect(getTables(db)).toContain('certificati_medici')
  })

  it('registra la versione 2 nella tabella schema_migrations', () => {
    runMigrations(db)
    expect(getAppliedVersions(db)).toContain(2)
  })

  it('il rollback di v2 rimuove clienti e certificati_medici ma lascia app_settings', () => {
    runMigrations(db)
    rollbackMigration(db, 2)
    const tables = getTables(db)
    expect(tables).not.toContain('clienti')
    expect(tables).not.toContain('certificati_medici')
    expect(tables).toContain('app_settings')
    expect(getAppliedVersions(db)).not.toContain(2)
  })

  it('inserisce e legge una riga in clienti con i campi obbligatori', () => {
    runMigrations(db)
    db.prepare(
      `INSERT INTO clienti (nome, cognome, codice_fiscale) VALUES ('Mario', 'Rossi', 'RSSMRA85T10H501Z')`
    ).run()
    const row = db.prepare('SELECT * FROM clienti WHERE codice_fiscale = ?')
      .get('RSSMRA85T10H501Z') as { nome: string; cognome: string; stato: string }
    expect(row.nome).toBe('Mario')
    expect(row.cognome).toBe('Rossi')
    expect(row.stato).toBe('attivo')
  })

  it('inserisce e legge una riga in certificati_medici', () => {
    runMigrations(db)
    db.prepare(
      `INSERT INTO clienti (nome, cognome, codice_fiscale) VALUES ('Anna', 'Bianchi', 'BNCNNA90A41H501X')`
    ).run()
    const cliente = db.prepare('SELECT id FROM clienti WHERE codice_fiscale = ?')
      .get('BNCNNA90A41H501X') as { id: number }
    db.prepare(
      `INSERT INTO certificati_medici (cliente_id, tipo, data_scadenza) VALUES (?, 'non_agonistico', '2027-06-01')`
    ).run(cliente.id)
    const cert = db.prepare('SELECT * FROM certificati_medici WHERE cliente_id = ?')
      .get(cliente.id) as { tipo: string; data_scadenza: string }
    expect(cert.tipo).toBe('non_agonistico')
    expect(cert.data_scadenza).toBe('2027-06-01')
  })

  it('ciclo up → down → up della migrazione 002 riporta le tabelle allo stato iniziale', () => {
    runMigrations(db)
    rollbackMigration(db, 2)
    expect(getTables(db)).not.toContain('clienti')
    runMigrations(db)
    expect(getTables(db)).toContain('clienti')
    expect(getTables(db)).toContain('certificati_medici')
    expect(getAppliedVersions(db)).toContain(2)
  })
})

// ---------------------------------------------------------------------------
// Suite: migrazione 003 — catalogo e associazioni
// ---------------------------------------------------------------------------

describe('migrazione 003: catalogo e associazioni', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    if (db.open) db.close()
  })

  it('crea le tabelle tipi_iscrizione e tipi_abbonamento', () => {
    runMigrations(db)
    const tables = getTables(db)
    expect(tables).toContain('tipi_iscrizione')
    expect(tables).toContain('tipi_abbonamento')
  })

  it('crea le tabelle iscrizioni_cliente e abbonamenti_cliente', () => {
    runMigrations(db)
    const tables = getTables(db)
    expect(tables).toContain('iscrizioni_cliente')
    expect(tables).toContain('abbonamenti_cliente')
  })

  it('registra la versione 3 nella tabella schema_migrations', () => {
    runMigrations(db)
    expect(getAppliedVersions(db)).toContain(3)
  })

  it('il rollback di v3 rimuove le 4 tabelle ma lascia clienti e app_settings', () => {
    runMigrations(db)
    rollbackMigration(db, 3)
    const tables = getTables(db)
    expect(tables).not.toContain('tipi_iscrizione')
    expect(tables).not.toContain('tipi_abbonamento')
    expect(tables).not.toContain('iscrizioni_cliente')
    expect(tables).not.toContain('abbonamenti_cliente')
    expect(tables).toContain('clienti')
    expect(tables).toContain('app_settings')
    expect(getAppliedVersions(db)).not.toContain(3)
  })

  it('inserisce e legge un tipo iscrizione con valori di default', () => {
    runMigrations(db)
    db.prepare(
      `INSERT INTO tipi_iscrizione (nome, durata_mesi, prezzo_default) VALUES ('Tesseramento annuale', 12, 50.00)`
    ).run()
    const row = db
      .prepare('SELECT * FROM tipi_iscrizione WHERE nome = ?')
      .get('Tesseramento annuale') as { nome: string; durata_mesi: number; prezzo_default: number; stato: string }
    expect(row.nome).toBe('Tesseramento annuale')
    expect(row.durata_mesi).toBe(12)
    expect(row.prezzo_default).toBe(50.0)
    expect(row.stato).toBe('attivo')
  })

  it('inserisce e legge un tipo abbonamento con colore default', () => {
    runMigrations(db)
    db.prepare(
      `INSERT INTO tipi_abbonamento (nome, durata_mesi, prezzo_default) VALUES ('Sala pesi', 1, 30.00)`
    ).run()
    const row = db
      .prepare('SELECT * FROM tipi_abbonamento WHERE nome = ?')
      .get('Sala pesi') as { nome: string; colore: string; stato: string }
    expect(row.nome).toBe('Sala pesi')
    expect(row.colore).toBe('#3B82F6')
    expect(row.stato).toBe('attivo')
  })

  it('inserisce una iscrizione_cliente e verifica i vincoli FK su clienti e tipi_iscrizione', () => {
    runMigrations(db)
    db.prepare(
      `INSERT INTO clienti (nome, cognome, codice_fiscale) VALUES ('Luca', 'Verdi', 'VRDLCU90A01H501Y')`
    ).run()
    const cliente = db
      .prepare('SELECT id FROM clienti WHERE codice_fiscale = ?')
      .get('VRDLCU90A01H501Y') as { id: number }
    db.prepare(
      `INSERT INTO tipi_iscrizione (nome, durata_mesi, prezzo_default) VALUES ('Annuale', 12, 50.00)`
    ).run()
    const tipo = db
      .prepare('SELECT id FROM tipi_iscrizione WHERE nome = ?')
      .get('Annuale') as { id: number }
    db.prepare(
      `INSERT INTO iscrizioni_cliente (cliente_id, tipo_iscrizione_id, data_inizio, data_scadenza, prezzo)
       VALUES (?, ?, '2026-01-01', '2026-12-31', 50.00)`
    ).run(cliente.id, tipo.id)
    const isc = db
      .prepare('SELECT * FROM iscrizioni_cliente WHERE cliente_id = ?')
      .get(cliente.id) as { stato: string; stato_pagamento: string }
    expect(isc.stato).toBe('attiva')
    expect(isc.stato_pagamento).toBe('da_incassare')
  })

  it('ciclo up → down → up della migrazione 003 riporta le tabelle allo stato iniziale', () => {
    runMigrations(db)
    rollbackMigration(db, 3)
    expect(getTables(db)).not.toContain('tipi_iscrizione')
    runMigrations(db)
    expect(getTables(db)).toContain('tipi_iscrizione')
    expect(getTables(db)).toContain('abbonamenti_cliente')
    expect(getAppliedVersions(db)).toContain(3)
  })
})
