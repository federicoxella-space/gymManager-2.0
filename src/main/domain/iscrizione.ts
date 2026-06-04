/**
 * Calcolo stati e validazioni per IscrizioneCliente e AbbonamentoCliente.
 * Logica pura — nessuna dipendenza da Node.js o Electron.
 *
 * Invarianti implementate (da DOMAIN-MODEL.md e CLAUDE.md):
 *   1. Al più una iscrizione attiva per cliente.
 *   2. Nessun abbonamento senza iscrizione attiva.
 *   3. Abbonamento oltre la scadenza dell'iscrizione: ammesso con segnalazione non bloccante.
 */

export type StatoIscrizione = 'attiva' | 'scaduta' | 'invalidata'
export type StatoAbbonamento = 'attivo' | 'scaduto' | 'invalidato'

/**
 * Stato di scadenza arricchito con preavviso, usato per badge e dashboard.
 * 'invalidata' copre sia StatoIscrizione 'invalidata' sia StatoAbbonamento 'invalidato'.
 */
export type StatoScadenzaConPreavviso = 'attiva' | 'in_scadenza' | 'scaduta' | 'invalidata'

// ---------------------------------------------------------------------------
// Calcolo stati
// ---------------------------------------------------------------------------

/**
 * Calcola lo stato di un'iscrizione rispetto alla data odierna.
 *
 * - `scaduta`:   dataScadenza < oggi (mezzanotte)
 * - `attiva`:    dataScadenza >= oggi
 *
 * `invalidata` non è calcolata qui: viene persistita esplicitamente dall'operatore.
 */
export function calcolaStatoIscrizione(
  dataScadenza: string, // YYYY-MM-DD
  oggi: Date,
): StatoIscrizione {
  const scadenza = parseData(dataScadenza)
  const oggiNorm = normalizzaData(oggi)

  return scadenza < oggiNorm ? 'scaduta' : 'attiva'
}

/**
 * Calcola lo stato di un abbonamento rispetto alla data odierna.
 *
 * - `scaduto`:  dataScadenza < oggi
 * - `attivo`:   dataScadenza >= oggi
 *
 * `invalidato` non è calcolato qui: viene persistito esplicitamente.
 */
export function calcolaStatoAbbonamento(
  dataScadenza: string, // YYYY-MM-DD
  oggi: Date,
): StatoAbbonamento {
  const scadenza = parseData(dataScadenza)
  const oggiNorm = normalizzaData(oggi)

  return scadenza < oggiNorm ? 'scaduto' : 'attivo'
}

// ---------------------------------------------------------------------------
// Invariante 3: segnalazione non bloccante
// ---------------------------------------------------------------------------

/**
 * Verifica se un abbonamento supera la scadenza dell'iscrizione attiva.
 *
 * Ritorna `true` se dataScadenzaAbbonamento > dataScadenzaIscrizione.
 * Il chiamante deve esporre una segnalazione non bloccante all'utente
 * (invariante 3 di CLAUDE.md); l'assegnazione resta permessa.
 */
export function abbonamentoOltreScadenzaIscrizione(
  dataScadenzaAbbonamento: string, // YYYY-MM-DD
  dataScadenzaIscrizione: string,  // YYYY-MM-DD
): boolean {
  const scadenzaAbb = parseData(dataScadenzaAbbonamento)
  const scadenzaIsc = parseData(dataScadenzaIscrizione)
  return scadenzaAbb > scadenzaIsc
}

// ---------------------------------------------------------------------------
// Calcolo data scadenza
// ---------------------------------------------------------------------------

/**
 * Calcola la data di scadenza aggiungendo `durataMesi` mesi a `dataInizio`.
 *
 * Gestione fine mese: se il giorno risultante non esiste nel mese di
 * destinazione (es. 31 gennaio + 1 mese → febbraio non ha 31 giorni),
 * viene usato l'ultimo giorno del mese di destinazione.
 *
 * @returns stringa YYYY-MM-DD
 */
export function calcolaDataScadenza(dataInizio: string, durataMesi: number): string {
  const [y, m, d] = dataInizio.split('-').map(Number)

  const annoTarget = y + Math.floor((m - 1 + durataMesi) / 12)
  const meseTarget = ((m - 1 + durataMesi) % 12) + 1 // 1-based

  // Clamp al numero di giorni effettivi del mese di destinazione
  const giorniNelMese = new Date(Date.UTC(annoTarget, meseTarget, 0)).getUTCDate()
  const giornoTarget = Math.min(d, giorniNelMese)

  return formatData(annoTarget, meseTarget, giornoTarget)
}

// ---------------------------------------------------------------------------
// Stato con preavviso (per dashboard e badge)
// ---------------------------------------------------------------------------

/**
 * Calcola lo stato di scadenza con preavviso per badge e widget dashboard.
 *
 * - Se `statoCorrente` è 'invalidata' o 'invalidato': ritorna 'invalidata'.
 * - Se `statoCorrente` è 'scaduta' o 'scaduto': ritorna 'scaduta'.
 * - Se `dataScadenza` è entro `giorniPreavviso` da oggi (incluso il giorno stesso): 'in_scadenza'.
 * - Altrimenti: 'attiva'.
 */
export function calcolaStatoConPreavviso(
  dataScadenza: string,
  statoCorrente: StatoIscrizione | StatoAbbonamento,
  oggi: Date,
  giorniPreavviso: number,
): StatoScadenzaConPreavviso {
  if (statoCorrente === 'invalidata' || statoCorrente === 'invalidato') {
    return 'invalidata'
  }

  if (statoCorrente === 'scaduta' || statoCorrente === 'scaduto') {
    return 'scaduta'
  }

  const scadenza = parseData(dataScadenza)
  const oggiNorm = normalizzaData(oggi)
  const diffMs = scadenza.getTime() - oggiNorm.getTime()
  const diffGiorni = Math.floor(diffMs / MS_PER_GIORNO)

  if (diffGiorni <= giorniPreavviso) return 'in_scadenza'
  return 'attiva'
}

// ---------------------------------------------------------------------------
// Utility interne
// ---------------------------------------------------------------------------

const MS_PER_GIORNO = 24 * 60 * 60 * 1000

/** Parsa una stringa YYYY-MM-DD come mezzanotte UTC per confronti consistenti. */
function parseData(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Normalizza un oggetto Date alla mezzanotte UTC del giorno corrispondente. */
function normalizzaData(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

/** Formatta anno, mese (1-based) e giorno in stringa YYYY-MM-DD. */
function formatData(anno: number, mese: number, giorno: number): string {
  const mm = String(mese).padStart(2, '0')
  const dd = String(giorno).padStart(2, '0')
  return `${anno}-${mm}-${dd}`
}
