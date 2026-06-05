import type Database from 'better-sqlite3'
import type { Migration } from '../migrations'

const migration004: Migration = {
  version: 4,
  description: 'Creazione tabelle ricevute e righe_ricevuta',

  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ricevute (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero INTEGER NOT NULL,
        anno INTEGER NOT NULL,
        data_emissione TEXT NOT NULL,
        cliente_id INTEGER NOT NULL REFERENCES clienti(id),
        intestatario_nome TEXT NOT NULL,
        intestatario_cognome TEXT NOT NULL,
        intestatario_cf TEXT NOT NULL,
        intestatario_via TEXT,
        intestatario_civico TEXT,
        intestatario_citta TEXT,
        intestatario_provincia TEXT,
        intestatario_cap TEXT,
        tutore_nome TEXT,
        tutore_cognome TEXT,
        tutore_cf TEXT,
        totale REAL NOT NULL,
        metodo_pagamento TEXT NOT NULL,
        stato_pagamento TEXT NOT NULL DEFAULT 'pagato',
        dicitura_pie TEXT,
        stato TEXT NOT NULL DEFAULT 'emessa',
        data_annullamento TEXT,
        data_emissione_sistema TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(numero, anno)
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS righe_ricevuta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ricevuta_id INTEGER NOT NULL REFERENCES ricevute(id),
        tipo TEXT NOT NULL,
        riferimento_id INTEGER,
        descrizione TEXT NOT NULL,
        data_inizio TEXT,
        data_fine TEXT,
        prezzo REAL NOT NULL,
        ordine INTEGER NOT NULL DEFAULT 0
      )
    `)
  },

  down(db: Database.Database): void {
    db.exec(`DROP TABLE IF EXISTS righe_ricevuta`)
    db.exec(`DROP TABLE IF EXISTS ricevute`)
  }
}

export default migration004
