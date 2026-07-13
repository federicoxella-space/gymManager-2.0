import type Database from 'better-sqlite3-multiple-ciphers'
import type { Migration } from '../migrations'

/**
 * Invariante 6: il numero iniziale ricevute (`receipt_start_number`) vale solo
 * per l'anno per cui l'utente lo ha impostato. Introduciamo la chiave
 * `receipt_start_number_year` per ancorarlo a un anno preciso, così un valore
 * residuo non "trabocca" sull'anno successivo (che deve ripartire da 1).
 *
 * Retro-compatibilità: se un'installazione esistente ha già un numero iniziale
 * personalizzato (> 1), lo si considera riferito all'anno corrente al momento
 * dell'aggiornamento, per non perdere l'intento di adozione dell'utente.
 */
const migration008: Migration = {
  version: 8,
  description: 'Ancoraggio del numero iniziale ricevute a un anno (receipt_start_number_year)',

  up(db: Database.Database): void {
    db.prepare(
      `INSERT OR IGNORE INTO app_settings (key, value) VALUES ('receipt_start_number_year', '0')`
    ).run()

    const startRow = db
      .prepare(`SELECT value FROM app_settings WHERE key = 'receipt_start_number'`)
      .get() as { value: string } | undefined
    const start = startRow ? parseInt(startRow.value, 10) : 1

    if (!Number.isNaN(start) && start > 1) {
      db.prepare(
        `UPDATE app_settings SET value = strftime('%Y', 'now')
         WHERE key = 'receipt_start_number_year'`
      ).run()
    }
  },

  down(db: Database.Database): void {
    db.prepare(`DELETE FROM app_settings WHERE key = 'receipt_start_number_year'`).run()
  }
}

export default migration008
