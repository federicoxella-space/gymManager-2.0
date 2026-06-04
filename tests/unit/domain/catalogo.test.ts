/**
 * Test unitari per src/main/domain/catalogo.ts
 * Copre validazioni dei tipi di catalogo e calcolo delle proposte di date.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  validaTipoIscrizione,
  validaTipoAbbonamento,
  proposteDate,
} from '../../../src/main/domain/catalogo'

// ---------------------------------------------------------------------------
// validaTipoIscrizione
// ---------------------------------------------------------------------------

describe('validaTipoIscrizione', () => {
  it('nome vuoto → errore sul campo nome', () => {
    const result = validaTipoIscrizione({ nome: '', durata_mesi: 12, prezzo_default: 50 })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'nome')).toBe(true)
  })

  it('nome solo spazi → errore sul campo nome', () => {
    const result = validaTipoIscrizione({ nome: '   ', durata_mesi: 12, prezzo_default: 50 })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'nome')).toBe(true)
  })

  it('durata_mesi < 1 → errore sul campo durata_mesi', () => {
    const result = validaTipoIscrizione({ nome: 'Annuale', durata_mesi: 0, prezzo_default: 50 })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'durata_mesi')).toBe(true)
  })

  it('durata_mesi negativa → errore sul campo durata_mesi', () => {
    const result = validaTipoIscrizione({ nome: 'Annuale', durata_mesi: -3, prezzo_default: 50 })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'durata_mesi')).toBe(true)
  })

  it('prezzo_default negativo → errore sul campo prezzo_default', () => {
    const result = validaTipoIscrizione({ nome: 'Annuale', durata_mesi: 12, prezzo_default: -1 })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'prezzo_default')).toBe(true)
  })

  it('tutti i campi validi → valid: true, nessun errore', () => {
    const result = validaTipoIscrizione({
      nome: 'Tesseramento annuale',
      durata_mesi: 12,
      prezzo_default: 30,
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('prezzo_default 0 → valido (gratuito ammesso)', () => {
    const result = validaTipoIscrizione({ nome: 'Prova', durata_mesi: 1, prezzo_default: 0 })
    expect(result.valid).toBe(true)
  })

  it('durata_mesi 1 → valido (minimo consentito)', () => {
    const result = validaTipoIscrizione({ nome: 'Mensile', durata_mesi: 1, prezzo_default: 20 })
    expect(result.valid).toBe(true)
  })

  it('multipli errori contemporanei', () => {
    const result = validaTipoIscrizione({ nome: '', durata_mesi: 0, prezzo_default: -5 })
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// validaTipoAbbonamento
// ---------------------------------------------------------------------------

describe('validaTipoAbbonamento', () => {
  it('nome vuoto → errore', () => {
    const result = validaTipoAbbonamento({ nome: '', durata_mesi: 1, prezzo_default: 0 })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'nome')).toBe(true)
  })

  it('tutti validi senza colore → valid: true', () => {
    const result = validaTipoAbbonamento({ nome: 'Sala pesi', durata_mesi: 3, prezzo_default: 60 })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('tutti validi con colore → valid: true', () => {
    const result = validaTipoAbbonamento({
      nome: 'Yoga',
      durata_mesi: 6,
      prezzo_default: 80,
      colore: '#FF5722',
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('durata_mesi < 1 → errore durata_mesi', () => {
    const result = validaTipoAbbonamento({ nome: 'Mensile', durata_mesi: 0, prezzo_default: 40 })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'durata_mesi')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// proposteDate
// ---------------------------------------------------------------------------

describe('proposteDate', () => {
  it('12 mesi da data X → scadenza X+12 mesi', () => {
    const { dataInizio, dataScadenza } = proposteDate(12, '2024-03-01')
    expect(dataInizio).toBe('2024-03-01')
    expect(dataScadenza).toBe('2025-03-01')
  })

  it('6 mesi da 2024-08-15 → scadenza 2025-02-15', () => {
    const { dataInizio, dataScadenza } = proposteDate(6, '2024-08-15')
    expect(dataInizio).toBe('2024-08-15')
    expect(dataScadenza).toBe('2025-02-15')
  })

  it('1 mese da 2024-01-31 → scadenza 2024-02-29 (fine mese bisestile)', () => {
    const { dataScadenza } = proposteDate(1, '2024-01-31')
    expect(dataScadenza).toBe('2024-02-29')
  })

  it('senza dataInizio usa oggi (formato YYYY-MM-DD)', () => {
    // Fissiamo la data "oggi" tramite fake timer
    const fakeNow = new Date('2024-06-05T00:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(fakeNow)

    const { dataInizio, dataScadenza } = proposteDate(3)

    vi.useRealTimers()

    expect(dataInizio).toBe('2024-06-05')
    expect(dataScadenza).toBe('2024-09-05')
  })

  it('senza dataInizio la data di inizio è oggi nel formato corretto', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-11-01T12:00:00.000Z'))

    const { dataInizio } = proposteDate(12)

    vi.useRealTimers()

    expect(dataInizio).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(dataInizio).toBe('2025-11-01')
  })
})
