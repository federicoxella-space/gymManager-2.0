import { describe, it, expect } from 'vitest'
import {
  calcolaIntestatario,
  indirizzoIntestatarioCompleto
} from '../../src/renderer/src/utils/dominio'
import type { ClienteRow } from '../../src/types/shared'

function baseCliente(over: Partial<ClienteRow> = {}): ClienteRow {
  return {
    id: 1,
    numero_tessera: null,
    nome: 'Mario',
    cognome: 'Rossi',
    codice_fiscale: 'RSSMRA85T10H501Z',
    data_nascita: '1985-12-10',
    sesso: 'M',
    comune_nascita: null,
    via: 'Via Roma',
    civico: '1',
    citta: 'Milano',
    provincia: 'MI',
    cap: '20100',
    email: null,
    telefono: null,
    note: null,
    tutore_nome: null,
    tutore_cognome: null,
    tutore_cf: null,
    tutore_via: null,
    tutore_civico: null,
    tutore_citta: null,
    tutore_provincia: null,
    tutore_cap: null,
    stato: 'attivo',
    data_inserimento: '2024-01-01',
    data_modifica: '2024-01-01',
    ...over
  } as ClienteRow
}

describe('calcolaIntestatario', () => {
  it('per un maggiorenne usa i dati del cliente', () => {
    const i = calcolaIntestatario(baseCliente())
    expect(i.isTutore).toBe(false)
    expect(i.cf).toBe('RSSMRA85T10H501Z')
    expect(i.assistitoCf).toBeNull()
  })

  it('per un minorenne con tutore usa il tutore e valorizza assistitoCf', () => {
    const i = calcolaIntestatario(
      baseCliente({
        data_nascita: '2015-01-01',
        tutore_nome: 'Anna',
        tutore_cognome: 'Verdi',
        tutore_cf: 'VRDNNA80A41F205X'
      })
    )
    expect(i.isTutore).toBe(true)
    expect(i.nome).toBe('Anna')
    expect(i.cf).toBe('VRDNNA80A41F205X')
    expect(i.assistitoCf).toBe('RSSMRA85T10H501Z')
  })

  it('per un maggiorenne con dati tutore ignora il tutore', () => {
    const i = calcolaIntestatario(
      baseCliente({ tutore_cf: 'VRDNNA80A41F205X', tutore_nome: 'Anna', tutore_cognome: 'Verdi' })
    )
    expect(i.isTutore).toBe(false)
    expect(i.cf).toBe('RSSMRA85T10H501Z')
  })
})

describe('indirizzoIntestatarioCompleto', () => {
  it('true se via+città+cap del cliente sono presenti (maggiorenne)', () => {
    expect(indirizzoIntestatarioCompleto(baseCliente())).toBe(true)
  })

  it('false se manca il cap', () => {
    expect(indirizzoIntestatarioCompleto(baseCliente({ cap: null }))).toBe(false)
  })

  it("per un minore con tutore controlla l'indirizzo del tutore", () => {
    const minore = baseCliente({
      data_nascita: '2015-01-01',
      tutore_cf: 'VRDNNA80A41F205X',
      tutore_nome: 'Anna',
      tutore_cognome: 'Verdi'
    })
    expect(indirizzoIntestatarioCompleto(minore)).toBe(false)
    minore.tutore_via = 'Via Po'
    minore.tutore_citta = 'Torino'
    minore.tutore_cap = '10100'
    expect(indirizzoIntestatarioCompleto(minore)).toBe(true)
  })
})
