import { app } from 'electron'
import {
  existsSync,
  copyFileSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  statSync
} from 'fs'
import { join, dirname } from 'path'
import log from 'electron-log'
import { DB_PATH, getDatabase, isDatabaseOpen } from '../db/database'

export interface BackupManifest {
  /** Versione schema DB al momento del backup (PRAGMA user_version). */
  version: number
  /** ISO datetime di creazione backup. */
  createdAt: string
  /** Versione dell'applicazione. */
  appVersion: string
  /** Percorso originale del file DB (per info). */
  dbPath: string
}

/** Numero massimo di backup automatici da conservare. */
const MAX_AUTO_BACKUPS = 5

/**
 * Legge PRAGMA user_version dal DB aperto.
 * Se il DB non è aperto restituisce 0.
 */
function getUserVersion(): number {
  if (!isDatabaseOpen()) return 0
  const db = getDatabase()
  const result = db.pragma('user_version') as Array<{ user_version: number }>
  return result[0]?.user_version ?? 0
}

/**
 * Esegue il backup locale del file DB verso un percorso scelto dall'utente.
 *
 * Il backup è la copia diretta del file DB cifrato con SQLCipher —
 * nessuna ulteriore cifratura viene aggiunta.
 * Accanto al file .db viene scritto un file .manifest.json con i metadati.
 *
 * @param destinazionePath - Percorso completo del file di destinazione (.db)
 * @returns Il manifest del backup creato
 */
export async function backupLocale(destinazionePath: string): Promise<BackupManifest> {
  if (!existsSync(DB_PATH)) {
    throw new Error('File database non trovato: ' + DB_PATH)
  }

  // Crea la directory di destinazione se non esiste
  const destDir = dirname(destinazionePath)
  mkdirSync(destDir, { recursive: true })

  // Copia il file DB (già cifrato con SQLCipher)
  copyFileSync(DB_PATH, destinazionePath)
  log.info(`[backup] File DB copiato in: ${destinazionePath}`)

  const manifest: BackupManifest = {
    version: getUserVersion(),
    createdAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    dbPath: DB_PATH
  }

  // Scrivi il manifest accanto al backup
  const manifestPath = destinazionePath + '.manifest.json'
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
  log.info(`[backup] Manifest scritto in: ${manifestPath}`)

  return manifest
}

/**
 * Esegue un backup automatico nella cartella di default
 * (`userData/backups/backup_YYYYMMDD_HHMMSS.db`).
 *
 * Mantiene al massimo MAX_AUTO_BACKUPS backup automatici,
 * cancellando i più vecchi in eccesso.
 *
 * @returns Il percorso del file di backup creato
 */
export async function backupAutomatico(): Promise<string> {
  const backupDir = join(app.getPath('userData'), 'backups')
  mkdirSync(backupDir, { recursive: true })

  // Nome file: backup_YYYYMMDD_HHMMSS.db
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const datePart =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const backupPath = join(backupDir, `backup_${datePart}.db`)

  await backupLocale(backupPath)
  log.info(`[backup] Backup automatico creato: ${backupPath}`)

  // Rimuovi i backup automatici in eccesso (i più vecchi prima)
  const files = readdirSync(backupDir)
    .filter((f) => f.startsWith('backup_') && f.endsWith('.db'))
    .map((f) => ({
      name: f,
      path: join(backupDir, f),
      mtime: statSync(join(backupDir, f)).mtimeMs
    }))
    .sort((a, b) => a.mtime - b.mtime) // più vecchi prima

  if (files.length > MAX_AUTO_BACKUPS) {
    const toDelete = files.slice(0, files.length - MAX_AUTO_BACKUPS)
    for (const file of toDelete) {
      try {
        unlinkSync(file.path)
        // Rimuovi anche il manifest se esiste
        const manifestPath = file.path + '.manifest.json'
        if (existsSync(manifestPath)) unlinkSync(manifestPath)
        log.info(`[backup] Backup automatico rimosso (eccesso): ${file.name}`)
      } catch (err) {
        log.warn(`[backup] Impossibile rimuovere backup obsoleto ${file.name}:`, err)
      }
    }
  }

  return backupPath
}
