import { getDatabase } from './database'
import type {
  TipoIscrizioneRow,
  TipoAbbonamentoRow,
  CreateTipoIscrizioneInput,
  UpdateTipoIscrizioneInput,
  CreateTipoAbbonamentoInput,
  UpdateTipoAbbonamentoInput
} from '../../types/shared'

// ── TipoIscrizione ────────────────────────────────────────────────────────────

export function createTipoIscrizione(data: CreateTipoIscrizioneInput): TipoIscrizioneRow {
  const db = getDatabase()

  const stmt = db.prepare(`
    INSERT INTO tipi_iscrizione (nome, descrizione, durata_mesi, prezzo_default)
    VALUES (@nome, @descrizione, @durata_mesi, @prezzo_default)
  `)

  const info = stmt.run({
    nome: data.nome,
    descrizione: data.descrizione ?? null,
    durata_mesi: data.durata_mesi,
    prezzo_default: data.prezzo_default
  })

  const created = getTipoIscrizione(info.lastInsertRowid as number)
  if (!created) {
    throw new Error('Errore durante la creazione del tipo iscrizione: record non trovato dopo INSERT')
  }
  return created
}

export function getTipoIscrizione(id: number): TipoIscrizioneRow | null {
  const db = getDatabase()
  const row = db
    .prepare(
      `SELECT t.*,
              (SELECT COUNT(*) FROM iscrizioni_cliente ic WHERE ic.tipo_iscrizione_id = t.id) AS assegnati_count
       FROM tipi_iscrizione t WHERE t.id = ?`
    )
    .get(id)
  return (row as TipoIscrizioneRow) ?? null
}

export function updateTipoIscrizione(
  id: number,
  data: UpdateTipoIscrizioneInput
): TipoIscrizioneRow {
  const db = getDatabase()

  const COLONNE_ISCRIZIONE = ['nome', 'descrizione', 'durata_mesi', 'prezzo_default', 'stato'] as const
  const fields = (Object.keys(data) as (keyof UpdateTipoIscrizioneInput)[]).filter((f) =>
    (COLONNE_ISCRIZIONE as readonly string[]).includes(f as string)
  )
  if (fields.length === 0) {
    const existing = getTipoIscrizione(id)
    if (!existing) throw new Error(`TipoIscrizione con id ${id} non trovato`)
    return existing
  }

  const setClauses = fields.map((f) => `${f} = @${f}`).join(', ')
  const stmt = db.prepare(`
    UPDATE tipi_iscrizione
    SET ${setClauses}, data_modifica = datetime('now')
    WHERE id = @id
  `)

  stmt.run({ ...data, id })

  const updated = getTipoIscrizione(id)
  if (!updated) throw new Error(`TipoIscrizione con id ${id} non trovato dopo UPDATE`)
  return updated
}

export function listTipiIscrizione(includeNonValidi = false): TipoIscrizioneRow[] {
  const db = getDatabase()

  const where = includeNonValidi ? '' : "WHERE t.stato = 'attivo'"
  const sql = `
    SELECT t.*,
           (SELECT COUNT(*) FROM iscrizioni_cliente ic WHERE ic.tipo_iscrizione_id = t.id) AS assegnati_count
    FROM tipi_iscrizione t
    ${where}
    ORDER BY t.nome
  `
  return db.prepare(sql).all() as TipoIscrizioneRow[]
}

/**
 * Elimina fisicamente un tipo iscrizione.
 * Invariante 4: lancia TIPO_ASSEGNATO se esistono iscrizioni_cliente con quel tipo_iscrizione_id.
 */
export function deleteTipoIscrizione(id: number): void {
  const db = getDatabase()

  const assegnato = db
    .prepare('SELECT 1 FROM iscrizioni_cliente WHERE tipo_iscrizione_id = ? LIMIT 1')
    .get(id)

  if (assegnato) {
    throw new Error('TIPO_ASSEGNATO')
  }

  db.prepare('DELETE FROM tipi_iscrizione WHERE id = ?').run(id)
}

/**
 * Porta il tipo iscrizione allo stato 'non_valido', togliendolo dagli assegnabili
 * ma preservando lo storico.
 */
export function invalidaTipoIscrizione(id: number): void {
  const db = getDatabase()
  db.prepare(`UPDATE tipi_iscrizione SET stato = 'non_valido', data_modifica = datetime('now') WHERE id = ?`).run(id)
}

// ── TipoAbbonamento ───────────────────────────────────────────────────────────

export function createTipoAbbonamento(data: CreateTipoAbbonamentoInput): TipoAbbonamentoRow {
  const db = getDatabase()

  const stmt = db.prepare(`
    INSERT INTO tipi_abbonamento (nome, descrizione, durata_mesi, prezzo_default, categoria, colore)
    VALUES (@nome, @descrizione, @durata_mesi, @prezzo_default, @categoria, @colore)
  `)

  const info = stmt.run({
    nome: data.nome,
    descrizione: data.descrizione ?? null,
    durata_mesi: data.durata_mesi,
    prezzo_default: data.prezzo_default,
    categoria: data.categoria ?? null,
    colore: data.colore ?? '#3B82F6'
  })

  const created = getTipoAbbonamento(info.lastInsertRowid as number)
  if (!created) {
    throw new Error('Errore durante la creazione del tipo abbonamento: record non trovato dopo INSERT')
  }
  return created
}

export function getTipoAbbonamento(id: number): TipoAbbonamentoRow | null {
  const db = getDatabase()
  const row = db
    .prepare(
      `SELECT t.*,
              (SELECT COUNT(*) FROM abbonamenti_cliente ac WHERE ac.tipo_abbonamento_id = t.id) AS assegnati_count
       FROM tipi_abbonamento t WHERE t.id = ?`
    )
    .get(id)
  return (row as TipoAbbonamentoRow) ?? null
}

export function updateTipoAbbonamento(
  id: number,
  data: UpdateTipoAbbonamentoInput
): TipoAbbonamentoRow {
  const db = getDatabase()

  const COLONNE_ABBONAMENTO = ['nome', 'descrizione', 'durata_mesi', 'prezzo_default', 'categoria', 'colore', 'stato'] as const
  const fields = (Object.keys(data) as (keyof UpdateTipoAbbonamentoInput)[]).filter((f) =>
    (COLONNE_ABBONAMENTO as readonly string[]).includes(f as string)
  )
  if (fields.length === 0) {
    const existing = getTipoAbbonamento(id)
    if (!existing) throw new Error(`TipoAbbonamento con id ${id} non trovato`)
    return existing
  }

  const setClauses = fields.map((f) => `${f} = @${f}`).join(', ')
  const stmt = db.prepare(`
    UPDATE tipi_abbonamento
    SET ${setClauses}, data_modifica = datetime('now')
    WHERE id = @id
  `)

  stmt.run({ ...data, id })

  const updated = getTipoAbbonamento(id)
  if (!updated) throw new Error(`TipoAbbonamento con id ${id} non trovato dopo UPDATE`)
  return updated
}

export function listTipiAbbonamento(includeNonValidi = false): TipoAbbonamentoRow[] {
  const db = getDatabase()

  const where = includeNonValidi ? '' : "WHERE t.stato = 'attivo'"
  const sql = `
    SELECT t.*,
           (SELECT COUNT(*) FROM abbonamenti_cliente ac WHERE ac.tipo_abbonamento_id = t.id) AS assegnati_count
    FROM tipi_abbonamento t
    ${where}
    ORDER BY t.nome
  `
  return db.prepare(sql).all() as TipoAbbonamentoRow[]
}

/**
 * Elimina fisicamente un tipo abbonamento.
 * Invariante 4: lancia TIPO_ASSEGNATO se esistono abbonamenti_cliente con quel tipo_abbonamento_id.
 */
export function deleteTipoAbbonamento(id: number): void {
  const db = getDatabase()

  const assegnato = db
    .prepare('SELECT 1 FROM abbonamenti_cliente WHERE tipo_abbonamento_id = ? LIMIT 1')
    .get(id)

  if (assegnato) {
    throw new Error('TIPO_ASSEGNATO')
  }

  db.prepare('DELETE FROM tipi_abbonamento WHERE id = ?').run(id)
}

/**
 * Porta il tipo abbonamento allo stato 'non_valido'.
 */
export function invalidaTipoAbbonamento(id: number): void {
  const db = getDatabase()
  db.prepare(`UPDATE tipi_abbonamento SET stato = 'non_valido', data_modifica = datetime('now') WHERE id = ?`).run(id)
}
