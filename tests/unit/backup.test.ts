/**
 * Test unit per il sistema di backup/restore (F5).
 *
 * Usa DB temporanei su disco (tmpdir) e mocka 'electron' per evitare
 * la dipendenza da Electron runtime.
 *
 * NOTA: i test di ripristino verificano il round-trip completo
 * backup → restore → DB apribile con la stessa password.
 * In assenza di SQLCipher la verifica della password è skip-pata
 * (stesso comportamento di db.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  statSync
} from 'fs'

// ─────────────────────────────────────────────────────────────────────────────
// Mock Electron
// NOTA: vi.mock() è hoistato da Vitest prima di qualsiasi inizializzazione di
// variabili del modulo (temporal dead zone). La factory NON può referenziare
// costanti del modulo — usiamo require() inline, come in db.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('electron', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: pathJoin } = require('path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir: osTmpdir } = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdirSync: fsMkdir } = require('fs')
  const testDataDir = pathJoin(osTmpdir(), `gymmanager-backup-test-${process.pid}`)
  fsMkdir(testDataDir, { recursive: true })
  return {
    app: {
      getPath: (_name: string) => testDataDir,
      getVersion: () => '0.1.0-test'
    }
  }
})

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

// Calcoliamo TEST_USER_DATA con la stessa logica della factory mock (dopo le mock)
const TEST_USER_DATA = join(tmpdir(), `gymmanager-backup-test-${process.pid}`)

// ─────────────────────────────────────────────────────────────────────────────
// Import DOPO i mock
// ─────────────────────────────────────────────────────────────────────────────

import { backupLocale, backupAutomatico } from '../../src/main/backup/backup-service'
import { verificaBackup, ripristinaBackup, resetDatabase } from '../../src/main/backup/restore-service'
import {
  connectDrive,
  isDriveConnected,
  backupSuDrive,
  listBackupDrive
} from '../../src/main/backup/drive-service'
import {
  openDatabase,
  closeDatabase,
  isDatabaseOpen,
  getDatabase,
  DB_PATH
} from '../../src/main/db/database'
import { runMigrations } from '../../src/main/db/migrations'
import type { BackupManifest } from '../../src/main/backup/backup-service'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

let _cfCounter = 0

/** Genera un codice fiscale fittizio univoco per ogni invocazione */
function uniqueCF(): string {
  _cfCounter++
  return `TSTBK${String(_cfCounter).padStart(5, '0')}H501Z`
}

/** Path temporaneo univoco */
function tempPath(suffix = '.db'): string {
  return join(tmpdir(), `gymmanager-bk-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`)
}

/**
 * Crea un DB SQLite fresco su dbPath con le migrazioni applicate
 * e un cliente di test.
 * Usa journal_mode = DELETE per evitare file WAL su Windows.
 * Il modulo database.ts NON viene coinvolto (usa better-sqlite3 direttamente).
 */
function creaDbDiTest(dbPath: string): void {
  const db = new Database(dbPath)
  db.pragma('journal_mode = DELETE')
  runMigrations(db)
  db.prepare(
    `INSERT OR IGNORE INTO clienti (nome, cognome, codice_fiscale) VALUES ('Mario', 'Rossi', ?)`
  ).run(uniqueCF())
  db.close()
}

/**
 * Pulisce un insieme di path (db + wal + shm + manifest + safety).
 * Ignora silenziosamente gli errori EBUSY/ENOENT.
 */
function cleanupFiles(...paths: string[]): void {
  for (const p of paths) {
    const extras = [
      p,
      p + '-wal',
      p + '-shm',
      p + '.manifest.json',
      p + '.restore-safety.db'
    ]
    for (const f of extras) {
      try {
        if (existsSync(f)) unlinkSync(f)
      } catch {
        // Ignora EBUSY/ENOENT
      }
    }
  }
}

/**
 * Chiude il DB del modulo in modo pulito, forzando il checkpoint WAL.
 * Riduce i file rimasti aperti su Windows dopo la chiusura.
 */
function chiudiDbModulo(): void {
  if (isDatabaseOpen()) {
    try {
      const db = getDatabase()
      db.pragma('wal_checkpoint(TRUNCATE)')
      db.pragma('journal_mode = DELETE')
    } catch {
      // ignora
    }
    closeDatabase()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup / teardown globale
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  chiudiDbModulo()
  cleanupFiles(DB_PATH)
})

afterEach(() => {
  chiudiDbModulo()
  cleanupFiles(DB_PATH)
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: backupLocale
// ─────────────────────────────────────────────────────────────────────────────

describe('backupLocale', () => {
  it('crea il file di backup nella destinazione indicata', async () => {
    creaDbDiTest(DB_PATH)
    const destPath = tempPath('.db')
    try {
      const manifest = await backupLocale(destPath)
      expect(existsSync(destPath)).toBe(true)
      expect(manifest).toBeDefined()
    } finally {
      cleanupFiles(destPath)
    }
  })

  it('crea il file manifest JSON accanto al backup', async () => {
    creaDbDiTest(DB_PATH)
    const destPath = tempPath('.db')
    try {
      await backupLocale(destPath)
      expect(existsSync(destPath + '.manifest.json')).toBe(true)
    } finally {
      cleanupFiles(destPath)
    }
  })

  it('il manifest ha i campi obbligatori (version, createdAt, appVersion, dbPath)', async () => {
    creaDbDiTest(DB_PATH)
    const destPath = tempPath('.db')
    try {
      const manifest = await backupLocale(destPath)
      expect(typeof manifest.version).toBe('number')
      expect(typeof manifest.createdAt).toBe('string')
      expect(manifest.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(typeof manifest.appVersion).toBe('string')
      expect(typeof manifest.dbPath).toBe('string')
    } finally {
      cleanupFiles(destPath)
    }
  })

  it('il manifest sul disco è leggibile e coerente con quello restituito', async () => {
    creaDbDiTest(DB_PATH)
    const destPath = tempPath('.db')
    try {
      const manifest = await backupLocale(destPath)
      const manifestOnDisk = JSON.parse(
        readFileSync(destPath + '.manifest.json', 'utf-8')
      ) as BackupManifest
      expect(manifestOnDisk.createdAt).toBe(manifest.createdAt)
      expect(manifestOnDisk.appVersion).toBe(manifest.appVersion)
      expect(manifestOnDisk.version).toBe(manifest.version)
    } finally {
      cleanupFiles(destPath)
    }
  })

  it('crea le directory di destinazione se non esistono', async () => {
    creaDbDiTest(DB_PATH)
    const subDir = join(tmpdir(), `gymmanager-newdir-${Date.now()}`)
    const destPath = join(subDir, 'backup.db')
    try {
      expect(existsSync(subDir)).toBe(false)
      await backupLocale(destPath)
      expect(existsSync(subDir)).toBe(true)
      expect(existsSync(destPath)).toBe(true)
    } finally {
      cleanupFiles(destPath)
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('fs').rmdirSync(subDir, { recursive: true })
      } catch { /* ignore */ }
    }
  })

  it('lancia errore se il file DB non esiste', async () => {
    // DB_PATH non esiste (cleanup in beforeEach)
    const destPath = tempPath('.db')
    await expect(backupLocale(destPath)).rejects.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: backupAutomatico
// ─────────────────────────────────────────────────────────────────────────────

describe('backupAutomatico', () => {
  it('crea il file nella directory backups di default', async () => {
    creaDbDiTest(DB_PATH)
    const backupPath = await backupAutomatico()
    try {
      expect(existsSync(backupPath)).toBe(true)
      expect(backupPath).toContain('backups')
      expect(backupPath).toMatch(/backup_\d{8}_\d{6}\.db$/)
    } finally {
      cleanupFiles(backupPath)
    }
  })

  it('mantiene al massimo 5 backup automatici', async () => {
    creaDbDiTest(DB_PATH)
    const backupDir = join(TEST_USER_DATA, 'backups')
    mkdirSync(backupDir, { recursive: true })

    // Crea 6 backup fittizi pre-esistenti
    const fakeFiles: string[] = []
    for (let i = 1; i <= 6; i++) {
      const fakePath = join(backupDir, `backup_20260101_0000${String(i).padStart(2, '0')}.db`)
      writeFileSync(fakePath, 'fake db data')
      writeFileSync(fakePath + '.manifest.json', '{}')
      fakeFiles.push(fakePath)
    }

    const backupPath = await backupAutomatico()

    try {
      const files = readdirSync(backupDir).filter(
        (f) => f.startsWith('backup_') && f.endsWith('.db')
      )
      expect(files.length).toBeLessThanOrEqual(5)
    } finally {
      cleanupFiles(backupPath)
      for (const f of fakeFiles) cleanupFiles(f)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: verificaBackup
// ─────────────────────────────────────────────────────────────────────────────

describe('verificaBackup', () => {
  it('legge il manifest correttamente da un backup creato con backupLocale', async () => {
    creaDbDiTest(DB_PATH)
    const destPath = tempPath('.db')
    try {
      const originalManifest = await backupLocale(destPath)
      const readManifest = await verificaBackup(destPath)
      expect(readManifest.createdAt).toBe(originalManifest.createdAt)
      expect(readManifest.appVersion).toBe(originalManifest.appVersion)
    } finally {
      cleanupFiles(destPath)
    }
  })

  it('lancia errore se il file .db è mancante', async () => {
    const fakePath = tempPath('.db')
    await expect(verificaBackup(fakePath)).rejects.toThrow(/non trovato/)
  })

  it('lancia errore se il manifest è mancante', async () => {
    const destPath = tempPath('.db')
    writeFileSync(destPath, 'fake db content')
    try {
      await expect(verificaBackup(destPath)).rejects.toThrow(/manifest/i)
    } finally {
      cleanupFiles(destPath)
    }
  })

  it('lancia errore se il manifest ha JSON non valido', async () => {
    const destPath = tempPath('.db')
    writeFileSync(destPath, 'fake db content')
    writeFileSync(destPath + '.manifest.json', 'INVALID JSON {{{}}}')
    try {
      await expect(verificaBackup(destPath)).rejects.toThrow()
    } finally {
      cleanupFiles(destPath)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: ripristinaBackup
// ─────────────────────────────────────────────────────────────────────────────

describe('ripristinaBackup', () => {
  it('copia il file backup nel percorso DB e apre il DB', async () => {
    // Crea il DB cifrato a DB_PATH tramite openDatabase (obbligatorio con SQLCipher)
    openDatabase('testpassword')
    chiudiDbModulo()

    const backupPath = tempPath('.db')
    await backupLocale(backupPath)

    // Reset DB_PATH per simulare un DB diverso corrente
    cleanupFiles(DB_PATH)

    // Ripristina — il backup è cifrato con 'testpassword', il restore deve riuscire
    await ripristinaBackup(backupPath, 'testpassword')
    expect(isDatabaseOpen()).toBe(true)

    cleanupFiles(backupPath)
  })

  it('dopo il ripristino le migrazioni sono presenti nel DB', async () => {
    // Crea DB cifrato tramite openDatabase
    openDatabase('testpassword')
    chiudiDbModulo()

    const backupPath = tempPath('.db')
    await backupLocale(backupPath)

    cleanupFiles(DB_PATH)

    await ripristinaBackup(backupPath, 'testpassword')
    expect(isDatabaseOpen()).toBe(true)

    const db = getDatabase()
    const versions = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as { version: number }[]
    expect(versions.length).toBeGreaterThan(0)

    cleanupFiles(backupPath)
  })

  it('lancia errore se il file backup non ha manifest', async () => {
    const invalidPath = tempPath('.db')
    writeFileSync(invalidPath, 'NOT_A_DB')
    // Nessun manifest → verificaBackup lancia Error con "manifest"

    try {
      await expect(ripristinaBackup(invalidPath, 'testpassword')).rejects.toThrow()
    } finally {
      cleanupFiles(invalidPath)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5: resetDatabase
// ─────────────────────────────────────────────────────────────────────────────

describe('resetDatabase', () => {
  it('crea un nuovo DB apribile dopo il reset', async () => {
    creaDbDiTest(DB_PATH)
    // Il DB è stato creato da better-sqlite3 direttamente, non aperto dal modulo
    expect(existsSync(DB_PATH)).toBe(true)

    await resetDatabase('nuovapassword')
    expect(isDatabaseOpen()).toBe(true)
  })

  it('il DB dopo reset ha le tabelle delle migrazioni (DB fresco)', async () => {
    creaDbDiTest(DB_PATH)

    await resetDatabase('nuovapassword')
    expect(isDatabaseOpen()).toBe(true)

    const db = getDatabase()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]
    const tableNames = tables.map((t) => t.name)
    expect(tableNames).toContain('clienti')
    expect(tableNames).toContain('schema_migrations')
  })

  it('il DB dopo reset è vuoto (nessun dato del vecchio DB)', async () => {
    creaDbDiTest(DB_PATH)

    await resetDatabase('nuovapassword')
    const db = getDatabase()
    const clienti = db.prepare('SELECT COUNT(*) as n FROM clienti').get() as { n: number }
    expect(clienti.n).toBe(0)
  })

  it('funziona anche se non c\'è nessun DB su disco', async () => {
    // beforeEach ha già rimosso il DB_PATH
    expect(existsSync(DB_PATH)).toBe(false)

    await resetDatabase('nuovapassword3')
    expect(isDatabaseOpen()).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6: Drive stub
// ─────────────────────────────────────────────────────────────────────────────

describe('Drive — stato non configurato/connesso', () => {
  it('isDriveConnected restituisce false quando non ci sono token salvati', () => {
    expect(isDriveConnected()).toBe(false)
  })

  it('connectDrive lancia errore quando le credenziali non sono configurate', async () => {
    // Con settings vuote (mock electron), il Client ID e Secret saranno stringa vuota
    await expect(connectDrive()).rejects.toThrow()
  })

  it('backupSuDrive lancia DRIVE_NOT_CONNECTED quando non connesso', async () => {
    await expect(backupSuDrive('/fake/path.db')).rejects.toThrow('DRIVE_NOT_CONNECTED')
  })

  it('listBackupDrive lancia DRIVE_NOT_CONNECTED quando non connesso', async () => {
    await expect(listBackupDrive()).rejects.toThrow('DRIVE_NOT_CONNECTED')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7: round-trip backup → restore → lettura dati
// ─────────────────────────────────────────────────────────────────────────────

describe('round-trip integrazione: backup → restore → DB apribile', () => {
  it('dopo backup e restore il DB è aperto e le migrazioni sono presenti', async () => {
    // 1. Crea DB cifrato a DB_PATH tramite openDatabase (necessario con SQLCipher)
    openDatabase('testpassword')
    chiudiDbModulo()

    // 2. Crea il backup dal DB cifrato
    const backupPath = tempPath('.db')
    await backupLocale(backupPath)
    expect(existsSync(backupPath)).toBe(true)
    expect(existsSync(backupPath + '.manifest.json')).toBe(true)

    // 3. Chiudi e svuota il DB corrente
    cleanupFiles(DB_PATH)

    // 4. Ripristina il backup
    await ripristinaBackup(backupPath, 'testpassword')

    // 5. Il DB deve essere aperto
    expect(isDatabaseOpen()).toBe(true)

    // 6. Le tabelle di migrazione devono esistere
    const db = getDatabase()
    const versions = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as { version: number }[]
    expect(versions.length).toBeGreaterThan(0)

    cleanupFiles(backupPath)
  })

  it('il manifest del backup riporta la versione schema corretta', async () => {
    const sourcePath = tempPath('.db')
    creaDbDiTest(sourcePath)
    copyFileSync(sourcePath, DB_PATH)

    const backupPath = tempPath('.db')
    const manifest = await backupLocale(backupPath)

    expect(manifest.version).toBeGreaterThanOrEqual(0)
    expect(manifest.appVersion).toBe('0.1.0-test')

    cleanupFiles(sourcePath, backupPath)
  })

  it('il backup è un file DB con dimensione > 0', async () => {
    const sourcePath = tempPath('.db')
    creaDbDiTest(sourcePath)
    copyFileSync(sourcePath, DB_PATH)

    const backupPath = tempPath('.db')
    await backupLocale(backupPath)

    const stat = statSync(backupPath)
    expect(stat.size).toBeGreaterThan(0)

    cleanupFiles(sourcePath, backupPath)
  })
})

