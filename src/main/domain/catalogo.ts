/**
 * Validazioni e calcoli per i tipi di catalogo (TipoIscrizione, TipoAbbonamento).
 * Logica pura — nessuna dipendenza da Node.js o Electron.
 *
 * Invariante 4 (DOMAIN-MODEL.md): i tipi non sono eliminabili se hanno almeno
 * un'associazione; la verifica dell'esistenza di assegnazioni è di competenza
 * del layer di persistenza, che deve lanciare TIPO_ASSEGNATO se necessario.
 */

import type { ValidationResult } from './cliente'
import { calcolaDataScadenza } from './iscrizione'

// ---------------------------------------------------------------------------
// Input per la creazione di un tipo
// ---------------------------------------------------------------------------

export interface CreateTipoInput {
  nome: string
  durata_mesi: number
  prezzo_default: number
}

export interface CreateTipoAbbonamentoInput extends CreateTipoInput {
  colore?: string
}

// ---------------------------------------------------------------------------
// Validazioni
// ---------------------------------------------------------------------------

/**
 * Valida i dati per la creazione (o aggiornamento) di un TipoIscrizione.
 *
 * Regole:
 * - `nome` non vuoto
 * - `durata_mesi` >= 1
 * - `prezzo_default` >= 0
 */
export function validaTipoIscrizione(input: CreateTipoInput): ValidationResult {
  return validaTipoBase(input)
}

/**
 * Valida i dati per la creazione (o aggiornamento) di un TipoAbbonamento.
 *
 * Regole: le stesse di TipoIscrizione; il campo `colore` è opzionale e non
 * soggetto a validazione di formato in questa versione.
 */
export function validaTipoAbbonamento(input: CreateTipoAbbonamentoInput): ValidationResult {
  return validaTipoBase(input)
}

/**
 * Validazione parziale per l'aggiornamento di un tipo (iscrizione o abbonamento):
 * controlla solo i campi presenti nell'input.
 */
export function validaTipoUpdate(input: Partial<CreateTipoInput>): ValidationResult {
  const errors: Array<{ field: string; message: string }> = []

  if ('nome' in input) {
    if (!input.nome || input.nome.trim().length === 0) {
      errors.push({ field: 'nome', message: 'Il nome è obbligatorio.' })
    }
  }
  if ('durata_mesi' in input) {
    if (!Number.isFinite(input.durata_mesi as number) || (input.durata_mesi as number) < 1) {
      errors.push({ field: 'durata_mesi', message: 'La durata deve essere di almeno 1 mese.' })
    }
  }
  if ('prezzo_default' in input) {
    if (!Number.isFinite(input.prezzo_default as number) || (input.prezzo_default as number) < 0) {
      errors.push({ field: 'prezzo_default', message: 'Il prezzo non può essere negativo.' })
    }
  }

  return { valid: errors.length === 0, errors }
}

// ---------------------------------------------------------------------------
// Proposte di date
// ---------------------------------------------------------------------------

/**
 * Calcola la data di inizio proposta (default: oggi) e la data di scadenza
 * proposta (dataInizio + durataMesi).
 *
 * @param durataMesi  numero di mesi di durata
 * @param dataInizio  YYYY-MM-DD; se assente, si usa la data odierna
 * @returns `{ dataInizio: string; dataScadenza: string }` in formato YYYY-MM-DD
 */
export function proposteDate(
  durataMesi: number,
  dataInizio?: string,
): { dataInizio: string; dataScadenza: string } {
  const inizio = dataInizio ?? oggiYmd()
  const scadenza = calcolaDataScadenza(inizio, durataMesi)
  return { dataInizio: inizio, dataScadenza: scadenza }
}

// ---------------------------------------------------------------------------
// Utility interne
// ---------------------------------------------------------------------------

function validaTipoBase(input: CreateTipoInput): ValidationResult {
  const errors: Array<{ field: string; message: string }> = []

  if (!input.nome || input.nome.trim().length === 0) {
    errors.push({ field: 'nome', message: 'Il nome è obbligatorio.' })
  }

  if (!Number.isFinite(input.durata_mesi) || input.durata_mesi < 1) {
    errors.push({
      field: 'durata_mesi',
      message: 'La durata deve essere di almeno 1 mese.',
    })
  }

  if (!Number.isFinite(input.prezzo_default) || input.prezzo_default < 0) {
    errors.push({
      field: 'prezzo_default',
      message: 'Il prezzo non può essere negativo.',
    })
  }

  return { valid: errors.length === 0, errors }
}

/** Restituisce la data odierna in formato YYYY-MM-DD (UTC). */
function oggiYmd(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
