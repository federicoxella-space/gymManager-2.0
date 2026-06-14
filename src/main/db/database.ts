import { join } from 'path'
import { existsSync } from 'fs'
import { pbkdf2Sync } from 'crypto'
import { app } from 'electron'
import Database from 'better-sqlite3-multiple-ciphers'
import log from 'electron-log'
import { runMigrations } from './migrations'

// Costante esportata utile per i test
export const DB_PATH = join(app.getPath('userData'), 'gymmanager.db')

const KDF_SALT = 'gymmanager2-kdf-salt-v1'
const KDF_ITERATIONS = 100_000
const KDF_KEYLEN = 32
const KDF_DIGEST = 'sha256'

let dbInstance: Database.Database | null = null
let currentKey: string | null = null

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

  // Fase 1: apertura e verifica chiave (errori qui → PASSWORD_WRONG)
  try {
    db = new Database(dbPath)
    db.pragma(`key='${key}'`)
    // Verifica che la chiave sia corretta — SQLCipher lancia se la chiave è sbagliata
    db.pragma('user_version')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  } catch (err) {
    if (db && db.open) db.close()
    dbInstance = null
    const message = err instanceof Error ? err.message : String(err)
    log.error('[database] Errore apertura/verifica DB:', message)
    throw new Error('PASSWORD_WRONG')
  }

  // Fase 2: migrazioni (errori qui → MIGRATION_FAILED, non PASSWORD_WRONG)
  dbInstance = db
  currentKey = key
  try {
    runMigrations(dbInstance)
    log.info('[database] DB aperto e migrazioni applicate')
  } catch (err) {
    // Le migrazioni hanno fallito: il DB è comunque aperto (dati pre-esistenti intatti).
    // Segnala l'errore senza chiudere il DB — l'utente vede un messaggio dedicato.
    const message = err instanceof Error ? err.message : String(err)
    log.error('[database] Errore migrazioni al primo avvio post-aggiornamento:', message)
    // Non chiudiamo il DB: i dati pre-migrazione sono ancora accessibili.
    // L'IPC handler trasmetterà MIGRATION_FAILED al renderer per mostrare istruzioni di recovery.
    throw new Error(`MIGRATION_FAILED: ${message}`)
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
    currentKey = null
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

/**
 * Cambia la master password senza perdere i dati (rekey SQLCipher in-place).
 * Verifica prima la vecchia password confrontando la chiave derivata con quella corrente.
 * @throws Error('PASSWORD_WRONG') se la vecchia password non corrisponde.
 */
export function changePassword(oldPassword: string, newPassword: string): void {
  if (dbInstance === null || currentKey === null) {
    throw new Error('Database non aperto. Eseguire prima openDatabase().')
  }
  if (deriveKey(oldPassword) !== currentKey) {
    throw new Error('PASSWORD_WRONG')
  }
  const newKey = deriveKey(newPassword)
  // PRAGMA rekey non è supportato in WAL journal mode: si commuta temporaneamente
  // in DELETE, si esegue il rekey, poi si ripristina WAL.
  dbInstance.pragma('journal_mode = DELETE')
  dbInstance.pragma(`rekey='${newKey}'`)
  dbInstance.pragma('journal_mode = WAL')
  currentKey = newKey
  log.info('[database] Master password aggiornata (rekey)')
}
