import type Database from 'better-sqlite3'
import type { Migration } from '../migrations'

/**
 * Migrazione di test per verificare il percorso di aggiornamento (F6).
 * Aggiunge una colonna 'note_interne' alla tabella clienti (opzionale, nullable).
 */
const migration005: Migration = {
  version: 5,
  description: 'Aggiunge note_interne a clienti (test migrazione F6)',

  up(db: Database.Database): void {
    db.exec(`ALTER TABLE clienti ADD COLUMN note_interne TEXT`)
  },

  down(db: Database.Database): void {
    // SQLite non supporta DROP COLUMN in modo diretto nelle versioni < 3.35.
    // Per questa migrazione di test il down è un no-op documentato.
    // In uno scenario reale si ricreerebbe la tabella senza la colonna.
    db.exec(`SELECT 1`) // no-op
  }
}

export default migration005
