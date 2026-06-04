import { describe, it, expect, beforeAll } from 'vitest'
import { isMinorenne, validaCliente } from '../../../src/main/domain/cliente'
import { calcolaCF } from '../../../src/main/domain/codice-fiscale'
import type { CreateClienteInput } from '../../../src/types/shared'

// CF generati internamente — consistenti con l'implementazione corrente
let CF_ADULTO: string
let CF_TUTORE: string
let CF_MINORE_ADULTO: string // CF formalmente valido usato per il cliente minorenne

beforeAll(() => {
  // Usiamo calcolaCF per avere CF verificati internamente coerenti
  CF_ADULTO = calcolaCF('Mario', 'Rossi', '1985-12-10', 'M', 'H501')
  CF_TUTORE = calcolaCF('Anna', 'Verdi', '1975-06-20', 'F', 'H501')
  // Per il "minorenne" il CF è formalmente valido ma la data_nascita nel form
  // indica minorennità — il test verifica la logica di validazione, non la
  // corrispondenza CF↔data_nascita (che è controllo separato).
  CF_MINORE_ADULTO = calcolaCF('Luca', 'Bianchi', '1990-03-10', 'M', 'F205')
})

describe('isMinorenne', () => {
  it('restituisce true per un minorenne', () => {
    const oggi = new Date('2026-06-05')
    expect(isMinorenne('2010-03-15', oggi)).toBe(true)
  })

  it('restituisce false per un maggiorenne', () => {
    const oggi = new Date('2026-06-05')
    expect(isMinorenne('1985-12-10', oggi)).toBe(false)
  })

  it('restituisce false esattamente il giorno del 18° compleanno', () => {
    const oggi = new Date('2026-06-05')
    // Nato il 2008-06-05 → compie 18 anni oggi → non è più minorenne
    expect(isMinorenne('2008-06-05', oggi)).toBe(false)
  })

  it('restituisce true il giorno prima del 18° compleanno', () => {
    const oggi = new Date('2026-06-05')
    // Nato il 2008-06-06 → 18° compleanno sarà domani → è ancora minorenne
    expect(isMinorenne('2008-06-06', oggi)).toBe(true)
  })

  it('restituisce false per dataNascita null', () => {
    expect(isMinorenne(null)).toBe(false)
  })

  it('restituisce false per dataNascita undefined', () => {
    expect(isMinorenne(undefined)).toBe(false)
  })

  it('restituisce false per dataNascita non parsabile', () => {
    expect(isMinorenne('non-una-data')).toBe(false)
  })
})

describe('validaCliente', () => {
  it('accetta un cliente adulto con dati minimi validi', () => {
    const input: CreateClienteInput = {
      nome: 'Mario',
      cognome: 'Rossi',
      codice_fiscale: CF_ADULTO,
      data_nascita: '1985-12-10',
    }
    const result = validaCliente(input)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rifiuta nome vuoto', () => {
    const input: CreateClienteInput = {
      nome: '',
      cognome: 'Rossi',
      codice_fiscale: CF_ADULTO,
    }
    const result = validaCliente(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'nome')).toBe(true)
  })

  it('rifiuta nome composto solo da spazi', () => {
    const input: CreateClienteInput = {
      nome: '   ',
      cognome: 'Rossi',
      codice_fiscale: CF_ADULTO,
    }
    const result = validaCliente(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'nome')).toBe(true)
  })

  it('rifiuta cognome vuoto', () => {
    const input: CreateClienteInput = {
      nome: 'Mario',
      cognome: '',
      codice_fiscale: CF_ADULTO,
    }
    const result = validaCliente(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'cognome')).toBe(true)
  })

  it('rifiuta codice_fiscale assente', () => {
    const input: CreateClienteInput = {
      nome: 'Mario',
      cognome: 'Rossi',
      codice_fiscale: '',
    }
    const result = validaCliente(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'codice_fiscale')).toBe(true)
  })

  it('rifiuta codice_fiscale non valido', () => {
    const input: CreateClienteInput = {
      nome: 'Mario',
      cognome: 'Rossi',
      codice_fiscale: 'INVALIDO1234567X',
    }
    const result = validaCliente(input)
    expect(result.valid).toBe(false)
    const cfErr = result.errors.find(e => e.field === 'codice_fiscale')
    expect(cfErr).toBeDefined()
    expect(cfErr?.message).toContain('non è valido')
  })

  it('non richiede indirizzo al salvataggio', () => {
    const input: CreateClienteInput = {
      nome: 'Mario',
      cognome: 'Rossi',
      codice_fiscale: CF_ADULTO,
      via: null,
      citta: null,
      cap: null,
    }
    const result = validaCliente(input)
    expect(result.valid).toBe(true)
  })

  it('accumula più errori contemporaneamente', () => {
    const input: CreateClienteInput = {
      nome: '',
      cognome: '',
      codice_fiscale: '',
    }
    const result = validaCliente(input)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(3)
  })

  describe('minorenne — validazione tutore', () => {
    it('richiede tutti i dati tutore per un minorenne senza tutore', () => {
      const input: CreateClienteInput = {
        nome: 'Luca',
        cognome: 'Verdi',
        codice_fiscale: CF_MINORE_ADULTO,
        data_nascita: '2012-01-01', // minorenne nel 2026
      }
      const result = validaCliente(input)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'tutore_nome')).toBe(true)
      expect(result.errors.some(e => e.field === 'tutore_cognome')).toBe(true)
      expect(result.errors.some(e => e.field === 'tutore_cf')).toBe(true)
    })

    it('accetta un minorenne con tutti i dati tutore validi', () => {
      const input: CreateClienteInput = {
        nome: 'Luca',
        cognome: 'Verdi',
        codice_fiscale: CF_MINORE_ADULTO,
        data_nascita: '2012-01-01',
        tutore_nome: 'Anna',
        tutore_cognome: 'Verdi',
        tutore_cf: CF_TUTORE,
      }
      const result = validaCliente(input)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('rifiuta tutore con CF non valido', () => {
      const input: CreateClienteInput = {
        nome: 'Luca',
        cognome: 'Verdi',
        codice_fiscale: CF_MINORE_ADULTO,
        data_nascita: '2012-01-01',
        tutore_nome: 'Anna',
        tutore_cognome: 'Verdi',
        tutore_cf: 'INVALIDO1234567X',
      }
      const result = validaCliente(input)
      expect(result.valid).toBe(false)
      const cfErr = result.errors.find(e => e.field === 'tutore_cf')
      expect(cfErr).toBeDefined()
      expect(cfErr?.message).toContain('non è valido')
    })

    it('non richiede dati tutore per un adulto', () => {
      const input: CreateClienteInput = {
        nome: 'Mario',
        cognome: 'Rossi',
        codice_fiscale: CF_ADULTO,
        data_nascita: '1985-12-10',
      }
      const result = validaCliente(input)
      expect(result.errors.some(e => e.field.startsWith('tutore'))).toBe(false)
    })

    it('accetta un adulto senza data_nascita (nessuna richiesta tutore)', () => {
      const input: CreateClienteInput = {
        nome: 'Mario',
        cognome: 'Rossi',
        codice_fiscale: CF_ADULTO,
      }
      const result = validaCliente(input)
      expect(result.valid).toBe(true)
    })
  })
})
