import { getDatabase } from './database'
import type { CertificatoRow, CreateCertificatoInput } from '../../types/shared'

export function addCertificato(data: CreateCertificatoInput): CertificatoRow {
  const db = getDatabase()

  const stmt = db.prepare(`
    INSERT INTO certificati_medici (cliente_id, tipo, data_scadenza)
    VALUES (@cliente_id, @tipo, @data_scadenza)
  `)

  const info = stmt.run({
    cliente_id: data.cliente_id,
    tipo: data.tipo,
    data_scadenza: data.data_scadenza
  })

  const created = db
    .prepare('SELECT * FROM certificati_medici WHERE id = ?')
    .get(info.lastInsertRowid) as CertificatoRow | undefined

  if (!created) {
    throw new Error(
      'Errore durante la creazione del certificato: record non trovato dopo INSERT'
    )
  }
  return created
}

export function getUltimoCertificato(clienteId: number): CertificatoRow | null {
  const db = getDatabase()
  const row = db
    .prepare(
      `SELECT * FROM certificati_medici
       WHERE cliente_id = ?
       ORDER BY data_scadenza DESC
       LIMIT 1`
    )
    .get(clienteId)
  return (row as CertificatoRow) ?? null
}

export function listCertificati(clienteId: number): CertificatoRow[] {
  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT * FROM certificati_medici
       WHERE cliente_id = ?
       ORDER BY data_scadenza DESC`
    )
    .all(clienteId)
  return rows as CertificatoRow[]
}
