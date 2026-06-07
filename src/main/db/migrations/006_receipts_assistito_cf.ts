import type Database from 'better-sqlite3-multiple-ciphers'
import type { Migration } from '../migrations'

/**
 * Aggiunge la colonna assistito_cf alla tabella ricevute.
 * Necessaria per la dicitura "Tutore di [CF del minore]" sulle ricevute
 * intestate al tutore: intestatario_cf contiene il CF del tutore,
 * assistito_cf contiene il CF del minore assistito.
 */
const migration006: Migration = {
  version: 6,
  description: 'Aggiunge assistito_cf a ricevute per la dicitura tutore',

  up(db: Database.Database): void {
    db.exec(`ALTER TABLE ricevute ADD COLUMN assistito_cf TEXT`)
  },

  down(db: Database.Database): void {
    // SQLite non supporta DROP COLUMN; no-op documentato
    db.exec(`SELECT 1`)
  }
}

export default migration006
