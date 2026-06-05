/**
 * Formattazione per le ricevute fiscali: valuta, date, numerazione.
 * Logica pura — nessuna dipendenza da Node.js o Electron.
 * Importabile nei test senza mockare Electron.
 */

/**
 * Formatta un importo numerico in stile italiano con simbolo €.
 * 1234.56 → "1.234,56 €"
 * 0 → "0,00 €"
 *
 * Implementazione manuale per evitare dipendenze dall'ICU di Node.js
 * (in alcuni ambienti Intl.NumberFormat con locale 'it-IT' può produrre
 * separatori diversi o non supportare il locale correttamente).
 */
export function formatImporto(amount: number): string {
  // Arrotonda a 2 decimali per evitare problemi floating point
  const rounded = Math.round(amount * 100) / 100

  // Separa parte intera e decimale
  const isNegative = rounded < 0
  const abs = Math.abs(rounded)
  const intPart = Math.floor(abs)
  const decPart = Math.round((abs - intPart) * 100)

  // Formatta la parte intera con separatore migliaia (punto)
  const intStr = intPart.toString()
  let intFormatted = ''
  for (let i = 0; i < intStr.length; i++) {
    if (i > 0 && (intStr.length - i) % 3 === 0) {
      intFormatted += '.'
    }
    intFormatted += intStr[i]
  }

  // Formatta i decimali con 2 cifre
  const decStr = decPart.toString().padStart(2, '0')

  const sign = isNegative ? '-' : ''
  return `${sign}${intFormatted},${decStr} €`
}

/**
 * Formatta una data ISO (YYYY-MM-DD) in formato italiano gg/mm/aaaa.
 * '2025-01-15' → '15/01/2025'
 */
export function formatDataIT(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

/**
 * Genera il numero di ricevuta formattato: anno=2025, numero=3 → "2025-3"
 */
export function formatNumeroRicevuta(anno: number, numero: number): string {
  return `${anno}-${numero}`
}
