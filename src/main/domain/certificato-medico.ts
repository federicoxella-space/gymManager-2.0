/**
 * Calcolo dello stato del certificato medico rispetto alla data odierna.
 * Logica pura — nessuna dipendenza da Node.js o Electron.
 */

export type StatoCertificato = 'valido' | 'in_scadenza' | 'scaduto'

export interface CertificatoConStato {
  id: number
  clienteId: number
  tipo: string
  dataScadenza: string // YYYY-MM-DD
  stato: StatoCertificato
  /** Giorni alla scadenza; negativo se già scaduto */
  giorniAllaScadenza: number
}

/**
 * Calcola lo stato di un certificato medico.
 *
 * - `scaduto`:    dataScadenza < oggi
 * - `in_scadenza`: oggi <= dataScadenza <= oggi + giorniPreavviso
 * - `valido`:     dataScadenza > oggi + giorniPreavviso
 */
export function calcolaStatoCertificato(
  dataScadenza: string,
  oggi: Date,
  giorniPreavviso: number,
): StatoCertificato {
  const scadenza = parseData(dataScadenza)
  const oggiNorm = normalizzaData(oggi)

  const diffMs = scadenza.getTime() - oggiNorm.getTime()
  const diffGiorni = Math.floor(diffMs / MS_PER_GIORNO)

  if (diffGiorni < 0) return 'scaduto'
  if (diffGiorni <= giorniPreavviso) return 'in_scadenza'
  return 'valido'
}

/**
 * Arricchisce un record certificato grezzo con lo stato calcolato e i giorni
 * alla scadenza.
 */
export function enrichCertificatoConStato(
  cert: { id: number; clienteId: number; tipo: string; dataScadenza: string },
  oggi: Date,
  giorniPreavviso: number,
): CertificatoConStato {
  const scadenza = parseData(cert.dataScadenza)
  const oggiNorm = normalizzaData(oggi)
  const diffMs = scadenza.getTime() - oggiNorm.getTime()
  const giorniAllaScadenza = Math.floor(diffMs / MS_PER_GIORNO)
  const stato = calcolaStatoCertificato(cert.dataScadenza, oggi, giorniPreavviso)

  return {
    ...cert,
    stato,
    giorniAllaScadenza,
  }
}

// ---------------------------------------------------------------------------
// Utility interne
// ---------------------------------------------------------------------------

const MS_PER_GIORNO = 24 * 60 * 60 * 1000

/** Parsa una data YYYY-MM-DD come mezzanotte UTC per confronti consistenti. */
function parseData(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Normalizza un oggetto Date alla mezzanotte UTC del giorno corrispondente. */
function normalizzaData(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}
