import type Database from 'better-sqlite3'
import type { Migration } from '../migrations'

const migration002: Migration = {
  version: 2,
  description: 'Creazione tabelle clienti e certificati_medici',

  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS clienti (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_tessera TEXT UNIQUE,
        nome TEXT NOT NULL,
        cognome TEXT NOT NULL,
        codice_fiscale TEXT NOT NULL UNIQUE,
        data_nascita TEXT,
        sesso TEXT,
        comune_nascita TEXT,
        via TEXT,
        civico TEXT,
        citta TEXT,
        provincia TEXT,
        cap TEXT,
        email TEXT,
        telefono TEXT,
        note TEXT,
        tutore_nome TEXT,
        tutore_cognome TEXT,
        tutore_cf TEXT,
        tutore_via TEXT,
        tutore_civico TEXT,
        tutore_citta TEXT,
        tutore_provincia TEXT,
        tutore_cap TEXT,
        stato TEXT NOT NULL DEFAULT 'attivo',
        data_inserimento TEXT NOT NULL DEFAULT (date('now')),
        data_modifica TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS certificati_medici (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL REFERENCES clienti(id),
        tipo TEXT NOT NULL,
        data_scadenza TEXT NOT NULL,
        data_inserimento TEXT NOT NULL DEFAULT (date('now'))
      )
    `)
  },

  down(db: Database.Database): void {
    db.exec(`DROP TABLE IF EXISTS certificati_medici`)
    db.exec(`DROP TABLE IF EXISTS clienti`)
  }
}

export default migration002
