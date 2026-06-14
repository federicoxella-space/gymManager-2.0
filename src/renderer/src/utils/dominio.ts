/**
 * Funzioni di utilità di dominio condivise nel renderer.
 * Non importano da main/domain per rispettare il confine di processo.
 */
import type { ClienteRow } from '../../../types/shared'

/**
 * Determina se la data di nascita corrisponde a un minorenne
 * (cioè non ha ancora compiuto 18 anni alla data odierna).
 */
export function isMinorenne(dataNascita: string | null | undefined): boolean {
  if (!dataNascita) return false
  const nascita = new Date(dataNascita)
  if (isNaN(nascita.getTime())) return false
  const oggi = new Date()
  const anni18fa = new Date(oggi.getFullYear() - 18, oggi.getMonth(), oggi.getDate())
  return nascita > anni18fa
}

/** Mappa dei codici mese del CF (A=gennaio … T=dicembre). */
const CF_MESI: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, H: 6,
  L: 7, M: 8, P: 9, R: 10, S: 11, T: 12,
}

/**
 * Decodifica le informazioni base da un codice fiscale italiano (16 caratteri).
 * Non richiede il dizionario Belfiore: restituisce data di nascita e sesso.
 *
 * Euristica anno: se le due cifre sono < 30 → 2000+xx, altrimenti 1900+xx.
 * Restituisce null se il CF non ha la struttura attesa.
 */
export function decodeCFBasic(
  cf: string,
): { sesso: 'M' | 'F'; annoNascita: number; meseNascita: number; giornoNascita: number } | null {
  const upper = cf.toUpperCase().trim()
  // Struttura minima: XXXXXX99X99X999X
  if (!/^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/.test(upper)) {
    return null
  }

  const annoStr = upper.slice(6, 8)
  const meseChar = upper.slice(8, 9)
  const giornoStr = upper.slice(9, 11)

  const annoRaw = parseInt(annoStr, 10)
  const annoNascita = annoRaw < 30 ? 2000 + annoRaw : 1900 + annoRaw

  const meseNascita = CF_MESI[meseChar]
  if (!meseNascita) return null

  let giornoNascita = parseInt(giornoStr, 10)
  let sesso: 'M' | 'F'

  if (giornoNascita > 40) {
    // Femmina: giorno = valore - 40
    giornoNascita -= 40
    sesso = 'F'
  } else {
    sesso = 'M'
  }

  if (giornoNascita < 1 || giornoNascita > 31) return null

  return { sesso, annoNascita, meseNascita, giornoNascita }
}

// ── Helper intestatario ricevuta ──────────────────────────────────────────────

export interface IntestatarioCalcolato {
  nome: string
  cognome: string
  cf: string
  /** CF del minore assistito; valorizzato solo quando l'intestatario è il tutore. */
  assistitoCf: string | null
  /** true se il cliente è minorenne e ha un tutore (intestatario = tutore). */
  isTutore: boolean
}

/** Replica lato renderer della logica intestatario di creaRicevuta (receipts-repository.ts). */
export function calcolaIntestatario(cliente: ClienteRow): IntestatarioCalcolato {
  const haTutore = Boolean(cliente.tutore_cf) && isMinorenne(cliente.data_nascita)
  if (haTutore) {
    return {
      nome: cliente.tutore_nome ?? '',
      cognome: cliente.tutore_cognome ?? '',
      cf: cliente.tutore_cf ?? '',
      assistitoCf: cliente.codice_fiscale,
      isTutore: true
    }
  }
  return {
    nome: cliente.nome,
    cognome: cliente.cognome,
    cf: cliente.codice_fiscale,
    assistitoCf: null,
    isTutore: false
  }
}

/** Nome cliente formattato in modo coerente: "Cognome Nome". */
export function formatNomeCliente(c: { nome: string; cognome: string }): string {
  return `${c.cognome} ${c.nome}`.trim()
}

/** true se il cliente è minorenne ma non ha un tutore collegato (emissione bloccata, B7). */
export function minoreSenzaTutore(cliente: ClienteRow): boolean {
  return isMinorenne(cliente.data_nascita) && cliente.tutore_id == null
}

/**
 * true se l'indirizzo che finirà sulla ricevuta (via + città + cap) è completo.
 * Controlla gli stessi campi che creaRicevuta scrive come intestatario:
 * tutore_* quando il cliente è minore con tutore, altrimenti i campi del cliente.
 */
export function indirizzoIntestatarioCompleto(cliente: ClienteRow): boolean {
  const haTutore = Boolean(cliente.tutore_cf) && isMinorenne(cliente.data_nascita)
  const via = haTutore ? cliente.tutore_via : cliente.via
  const citta = haTutore ? cliente.tutore_citta : cliente.citta
  const cap = haTutore ? cliente.tutore_cap : cliente.cap
  return Boolean(via?.trim() && citta?.trim() && cap?.trim())
}
