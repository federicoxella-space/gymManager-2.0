/**
 * Test unitari per src/main/domain/ricevuta-format.ts
 * Verifica formattazione valuta, date e numerazione ricevute.
 */

import { describe, it, expect } from 'vitest'
import {
  formatImporto,
  formatDataIT,
  formatNumeroRicevuta,
} from '../../../src/main/domain/ricevuta-format'

// ---------------------------------------------------------------------------
// formatImporto
// ---------------------------------------------------------------------------

describe('formatImporto', () => {
  it('0 → "0,00 €"', () => {
    expect(formatImporto(0)).toBe('0,00 €')
  })

  it('1234.56 → "1.234,56 €"', () => {
    expect(formatImporto(1234.56)).toBe('1.234,56 €')
  })

  it('20 → "20,00 €"', () => {
    expect(formatImporto(20)).toBe('20,00 €')
  })

  it('0.5 → "0,50 €"', () => {
    expect(formatImporto(0.5)).toBe('0,50 €')
  })
})

// ---------------------------------------------------------------------------
// formatDataIT
// ---------------------------------------------------------------------------

describe('formatDataIT', () => {
  it("'2025-01-15' → '15/01/2025'", () => {
    expect(formatDataIT('2025-01-15')).toBe('15/01/2025')
  })

  it("'2026-12-31' → '31/12/2026'", () => {
    expect(formatDataIT('2026-12-31')).toBe('31/12/2026')
  })
})

// ---------------------------------------------------------------------------
// formatNumeroRicevuta
// ---------------------------------------------------------------------------

describe('formatNumeroRicevuta', () => {
  it("(2025, 1) → '2025-1'", () => {
    expect(formatNumeroRicevuta(2025, 1)).toBe('2025-1')
  })

  it("(2026, 42) → '2026-42'", () => {
    expect(formatNumeroRicevuta(2026, 42)).toBe('2026-42')
  })
})
