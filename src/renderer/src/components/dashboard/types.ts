/**
 * Tipi locali per la Dashboard.
 * TODO: allineare con domain-logic quando i tipi saranno aggiunti a shared.ts e api.d.ts.
 */

export type TipoPeriodo = 'mese_corrente' | 'ultimi_30' | 'anno_corrente' | 'personalizzato'

export interface DashboardPeriodo {
  tipo: TipoPeriodo
  dal: string // ISO date string YYYY-MM-DD
  al: string  // ISO date string YYYY-MM-DD
}

/** Indicatori sintetici della dashboard. */
export interface DashboardIndicatori {
  soci_attivi: number
  da_rinnovare: number
  certificati_in_scadenza: number
  incassi_periodo: number
}

/** Singola voce di scadenza (certificato, iscrizione o abbonamento). */
export interface VoceScadenza {
  cliente_id: number
  cliente_nome: string
  cliente_cognome: string
  tipo: 'certificato' | 'iscrizione' | 'abbonamento'
  nome_voce: string
  data_scadenza: string // ISO date string
  giorni_rimanenti: number // negativo = già scaduto
}

/** Dati per il widget incassi. */
export interface DashboardIncassi {
  pagato: number
  da_incassare: number
  num_ricevute: number
  totale_ricevute: number
}

/** Singola riga di distribuzione abbonamenti per tipo. */
export interface AbbonamentoDistribuzione {
  tipo_id: number
  nome: string
  colore: string
  conteggio: number
}

/** Dati per il widget abbonamenti. */
export interface DashboardAbbonamenti {
  distribuzione: AbbonamentoDistribuzione[]
  totale: number
}

/** Dati per il widget tesseramenti. */
export interface DashboardTesseramenti {
  nuovi: number
  variazione: number | null // rispetto al periodo precedente; null se non disponibile
}

/** Cliente con compleanno in settimana. */
export interface ClienteCompleanno {
  cliente_id: number
  nome: string
  cognome: string
  data_nascita: string // ISO date string
}
