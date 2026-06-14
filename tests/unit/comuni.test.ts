import { describe, it, expect } from 'vitest'
import { cercaComuni, comunePerCodice } from '../../src/main/domain/comuni'

describe('cercaComuni', () => {
  it('trova Roma e ne restituisce il codice catastale H501', () => {
    const res = cercaComuni('roma', 20)
    const roma = res.find((c) => c.nome.toLowerCase() === 'roma')
    expect(roma).toBeDefined()
    expect(roma!.codiceCatastale).toBe('H501')
  })

  it('è case-insensitive e limita i risultati', () => {
    const res = cercaComuni('MILANO', 5)
    expect(res.length).toBeGreaterThan(0)
    expect(res.length).toBeLessThanOrEqual(5)
    expect(res.some((c) => c.nome.toLowerCase() === 'milano')).toBe(true)
  })

  it('restituisce [] per query troppo corta', () => {
    expect(cercaComuni('a', 10)).toEqual([])
  })
})

describe('comunePerCodice', () => {
  it('risolve H501 → Roma', () => {
    const c = comunePerCodice('H501')
    expect(c?.nome.toLowerCase()).toBe('roma')
  })
  it('restituisce null per codice inesistente', () => {
    expect(comunePerCodice('ZZZZ')).toBeNull()
  })
})
