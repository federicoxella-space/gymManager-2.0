/**
 * Parsing e analisi di un CSV di clienti per l'import additivo.
 * Logica pura: dipende solo da papaparse (puro JS) e dalla validazione CF.
 */

import Papa from 'papaparse'
import { isCodiceFiscaleValid } from './codice-fiscale'
import type { CreateClienteInput, ImportPreview, ImportRowResult } from '../../types/shared'

/** Colonne opzionali di tipo testo mappate 1:1 su CreateClienteInput. */
const CAMPI_TESTO = [
  'comune_nascita',
  'via',
  'civico',
  'citta',
  'provincia',
  'cap',
  'email',
  'telefono',
  'note',
] as const

export interface RigaGrezza {
  /** Numero di riga 1-based nel file (intestazione = riga 1). */
  riga: number
  /** Celle della riga, per intestazione normalizzata (minuscolo, trim). */
  dati: Record<string, string>
}

/**
 * Converte una data italiana `gg/mm/aaaa` in ISO `aaaa-mm-gg`.
 * Restituisce null se la stringa non è una data di calendario valida.
 */
export function parseDataItaliana(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const giorno = parseInt(m[1], 10)
  const mese = parseInt(m[2], 10)
  const anno = parseInt(m[3], 10)
  if (mese < 1 || mese > 12 || giorno < 1 || giorno > 31) return null
  // Verifica che la data esista davvero (es. 31/02 non valida)
  const d = new Date(Date.UTC(anno, mese - 1, giorno))
  if (
    d.getUTCFullYear() !== anno ||
    d.getUTCMonth() !== mese - 1 ||
    d.getUTCDate() !== giorno
  ) {
    return null
  }
  const mm = String(mese).padStart(2, '0')
  const dd = String(giorno).padStart(2, '0')
  return `${anno}-${mm}-${dd}`
}

/**
 * Parsa il contenuto CSV in righe grezze. Rileva automaticamente il
 * delimitatore (`,`/`;`/tab/`|`), rimuove il BOM, normalizza le intestazioni
 * (minuscolo + trim) e salta le righe vuote.
 */
export function parseCsvClienti(content: string): RigaGrezza[] {
  const senzaBom = content.replace(/^\uFEFF/, '')
  const result = Papa.parse<Record<string, string>>(senzaBom, {
    header: true,
    skipEmptyLines: 'greedy',
    delimiter: '', // autodetect
    transformHeader: (h) => h.trim().toLowerCase(),
  })
  return result.data.map((dati, i) => ({
    // header = riga 1; la prima riga di dati è la riga 2 del file
    riga: i + 2,
    dati,
  }))
}

function cella(dati: Record<string, string>, chiave: string): string {
  return (dati[chiave] ?? '').trim()
}

/**
 * Analizza le righe grezze e le classifica in nuovo/duplicato/errore rispetto
 * ai CF e ai numeri tessera già esistenti. Non effettua alcuna scrittura.
 */
export function analizzaImport(
  righe: RigaGrezza[],
  cfEsistenti: Set<string>,
  tessereEsistenti: Set<string>,
): ImportPreview {
  const risultati: ImportRowResult[] = []
  const cfVistiNelFile = new Set<string>()
  const tessereVisteNelFile = new Set<string>()

  for (const { riga, dati } of righe) {
    const cfRaw = cella(dati, 'codice_fiscale').toUpperCase()
    const nome = cella(dati, 'nome')
    const cognome = cella(dati, 'cognome')
    const cf = cfRaw || null

    // 1. Campi obbligatori e formato CF
    if (!cfRaw) {
      risultati.push({ riga, esito: 'errore', cf, motivo: 'CF_MANCANTE' })
      continue
    }
    if (!isCodiceFiscaleValid(cfRaw)) {
      risultati.push({ riga, esito: 'errore', cf, motivo: 'CF_NON_VALIDO' })
      continue
    }
    if (!nome || !cognome) {
      risultati.push({ riga, esito: 'errore', cf, motivo: 'NOME_COGNOME_MANCANTE' })
      continue
    }

    // 2. Duplicato già in anagrafica (saltato, non modificato)
    if (cfEsistenti.has(cfRaw)) {
      risultati.push({ riga, esito: 'duplicato', cf, motivo: 'GIA_PRESENTE' })
      continue
    }

    // 3. Duplicato all'interno dello stesso file
    if (cfVistiNelFile.has(cfRaw)) {
      risultati.push({ riga, esito: 'errore', cf, motivo: 'CF_RIPETUTO_FILE' })
      continue
    }
    cfVistiNelFile.add(cfRaw)

    // 4. Campi opzionali
    const cliente: CreateClienteInput = { codice_fiscale: cfRaw, nome, cognome }

    const tessera = cella(dati, 'numero_tessera')
    if (tessera) {
      if (tessereEsistenti.has(tessera) || tessereVisteNelFile.has(tessera)) {
        risultati.push({ riga, esito: 'errore', cf, motivo: 'TESSERA_IN_USO', motivoParams: { tessera } })
        continue
      }
      tessereVisteNelFile.add(tessera)
      cliente.numero_tessera = tessera
    }

    const dataNascita = cella(dati, 'data_nascita')
    if (dataNascita) {
      const iso = parseDataItaliana(dataNascita)
      if (!iso) {
        risultati.push({ riga, esito: 'errore', cf, motivo: 'DATA_NON_VALIDA', motivoParams: { valore: dataNascita } })
        continue
      }
      cliente.data_nascita = iso
    }

    const sesso = cella(dati, 'sesso').toUpperCase()
    if (sesso) {
      if (sesso !== 'M' && sesso !== 'F') {
        risultati.push({ riga, esito: 'errore', cf, motivo: 'SESSO_NON_VALIDO', motivoParams: { valore: sesso } })
        continue
      }
      cliente.sesso = sesso
    }

    for (const campo of CAMPI_TESTO) {
      const valore = cella(dati, campo)
      if (valore) cliente[campo] = valore
    }

    risultati.push({ riga, esito: 'nuovo', cf, cliente })
  }

  return {
    totali: risultati.length,
    nuovi: risultati.filter((r) => r.esito === 'nuovo').length,
    duplicati: risultati.filter((r) => r.esito === 'duplicato').length,
    errori: risultati.filter((r) => r.esito === 'errore').length,
    righe: risultati,
  }
}
