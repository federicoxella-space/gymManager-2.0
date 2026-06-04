import { describe, it, expect } from 'vitest'
import {
  calcolaStatoCertificato,
  enrichCertificatoConStato,
} from '../../../src/main/domain/certificato-medico'

const AVVISO_30_GIORNI = 30

describe('calcolaStatoCertificato', () => {
  it('restituisce "scaduto" se la data di scadenza è nel passato', () => {
    const oggi = new Date('2026-06-05')
    expect(calcolaStatoCertificato('2026-06-04', oggi, AVVISO_30_GIORNI)).toBe('scaduto')
    expect(calcolaStatoCertificato('2025-01-01', oggi, AVVISO_30_GIORNI)).toBe('scaduto')
  })

  it('restituisce "in_scadenza" se scade oggi', () => {
    const oggi = new Date('2026-06-05')
    expect(calcolaStatoCertificato('2026-06-05', oggi, AVVISO_30_GIORNI)).toBe('in_scadenza')
  })

  it('restituisce "in_scadenza" se scade entro il periodo di preavviso', () => {
    const oggi = new Date('2026-06-05')
    expect(calcolaStatoCertificato('2026-07-04', oggi, AVVISO_30_GIORNI)).toBe('in_scadenza')
  })

  it('restituisce "in_scadenza" esattamente al limite del preavviso (oggi + 30 giorni)', () => {
    // 2026-06-05 + 30 = 2026-07-05 → incluso nella finestra → in_scadenza
    const oggi = new Date('2026-06-05')
    expect(calcolaStatoCertificato('2026-07-05', oggi, AVVISO_30_GIORNI)).toBe('in_scadenza')
  })

  it('restituisce "valido" se scade a 31+ giorni da oggi', () => {
    // 2026-06-05 + 31 = 2026-07-06 → fuori dalla finestra → valido
    const oggi = new Date('2026-06-05')
    expect(calcolaStatoCertificato('2026-07-06', oggi, AVVISO_30_GIORNI)).toBe('valido')
    expect(calcolaStatoCertificato('2027-01-01', oggi, AVVISO_30_GIORNI)).toBe('valido')
  })

  it('usa correttamente un preavviso a zero giorni', () => {
    const oggi = new Date('2026-06-05')
    expect(calcolaStatoCertificato('2026-06-05', oggi, 0)).toBe('in_scadenza')
    expect(calcolaStatoCertificato('2026-06-06', oggi, 0)).toBe('valido')
  })
})

describe('enrichCertificatoConStato', () => {
  it('arricchisce correttamente un certificato scaduto', () => {
    const oggi = new Date('2026-06-05')
    const cert = {
      id: 1,
      clienteId: 42,
      tipo: 'non agonistico',
      dataScadenza: '2026-05-01',
    }
    const result = enrichCertificatoConStato(cert, oggi, AVVISO_30_GIORNI)
    expect(result.stato).toBe('scaduto')
    expect(result.giorniAllaScadenza).toBeLessThan(0)
  })

  it('arricchisce correttamente un certificato valido', () => {
    const oggi = new Date('2026-06-05')
    const cert = {
      id: 2,
      clienteId: 42,
      tipo: 'agonistico',
      dataScadenza: '2027-01-01',
    }
    const result = enrichCertificatoConStato(cert, oggi, AVVISO_30_GIORNI)
    expect(result.stato).toBe('valido')
    expect(result.giorniAllaScadenza).toBeGreaterThan(30)
  })

  it('calcola giorniAllaScadenza = 0 per scadenza oggi', () => {
    const oggi = new Date('2026-06-05')
    const cert = {
      id: 3,
      clienteId: 42,
      tipo: 'non agonistico',
      dataScadenza: '2026-06-05',
    }
    const result = enrichCertificatoConStato(cert, oggi, AVVISO_30_GIORNI)
    expect(result.giorniAllaScadenza).toBe(0)
    expect(result.stato).toBe('in_scadenza')
  })
})
