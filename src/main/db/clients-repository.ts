import { getDatabase } from './database'
import type {
  ClienteRow,
  CreateClienteInput,
  UpdateClienteInput,
  ClientiFilters
} from '../../types/shared'

export function getNextNumeroTessera(): string {
  const db = getDatabase()
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(CAST(numero_tessera AS INTEGER)), 0) + 1 AS next
       FROM clienti
       WHERE numero_tessera GLOB '[0-9]*'`
    )
    .get() as { next: number }
  return String(row.next)
}

export function createCliente(data: CreateClienteInput): ClienteRow {
  const db = getDatabase()

  let newId!: number

  const esegui = db.transaction(() => {
    const numeroTessera = data.numero_tessera ?? getNextNumeroTessera()

    const stmt = db.prepare(`
      INSERT INTO clienti (
        numero_tessera, nome, cognome, codice_fiscale,
        data_nascita, sesso, comune_nascita,
        via, civico, citta, provincia, cap,
        email, telefono, note,
        tutore_nome, tutore_cognome, tutore_cf,
        tutore_via, tutore_civico, tutore_citta, tutore_provincia, tutore_cap
      ) VALUES (
        @numero_tessera, @nome, @cognome, @codice_fiscale,
        @data_nascita, @sesso, @comune_nascita,
        @via, @civico, @citta, @provincia, @cap,
        @email, @telefono, @note,
        @tutore_nome, @tutore_cognome, @tutore_cf,
        @tutore_via, @tutore_civico, @tutore_citta, @tutore_provincia, @tutore_cap
      )
    `)

    const info = stmt.run({
      numero_tessera: numeroTessera,
      nome: data.nome,
      cognome: data.cognome,
      codice_fiscale: data.codice_fiscale,
      data_nascita: data.data_nascita ?? null,
      sesso: data.sesso ?? null,
      comune_nascita: data.comune_nascita ?? null,
      via: data.via ?? null,
      civico: data.civico ?? null,
      citta: data.citta ?? null,
      provincia: data.provincia ?? null,
      cap: data.cap ?? null,
      email: data.email ?? null,
      telefono: data.telefono ?? null,
      note: data.note ?? null,
      tutore_nome: data.tutore_nome ?? null,
      tutore_cognome: data.tutore_cognome ?? null,
      tutore_cf: data.tutore_cf ?? null,
      tutore_via: data.tutore_via ?? null,
      tutore_civico: data.tutore_civico ?? null,
      tutore_citta: data.tutore_citta ?? null,
      tutore_provincia: data.tutore_provincia ?? null,
      tutore_cap: data.tutore_cap ?? null
    })

    newId = info.lastInsertRowid as number
  })

  try {
    esegui.immediate()
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed:\s*clienti\.numero_tessera/i.test(err.message)) {
      throw new Error('NUMERO_TESSERA_DUPLICATO')
    }
    throw err
  }

  const created = getCliente(newId)
  if (!created) {
    throw new Error('Errore durante la creazione del cliente: record non trovato dopo INSERT')
  }
  return created
}

export function getCliente(id: number): ClienteRow | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM clienti WHERE id = ?').get(id)
  return (row as ClienteRow) ?? null
}

export function getClienteByCodiceFiscale(cf: string): ClienteRow | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM clienti WHERE codice_fiscale = ?').get(cf)
  return (row as ClienteRow) ?? null
}

export function updateCliente(id: number, data: UpdateClienteInput): ClienteRow {
  const db = getDatabase()

  const fields = Object.keys(data) as (keyof UpdateClienteInput)[]
  if (fields.length === 0) {
    const existing = getCliente(id)
    if (!existing) throw new Error(`Cliente con id ${id} non trovato`)
    return existing
  }

  const setClauses = fields.map((f) => `${f} = @${f}`).join(', ')
  const stmt = db.prepare(`
    UPDATE clienti
    SET ${setClauses}, data_modifica = datetime('now')
    WHERE id = @id
  `)

  stmt.run({ ...data, id })

  const updated = getCliente(id)
  if (!updated) throw new Error(`Cliente con id ${id} non trovato dopo UPDATE`)
  return updated
}

export function listClienti(filters?: ClientiFilters, giorniPreavvisoCert = 30): ClienteRow[] {
  const db = getDatabase()

  const stato = filters?.stato ?? 'attivo'
  const search = filters?.search ? `%${filters.search}%` : null
  const limit = filters?.limit ?? -1
  const offset = filters?.offset ?? 0

  // Clausole WHERE dinamiche per i nuovi filtri
  const extraWhere: string[] = []
  const extraParams: unknown[] = []

  if (filters?.stato_iscrizione === 'attiva') {
    extraWhere.push(
      `EXISTS (SELECT 1 FROM iscrizioni_cliente WHERE cliente_id = c.id AND stato = 'attiva')`
    )
  } else if (filters?.stato_iscrizione === 'scaduta') {
    extraWhere.push(
      `EXISTS (SELECT 1 FROM iscrizioni_cliente WHERE cliente_id = c.id AND stato = 'scaduta')
       AND NOT EXISTS (SELECT 1 FROM iscrizioni_cliente WHERE cliente_id = c.id AND stato = 'attiva')`
    )
  } else if (filters?.stato_iscrizione === 'assente') {
    extraWhere.push(
      `NOT EXISTS (SELECT 1 FROM iscrizioni_cliente WHERE cliente_id = c.id)`
    )
  }

  if (filters?.stato_certificato === 'scaduto') {
    extraWhere.push(
      `cm.data_scadenza IS NOT NULL AND julianday(cm.data_scadenza) < julianday('now')`
    )
  } else if (filters?.stato_certificato === 'in_scadenza') {
    extraWhere.push(
      `cm.data_scadenza IS NOT NULL AND julianday(cm.data_scadenza) - julianday('now') BETWEEN 0 AND ?`
    )
    extraParams.push(giorniPreavvisoCert)
  } else if (filters?.stato_certificato === 'valido') {
    extraWhere.push(
      `cm.data_scadenza IS NOT NULL AND julianday(cm.data_scadenza) - julianday('now') > ?`
    )
    extraParams.push(giorniPreavvisoCert)
  }

  if (filters?.tipo_abbonamento_id !== undefined) {
    extraWhere.push(
      `EXISTS (SELECT 1 FROM abbonamenti_cliente WHERE cliente_id = c.id AND tipo_abbonamento_id = ? AND stato = 'attivo')`
    )
    extraParams.push(filters.tipo_abbonamento_id)
  }

  const extraWhereStr = extraWhere.length > 0 ? `AND ${extraWhere.join(' AND ')}` : ''

  const rows = db
    .prepare(
      `
    SELECT c.*,
      cm.data_scadenza AS cert_scadenza,
      cm.tipo AS cert_tipo,
      ic.stato AS iscrizione_stato,
      ic.data_scadenza AS iscrizione_scadenza,
      COALESCE(ac.cnt, 0) AS abbonamenti_attivi_count
    FROM clienti c
    LEFT JOIN (
      SELECT cliente_id, data_scadenza, tipo,
        ROW_NUMBER() OVER (PARTITION BY cliente_id ORDER BY data_scadenza DESC) AS rn
      FROM certificati_medici
    ) cm ON cm.cliente_id = c.id AND cm.rn = 1
    LEFT JOIN (
      SELECT cliente_id, stato, data_scadenza
      FROM iscrizioni_cliente
      WHERE stato = 'attiva'
    ) ic ON ic.cliente_id = c.id
    LEFT JOIN (
      SELECT cliente_id, COUNT(*) AS cnt
      FROM abbonamenti_cliente
      WHERE stato = 'attivo'
      GROUP BY cliente_id
    ) ac ON ac.cliente_id = c.id
    WHERE c.stato = ?
      AND (? IS NULL OR c.nome LIKE ? OR c.cognome LIKE ? OR c.codice_fiscale LIKE ?)
      ${extraWhereStr}
    LIMIT ? OFFSET ?
  `
    )
    .all(stato, search, search, search, search, ...extraParams, limit, offset)

  return rows as ClienteRow[]
}

export function anonimizzaCliente(id: number): void {
  const db = getDatabase()

  // Legge il record prima di agire: verifica esistenza e stato corrente.
  const existing = db
    .prepare('SELECT stato FROM clienti WHERE id = ?')
    .get(id) as { stato: string } | undefined

  if (!existing) {
    throw new Error('CLIENTE_NOT_FOUND')
  }

  if (existing.stato === 'anonimizzato') {
    throw new Error('CLIENTE_GIA_ANONIMIZZATO')
  }

  const stmt = db.prepare(`
    UPDATE clienti SET
      nome = 'ANONIMIZZATO',
      cognome = 'ANONIMIZZATO',
      codice_fiscale = 'ANON-' || id,
      data_nascita = NULL,
      sesso = NULL,
      comune_nascita = NULL,
      via = NULL,
      civico = NULL,
      citta = NULL,
      provincia = NULL,
      cap = NULL,
      email = NULL,
      telefono = NULL,
      note = NULL,
      tutore_nome = NULL,
      tutore_cognome = NULL,
      tutore_cf = NULL,
      tutore_via = NULL,
      tutore_civico = NULL,
      tutore_citta = NULL,
      tutore_provincia = NULL,
      tutore_cap = NULL,
      stato = 'anonimizzato',
      data_modifica = datetime('now')
    WHERE id = ?
  `)

  const info = stmt.run(id)
  if (info.changes !== 1) {
    throw new Error(`Impossibile anonimizzare il cliente con id ${id}: nessuna riga aggiornata`)
  }
}
