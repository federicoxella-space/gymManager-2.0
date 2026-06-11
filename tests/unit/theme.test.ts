import { describe, it, expect } from 'vitest'
import { scalaPrimaria } from '../../src/renderer/src/theme'

describe('scalaPrimaria', () => {
  it('mantiene il colore base sulla sfumatura 500 (in forma "r g b")', () => {
    const scala = scalaPrimaria('37,99,235')
    expect(scala?.[500]).toBe('37 99 235')
  })

  it('produce tutte e 10 le sfumature', () => {
    const scala = scalaPrimaria('37,99,235')
    expect(Object.keys(scala ?? {}).map(Number).sort((a, b) => a - b)).toEqual([
      50, 100, 200, 300, 400, 500, 600, 700, 800, 900
    ])
  })

  it('schiarisce verso il 50 e scurisce verso il 900', () => {
    const scala = scalaPrimaria('37,99,235')!
    const lum = (s: string): number => s.split(' ').reduce((a, v) => a + Number(v), 0)
    expect(lum(scala[50])).toBeGreaterThan(lum(scala[500]))
    expect(lum(scala[900])).toBeLessThan(lum(scala[500]))
  })

  it('clampa i valori entro 0..255 e arrotonda a interi', () => {
    const scala = scalaPrimaria('250,250,250')!
    for (const v of scala[50].split(' ')) {
      const n = Number(v)
      expect(Number.isInteger(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(255)
    }
  })

  it('ritorna null per input malformato', () => {
    expect(scalaPrimaria('non-valido')).toBeNull()
    expect(scalaPrimaria('1,2')).toBeNull()
  })
})
