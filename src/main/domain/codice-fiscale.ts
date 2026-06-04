/**
 * Validazione e calcolo bidirezionale del Codice Fiscale italiano.
 * Logica pura — nessuna dipendenza da Node.js o Electron.
 */

// ---------------------------------------------------------------------------
// Tabelle dell'algoritmo CF
// ---------------------------------------------------------------------------

/** Valori per i caratteri in posizione PARI (0-based: 1,3,5,...) */
const VALORI_PARI: Record<string, number> = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4,
  '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  A: 0,  B: 1,  C: 2,  D: 3,  E: 4,
  F: 5,  G: 6,  H: 7,  I: 8,  J: 9,
  K: 10, L: 11, M: 12, N: 13, O: 14,
  P: 15, Q: 16, R: 17, S: 18, T: 19,
  U: 20, V: 21, W: 22, X: 23, Y: 24,
  Z: 25,
}

/** Valori per i caratteri in posizione DISPARI (0-based: 0,2,4,...) */
const VALORI_DISPARI: Record<string, number> = {
  '0': 1,  '1': 0,  '2': 5,  '3': 7,  '4': 9,
  '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  A: 1,  B: 0,  C: 5,  D: 7,  E: 9,
  F: 13, G: 15, H: 17, I: 19, J: 21,
  K: 2,  L: 4,  M: 18, N: 20, O: 11,
  P: 3,  Q: 6,  R: 8,  S: 12, T: 14,
  U: 16, V: 10, W: 22, X: 25, Y: 24,
  Z: 23,
}

/** Mesi CF: A=gen, B=feb, C=mar, D=apr, E=mag, H=giu, L=lug, M=ago, P=set, R=ott, S=nov, T=dic */
const CODICE_MESE: Record<number, string> = {
  1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E', 6: 'H',
  7: 'L', 8: 'M', 9: 'P', 10: 'R', 11: 'S', 12: 'T',
}

const MESE_DA_CODICE: Record<string, number> = Object.fromEntries(
  Object.entries(CODICE_MESE).map(([k, v]) => [v, Number(k)])
)

/** Pattern formato CF: 6 lettere, 2 cifre, 1 lettera, 2 cifre, 1 lettera, 3 alfanumerici, 1 lettera */
const CF_PATTERN = /^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/

// ---------------------------------------------------------------------------
// Validazione
// ---------------------------------------------------------------------------

/**
 * Verifica se un codice fiscale italiano è formalmente valido.
 * Non lancia eccezioni: restituisce sempre true/false.
 */
export function isCodiceFiscaleValid(cf: string): boolean {
  if (!cf) return false
  const upper = cf.toUpperCase().trim()
  if (!CF_PATTERN.test(upper)) return false
  return calcolaCarattereControllo(upper.slice(0, 15)) === upper[15]
}

/** Calcola il carattere di controllo per i primi 15 caratteri del CF. */
function calcolaCarattereControllo(primi15: string): string {
  let somma = 0
  for (let i = 0; i < 15; i++) {
    const char = primi15[i]
    // posizioni 0-based: 0,2,4,... = dispari; 1,3,5,... = pari
    somma += i % 2 === 0
      ? (VALORI_DISPARI[char] ?? 0)
      : (VALORI_PARI[char] ?? 0)
  }
  return String.fromCharCode(65 + (somma % 26))
}

// ---------------------------------------------------------------------------
// Decodifica CF → dati anagrafici
// ---------------------------------------------------------------------------

export interface DatiAnagraficiDaCF {
  /** Ultime 2 cifre dell'anno di nascita (es. 90 per 1990 o 2090 — ambiguità del secolo non risolvibile solo dal CF) */
  annoCorto: number
  /** Numero del mese (1–12) */
  mese: number
  /** Giorno di nascita (per le donne il valore raw è giorno+40; questa funzione restituisce il giorno reale) */
  giorno: number
  sesso: 'M' | 'F'
  /** Codice catastale (Belfiore) del comune di nascita, es. "H501" per Roma */
  codiceComune: string
}

/**
 * Decodifica un codice fiscale restituendo i dati anagrafici estratti.
 * Restituisce null se il CF non è valido.
 */
export function decodificaCF(cf: string): DatiAnagraficiDaCF | null {
  if (!isCodiceFiscaleValid(cf)) return null
  const upper = cf.toUpperCase().trim()

  const annoCorto = parseInt(upper.slice(6, 8), 10)

  const codiceMese = upper[8]
  const mese = MESE_DA_CODICE[codiceMese]
  if (mese === undefined) return null

  const giornoRaw = parseInt(upper.slice(9, 11), 10)
  const sesso: 'M' | 'F' = giornoRaw > 40 ? 'F' : 'M'
  const giorno = sesso === 'F' ? giornoRaw - 40 : giornoRaw

  const codiceComune = upper.slice(11, 15)

  return { annoCorto, mese, giorno, sesso, codiceComune }
}

// ---------------------------------------------------------------------------
// Calcolo CF da dati anagrafici
// ---------------------------------------------------------------------------

/**
 * Calcola le consonanti e vocali di una stringa (nome/cognome) per il CF.
 * Restituisce un array di caratteri utili ordinati secondo le regole CF.
 */
function estraiCaratteriCF(s: string, isNome: boolean): string {
  const upper = s.toUpperCase().replace(/[^A-Z]/g, '')
  const consonanti = upper.split('').filter(c => !'AEIOU'.includes(c))
  const vocali = upper.split('').filter(c => 'AEIOU'.includes(c))

  if (isNome && consonanti.length >= 4) {
    // Per il nome con 4+ consonanti: prende 1a, 3a, 4a consonante
    return (consonanti[0] + consonanti[2] + consonanti[3]).slice(0, 3)
  }

  const tutti = [...consonanti, ...vocali]
  const risultato = tutti.join('').padEnd(3, 'X').slice(0, 3)
  return risultato
}

/**
 * Calcola il codice fiscale da dati anagrafici.
 *
 * NOTA: la tabella completa dei codici catastali (Belfiore) non è inclusa in
 * questo modulo — vedi OPEN-QUESTIONS.md.  Il parametro `codiceComune` deve
 * essere il codice catastale già noto (es. "H501" per Roma).
 */
export function calcolaCF(
  nome: string,
  cognome: string,
  dataNascita: string, // YYYY-MM-DD
  sesso: 'M' | 'F',
  codiceComune: string,
): string {
  const parteCognome = estraiCaratteriCF(cognome, false)
  const parteNome = estraiCaratteriCF(nome, true)

  const [annoStr, meseStr, giornoStr] = dataNascita.split('-')
  const anno = parseInt(annoStr, 10)
  const mese = parseInt(meseStr, 10)
  const giorno = parseInt(giornoStr, 10)

  const annoCorto = String(anno % 100).padStart(2, '0')
  const codiceMese = CODICE_MESE[mese] ?? 'A'
  const giornoStr2 = sesso === 'M'
    ? String(giorno).padStart(2, '0')
    : String(giorno + 40).padStart(2, '0')

  const parziale = `${parteCognome}${parteNome}${annoCorto}${codiceMese}${giornoStr2}${codiceComune.toUpperCase()}`
  const controllo = calcolaCarattereControllo(parziale)
  return `${parziale}${controllo}`
}
