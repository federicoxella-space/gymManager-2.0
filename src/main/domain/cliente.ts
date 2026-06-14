/**
 * Validazioni e regole di business per l'entità Cliente.
 * Logica pura — nessuna dipendenza da Node.js o Electron.
 */

import { isCodiceFiscaleValid } from './codice-fiscale'
import type { CreateClienteInput } from '../../types/shared'

// ---------------------------------------------------------------------------
// Tipi condivisi di validazione (riesportati verso shared.ts)
// ---------------------------------------------------------------------------

export interface ValidationError {
  /** Nome del campo (es. "codice_fiscale", "tutore_cf") */
  field: string
  /** Messaggio di errore in italiano */
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

// ---------------------------------------------------------------------------
// Calcolo età / minorennità
// ---------------------------------------------------------------------------

/**
 * Restituisce true se il cliente è minorenne (età < 18) rispetto alla data
 * `oggi` (default: now).
 * Restituisce false se `dataNascita` è null/undefined/stringa non parsabile.
 */
export function isMinorenne(
  dataNascita: string | null | undefined,
  oggi: Date = new Date(),
): boolean {
  if (!dataNascita) return false

  // Parse YYYY-MM-DD esplicitamente in UTC per coerenza con il resto del dominio
  const parts = dataNascita.split('-')
  if (parts.length !== 3) return false
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const d = parseInt(parts[2], 10)
  if (isNaN(y) || isNaN(m) || isNaN(d)) return false

  // 18° compleanno a mezzanotte UTC
  const eta18 = new Date(Date.UTC(y + 18, m - 1, d))

  // Normalizza "oggi" a mezzanotte UTC per evitare errori al giorno del compleanno
  const oggiUTC = new Date(Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()))

  return oggiUTC < eta18
}

// ---------------------------------------------------------------------------
// Validazione cliente
// ---------------------------------------------------------------------------

/**
 * Valida i dati di input per la creazione (o aggiornamento) di un cliente.
 *
 * Regole:
 * - `nome` non vuoto
 * - `cognome` non vuoto
 * - `codice_fiscale` formalmente valido (algoritmo standard italiano)
 * - Il tutore NON è obbligatorio al salvataggio, neanche per i minorenni: un
 *   minore può essere salvato senza tutore. Il vincolo del tutore (B7) è
 *   verificato solo al momento dell'emissione della ricevuta (TUTORE_RICHIESTO
 *   in creaRicevuta), non qui.
 * - L'indirizzo NON è obbligatorio al salvataggio; è richiesto solo al momento
 *   dell'emissione della ricevuta (validazione di competenza del layer ricevute).
 */
export function validaCliente(input: CreateClienteInput): ValidationResult {
  const errors: ValidationError[] = []

  // Campi obbligatori base
  if (!input.nome || input.nome.trim().length === 0) {
    errors.push({ field: 'nome', message: 'Il nome è obbligatorio.' })
  }

  if (!input.cognome || input.cognome.trim().length === 0) {
    errors.push({ field: 'cognome', message: 'Il cognome è obbligatorio.' })
  }

  if (!input.codice_fiscale || input.codice_fiscale.trim().length === 0) {
    errors.push({
      field: 'codice_fiscale',
      message: 'Il codice fiscale è obbligatorio.',
    })
  } else if (!isCodiceFiscaleValid(input.codice_fiscale)) {
    errors.push({
      field: 'codice_fiscale',
      message: 'Il codice fiscale non è valido.',
    })
  }

  // B7: il tutore NON è obbligatorio al salvataggio, neanche per i minorenni.
  // Il blocco avviene solo all'emissione della ricevuta (TUTORE_RICHIESTO in
  // creaRicevuta). Qui non si valida tutore_id.

  return { valid: errors.length === 0, errors }
}

/**
 * Validazione parziale per l'aggiornamento di un cliente.
 * Controlla solo i campi effettivamente presenti nell'input:
 * - se `nome` è fornito, non deve essere vuoto
 * - se `cognome` è fornito, non deve essere vuoto
 * - se `codice_fiscale` è fornito, deve essere formalmente valido
 * - il tutore NON è obbligatorio al salvataggio, neanche per i minorenni:
 *   il vincolo del tutore (B7) è verificato solo all'emissione della ricevuta.
 */
export function validaClienteUpdate(input: Partial<CreateClienteInput>): ValidationResult {
  const errors: ValidationError[] = []

  if ('nome' in input) {
    if (!input.nome || input.nome.trim().length === 0) {
      errors.push({ field: 'nome', message: 'Il nome è obbligatorio.' })
    }
  }

  if ('cognome' in input) {
    if (!input.cognome || input.cognome.trim().length === 0) {
      errors.push({ field: 'cognome', message: 'Il cognome è obbligatorio.' })
    }
  }

  if ('codice_fiscale' in input) {
    if (!input.codice_fiscale || input.codice_fiscale.trim().length === 0) {
      errors.push({
        field: 'codice_fiscale',
        message: 'Il codice fiscale è obbligatorio.',
      })
    } else if (!isCodiceFiscaleValid(input.codice_fiscale)) {
      errors.push({
        field: 'codice_fiscale',
        message: 'Il codice fiscale non è valido.',
      })
    }
  }

  // B7: il tutore NON è obbligatorio al salvataggio, neanche per i minorenni.
  // Il blocco avviene solo all'emissione della ricevuta (TUTORE_RICHIESTO in
  // creaRicevuta). Qui non si valida tutore_id.

  return { valid: errors.length === 0, errors }
}
