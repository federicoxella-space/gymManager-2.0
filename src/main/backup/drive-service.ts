/**
 * STUB: Google Drive integration — richiede credenziali OAuth (vedi BLOCKERS.md B2)
 *
 * Le funzioni restituiscono errori informativi fino alla configurazione delle credenziali.
 *
 * Per attivare:
 * - Inserire Client ID e Client Secret nelle variabili d'ambiente
 *   GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.
 * - Implementare il flusso OAuth (authorization code → token exchange) in questo file.
 * - Rimuovere i blocchi STUB e collegare googleapis con scope 'drive.file'.
 */

export interface DriveBackupItem {
  id: string
  nome: string
  createdAt: string
  size: number
}

const STUB_ERROR = 'DRIVE_NOT_CONFIGURED'

/**
 * STUB: avvia la connessione a Google Drive tramite OAuth.
 * Lancia Error('DRIVE_NOT_CONFIGURED') finché le credenziali non sono configurate.
 */
export async function connectDrive(_authCode?: string): Promise<void> {
  throw new Error(STUB_ERROR)
}

/**
 * STUB: indica se Google Drive è connesso.
 * Restituisce sempre false finché le credenziali non sono configurate.
 */
export function isDriveConnected(): boolean {
  return false
}

/**
 * STUB: carica un file di backup su Google Drive.
 * Lancia Error('DRIVE_NOT_CONFIGURED') finché le credenziali non sono configurate.
 *
 * @param _backupPath - Percorso locale del file di backup
 * @returns ID del file su Google Drive
 */
export async function backupSuDrive(_backupPath: string): Promise<string> {
  throw new Error(STUB_ERROR)
}

/**
 * STUB: ripristina un file di backup da Google Drive.
 * Lancia Error('DRIVE_NOT_CONFIGURED') finché le credenziali non sono configurate.
 *
 * @param _fileId - ID del file su Google Drive
 * @param _destinazionePath - Percorso locale di destinazione
 */
export async function ripristinaDaDrive(_fileId: string, _destinazionePath: string): Promise<void> {
  throw new Error(STUB_ERROR)
}

/**
 * STUB: elenca i backup presenti su Google Drive.
 * Lancia Error('DRIVE_NOT_CONFIGURED') finché le credenziali non sono configurate.
 */
export async function listBackupDrive(): Promise<DriveBackupItem[]> {
  throw new Error(STUB_ERROR)
}
