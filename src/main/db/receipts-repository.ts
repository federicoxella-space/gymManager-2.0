import { getDatabase } from './database'
import { isMinorenne } from '../domain/cliente'
import type {
  RicevutaRow,
  RigaRicevutaRow,
  RicevutaConRighe,
  VocePagabile,
  RicevutaFilters,
  CreaRicevutaInput,
  CreaRigaInput
} from '../../types/shared'

// Re-esporta per chi importa dal repository (pattern esistente nel progetto)
export type { RicevutaRow, RigaRicevutaRow, RicevutaConRighe, VocePagabile, RicevutaFilters }

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Legge il numero iniziale ricevute da app_settings (default 1). */
function getReceiptStartNumber(): number {
  const db = getDatabase()
  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = 'receipt_start_number'`)
    .get() as { value: string } | undefined
  const n = row ? parseInt(row.value, 10) : 1
  return isNaN(n) || n < 1 ? 1 : n
}

/** Recupera le righe di una ricevuta. */
function getRighe(ricevutaId: number): RigaRicevutaRow[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM righe_ricevuta WHERE ricevuta_id = ? ORDER BY ordine ASC, id ASC')
    .all(ricevutaId) as RigaRicevutaRow[]
}

// ── Funzioni esportate ────────────────────────────────────────────────────────

/**
 * Crea una nuova ricevuta.
 * Invariante 6: il numero progressivo è assegnato in transazione atomica,
 * snapshot intestatario copiato dal cliente, voci marchiate 'pagato' se pagato.
 */
export function creaRicevuta(input: CreaRicevutaInput): RicevutaConRighe {
  const db = getDatabase()

  // Legge il cliente per lo snapshot intestatario
  const cliente = db
    .prepare(
      'SELECT id, nome, cognome, codice_fiscale, data_nascita, stato, via, civico, citta, provincia, cap,' +
        ' tutore_nome, tutore_cognome, tutore_cf, tutore_via, tutore_civico, tutore_citta, tutore_provincia, tutore_cap' +
        ' FROM clienti WHERE id = ?'
    )
    .get(input.clienteId) as
    | {
        id: number
        stato: 'attivo' | 'anonimizzato'
        nome: string
        cognome: string
        codice_fiscale: string
        data_nascita: string | null
        via: string | null
        civico: string | null
        citta: string | null
        provincia: string | null
        cap: string | null
        tutore_nome: string | null
        tutore_cognome: string | null
        tutore_cf: string | null
        tutore_via: string | null
        tutore_civico: string | null
        tutore_citta: string | null
        tutore_provincia: string | null
        tutore_cap: string | null
      }
    | undefined

  if (!cliente) {
    throw new Error('CLIENTE_NOT_FOUND')
  }

  // A10: nessuna nuova emissione a clienti anonimizzati (invariante 7).
  if (cliente.stato !== 'attivo') {
    throw new Error('CLIENTE_ANONIMIZZATO')
  }

  // A9: almeno una riga
  if (!input.righe || input.righe.length === 0) {
    throw new Error('RICEVUTA_SENZA_RIGHE')
  }

  // A9: ogni riga con riferimento a iscrizione/abbonamento deve appartenere a questo cliente.
  // Le righe di tipo 'libera' non hanno un riferimento strutturato: anche se riferimentoId
  // fosse impostato, non corrisponde a un'entità validabile e viene ignorato.
  const checkIscrizione = db.prepare(
    'SELECT 1 FROM iscrizioni_cliente WHERE id = ? AND cliente_id = ?'
  )
  const checkAbbonamento = db.prepare(
    'SELECT 1 FROM abbonamenti_cliente WHERE id = ? AND cliente_id = ?'
  )
  for (const riga of input.righe) {
    if (riga.riferimentoId == null) continue
    if (riga.tipo === 'iscrizione') {
      if (!checkIscrizione.get(riga.riferimentoId, input.clienteId)) {
        throw new Error('RIFERIMENTO_NON_VALIDO')
      }
    } else if (riga.tipo === 'abbonamento') {
      if (!checkAbbonamento.get(riga.riferimentoId, input.clienteId)) {
        throw new Error('RIFERIMENTO_NON_VALIDO')
      }
    }
  }

  // Il tutore è intestatario solo se il cliente ha un tutore E è effettivamente minorenne
  const haTutore = Boolean(cliente.tutore_cf) && isMinorenne(cliente.data_nascita ?? null)
  const intestatarioNome = haTutore ? (cliente.tutore_nome ?? '') : cliente.nome
  const intestatarioCognome = haTutore ? (cliente.tutore_cognome ?? '') : cliente.cognome
  const intestatarioCf = haTutore ? (cliente.tutore_cf ?? '') : cliente.codice_fiscale
  const intestatarioVia = haTutore ? (cliente.tutore_via ?? null) : cliente.via
  const intestatarioCivico = haTutore ? (cliente.tutore_civico ?? null) : cliente.civico
  const intestatarioCitta = haTutore ? (cliente.tutore_citta ?? null) : cliente.citta
  const intestatarioProvincia = haTutore ? (cliente.tutore_provincia ?? null) : cliente.provincia
  const intestatarioCap = haTutore ? (cliente.tutore_cap ?? null) : cliente.cap

  // Tutore nella ricevuta: solo se il cliente è minore
  const tutoreNome = haTutore ? cliente.tutore_nome : null
  const tutoreCognome = haTutore ? cliente.tutore_cognome : null
  const tutoreCf = haTutore ? cliente.tutore_cf : null
  // CF del minore assistito: serve per la dicitura "Tutore di [CF minore]"
  const assistitoCf = haTutore ? cliente.codice_fiscale : null

  // Anno della data di emissione scelta dall'utente
  const anno = parseInt(input.dataEmissione.substring(0, 4), 10)

  // Calcola totale
  const totale = input.righe.reduce((sum, r) => sum + r.prezzo, 0)

  let ricevutaId!: number

  const esegui = db.transaction(() => {
    // Invariante 6: numero progressivo nell'anno
    const startNumber = getReceiptStartNumber()
    const maxRow = db
      .prepare(`SELECT COALESCE(MAX(numero), ?) AS prossimo FROM ricevute WHERE anno = ?`)
      .get(startNumber - 1, anno) as { prossimo: number }
    const numero = maxRow.prossimo + 1

    // Inserisce la ricevuta
    const info = db
      .prepare(
        `INSERT INTO ricevute (
          numero, anno, data_emissione, cliente_id,
          intestatario_nome, intestatario_cognome, intestatario_cf,
          intestatario_via, intestatario_civico, intestatario_citta,
          intestatario_provincia, intestatario_cap,
          tutore_nome, tutore_cognome, tutore_cf, assistito_cf,
          totale, metodo_pagamento, stato_pagamento,
          dicitura_pie, stato
        ) VALUES (
          @numero, @anno, @data_emissione, @cliente_id,
          @intestatario_nome, @intestatario_cognome, @intestatario_cf,
          @intestatario_via, @intestatario_civico, @intestatario_citta,
          @intestatario_provincia, @intestatario_cap,
          @tutore_nome, @tutore_cognome, @tutore_cf, @assistito_cf,
          @totale, @metodo_pagamento, @stato_pagamento,
          @dicitura_pie, 'emessa'
        )`
      )
      .run({
        numero,
        anno,
        data_emissione: input.dataEmissione,
        cliente_id: input.clienteId,
        intestatario_nome: intestatarioNome,
        intestatario_cognome: intestatarioCognome,
        intestatario_cf: intestatarioCf,
        intestatario_via: intestatarioVia,
        intestatario_civico: intestatarioCivico,
        intestatario_citta: intestatarioCitta,
        intestatario_provincia: intestatarioProvincia,
        intestatario_cap: intestatarioCap,
        tutore_nome: tutoreNome,
        tutore_cognome: tutoreCognome,
        tutore_cf: tutoreCf,
        assistito_cf: assistitoCf,
        totale,
        metodo_pagamento: input.metodo_pagamento,
        stato_pagamento: input.stato_pagamento,
        dicitura_pie: input.dictPie ?? null
      })

    ricevutaId = info.lastInsertRowid as number

    // Inserisce le righe e aggiorna lo stato_pagamento delle voci collegate
    const insertRiga = db.prepare(
      `INSERT INTO righe_ricevuta (
        ricevuta_id, tipo, riferimento_id,
        descrizione, data_inizio, data_fine, prezzo, ordine
      ) VALUES (
        @ricevuta_id, @tipo, @riferimento_id,
        @descrizione, @data_inizio, @data_fine, @prezzo, @ordine
      )`
    )

    input.righe.forEach((riga: CreaRigaInput, idx: number) => {
      insertRiga.run({
        ricevuta_id: ricevutaId,
        tipo: riga.tipo,
        riferimento_id: riga.riferimentoId ?? null,
        descrizione: riga.descrizione,
        data_inizio: riga.dataInizio ?? null,
        data_fine: riga.dataFine ?? null,
        prezzo: riga.prezzo,
        ordine: idx
      })

      // Marca la voce collegata come 'pagato' solo se la ricevuta è pagata
      if (input.stato_pagamento === 'pagato' && riga.riferimentoId != null) {
        if (riga.tipo === 'iscrizione') {
          db.prepare(
            `UPDATE iscrizioni_cliente
             SET stato_pagamento = 'pagato', data_modifica = datetime('now')
             WHERE id = ?`
          ).run(riga.riferimentoId)
        } else if (riga.tipo === 'abbonamento') {
          db.prepare(
            `UPDATE abbonamenti_cliente
             SET stato_pagamento = 'pagato', data_modifica = datetime('now')
             WHERE id = ?`
          ).run(riga.riferimentoId)
        }
      }
    })
  })

  esegui.immediate()

  const ricevuta = getRicevuta(ricevutaId)
  if (!ricevuta) {
    throw new Error('Errore durante la creazione della ricevuta: record non trovato dopo INSERT')
  }
  return ricevuta
}

/**
 * Restituisce una ricevuta con le sue righe, o null se non trovata.
 */
export function getRicevuta(id: number): RicevutaConRighe | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM ricevute WHERE id = ?').get(id) as RicevutaRow | undefined
  if (!row) return null
  return { ...row, righe: getRighe(id) }
}

/**
 * Restituisce la lista delle ricevute con filtri opzionali.
 */
export function listRicevute(filters?: RicevutaFilters): RicevutaRow[] {
  const db = getDatabase()

  const conditions: string[] = []
  const params: unknown[] = []

  if (filters?.anno != null) {
    conditions.push('anno = ?')
    params.push(filters.anno)
  }
  if (filters?.stato != null) {
    conditions.push('stato = ?')
    params.push(filters.stato)
  }
  if (filters?.clienteId != null) {
    conditions.push('cliente_id = ?')
    params.push(filters.clienteId)
  }
  // Nota (A15b, vedi OPEN-QUESTIONS): la ricerca per numero non vincola l'anno.
  // In pratica la UI passa sempre filters.anno (ANDato sotto), quindi il caso cross-anno è latente.
  if (filters?.search != null && filters.search.trim() !== '') {
    const term = filters.search.trim()
    const numTerm = parseInt(term, 10)
    if (!isNaN(numTerm)) {
      conditions.push(
        `(numero = ? OR LOWER(intestatario_nome || ' ' || intestatario_cognome) LIKE ?)`
      )
      params.push(numTerm, `%${term.toLowerCase()}%`)
    } else {
      conditions.push(`LOWER(intestatario_nome || ' ' || intestatario_cognome) LIKE ?`)
      params.push(`%${term.toLowerCase()}%`)
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const sql = `SELECT * FROM ricevute ${where} ORDER BY anno DESC, numero DESC`

  return db.prepare(sql).all(...params) as RicevutaRow[]
}

/**
 * Annulla una ricevuta.
 * Invariante 5: imposta stato='annullata', ripristina voci a 'da_incassare',
 * non elimina nulla, il numero rimane invariato.
 */
export function annullaRicevuta(id: number): RicevutaRow {
  const db = getDatabase()

  const ricevuta = db.prepare('SELECT * FROM ricevute WHERE id = ?').get(id) as
    | RicevutaRow
    | undefined
  if (!ricevuta) {
    throw new Error(`Ricevuta con id ${id} non trovata`)
  }
  if (ricevuta.stato === 'annullata') {
    throw new Error('RICEVUTA_GIA_ANNULLATA')
  }

  const righe = getRighe(id)

  const esegui = db.transaction(() => {
    db.prepare(
      `UPDATE ricevute
       SET stato = 'annullata', data_annullamento = datetime('now')
       WHERE id = ?`
    ).run(id)

    for (const riga of righe) {
      if (riga.tipo === 'iscrizione' && riga.riferimento_id != null) {
        db.prepare(
          `UPDATE iscrizioni_cliente
           SET stato_pagamento = 'da_incassare', data_modifica = datetime('now')
           WHERE id = ?`
        ).run(riga.riferimento_id)
      } else if (riga.tipo === 'abbonamento' && riga.riferimento_id != null) {
        db.prepare(
          `UPDATE abbonamenti_cliente
           SET stato_pagamento = 'da_incassare', data_modifica = datetime('now')
           WHERE id = ?`
        ).run(riga.riferimento_id)
      }
    }
  })

  esegui()

  return db.prepare('SELECT * FROM ricevute WHERE id = ?').get(id) as RicevutaRow
}

/**
 * Restituisce la lista degli anni per cui esistono ricevute, in ordine decrescente.
 */
export function listAnniRicevute(): number[] {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT DISTINCT anno FROM ricevute ORDER BY anno DESC')
    .all() as Array<{ anno: number }>
  return rows.map((r) => r.anno)
}

/**
 * Restituisce le voci pagabili di un cliente (iscrizioni e abbonamenti
 * con stato_pagamento='da_incassare' e stato attivo/attiva).
 */
export function getVociPagabili(clienteId: number): VocePagabile[] {
  const db = getDatabase()

  const iscrizioni = db
    .prepare(
      `SELECT
        ic.id AS riferimentoId,
        'iscrizione' AS tipo,
        ti.nome AS descrizione,
        ic.data_inizio AS dataInizio,
        ic.data_scadenza AS dataFine,
        ic.prezzo,
        ic.stato_pagamento
      FROM iscrizioni_cliente ic
      JOIN tipi_iscrizione ti ON ti.id = ic.tipo_iscrizione_id
      WHERE ic.cliente_id = ?
        AND ic.stato_pagamento = 'da_incassare'
        AND ic.stato = 'attiva'`
    )
    .all(clienteId) as VocePagabile[]

  const abbonamenti = db
    .prepare(
      `SELECT
        ac.id AS riferimentoId,
        'abbonamento' AS tipo,
        ta.nome AS descrizione,
        ac.data_inizio AS dataInizio,
        ac.data_scadenza AS dataFine,
        ac.prezzo,
        ac.stato_pagamento
      FROM abbonamenti_cliente ac
      JOIN tipi_abbonamento ta ON ta.id = ac.tipo_abbonamento_id
      WHERE ac.cliente_id = ?
        AND ac.stato_pagamento = 'da_incassare'
        AND ac.stato = 'attivo'`
    )
    .all(clienteId) as VocePagabile[]

  return [...iscrizioni, ...abbonamenti]
}
