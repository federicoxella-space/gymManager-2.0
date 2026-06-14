import type Database from 'better-sqlite3-multiple-ciphers'
import type { Migration } from '../migrations'

/**
 * B7: il tutore di un minore diventa un riferimento a un cliente registrato.
 * Clean slate: rimuove le colonne free-text tutore_* da clienti e aggiunge tutore_id (FK su clienti.id).
 * I minori esistenti perdono il collegamento (da ri-collegare a mano). Le ricevute già emesse (snapshot) non cambiano.
 */
const migration007: Migration = {
  version: 7,
  description: 'Tutore come cliente collegato: +tutore_id, rimuove colonne tutore_* free-text',

  up(db: Database.Database): void {
    db.exec(`ALTER TABLE clienti ADD COLUMN tutore_id INTEGER REFERENCES clienti(id)`)
    for (const col of [
      'tutore_nome', 'tutore_cognome', 'tutore_cf',
      'tutore_via', 'tutore_civico', 'tutore_citta', 'tutore_provincia', 'tutore_cap'
    ]) {
      db.exec(`ALTER TABLE clienti DROP COLUMN ${col}`)
    }
  },

  down(db: Database.Database): void {
    // Best-effort: ripristina le colonne free-text e rimuove tutore_id.
    for (const col of [
      'tutore_nome', 'tutore_cognome', 'tutore_cf',
      'tutore_via', 'tutore_civico', 'tutore_citta', 'tutore_provincia', 'tutore_cap'
    ]) {
      db.exec(`ALTER TABLE clienti ADD COLUMN ${col} TEXT`)
    }
    db.exec(`ALTER TABLE clienti DROP COLUMN tutore_id`)
  }
}

export default migration007
