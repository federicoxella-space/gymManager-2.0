import { getDatabase } from './database'
import type {
  IscrizioneClienteRow,
  AbbonamentoClienteRow,
  AssegnaIscrizioneInput,
  AssegnaAbbonamentoInput
} from '../../types/shared'

// ── Iscrizioni cliente ────────────────────────────────────────────────────────

/**
 * Assegna una nuova iscrizione a un cliente.
 * Invariante 1: lancia ISCRIZIONE_GIA_ATTIVA se il cliente ha già un'iscrizione attiva.
 */
export function assegnaIscrizione(data: AssegnaIscrizioneInput): IscrizioneClienteRow {
  const db = getDatabase()

  const attiva = getIscrizioneAttiva(data.cliente_id)
  if (attiva) {
    throw new Error('ISCRIZIONE_GIA_ATTIVA')
  }

  const stmt = db.prepare(`
    INSERT INTO iscrizioni_cliente (
      cliente_id, tipo_iscrizione_id,
      data_inizio, data_scadenza,
      prezzo, stato_pagamento, metodo_pagamento,
      note
    ) VALUES (
      @cliente_id, @tipo_iscrizione_id,
      @data_inizio, @data_scadenza,
      @prezzo, @stato_pagamento, @metodo_pagamento,
      @note
    )
  `)

  const info = stmt.run({
    cliente_id: data.cliente_id,
    tipo_iscrizione_id: data.tipo_iscrizione_id,
    data_inizio: data.data_inizio,
    data_scadenza: data.data_scadenza,
    prezzo: data.prezzo,
    stato_pagamento: data.stato_pagamento,
    metodo_pagamento: data.metodo_pagamento ?? null,
    note: data.note ?? null
  })

  const created = db
    .prepare('SELECT * FROM iscrizioni_cliente WHERE id = ?')
    .get(info.lastInsertRowid) as IscrizioneClienteRow | undefined

  if (!created) {
    throw new Error('Errore durante la creazione dell\'iscrizione: record non trovato dopo INSERT')
  }
  return created
}

/**
 * Restituisce l'iscrizione attiva del cliente, se presente.
 */
export function getIscrizioneAttiva(clienteId: number): IscrizioneClienteRow | null {
  const db = getDatabase()
  const row = db
    .prepare("SELECT * FROM iscrizioni_cliente WHERE cliente_id = ? AND stato = 'attiva'")
    .get(clienteId)
  return (row as IscrizioneClienteRow) ?? null
}

/**
 * Restituisce tutte le iscrizioni del cliente ordinate per data_inizio DESC.
 */
export function listIscrizioni(clienteId: number): IscrizioneClienteRow[] {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT * FROM iscrizioni_cliente WHERE cliente_id = ? ORDER BY data_inizio DESC')
    .all(clienteId)
  return rows as IscrizioneClienteRow[]
}

/**
 * Aggiorna le date di un'iscrizione ricalcolando lo stato.
 * Se le nuove date produrrebbero una seconda iscrizione attiva, lancia ISCRIZIONE_GIA_ATTIVA.
 */
export function updateIscrizioneDate(
  id: number,
  dataInizio: string,
  dataScadenza: string
): IscrizioneClienteRow {
  const db = getDatabase()

  const corrente = db
    .prepare('SELECT cliente_id, stato FROM iscrizioni_cliente WHERE id = ?')
    .get(id) as { cliente_id: number; stato: 'attiva' | 'scaduta' | 'invalidata' } | undefined
  if (!corrente) throw new Error(`Iscrizione con id ${id} non trovata`)

  const today = new Date().toISOString().slice(0, 10)
  // N1: un'iscrizione invalidata non viene riportata in vita dalla modifica delle date.
  const nuovoStato: 'attiva' | 'scaduta' | 'invalidata' =
    corrente.stato === 'invalidata'
      ? 'invalidata'
      : dataScadenza < today
        ? 'scaduta'
        : 'attiva'

  // N2: check invariante 1 + UPDATE nella stessa transazione immediata (write-lock all'avvio
  // della transazione). La lettura di `corrente` resta fuori transazione, coerente con il pattern
  // di assegnaIscrizione; accettabile nell'app desktop monoprocesso (SQLite serializza le scritture).
  const esegui = db.transaction(() => {
    if (nuovoStato === 'attiva') {
      const altraAttiva = db
        .prepare(
          "SELECT id FROM iscrizioni_cliente WHERE cliente_id = ? AND stato = 'attiva' AND id != ?"
        )
        .get(corrente.cliente_id, id)
      if (altraAttiva) {
        throw new Error('ISCRIZIONE_GIA_ATTIVA')
      }
    }

    db.prepare(`
      UPDATE iscrizioni_cliente
      SET data_inizio = ?, data_scadenza = ?, stato = ?, data_modifica = datetime('now')
      WHERE id = ?
    `).run(dataInizio, dataScadenza, nuovoStato, id)
  })
  esegui.immediate()

  const updated = db
    .prepare('SELECT * FROM iscrizioni_cliente WHERE id = ?')
    .get(id) as IscrizioneClienteRow | undefined

  if (!updated) throw new Error(`Iscrizione con id ${id} non trovata dopo UPDATE`)
  return updated
}

/**
 * Porta l'iscrizione allo stato 'invalidata'.
 */
export function invalidaIscrizione(id: number): IscrizioneClienteRow {
  const db = getDatabase()

  db.prepare(`
    UPDATE iscrizioni_cliente
    SET stato = 'invalidata', data_modifica = datetime('now')
    WHERE id = ?
  `).run(id)

  const updated = db
    .prepare('SELECT * FROM iscrizioni_cliente WHERE id = ?')
    .get(id) as IscrizioneClienteRow | undefined

  if (!updated) throw new Error(`Iscrizione con id ${id} non trovata dopo UPDATE`)
  return updated
}

/**
 * Aggiorna in batch le iscrizioni scadute:
 * porta a 'scaduta' tutte le iscrizioni 'attiva' con data_scadenza precedente a oggi.
 */
export function aggiornaStatoIscrizioni(): void {
  const db = getDatabase()
  db.prepare(`
    UPDATE iscrizioni_cliente
    SET stato = 'scaduta', data_modifica = datetime('now')
    WHERE stato = 'attiva' AND data_scadenza < date('now')
  `).run()
}

// ── Abbonamenti cliente ───────────────────────────────────────────────────────

/**
 * Assegna un nuovo abbonamento a un cliente.
 * Invariante 2: lancia NESSUNA_ISCRIZIONE_ATTIVA se il cliente non ha un'iscrizione attiva.
 * Non blocca se l'abbonamento supera la scadenza dell'iscrizione (segnalazione gestita dal domain).
 */
export function assegnaAbbonamento(data: AssegnaAbbonamentoInput): AbbonamentoClienteRow {
  const db = getDatabase()

  const iscrizioneAttiva = getIscrizioneAttiva(data.cliente_id)
  if (!iscrizioneAttiva) {
    throw new Error('NESSUNA_ISCRIZIONE_ATTIVA')
  }

  const stmt = db.prepare(`
    INSERT INTO abbonamenti_cliente (
      cliente_id, tipo_abbonamento_id,
      data_inizio, data_scadenza,
      prezzo, stato_pagamento, metodo_pagamento,
      note
    ) VALUES (
      @cliente_id, @tipo_abbonamento_id,
      @data_inizio, @data_scadenza,
      @prezzo, @stato_pagamento, @metodo_pagamento,
      @note
    )
  `)

  const info = stmt.run({
    cliente_id: data.cliente_id,
    tipo_abbonamento_id: data.tipo_abbonamento_id,
    data_inizio: data.data_inizio,
    data_scadenza: data.data_scadenza,
    prezzo: data.prezzo,
    stato_pagamento: data.stato_pagamento,
    metodo_pagamento: data.metodo_pagamento ?? null,
    note: data.note ?? null
  })

  const created = db
    .prepare('SELECT * FROM abbonamenti_cliente WHERE id = ?')
    .get(info.lastInsertRowid) as AbbonamentoClienteRow | undefined

  if (!created) {
    throw new Error('Errore durante la creazione dell\'abbonamento: record non trovato dopo INSERT')
  }
  return created
}

/**
 * Restituisce un abbonamento per id.
 */
export function getAbbonamento(id: number): AbbonamentoClienteRow | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM abbonamenti_cliente WHERE id = ?').get(id)
  return (row as AbbonamentoClienteRow) ?? null
}

/**
 * Restituisce gli abbonamenti di un cliente.
 * Se soloAttivi=true, filtra per stato='attivo'.
 */
export function listAbbonamenti(clienteId: number, soloAttivi = false): AbbonamentoClienteRow[] {
  const db = getDatabase()

  const sql = soloAttivi
    ? "SELECT * FROM abbonamenti_cliente WHERE cliente_id = ? AND stato = 'attivo' ORDER BY data_inizio DESC"
    : 'SELECT * FROM abbonamenti_cliente WHERE cliente_id = ? ORDER BY data_inizio DESC'

  return db.prepare(sql).all(clienteId) as AbbonamentoClienteRow[]
}

/**
 * Aggiorna le date di un abbonamento ricalcolando lo stato.
 */
export function updateAbbonamentoDate(
  id: number,
  dataInizio: string,
  dataScadenza: string
): AbbonamentoClienteRow {
  const db = getDatabase()

  const corrente = db
    .prepare('SELECT stato FROM abbonamenti_cliente WHERE id = ?')
    .get(id) as { stato: 'attivo' | 'scaduto' | 'invalidato' } | undefined
  if (!corrente) throw new Error(`Abbonamento con id ${id} non trovato`)

  const today = new Date().toISOString().slice(0, 10)
  // N1: un abbonamento invalidato non viene riportato in vita dalla modifica delle date.
  const nuovoStato: 'attivo' | 'scaduto' | 'invalidato' =
    corrente.stato === 'invalidato'
      ? 'invalidato'
      : dataScadenza < today
        ? 'scaduto'
        : 'attivo'

  db.prepare(`
    UPDATE abbonamenti_cliente
    SET data_inizio = ?, data_scadenza = ?, stato = ?, data_modifica = datetime('now')
    WHERE id = ?
  `).run(dataInizio, dataScadenza, nuovoStato, id)

  const updated = db
    .prepare('SELECT * FROM abbonamenti_cliente WHERE id = ?')
    .get(id) as AbbonamentoClienteRow | undefined

  if (!updated) throw new Error(`Abbonamento con id ${id} non trovato dopo UPDATE`)
  return updated
}

/**
 * Porta l'abbonamento allo stato 'invalidato'.
 */
export function invalidaAbbonamento(id: number): AbbonamentoClienteRow {
  const db = getDatabase()

  db.prepare(`
    UPDATE abbonamenti_cliente
    SET stato = 'invalidato', data_modifica = datetime('now')
    WHERE id = ?
  `).run(id)

  const updated = db
    .prepare('SELECT * FROM abbonamenti_cliente WHERE id = ?')
    .get(id) as AbbonamentoClienteRow | undefined

  if (!updated) throw new Error(`Abbonamento con id ${id} non trovato dopo UPDATE`)
  return updated
}

/**
 * Aggiorna in batch gli abbonamenti scaduti:
 * porta a 'scaduto' tutti gli abbonamenti 'attivo' con data_scadenza precedente a oggi.
 */
export function aggiornaStatoAbbonamenti(): void {
  const db = getDatabase()
  db.prepare(`
    UPDATE abbonamenti_cliente
    SET stato = 'scaduto', data_modifica = datetime('now')
    WHERE stato = 'attivo' AND data_scadenza < date('now')
  `).run()
}
