/**
 * Tipi locali per la Dashboard.
 * I tipi di dati (WidgetIndicatori, ClienteInScadenza, ecc.) sono definiti in shared.ts
 * e accessibili tramite api.d.ts nel renderer.
 */

export type TipoPeriodo = 'mese_corrente' | 'ultimi_30' | 'anno_corrente' | 'personalizzato'

export interface DashboardPeriodo {
  tipo: TipoPeriodo
  dal: string // ISO date string YYYY-MM-DD
  al: string  // ISO date string YYYY-MM-DD
}
