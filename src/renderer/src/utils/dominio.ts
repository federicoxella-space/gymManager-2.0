/**
 * Funzioni di utilità di dominio condivise nel renderer.
 * Non importano da main/domain per rispettare il confine di processo.
 */

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
