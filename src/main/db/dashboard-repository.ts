/**
 * Repository per i dati della dashboard.
 * Espone solo dati grezzi aggregati — nessuna logica di business.
 * Tutta la logica di classificazione (stati, badge) vive nel layer domain.
 */

import { getDatabase } from './database'

// ── Tipi di output ────────────────────────────────────────────────────────────

export interface DashboardPeriodo {
  dal: string // YYYY-MM-DD
  al: string  // YYYY-MM-DD
}

export interface WidgetIndicatori {
  soci_attivi: number
  da_rinnovare: number
  certificati_in_scadenza: number
  certificati_scaduti: number
  iscrizioni_in_scadenza: number
  abbonamenti_in_scadenza: number
  incassi_pagati: number
  incassi_da_incassare: number
}

export interface ClienteInScadenza {
  cliente_id: number
  nome: string
  cognome: string
  tipo: 'certificato' | 'iscrizione' | 'abbonamento'
  nome_tipo: string
  data_scadenza: string
  giorni_alla_scadenza: number
}

export interface AbbonamentoPerTipo {
  tipo_abbonamento_id: number
  nome: string
  colore: string
  totale: number
}

export interface IncassiPeriodo {
  totale_pagato: number
  totale_da_incassare: number
  ricevute_emesse: number
  totale_ricevute: number
}

export interface NuoviTesseramenti {
  totale: number
}

export interface CompleannoDellaSett {
  cliente_id: number
  nome: string
  cognome: string
  data_nascita: string
  giorno_mese: string // gg/mm
}

// ── Implementazioni ───────────────────────────────────────────────────────────

/**
 * Indicatori sintetici per la sezione "Soci" e "Incassi" della dashboard.
 *
 * - soci_attivi:              clienti con iscrizione in stato='attiva' e cliente.stato='attivo'
 * - da_rinnovare:             clienti con iscrizione in stato='scaduta' e cliente.stato='attivo'
 * - certificati_in_scadenza:  certificati con scadenza entro [oggi, oggi+giorniPreavvisoCert]
 * - certificati_scaduti:      certificati con data_scadenza < oggi
 * - incassi_pagati:           somma importi ricevute emesse con stato_pagamento='pagato' e stato='emessa'
 * - incassi_da_incassare:     somma prezzi di iscrizioni + abbonamenti con stato_pagamento='da_incassare'
 *                             e stato attiva/attivo
 */
export function getIndicatori(
  oggi: string,
  giorniPreavvisoCert: number,
  giorniPreavvisoIsc: number,
  giorniPreavvisoAbb: number,
): WidgetIndicatori {
  const db = getDatabase()

  // soci_attivi: iscrizioni con stato='attiva' per clienti attivi
  const sociRow = db
    .prepare(
      `SELECT COUNT(DISTINCT ic.cliente_id) AS cnt
       FROM iscrizioni_cliente ic
       JOIN clienti c ON c.id = ic.cliente_id
       WHERE ic.stato = 'attiva'
         AND c.stato = 'attivo'`
    )
    .get() as { cnt: number }

  // da_rinnovare: clienti con iscrizione scaduta e nessuna attiva (prendi la più recente scaduta)
  // Usiamo DISTINCT cliente_id con stato='scaduta' e senza iscrizioni attive
  const daRinnovareRow = db
    .prepare(
      `SELECT COUNT(DISTINCT ic.cliente_id) AS cnt
       FROM iscrizioni_cliente ic
       JOIN clienti c ON c.id = ic.cliente_id
       WHERE ic.stato = 'scaduta'
         AND c.stato = 'attivo'
         AND NOT EXISTS (
           SELECT 1 FROM iscrizioni_cliente ic2
           WHERE ic2.cliente_id = ic.cliente_id
             AND ic2.stato = 'attiva'
         )`
    )
    .get() as { cnt: number }

  // certificati_in_scadenza: data_scadenza nell'intervallo [oggi, oggi+giorni]
  const certInScadenzaRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM certificati_medici cm
       JOIN clienti c ON c.id = cm.cliente_id
       WHERE c.stato = 'attivo'
         AND julianday(cm.data_scadenza) - julianday(:oggi) BETWEEN 0 AND :giorni`
    )
    .get({ oggi, giorni: giorniPreavvisoCert }) as { cnt: number }

  // certificati_scaduti: data_scadenza < oggi
  const certScadutiRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM certificati_medici cm
       JOIN clienti c ON c.id = cm.cliente_id
       WHERE c.stato = 'attivo'
         AND cm.data_scadenza < :oggi`
    )
    .get({ oggi }) as { cnt: number }

  // incassi_pagati: somma ricevute emesse con stato_pagamento='pagato' (non annullate)
  const incassiPagatiRow = db
    .prepare(
      `SELECT COALESCE(SUM(totale), 0) AS totale
       FROM ricevute
       WHERE stato = 'emessa'
         AND stato_pagamento = 'pagato'`
    )
    .get() as { totale: number }

  // incassi_da_incassare: somma prezzi iscrizioni attive da incassare + abbonamenti attivi da incassare
  const incassiDaIncassareRow = db
    .prepare(
      `SELECT
         COALESCE((
           SELECT SUM(ic.prezzo)
           FROM iscrizioni_cliente ic
           WHERE ic.stato = 'attiva'
             AND ic.stato_pagamento = 'da_incassare'
         ), 0)
         +
         COALESCE((
           SELECT SUM(ac.prezzo)
           FROM abbonamenti_cliente ac
           WHERE ac.stato = 'attivo'
             AND ac.stato_pagamento = 'da_incassare'
         ), 0) AS totale`
    )
    .get() as { totale: number }

  // Conteggi PER RIGA (iscrizioni/abbonamenti in scadenza), coerenti con certificati_in_scadenza
  // che pure usa COUNT(*). Non sono conteggi di clienti distinti: per gli abbonamenti un cliente
  // può averne più d'uno in scadenza, e l'etichetta indica "abbonamenti in scadenza".
  const iscInScadenzaRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM iscrizioni_cliente ic
       JOIN clienti c ON c.id = ic.cliente_id
       WHERE c.stato = 'attivo'
         AND ic.stato = 'attiva'
         AND julianday(ic.data_scadenza) - julianday(:oggi) BETWEEN 0 AND :giorni`
    )
    .get({ oggi, giorni: giorniPreavvisoIsc }) as { cnt: number }

  const abbInScadenzaRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM abbonamenti_cliente ac
       JOIN clienti c ON c.id = ac.cliente_id
       WHERE c.stato = 'attivo'
         AND ac.stato = 'attivo'
         AND julianday(ac.data_scadenza) - julianday(:oggi) BETWEEN 0 AND :giorni`
    )
    .get({ oggi, giorni: giorniPreavvisoAbb }) as { cnt: number }

  return {
    soci_attivi: sociRow.cnt,
    da_rinnovare: daRinnovareRow.cnt,
    certificati_in_scadenza: certInScadenzaRow.cnt,
    certificati_scaduti: certScadutiRow.cnt,
    iscrizioni_in_scadenza: iscInScadenzaRow.cnt,
    abbonamenti_in_scadenza: abbInScadenzaRow.cnt,
    incassi_pagati: incassiPagatiRow.totale,
    incassi_da_incassare: incassiDaIncassareRow.totale,
  }
}

/**
 * Lista clienti con scadenze imminenti (certificati, iscrizioni, abbonamenti)
 * entro il rispettivo intervallo di preavviso.
 *
 * Ogni riga rappresenta una singola entità in scadenza per un cliente.
 * giorni_alla_scadenza è un intero (0 = scade oggi, negativo = già scaduto).
 */
export function getClientiInScadenza(
  oggi: string,
  giorniPreavvisoCert: number,
  giorniPreavvisoIsc: number,
  giorniPreavvisoAbb: number,
): ClienteInScadenza[] {
  const db = getDatabase()

  // Certificati in scadenza (inclusi scaduti nella stessa query per uniformità)
  const certRows = db
    .prepare(
      `SELECT
         c.id AS cliente_id,
         c.nome,
         c.cognome,
         'certificato' AS tipo,
         COALESCE(cm.tipo, 'Certificato medico') AS nome_tipo,
         cm.data_scadenza,
         CAST(julianday(cm.data_scadenza) - julianday(:oggi) AS INTEGER) AS giorni_alla_scadenza
       FROM certificati_medici cm
       JOIN clienti c ON c.id = cm.cliente_id
       WHERE c.stato = 'attivo'
         AND julianday(cm.data_scadenza) - julianday(:oggi) <= :giorni
       ORDER BY cm.data_scadenza ASC`
    )
    .all({ oggi, giorni: giorniPreavvisoCert }) as ClienteInScadenza[]

  // Iscrizioni in scadenza (escluse le invalidate)
  const iscRows = db
    .prepare(
      `SELECT
         c.id AS cliente_id,
         c.nome,
         c.cognome,
         'iscrizione' AS tipo,
         ti.nome AS nome_tipo,
         ic.data_scadenza,
         CAST(julianday(ic.data_scadenza) - julianday(:oggi) AS INTEGER) AS giorni_alla_scadenza
       FROM iscrizioni_cliente ic
       JOIN clienti c ON c.id = ic.cliente_id
       JOIN tipi_iscrizione ti ON ti.id = ic.tipo_iscrizione_id
       WHERE c.stato = 'attivo'
         AND ic.stato != 'invalidata'
         AND julianday(ic.data_scadenza) - julianday(:oggi) BETWEEN 0 AND :giorni
       ORDER BY ic.data_scadenza ASC`
    )
    .all({ oggi, giorni: giorniPreavvisoIsc }) as ClienteInScadenza[]

  // Abbonamenti in scadenza (esclusi gli invalidati)
  const abbRows = db
    .prepare(
      `SELECT
         c.id AS cliente_id,
         c.nome,
         c.cognome,
         'abbonamento' AS tipo,
         ta.nome AS nome_tipo,
         ac.data_scadenza,
         CAST(julianday(ac.data_scadenza) - julianday(:oggi) AS INTEGER) AS giorni_alla_scadenza
       FROM abbonamenti_cliente ac
       JOIN clienti c ON c.id = ac.cliente_id
       JOIN tipi_abbonamento ta ON ta.id = ac.tipo_abbonamento_id
       WHERE c.stato = 'attivo'
         AND ac.stato != 'invalidato'
         AND julianday(ac.data_scadenza) - julianday(:oggi) BETWEEN 0 AND :giorni
       ORDER BY ac.data_scadenza ASC`
    )
    .all({ oggi, giorni: giorniPreavvisoAbb }) as ClienteInScadenza[]

  // Unisce i tre set e ordina per data_scadenza crescente
  const tutti = [...certRows, ...iscRows, ...abbRows]
  tutti.sort((a, b) => a.data_scadenza.localeCompare(b.data_scadenza))
  return tutti
}

/**
 * Distribuzione degli abbonamenti raggruppati per tipo.
 * Se soloAttivi=true (default), conta solo abbonamenti_cliente con stato='attivo'.
 */
export function getDistribuzioneAbbonamenti(soloAttivi = true): AbbonamentoPerTipo[] {
  const db = getDatabase()

  const filtroStato = soloAttivi ? `AND ac.stato = 'attivo'` : ''

  const rows = db
    .prepare(
      `SELECT
         ta.id AS tipo_abbonamento_id,
         ta.nome,
         ta.colore,
         COUNT(ac.id) AS totale
       FROM tipi_abbonamento ta
       JOIN abbonamenti_cliente ac ON ac.tipo_abbonamento_id = ta.id
       WHERE 1=1 ${filtroStato}
       GROUP BY ta.id, ta.nome, ta.colore
       ORDER BY totale DESC, ta.nome ASC`
    )
    .all() as AbbonamentoPerTipo[]

  return rows
}

/**
 * Incassi nel periodo selezionato, basati sulle ricevute NON annullate.
 *
 * - totale_pagato:        somma delle ricevute emesse (stato='emessa') e pagate nel periodo
 * - totale_da_incassare:  somma delle ricevute emesse (stato='emessa') con stato_pagamento='da_incassare'
 *                         nel periodo. Si escludono le annullate per evitare doppio conteggio
 *                         con le voci già riportate a 'da_incassare' sulle associazioni cliente.
 * - ricevute_emesse:      numero di ricevute con stato='emessa' nel periodo
 * - totale_ricevute:      valore totale delle ricevute emesse (stato='emessa') nel periodo
 */
export function getIncassiPeriodo(periodo: DashboardPeriodo): IncassiPeriodo {
  const db = getDatabase()

  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN stato_pagamento = 'pagato' THEN totale ELSE 0 END), 0) AS totale_pagato,
         COALESCE(SUM(CASE WHEN stato_pagamento = 'da_incassare' THEN totale ELSE 0 END), 0) AS totale_da_incassare,
         COUNT(*) AS ricevute_emesse,
         COALESCE(SUM(totale), 0) AS totale_ricevute
       FROM ricevute
       WHERE data_emissione BETWEEN :dal AND :al
         AND stato = 'emessa'`
    )
    .get({ dal: periodo.dal, al: periodo.al }) as IncassiPeriodo

  return row
}

/**
 * Nuovi tesseramenti (iscrizioni_cliente) con data_inizio nel periodo.
 */
export function getNuoviTesseramenti(periodo: DashboardPeriodo): NuoviTesseramenti {
  const db = getDatabase()

  const row = db
    .prepare(
      `SELECT COUNT(*) AS totale
       FROM iscrizioni_cliente
       WHERE data_inizio BETWEEN :dal AND :al`
    )
    .get({ dal: periodo.dal, al: periodo.al }) as { totale: number }

  return { totale: row.totale }
}

/**
 * Clienti con compleanno nei prossimi giorni a partire da dalGiorno (incluso)
 * fino ad alGiorno (incluso). Gestisce il caso a cavallo di anno (es. 28/12–03/01).
 *
 * Confronto su gg-mm per trovare anniversari indipendentemente dall'anno.
 */
export function getCompleanni(dalGiorno: string, alGiorno: string): CompleannoDellaSett[] {
  const db = getDatabase()

  // Estrae gg-mm da una data YYYY-MM-DD nel formato MM-DD (per confronto SQLite strftime)
  const dalMmDd = dalGiorno.slice(5)  // 'MM-DD'
  const alMmDd = alGiorno.slice(5)    // 'MM-DD'

  let rows: Array<{
    cliente_id: number
    nome: string
    cognome: string
    data_nascita: string
    mm_dd: string
  }>

  if (dalMmDd <= alMmDd) {
    // Intervallo nello stesso anno (es. 06-01 → 06-07)
    rows = db
      .prepare(
        `SELECT
           c.id AS cliente_id,
           c.nome,
           c.cognome,
           c.data_nascita,
           strftime('%m-%d', c.data_nascita) AS mm_dd
         FROM clienti c
         WHERE c.stato = 'attivo'
           AND c.data_nascita IS NOT NULL
           AND strftime('%m-%d', c.data_nascita) BETWEEN :dal AND :al
         ORDER BY mm_dd ASC, c.cognome ASC, c.nome ASC`
      )
      .all({ dal: dalMmDd, al: alMmDd }) as typeof rows
  } else {
    // Intervallo a cavallo d'anno (es. 12-28 → 01-03)
    rows = db
      .prepare(
        `SELECT
           c.id AS cliente_id,
           c.nome,
           c.cognome,
           c.data_nascita,
           strftime('%m-%d', c.data_nascita) AS mm_dd
         FROM clienti c
         WHERE c.stato = 'attivo'
           AND c.data_nascita IS NOT NULL
           AND (
             strftime('%m-%d', c.data_nascita) >= :dal
             OR strftime('%m-%d', c.data_nascita) <= :al
           )
         ORDER BY mm_dd ASC, c.cognome ASC, c.nome ASC`
      )
      .all({ dal: dalMmDd, al: alMmDd }) as typeof rows
  }

  return rows.map((r) => {
    const [mm, dd] = r.mm_dd.split('-')
    return {
      cliente_id: r.cliente_id,
      nome: r.nome,
      cognome: r.cognome,
      data_nascita: r.data_nascita,
      giorno_mese: `${dd}/${mm}`,
    }
  })
}
