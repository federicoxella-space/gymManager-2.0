import comuniData from 'comuni-json/comuni.json'

export interface ComuneInfo {
  nome: string
  codiceCatastale: string
  sigla: string
  provincia: string
}

interface RawComune {
  nome: string
  codiceCatastale: string
  sigla?: string
  provincia?: { nome?: string }
}

const COMUNI: ComuneInfo[] = (comuniData as RawComune[]).map((c) => ({
  nome: c.nome,
  codiceCatastale: c.codiceCatastale,
  sigla: c.sigla ?? '',
  provincia: c.provincia?.nome ?? ''
}))

/** Ricerca per prefisso/sottostringa sul nome del comune (case-insensitive). */
export function cercaComuni(query: string, limit = 20): ComuneInfo[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const startsWith: ComuneInfo[] = []
  const contains: ComuneInfo[] = []
  for (const c of COMUNI) {
    const nome = c.nome.toLowerCase()
    if (nome.startsWith(q)) startsWith.push(c)
    else if (nome.includes(q)) contains.push(c)
    if (startsWith.length >= limit) break
  }
  return [...startsWith, ...contains].slice(0, limit)
}

/** Risolve un codice catastale Belfiore al relativo comune. */
export function comunePerCodice(codice: string): ComuneInfo | null {
  const up = codice.trim().toUpperCase()
  return COMUNI.find((c) => c.codiceCatastale.toUpperCase() === up) ?? null
}
