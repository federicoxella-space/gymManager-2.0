import { describe, it, expect } from 'vitest'
import {
  isCodiceFiscaleValid,
  decodificaCF,
  calcolaCF,
} from '../../../src/main/domain/codice-fiscale'

// ---------------------------------------------------------------------------
// CF generati tramite calcolaCF e verificati in modo incrociato.
// Non si usa nessun CF esterno hardcoded per evitare dipendenze da dati non
// verificati nel codebase.
// ---------------------------------------------------------------------------

describe('isCodiceFiscaleValid', () => {
  it('accetta un CF calcolato internamente (maschile)', () => {
    const cf = calcolaCF('Mario', 'Rossi', '1985-12-10', 'M', 'H501')
    expect(isCodiceFiscaleValid(cf)).toBe(true)
  })

  it('accetta un CF calcolato internamente (femminile)', () => {
    const cf = calcolaCF('Anna', 'Bianchi', '1990-06-15', 'F', 'F205')
    expect(isCodiceFiscaleValid(cf)).toBe(true)
  })

  it('restituisce false per stringa vuota', () => {
    expect(isCodiceFiscaleValid('')).toBe(false)
  })

  it('restituisce false per CF troppo corto (15 caratteri)', () => {
    const cf = calcolaCF('Mario', 'Rossi', '1985-12-10', 'M', 'H501')
    expect(isCodiceFiscaleValid(cf.slice(0, 15))).toBe(false)
  })

  it('restituisce false per CF con carattere di controllo errato', () => {
    const cf = calcolaCF('Mario', 'Rossi', '1985-12-10', 'M', 'H501')
    const cfSbagliato = cf.slice(0, 15) + (cf[15] === 'A' ? 'B' : 'A')
    expect(isCodiceFiscaleValid(cfSbagliato)).toBe(false)
  })

  it('è case-insensitive (normalizza in maiuscolo)', () => {
    const cf = calcolaCF('Mario', 'Rossi', '1985-12-10', 'M', 'H501')
    expect(isCodiceFiscaleValid(cf.toLowerCase())).toBe(true)
  })

  it('restituisce false per CF con formato non valido', () => {
    expect(isCodiceFiscaleValid('1234567890123456')).toBe(false)
  })

  it('restituisce false per CF con spazi interni', () => {
    const cf = calcolaCF('Mario', 'Rossi', '1985-12-10', 'M', 'H501')
    expect(isCodiceFiscaleValid(cf.slice(0, 8) + ' ' + cf.slice(8))).toBe(false)
  })
})

describe('decodificaCF — coerenza interna', () => {
  it('restituisce null per un CF formalmente non valido', () => {
    expect(decodificaCF('INVALIDO12345678')).toBeNull()
  })

  it('decodifica il sesso maschile da un CF generato', () => {
    const cf = calcolaCF('Marco', 'Ferrari', '1975-03-22', 'M', 'L736')
    const dati = decodificaCF(cf)
    expect(dati).not.toBeNull()
    expect(dati?.sesso).toBe('M')
    expect(dati?.giorno).toBe(22)
    expect(dati?.mese).toBe(3)    // C = marzo
    expect(dati?.annoCorto).toBe(75)
    expect(dati?.codiceComune).toBe('L736')
  })

  it('decodifica il sesso femminile da un CF generato (giorno - 40)', () => {
    const cf = calcolaCF('Sofia', 'Romano', '2000-08-07', 'F', 'A944')
    const dati = decodificaCF(cf)
    expect(dati).not.toBeNull()
    expect(dati?.sesso).toBe('F')
    expect(dati?.giorno).toBe(7)  // raw = 47, dopo sottrazione 40 = 7
    expect(dati?.mese).toBe(8)    // M = agosto
    expect(dati?.annoCorto).toBe(0)
    expect(dati?.codiceComune).toBe('A944')
  })

  it('decodifica i 12 mesi correttamente', () => {
    const mesiAttesi = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    for (const mese of mesiAttesi) {
      const data = `1990-${String(mese).padStart(2, '0')}-15`
      const cf = calcolaCF('Luca', 'Neri', data, 'M', 'H501')
      const dati = decodificaCF(cf)
      expect(dati?.mese, `mese ${mese}`).toBe(mese)
    }
  })

  it('round-trip: calcolaCF → decodificaCF restituisce i dati originali', () => {
    const cases: Array<[string, string, string, 'M' | 'F', string]> = [
      ['Giovanni', 'Conti', '1968-11-30', 'M', 'G273'],
      ['Elena',    'Marini', '1995-02-14', 'F', 'E625'],
      ['Pietro',   'Colombo', '1950-07-01', 'M', 'C933'],
    ]
    for (const [nome, cognome, data, sesso, comune] of cases) {
      const cf = calcolaCF(nome, cognome, data, sesso, comune)
      const dati = decodificaCF(cf)
      expect(dati, `CF generato: ${cf}`).not.toBeNull()
      expect(dati?.sesso).toBe(sesso)
      expect(dati?.codiceComune).toBe(comune)
      const [, meseStr, giornoStr] = data.split('-')
      expect(dati?.giorno).toBe(parseInt(giornoStr, 10))
      expect(dati?.mese).toBe(parseInt(meseStr, 10))
    }
  })
})

describe('calcolaCF — struttura e validità', () => {
  it('produce sempre un CF di 16 caratteri', () => {
    const cf = calcolaCF('Anna', 'Verdi', '2001-05-20', 'F', 'H501')
    expect(cf).toHaveLength(16)
  })

  it('produce un CF valido (round-trip con isCodiceFiscaleValid)', () => {
    const cases: Array<[string, string, string, 'M' | 'F', string]> = [
      ['Mario', 'Rossi', '1985-12-10', 'M', 'H501'],
      ['Anna', 'Bianchi', '1990-06-15', 'F', 'F205'],
      ['Luca', 'Ferrari', '2000-03-22', 'M', 'G702'],
      ['Giulia', 'Russo', '1978-09-01', 'F', 'L219'],
    ]
    for (const [nome, cognome, data, sesso, comune] of cases) {
      const cf = calcolaCF(nome, cognome, data, sesso, comune)
      expect(isCodiceFiscaleValid(cf), `CF non valido per ${nome} ${cognome}: ${cf}`).toBe(true)
    }
  })

  it('nome con 4+ consonanti usa 1a-3a-4a consonante', () => {
    // "Francesco" → consonanti: F,R,N,C,S,C → usa F,N,C (1a,3a,4a)
    const cf = calcolaCF('Francesco', 'Neri', '1990-01-01', 'M', 'H501')
    expect(cf.slice(3, 6)).toBe('FNC')
    expect(isCodiceFiscaleValid(cf)).toBe(true)
  })

  it('nome con 3 consonanti usa tutte e 3', () => {
    // "Luca" → consonanti: L,C → solo 2; poi vocali: U,A → "LCU"
    const cf = calcolaCF('Luca', 'Neri', '1990-01-01', 'M', 'H501')
    expect(cf.slice(3, 6)).toBe('LCU')
    expect(isCodiceFiscaleValid(cf)).toBe(true)
  })

  it('giorno femminile è codificato come giorno + 40', () => {
    const cf = calcolaCF('Maria', 'Neri', '1990-01-15', 'F', 'H501')
    // pos 9-10 (0-based) = giorno: 15+40=55
    expect(cf.slice(9, 11)).toBe('55')
    expect(isCodiceFiscaleValid(cf)).toBe(true)
  })
})
