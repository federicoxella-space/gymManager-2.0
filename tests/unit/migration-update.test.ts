/**
 * Test critico gate F6: simulazione aggiornamento con cambio schema.
 *
 * Verifica che le migrazioni si applichino automaticamente al primo avvio
 * post-aggiornamento su un DB esistente, senza perdita di dati.
 *
 * electron-log è mockato per silenziare l'output.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'

// Mocking electron-log per silenziare output nei test
vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

import { runMigrations, getPendingMigrations } from '../../src/main/db/migrations'
import migration001 from '../../src/main/db/migrations/001_initial'
import migration002 from '../../src/main/db/migrations/002_clients'
import migration003 from '../../src/main/db/migrations/003_memberships'
import migration004 from '../../src/main/db/migrations/004_receipts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Restituisce i nomi delle tabelle utente presenti nel DB. */
function getTables(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[]
  return rows.map((r) => r.name)
}

/** Restituisce le versioni delle migrazioni già applicate. */
function getAppliedVersions(db: Database.Database): number[] {
  const rows = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all() as { version: number }[]
  return rows.map((r) => r.version)
}

/** Verifica se una colonna esiste in una tabella. */
function columnExists(db: Database.Database, table: string, column: string): boolean {
  const rows = db.pragma(`table_info(${table})`) as { name: string }[]
  return rows.some((r) => r.name === column)
}

/**
 * Applica solo le migrazioni 001-004 simulando uno stato di DB pre-aggiornamento F6.
 * Usa import statici (non require()) compatibili con ESM/Vitest.
 */
function applyMigrationsUpToV4(db: Database.Database): void {
  // Crea la tabella di tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at  TEXT NOT NULL
    )
  `)

  const migrations = [migration001, migration002, migration003, migration004]

  const insert = db.prepare(
    `INSERT INTO schema_migrations (version, description, applied_at)
     VALUES (?, ?, datetime('now'))`
  )

  for (const migration of migrations) {
    const applyMigration = db.transaction(() => {
      migration.up(db)
      insert.run(migration.version, migration.description)
    })
    applyMigration()
  }
}

// ---------------------------------------------------------------------------
// Suite principale: Simulazione update con cambio schema F6
// ---------------------------------------------------------------------------

describe('Simulazione update con cambio schema F6', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    if (db.open) db.close()
  })

  // Test 1: dati esistenti sopravvivono alla migrazione 005
  it('dati esistenti sopravvivono alla migrazione 005', () => {
    // 1. Applica migrazioni 001-004 (stato DB prima dell'aggiornamento)
    applyMigrationsUpToV4(db)

    // 2. Inserisce un cliente con i dati pre-aggiornamento
    db.prepare(
      `INSERT INTO clienti (nome, cognome, codice_fiscale) VALUES ('Mario', 'Rossi', 'RSSMRA85T10H501Z')`
    ).run()

    // 3. Verifica che il cliente sia presente prima della migrazione 005
    const clientePre = db
      .prepare('SELECT * FROM clienti WHERE codice_fiscale = ?')
      .get('RSSMRA85T10H501Z') as { nome: string; cognome: string } | undefined
    expect(clientePre).toBeDefined()
    expect(clientePre!.nome).toBe('Mario')

    // 4. Simula il primo avvio post-aggiornamento: runMigrations applica solo la 005
    expect(() => runMigrations(db)).not.toThrow()

    // 5. Verifica che il cliente sia ancora presente dopo la migrazione 005
    const clientePost = db
      .prepare('SELECT * FROM clienti WHERE codice_fiscale = ?')
      .get('RSSMRA85T10H501Z') as { nome: string; cognome: string } | undefined
    expect(clientePost).toBeDefined()
    expect(clientePost!.nome).toBe('Mario')
    expect(clientePost!.cognome).toBe('Rossi')

    // 6. Verifica che la colonna note_interne esista nella tabella clienti
    expect(columnExists(db, 'clienti', 'note_interne')).toBe(true)

    // 7. Verifica che la versione 5 sia registrata nelle migrazioni applicate
    expect(getAppliedVersions(db)).toContain(5)
  })

  // Test 2: getPendingMigrations restituisce la migrazione non ancora applicata
  it('getPendingMigrations restituisce la migrazione non ancora applicata', () => {
    // DB con solo migrazioni 001-004
    applyMigrationsUpToV4(db)

    // getPendingMigrations deve includere solo la versione 5
    const pending = getPendingMigrations(db)
    expect(pending).toContain(5)
    expect(pending).not.toContain(1)
    expect(pending).not.toContain(2)
    expect(pending).not.toContain(3)
    expect(pending).not.toContain(4)
  })

  // Test 3: getPendingMigrations è vuoto dopo runMigrations completo
  it('getPendingMigrations è vuoto dopo runMigrations completo', () => {
    // DB con tutte le migrazioni applicate
    runMigrations(db)

    const pending = getPendingMigrations(db)
    expect(pending).toHaveLength(0)
    expect(pending).toEqual([])
  })

  // Test 4: percorso di ripristino - migrazione fallita non corrompe il DB
  it('percorso di ripristino: migrazione fallita non corrompe il DB', () => {
    // Applica le prime 4 migrazioni
    applyMigrationsUpToV4(db)

    // Inserisce dati
    db.prepare(
      `INSERT INTO clienti (nome, cognome, codice_fiscale) VALUES ('Anna', 'Bianchi', 'BNCNNA90A41H501X')`
    ).run()

    // Forza un errore per la migrazione 005: aggiunge la colonna note_interne
    // in anticipo, cosicché il successivo ALTER TABLE nella 005 fallisca
    db.exec(`ALTER TABLE clienti ADD COLUMN note_interne TEXT`)

    // runMigrations tenterà la 005 che farà ALTER TABLE su colonna già esistente → errore
    expect(() => runMigrations(db)).toThrow()

    // Verifica che il DB sia ancora accessibile e i dati pre-esistenti intatti
    const cliente = db
      .prepare('SELECT * FROM clienti WHERE codice_fiscale = ?')
      .get('BNCNNA90A41H501X') as { nome: string } | undefined
    expect(cliente).toBeDefined()
    expect(cliente!.nome).toBe('Anna')

    // Le migrazioni 001-004 devono essere ancora nel registro
    const applied = getAppliedVersions(db)
    expect(applied).toContain(1)
    expect(applied).toContain(2)
    expect(applied).toContain(3)
    expect(applied).toContain(4)

    // La migrazione 005 non deve essere nel registro (la transazione è stata annullata)
    expect(applied).not.toContain(5)
  })

  // Test 5: note_interne accetta valori null (colonna nullable)
  it('la colonna note_interne è nullable e accetta valori null', () => {
    runMigrations(db)

    db.prepare(
      `INSERT INTO clienti (nome, cognome, codice_fiscale) VALUES ('Luca', 'Verdi', 'VRDLCU90A01H501Y')`
    ).run()

    const cliente = db
      .prepare('SELECT note_interne FROM clienti WHERE codice_fiscale = ?')
      .get('VRDLCU90A01H501Y') as { note_interne: string | null }
    expect(cliente.note_interne).toBeNull()
  })

  // Test 6: note_interne accetta testo
  it('la colonna note_interne accetta valori testuali', () => {
    runMigrations(db)

    db.prepare(
      `INSERT INTO clienti (nome, cognome, codice_fiscale, note_interne) VALUES ('Sara', 'Neri', 'NRESAR99A41H501K', 'note di test')`
    ).run()

    const cliente = db
      .prepare('SELECT note_interne FROM clienti WHERE codice_fiscale = ?')
      .get('NRESAR99A41H501K') as { note_interne: string | null }
    expect(cliente.note_interne).toBe('note di test')
  })

  // Test 7: runMigrations su DB con 001-004 applica solo la 005
  it('runMigrations su DB con 001-004 applica solo la migrazione 005', () => {
    applyMigrationsUpToV4(db)

    // Prima dell'upgrade: 4 migrazioni applicate
    expect(getAppliedVersions(db)).toEqual([1, 2, 3, 4])

    // Simula l'avvio post-aggiornamento
    runMigrations(db)

    // Dopo l'upgrade: 6 migrazioni applicate
    expect(getAppliedVersions(db)).toEqual([1, 2, 3, 4, 5, 6])
  })

  // Test 8: tutte le tabelle preesistenti sopravvivono alla migrazione 005
  it('tutte le tabelle preesistenti sopravvivono alla migrazione 005', () => {
    applyMigrationsUpToV4(db)

    const tablesPre = getTables(db)
    expect(tablesPre).toContain('clienti')
    expect(tablesPre).toContain('app_settings')
    expect(tablesPre).toContain('tipi_iscrizione')
    expect(tablesPre).toContain('ricevute')

    // Applica la 005
    runMigrations(db)

    const tablesPost = getTables(db)
    expect(tablesPost).toContain('clienti')
    expect(tablesPost).toContain('app_settings')
    expect(tablesPost).toContain('tipi_iscrizione')
    expect(tablesPost).toContain('ricevute')
    expect(tablesPost).toContain('schema_migrations')
  })

  // Test 9: getPendingMigrations su DB vuoto restituisce tutte le versioni
  it('getPendingMigrations su DB vuoto restituisce tutte le versioni registrate', () => {
    const pending = getPendingMigrations(db)
    expect(pending).toContain(1)
    expect(pending).toContain(2)
    expect(pending).toContain(3)
    expect(pending).toContain(4)
    expect(pending).toContain(5)
    expect(pending).toContain(6)
    expect(pending).toHaveLength(6)
  })
})
