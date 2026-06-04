import type Database from 'better-sqlite3'
import log from 'electron-log'
import migration001 from './migrations/001_initial'
import migration002 from './migrations/002_clients'
import migration003 from './migrations/003_memberships'

export interface Migration {
  version: number
  description: string
  up: (db: Database.Database) => void
  down: (db: Database.Database) => void
}

/** Elenco ordinato di tutte le migrazioni registrate. */
const migrations: Migration[] = [migration001, migration002, migration003]

/**
 * Applica tutte le migrazioni non ancora applicate al DB.
 * Ogni migrazione viene eseguita in una transazione atomica:
 * se fallisce non lascia il DB in stato incoerente.
 */
export function runMigrations(db: Database.Database): void {
  // Crea la tabella di tracking se non esiste
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at  TEXT NOT NULL
    )
  `)

  // Legge le versioni già applicate
  const applied = new Set<number>(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
      (r) => r.version
    )
  )

  const insert = db.prepare(
    `INSERT INTO schema_migrations (version, description, applied_at)
     VALUES (?, ?, datetime('now'))`
  )

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue
    }

    log.info(`[migrations] Applico migrazione v${migration.version}: ${migration.description}`)

    const applyMigration = db.transaction(() => {
      migration.up(db)
      insert.run(migration.version, migration.description)
    })

    try {
      applyMigration()
      log.info(`[migrations] Migrazione v${migration.version} applicata con successo`)
    } catch (err) {
      log.error(`[migrations] Errore nella migrazione v${migration.version}:`, err)
      throw new Error(
        `Migrazione v${migration.version} fallita: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
}

/**
 * Esegue il rollback di una singola migrazione per versione.
 * Rimuove la voce da schema_migrations e chiama il metodo down().
 */
export function rollbackMigration(db: Database.Database, version: number): void {
  const migration = migrations.find((m) => m.version === version)
  if (!migration) {
    throw new Error(`Migrazione v${version} non trovata`)
  }

  const applied = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get(version) as { version: number } | undefined

  if (!applied) {
    throw new Error(`Migrazione v${version} non risulta applicata`)
  }

  log.info(`[migrations] Rollback migrazione v${version}: ${migration.description}`)

  const doRollback = db.transaction(() => {
    migration.down(db)
    db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(version)
  })

  try {
    doRollback()
    log.info(`[migrations] Rollback migrazione v${version} completato`)
  } catch (err) {
    log.error(`[migrations] Errore nel rollback della migrazione v${version}:`, err)
    throw new Error(
      `Rollback v${version} fallito: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}
