/**
 * Test unitari per src/main/domain/iscrizione.ts
 * Copre tutte le invarianti F2 per iscrizioni e abbonamenti.
 */

import { describe, it, expect } from 'vitest'
import {
  calcolaStatoIscrizione,
  calcolaStatoAbbonamento,
  abbonamentoOltreScadenzaIscrizione,
  calcolaDataScadenza,
  calcolaStatoConPreavviso,
} from '../../../src/main/domain/iscrizione'

// ---------------------------------------------------------------------------
// calcolaStatoIscrizione
// ---------------------------------------------------------------------------

describe('calcolaStatoIscrizione', () => {
  it('scaduta quando data_scadenza è nel passato', () => {
    const oggi = new Date('2024-06-15')
    expect(calcolaStatoIscrizione('2024-06-14', oggi)).toBe('scaduta')
  })

  it('scaduta quando data_scadenza è un anno fa', () => {
    const oggi = new Date('2025-01-01')
    expect(calcolaStatoIscrizione('2024-01-01', oggi)).toBe('scaduta')
  })

  it('attiva quando data_scadenza è nel futuro', () => {
    const oggi = new Date('2024-06-15')
    expect(calcolaStatoIscrizione('2024-12-31', oggi)).toBe('attiva')
  })

  it('attiva quando data_scadenza è oggi (stesso giorno)', () => {
    const oggi = new Date('2024-06-15')
    expect(calcolaStatoIscrizione('2024-06-15', oggi)).toBe('attiva')
  })
})

// ---------------------------------------------------------------------------
// calcolaStatoAbbonamento
// ---------------------------------------------------------------------------

describe('calcolaStatoAbbonamento', () => {
  it('scaduto quando data_scadenza è nel passato', () => {
    const oggi = new Date('2024-06-15')
    expect(calcolaStatoAbbonamento('2024-06-14', oggi)).toBe('scaduto')
  })

  it('attivo quando data_scadenza è nel futuro', () => {
    const oggi = new Date('2024-06-15')
    expect(calcolaStatoAbbonamento('2024-12-31', oggi)).toBe('attivo')
  })

  it('attivo quando data_scadenza è oggi', () => {
    const oggi = new Date('2024-06-15')
    expect(calcolaStatoAbbonamento('2024-06-15', oggi)).toBe('attivo')
  })
})

// ---------------------------------------------------------------------------
// abbonamentoOltreScadenzaIscrizione — invariante 3
// ---------------------------------------------------------------------------

describe('abbonamentoOltreScadenzaIscrizione', () => {
  it('true quando abbonamento supera la scadenza iscrizione (invariante 3: ammesso con segnalazione)', () => {
    expect(
      abbonamentoOltreScadenzaIscrizione('2025-02-01', '2025-01-31'),
    ).toBe(true)
  })

  it('true quando abbonamento supera di molto la scadenza iscrizione', () => {
    expect(
      abbonamentoOltreScadenzaIscrizione('2026-01-01', '2025-01-01'),
    ).toBe(true)
  })

  it('false quando abbonamento non supera la scadenza iscrizione', () => {
    expect(
      abbonamentoOltreScadenzaIscrizione('2025-01-15', '2025-01-31'),
    ).toBe(false)
  })

  it('false quando le date coincidono esattamente', () => {
    expect(
      abbonamentoOltreScadenzaIscrizione('2025-01-31', '2025-01-31'),
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// calcolaDataScadenza
// ---------------------------------------------------------------------------

describe('calcolaDataScadenza', () => {
  it('1 mese da 2024-01-15 → 2024-02-15', () => {
    expect(calcolaDataScadenza('2024-01-15', 1)).toBe('2024-02-15')
  })

  it('12 mesi da 2024-01-15 → 2025-01-15', () => {
    expect(calcolaDataScadenza('2024-01-15', 12)).toBe('2025-01-15')
  })

  it('6 mesi da 2024-06-01 → 2024-12-01', () => {
    expect(calcolaDataScadenza('2024-06-01', 6)).toBe('2024-12-01')
  })

  it('1 mese da 2024-01-31 → 2024-02-29 (2024 è bisestile)', () => {
    expect(calcolaDataScadenza('2024-01-31', 1)).toBe('2024-02-29')
  })

  it('1 mese da 2023-01-31 → 2023-02-28 (2023 non è bisestile)', () => {
    expect(calcolaDataScadenza('2023-01-31', 1)).toBe('2023-02-28')
  })

  it('1 mese da 2024-03-31 → 2024-04-30 (aprile ha 30 giorni)', () => {
    expect(calcolaDataScadenza('2024-03-31', 1)).toBe('2024-04-30')
  })

  it('24 mesi da 2024-02-29 → 2026-02-28 (2026 non è bisestile)', () => {
    expect(calcolaDataScadenza('2024-02-29', 24)).toBe('2026-02-28')
  })

  it('3 mesi da 2024-11-30 → 2025-02-28', () => {
    expect(calcolaDataScadenza('2024-11-30', 3)).toBe('2025-02-28')
  })
})

// ---------------------------------------------------------------------------
// calcolaStatoConPreavviso
// ---------------------------------------------------------------------------

describe('calcolaStatoConPreavviso', () => {
  const oggi = new Date('2024-06-15')
  const PREAVVISO = 30

  it('in_scadenza quando la scadenza è entro 30 giorni (stesso giorno)', () => {
    expect(
      calcolaStatoConPreavviso('2024-06-15', 'attiva', oggi, PREAVVISO),
    ).toBe('in_scadenza')
  })

  it('in_scadenza quando la scadenza è tra 10 giorni', () => {
    expect(
      calcolaStatoConPreavviso('2024-06-25', 'attiva', oggi, PREAVVISO),
    ).toBe('in_scadenza')
  })

  it('in_scadenza esattamente al limite del preavviso (30 giorni)', () => {
    expect(
      calcolaStatoConPreavviso('2024-07-15', 'attiva', oggi, PREAVVISO),
    ).toBe('in_scadenza')
  })

  it('attiva quando la scadenza è oltre i 30 giorni', () => {
    expect(
      calcolaStatoConPreavviso('2024-07-16', 'attiva', oggi, PREAVVISO),
    ).toBe('attiva')
  })

  it('attiva quando la scadenza è molto lontana', () => {
    expect(
      calcolaStatoConPreavviso('2025-12-31', 'attiva', oggi, PREAVVISO),
    ).toBe('attiva')
  })

  it('scaduta se statoCorrente è scaduta', () => {
    expect(
      calcolaStatoConPreavviso('2024-06-01', 'scaduta', oggi, PREAVVISO),
    ).toBe('scaduta')
  })

  it('scaduta se statoCorrente è scaduto (abbonamento)', () => {
    expect(
      calcolaStatoConPreavviso('2024-06-01', 'scaduto', oggi, PREAVVISO),
    ).toBe('scaduta')
  })

  it('invalidata se statoCorrente è invalidata (iscrizione)', () => {
    expect(
      calcolaStatoConPreavviso('2024-12-31', 'invalidata', oggi, PREAVVISO),
    ).toBe('invalidata')
  })

  it('invalidata se statoCorrente è invalidato (abbonamento)', () => {
    expect(
      calcolaStatoConPreavviso('2024-12-31', 'invalidato', oggi, PREAVVISO),
    ).toBe('invalidata')
  })

  it('funziona con preavviso 0 giorni: in_scadenza solo il giorno stesso', () => {
    expect(calcolaStatoConPreavviso('2024-06-15', 'attiva', oggi, 0)).toBe('in_scadenza')
    expect(calcolaStatoConPreavviso('2024-06-16', 'attiva', oggi, 0)).toBe('attiva')
  })
})
