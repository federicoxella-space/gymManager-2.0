import type Database from 'better-sqlite3-multiple-ciphers'
import type { Migration } from '../migrations'

const migration001: Migration = {
  version: 1,
  description: 'Creazione tabella app_settings con valori di default',

  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    const insert = db.prepare(
      `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`
    )

    const defaults: [string, string][] = [
      ['theme', 'system'],
      ['language', 'it'],
      ['primary_color', '59,130,246'],
      ['receipt_start_number', '1'],
      ['expiry_warning_days_certificates', '30'],
      ['expiry_warning_days_memberships', '30'],
      ['expiry_warning_days_subscriptions', '30'],
      ['backup_on_close', 'true'],
      ['dashboard_widgets', '["expiring_certs","expiring_memberships","active_members","revenue"]']
    ]

    for (const [key, value] of defaults) {
      insert.run(key, value)
    }
  },

  down(db: Database.Database): void {
    db.exec(`DROP TABLE IF EXISTS app_settings`)
  }
}

export default migration001
