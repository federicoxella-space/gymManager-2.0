import { describe, it, expect } from 'vitest'
import {
  parseCsvClienti,
  analizzaImport,
  parseDataItaliana,
} from '../../../src/main/domain/import-clienti'

const HEADER = 'codice_fiscale;nome;cognome;email'
// CF validi reali (superano il carattere di controllo)
const CF_A = 'RSSMRA85M01H501Q' // Mario Rossi
const CF_B = 'VRDLGI90A41H501K' // Luigi Verdi (esempio)

describe('parseDataItaliana', () => {
  it('converte gg/mm/aaaa in ISO', () => {
    expect(parseDataItaliana('01/03/1990')).toBe('1990-03-01')
  })
  it('accetta spazi e giorni/mesi a una cifra', () => {
    expect(parseDataItaliana(' 5/7/1988 ')).toBe('1988-07-05')
  })
  it('rifiuta date impossibili', () => {
    expect(parseDataItaliana('31/02/1990')).toBeNull()
    expect(parseDataItaliana('00/01/1990')).toBeNull()
    expect(parseDataItaliana('non-una-data')).toBeNull()
  })
})

describe('parseCsvClienti', () => {
  it('rileva il delimitatore ; e normalizza le intestazioni', () => {
    const righe = parseCsvClienti(`${HEADER}\n${CF_A};Mario;Rossi;m@x.it`)
    expect(righe).toHaveLength(1)
    expect(righe[0].riga).toBe(2)
    expect(righe[0].dati.codice_fiscale).toBe(CF_A)
    expect(righe[0].dati.nome).toBe('Mario')
    expect(righe[0].dati.email).toBe('m@x.it')
  })
  it('rileva il delimitatore , e ignora il BOM', () => {
    const righe = parseCsvClienti(`﻿codice_fiscale,nome,cognome\n${CF_A},Mario,Rossi`)
    expect(righe).toHaveLength(1)
    expect(righe[0].dati.codice_fiscale).toBe(CF_A)
  })
  it('gestisce intestazioni con maiuscole e spazi', () => {
    const righe = parseCsvClienti(` Codice_Fiscale ; Nome ; Cognome \n${CF_A};Mario;Rossi`)
    expect(righe[0].dati.codice_fiscale).toBe(CF_A)
    expect(righe[0].dati.nome).toBe('Mario')
  })
  it('salta le righe vuote', () => {
    const righe = parseCsvClienti(`${HEADER}\n\n${CF_A};Mario;Rossi;\n\n`)
    expect(righe).toHaveLength(1)
  })
})

describe('analizzaImport', () => {
  it('classifica una riga valida come nuovo e mappa CreateClienteInput', () => {
    const righe = parseCsvClienti(`${HEADER}\n${CF_A};Mario;Rossi;m@x.it`)
    const p = analizzaImport(righe, new Set(), new Set())
    expect(p.totali).toBe(1)
    expect(p.nuovi).toBe(1)
    expect(p.righe[0].esito).toBe('nuovo')
    expect(p.righe[0].cliente).toMatchObject({
      codice_fiscale: CF_A,
      nome: 'Mario',
      cognome: 'Rossi',
      email: 'm@x.it',
    })
  })
  it('marca come duplicato un CF già in anagrafica', () => {
    const righe = parseCsvClienti(`${HEADER}\n${CF_A};Mario;Rossi;`)
    const p = analizzaImport(righe, new Set([CF_A]), new Set())
    expect(p.duplicati).toBe(1)
    expect(p.righe[0].esito).toBe('duplicato')
  })
  it('marca come errore un CF non valido o campi obbligatori mancanti', () => {
    const righe = parseCsvClienti(`${HEADER}\nABC;Mario;Rossi;\n${CF_B};;Verdi;`)
    const p = analizzaImport(righe, new Set(), new Set())
    expect(p.errori).toBe(2)
    expect(p.righe[0].esito).toBe('errore')
    expect(p.righe[1].esito).toBe('errore')
  })
  it('marca come errore la seconda occorrenza dello stesso CF nel file', () => {
    const righe = parseCsvClienti(`${HEADER}\n${CF_A};Mario;Rossi;\n${CF_A};Mario;Rossi;`)
    const p = analizzaImport(righe, new Set(), new Set())
    expect(p.nuovi).toBe(1)
    expect(p.errori).toBe(1)
    expect(p.righe[1].esito).toBe('errore')
  })
  it('valida data_nascita e sesso opzionali', () => {
    const h = 'codice_fiscale;nome;cognome;data_nascita;sesso'
    const righe = parseCsvClienti(`${h}\n${CF_A};Mario;Rossi;31/02/1990;M`)
    const p = analizzaImport(righe, new Set(), new Set())
    expect(p.righe[0].esito).toBe('errore')
  })
  it('converte data_nascita valida in ISO nel CreateClienteInput', () => {
    const h = 'codice_fiscale;nome;cognome;data_nascita;sesso'
    const righe = parseCsvClienti(`${h}\n${CF_A};Mario;Rossi;01/03/1985;M`)
    const p = analizzaImport(righe, new Set(), new Set())
    expect(p.righe[0].cliente?.data_nascita).toBe('1985-03-01')
    expect(p.righe[0].cliente?.sesso).toBe('M')
  })
  it('marca come errore una numero_tessera già in uso', () => {
    const h = 'codice_fiscale;nome;cognome;numero_tessera'
    const righe = parseCsvClienti(`${h}\n${CF_A};Mario;Rossi;100`)
    const p = analizzaImport(righe, new Set(), new Set(['100']))
    expect(p.righe[0].esito).toBe('errore')
  })
})
