import { existsSync, copyFileSync, unlinkSync, readFileSync } from 'fs'
import log from 'electron-log'
import { DB_PATH, openDatabase, closeDatabase, isDatabaseOpen } from '../db/database'
import type { BackupManifest } from './backup-service'

/**
 * Legge e verifica il manifest JSON accanto al file di backup.
 *
 * @param backupPath - Percorso del file .db di backup
 * @returns Il manifest del backup
 * @throws Se il manifest non è trovato o il file .db è mancante
 */
export async function verificaBackup(backupPath: string): Promise<BackupManifest> {
  if (!existsSync(backupPath)) {
    throw new Error(`File di backup non trovato: ${backupPath}`)
  }

  const manifestPath = backupPath + '.manifest.json'
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Manifest del backup non trovato: ${manifestPath}. ` +
        'Il file potrebbe non essere un backup valido di GymManager.'
    )
  }

  let manifest: BackupManifest
  try {
    const raw = readFileSync(manifestPath, 'utf-8')
    manifest = JSON.parse(raw) as BackupManifest
  } catch (err) {
    throw new Error(
      `Impossibile leggere il manifest del backup: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  // Valida i campi minimi
  if (typeof manifest.version !== 'number' || !manifest.createdAt || !manifest.appVersion) {
    throw new Error('Manifest del backup non valido: campi obbligatori mancanti.')
  }

  log.info(`[restore] Backup verificato — versione schema: ${manifest.version}, creato: ${manifest.createdAt}`)
  return manifest
}

/**
 * Ripristina un backup nel DB corrente.
 *
 * Operazione distruttiva: sovrascrive il DB attivo.
 * Prima di sovrascrivere, crea un backup di sicurezza del DB corrente.
 * Se l'apertura con la nuova password fallisce, ripristina il backup di sicurezza.
 *
 * @param backupPath - Percorso del file .db di backup
 * @param nuovaPassword - La master password con cui il backup è stato creato
 */
export async function ripristinaBackup(backupPath: string, nuovaPassword: string): Promise<void> {
  // 1. Verifica il backup
  await verificaBackup(backupPath)

  // 2. Chiudi il DB corrente
  if (isDatabaseOpen()) {
    closeDatabase()
    log.info('[restore] DB corrente chiuso per ripristino')
  }

  // 3. Crea un backup di sicurezza del DB corrente (se esiste)
  const safetyPath = DB_PATH + '.restore-safety.db'
  let hasSafetyBackup = false
  if (existsSync(DB_PATH)) {
    copyFileSync(DB_PATH, safetyPath)
    hasSafetyBackup = true
    log.info(`[restore] Backup di sicurezza creato: ${safetyPath}`)
  }

  // 4. Copia il file backup nel percorso DB
  try {
    copyFileSync(backupPath, DB_PATH)
    log.info(`[restore] File backup copiato su: ${DB_PATH}`)
  } catch (err) {
    // Se la copia fallisce, ripristina il backup di sicurezza
    if (hasSafetyBackup) {
      copyFileSync(safetyPath, DB_PATH)
      log.warn('[restore] Copia backup fallita, DB di sicurezza ripristinato')
    }
    throw new Error(
      `Impossibile copiare il backup: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  // 5. Tenta di aprire il DB con la password fornita
  try {
    openDatabase(nuovaPassword)
    log.info('[restore] DB ripristinato e aperto con successo')
  } catch (err) {
    // 6. Se fallisce: ripristina il backup di sicurezza
    log.error('[restore] Apertura DB ripristinato fallita, ripristino backup di sicurezza')
    closeDatabase()

    if (hasSafetyBackup) {
      copyFileSync(safetyPath, DB_PATH)
      try {
        // Non riaprire: la password originale è sconosciuta qui
        log.info('[restore] DB di sicurezza ripristinato su disco (richiede riapertura manuale)')
      } catch {
        // ignora
      }
    } else if (existsSync(DB_PATH)) {
      unlinkSync(DB_PATH)
    }

    throw new Error(
      'Password errata o file di backup corrotto. ' +
        'Il database originale è stato ripristinato. ' +
        `Dettaglio: ${err instanceof Error ? err.message : String(err)}`
    )
  } finally {
    // 7. Rimuovi il backup di sicurezza (operazione completata o fallita già gestita)
    if (hasSafetyBackup && existsSync(safetyPath)) {
      try {
        unlinkSync(safetyPath)
      } catch {
        log.warn(`[restore] Impossibile rimuovere backup di sicurezza: ${safetyPath}`)
      }
    }
  }
}

/**
 * Reset DISTRUTTIVO del database.
 *
 * Cancella tutti i dati, crea un nuovo DB con la nuova password.
 * Conforme a D6 (DECISIONS.md): il reset cancella i dati senza recupero possibile.
 *
 * ATTENZIONE: operazione irreversibile. Usare solo con doppia conferma dell'utente.
 *
 * @param nuovaPassword - La nuova master password per il DB appena creato
 */
export async function resetDatabase(nuovaPassword: string): Promise<void> {
  log.warn('[reset] Avvio reset DISTRUTTIVO del database')

  // 1. Chiudi il DB corrente
  if (isDatabaseOpen()) {
    closeDatabase()
    log.info('[reset] DB corrente chiuso')
  }

  // 2. Elimina il file DB (e i file WAL/SHM associati)
  const filesToDelete = [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']
  for (const f of filesToDelete) {
    if (existsSync(f)) {
      unlinkSync(f)
      log.info(`[reset] File eliminato: ${f}`)
    }
  }

  // 3. Crea un nuovo DB con la nuova password (openDatabase lo crea da zero con migrazioni)
  openDatabase(nuovaPassword)
  log.info('[reset] Nuovo DB creato con nuova password e migrazioni applicate')
}

export type { BackupManifest }
