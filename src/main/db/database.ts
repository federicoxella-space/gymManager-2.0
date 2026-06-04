import { join } from 'path'
import { existsSync } from 'fs'
import { pbkdf2Sync } from 'crypto'
import { app } from 'electron'
import Database from 'better-sqlite3'
import log from 'electron-log'
import { runMigrations } from './migrations'

// Costante esportata utile per i test
export const DB_PATH = join(app.getPath('userData'), 'gymmanager.db')

const KDF_SALT = 'gymmanager2-kdf-salt-v1'
const KDF_ITERATIONS = 100_000
const KDF_KEYLEN = 32
const KDF_DIGEST = 'sha256'

let dbInstance: Database.Database | null = null

/**
 * Deriva la chiave SQLCipher dalla master password usando PBKDF2.
 * Restituisce una stringa esadecimale di 64 caratteri (32 byte).
 * La chiave non viene mai scritta su disco.
 */
export function deriveKey(password: string): string {
  const key = pbkdf2Sync(password, KDF_SALT, KDF_ITERATIONS, KDF_KEYLEN, KDF_DIGEST)
  return key.toString('hex')
}

/**
 * Controlla se il file DB esiste già (primo avvio vs avvio successivo).
 */
export function checkFirstRun(): boolean {
  return !existsSync(DB_PATH)
}

/**
 * Apre il database con la password fornita.
 * Applica PRAGMA key per SQLCipher, verifica l'accesso leggendo user_version,
 * poi esegue le migrazioni in sospeso.
 *
 * Lancia Error('PASSWORD_WRONG') se la password non corrisponde.
 */
export function openDatabase(password: string): void {
  if (dbInstance !== null) {
    log.info('[database] DB già aperto, skip')
    return
  }

  const key = deriveKey(password)
  const dbPath = DB_PATH

  log.info(`[database] Apertura DB: ${dbPath}`)

  let db: Database.Database | null = null
  try {
    db = new Database(dbPath)

    // Applica la chiave SQLCipher
    db.pragma(`key='${key}'`)

    // Verifica che la chiave sia corretta leggendo user_version.
    // Se la chiave è sbagliata, SQLCipher restituisce un errore o dati corrotti.
    db.pragma('user_version')

    // Abilita WAL per performance migliori
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    dbInstance = db
    log.info('[database] DB aperto con successo')

    runMigrations(dbInstance)
  } catch (err) {
    // Chiudi il file se l'apertura ha fallito
    if (db && db.open) {
      db.close()
    }
    dbInstance = null

    const message = err instanceof Error ? err.message : String(err)
    log.error('[database] Errore apertura DB:', message)

    // SQLCipher / better-sqlite3 lancia errori di file o di decifrazione;
    // li normalizziamo in PASSWORD_WRONG per il chiamante
    throw new Error('PASSWORD_WRONG')
  }
}

/**
 * Chiude il database se aperto.
 */
export function closeDatabase(): void {
  if (dbInstance === null) {
    return
  }
  try {
    dbInstance.close()
    log.info('[database] DB chiuso')
  } catch (err) {
    log.error('[database] Errore nella chiusura del DB:', err)
  } finally {
    dbInstance = null
  }
}

/**
 * Restituisce l'istanza del database.
 * Lancia un errore se il DB non è aperto.
 */
export function getDatabase(): Database.Database {
  if (dbInstance === null) {
    throw new Error('Database non aperto. Eseguire prima openDatabase().')
  }
  return dbInstance
}

/**
 * Indica se il database è attualmente aperto.
 */
export function isDatabaseOpen(): boolean {
  return dbInstance !== null && dbInstance.open
}
