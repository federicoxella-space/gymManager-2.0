import type Database from 'better-sqlite3'
import type { Migration } from '../migrations'

const migration003: Migration = {
  version: 3,
  description: 'Creazione tabelle catalogo (tipi_iscrizione, tipi_abbonamento) e associazioni cliente (iscrizioni_cliente, abbonamenti_cliente)',

  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tipi_iscrizione (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        descrizione TEXT,
        durata_mesi INTEGER NOT NULL DEFAULT 12,
        prezzo_default REAL NOT NULL DEFAULT 0,
        stato TEXT NOT NULL DEFAULT 'attivo',
        data_inserimento TEXT NOT NULL DEFAULT (datetime('now')),
        data_modifica TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS tipi_abbonamento (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        descrizione TEXT,
        durata_mesi INTEGER NOT NULL DEFAULT 1,
        prezzo_default REAL NOT NULL DEFAULT 0,
        categoria TEXT,
        colore TEXT NOT NULL DEFAULT '#3B82F6',
        stato TEXT NOT NULL DEFAULT 'attivo',
        data_inserimento TEXT NOT NULL DEFAULT (datetime('now')),
        data_modifica TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS iscrizioni_cliente (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL REFERENCES clienti(id),
        tipo_iscrizione_id INTEGER NOT NULL REFERENCES tipi_iscrizione(id),
        data_inizio TEXT NOT NULL,
        data_scadenza TEXT NOT NULL,
        prezzo REAL NOT NULL,
        stato_pagamento TEXT NOT NULL DEFAULT 'da_incassare',
        metodo_pagamento TEXT,
        stato TEXT NOT NULL DEFAULT 'attiva',
        note TEXT,
        data_inserimento TEXT NOT NULL DEFAULT (datetime('now')),
        data_modifica TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS abbonamenti_cliente (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL REFERENCES clienti(id),
        tipo_abbonamento_id INTEGER NOT NULL REFERENCES tipi_abbonamento(id),
        data_inizio TEXT NOT NULL,
        data_scadenza TEXT NOT NULL,
        prezzo REAL NOT NULL,
        stato_pagamento TEXT NOT NULL DEFAULT 'da_incassare',
        metodo_pagamento TEXT,
        stato TEXT NOT NULL DEFAULT 'attivo',
        note TEXT,
        data_inserimento TEXT NOT NULL DEFAULT (datetime('now')),
        data_modifica TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  },

  down(db: Database.Database): void {
    db.exec(`DROP TABLE IF EXISTS abbonamenti_cliente`)
    db.exec(`DROP TABLE IF EXISTS iscrizioni_cliente`)
    db.exec(`DROP TABLE IF EXISTS tipi_abbonamento`)
    db.exec(`DROP TABLE IF EXISTS tipi_iscrizione`)
  }
}

export default migration003
