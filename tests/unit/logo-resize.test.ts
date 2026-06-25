import { describe, it, expect } from 'vitest'
import {
  calcolaDimensioniLogo,
  LOGO_MAX_WIDTH_PX,
  LOGO_MAX_HEIGHT_PX
} from '../../src/renderer/src/utils/logo'

/** Tolleranza per il rapporto d'aspetto dopo l'arrotondamento ai pixel interi. */
const RAPPORTO_TOLLERANZA = 0.02

describe('calcolaDimensioniLogo — ridimensionamento del logo', () => {
  it('non ingrandisce un logo già più piccolo del box (solo downscale)', () => {
    expect(calcolaDimensioniLogo(100, 50)).toEqual({ width: 100, height: 50 })
  })

  it('riduce dentro il box quando entrambi i lati eccedono', () => {
    const { width, height } = calcolaDimensioniLogo(800, 800)
    expect(width).toBeLessThanOrEqual(LOGO_MAX_WIDTH_PX)
    expect(height).toBeLessThanOrEqual(LOGO_MAX_HEIGHT_PX)
    // quadrato 800×800 → vincolato dall'altezza (192) → 192×192
    expect(width).toBe(192)
    expect(height).toBe(192)
  })

  it('preserva il rapporto d’aspetto su immagine panoramica', () => {
    const { width, height } = calcolaDimensioniLogo(1000, 200)
    // vincolato dalla larghezza (360) → 360×72
    expect(width).toBe(360)
    expect(height).toBe(72)
    expect(width / height).toBeCloseTo(1000 / 200, 1)
  })

  it('preserva il rapporto d’aspetto su immagine verticale', () => {
    const { width, height } = calcolaDimensioniLogo(400, 1200)
    // vincolato dall'altezza (192) → 64×192
    expect(width).toBe(64)
    expect(height).toBe(192)
    expect(width / height).toBeCloseTo(400 / 1200, 1)
  })

  it('non deforma mai: il rapporto d’aspetto resta invariato per molti formati', () => {
    const casi: Array<[number, number]> = [
      [1920, 1080],
      [3000, 4000],
      [640, 480],
      [2500, 500],
      [777, 333],
      [4096, 4096]
    ]
    for (const [w, h] of casi) {
      const r = calcolaDimensioniLogo(w, h)
      expect(r.width).toBeLessThanOrEqual(LOGO_MAX_WIDTH_PX)
      expect(r.height).toBeLessThanOrEqual(LOGO_MAX_HEIGHT_PX)
      expect(Math.abs(r.width / r.height - w / h)).toBeLessThan(RAPPORTO_TOLLERANZA)
    }
  })

  it('gestisce dimensioni non valide senza crash', () => {
    expect(calcolaDimensioniLogo(0, 100)).toEqual({ width: 0, height: 0 })
    expect(calcolaDimensioniLogo(100, 0)).toEqual({ width: 0, height: 0 })
    expect(calcolaDimensioniLogo(-5, -5)).toEqual({ width: 0, height: 0 })
  })

  it('non scende mai sotto 1px su lati estremamente sproporzionati', () => {
    const { width, height } = calcolaDimensioniLogo(10000, 5)
    expect(width).toBeLessThanOrEqual(LOGO_MAX_WIDTH_PX)
    expect(height).toBeGreaterThanOrEqual(1)
  })
})
