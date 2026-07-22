# Import clienti da CSV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importare clienti da un file CSV in modo puramente additivo, con anteprima, deduplica per codice fiscale e report degli scarti.

**Architecture:** Logica di parsing/analisi pura e testabile in `src/main/domain/import-clienti.ts`; funzioni di lettura/scrittura DB in `clients-repository.ts`; due handler IPC (`analizza`/`esegui`, che rileggono il file al momento della scrittura) più un handler per il modello CSV; UI in un modale React a 3 step con un pulsante in `ClientsPage`.

**Tech Stack:** Electron + React + TypeScript, better-sqlite3-multiple-ciphers, papaparse, Vitest, i18next.

## Global Constraints

- KISS: soluzione più semplice che soddisfa la specifica; niente astrazioni premature.
- TypeScript strict; niente `any` senza motivazione esplicita.
- Stringhe UI **sempre** esternalizzate in i18n (namespace `clienti.import.*`); mai hardcoded.
- Sicurezza Electron: nessun accesso a `fs` dal renderer; lettura file solo nel main via IPC.
- Import **additivo**: nessuna modifica/cancellazione di clienti esistenti.
- CF unico: già `clienti.codice_fiscale TEXT NOT NULL UNIQUE` in migrazione 002.
- Importi/date in stile italiano; date CSV in `gg/mm/aaaa`, memorizzate in ISO `aaaa-mm-gg`.
- Test in `tests/unit/**/*.test.ts`; DB in-memory con `runMigrations` e `getDatabase` mockato (vedi `tests/unit/clients-repository.test.ts`).
- `npm run verify` (typecheck + lint + test + build:electron) deve restare verde.
- Dipendenze pinnate, lockfile committato.

---

### Task 1: Dipendenza papaparse e tipi condivisi

**Files:**
- Modify: `package.json` (dependencies + devDependencies)
- Modify: `src/types/shared.ts` (nuovi tipi + estensione `ElectronAPI.clienti` e `ElectronAPI.dialog`)

**Interfaces:**
- Produces: tipi `ImportRowResult`, `ImportPreview`, `ImportReport`; estensione API `clienti.import` e `dialog.showSaveDialog`.

- [ ] **Step 1: Installare papaparse (versione pinnata)**

Run:
```bash
npm install --save-exact papaparse@5.4.1
npm install --save-dev --save-exact @types/papaparse@5.3.14
```
Expected: `package.json` mostra `"papaparse": "5.4.1"` in `dependencies` e `"@types/papaparse": "5.3.14"` in `devDependencies`; `package-lock.json` aggiornato.

- [ ] **Step 2: Aggiungere i tipi condivisi**

In `src/types/shared.ts`, subito dopo il blocco `// ── Clienti ──` (dopo `ClientiFilters`), aggiungere:

```ts
// ── Import clienti da CSV ───────────────────────────────────────────────────

/** Esito della singola riga di un import CSV. */
export interface ImportRowResult {
  /** Numero di riga 1-based nel file (intestazione = riga 1). */
  riga: number
  esito: 'nuovo' | 'duplicato' | 'errore'
  /** CF normalizzato (maiuscolo, trim); null se la cella era vuota. */
  cf: string | null
  /** Popolato solo quando esito === 'nuovo'. */
  cliente?: CreateClienteInput
  /** Motivo, presente per 'duplicato' ed 'errore'. */
  messaggio?: string
}

/** Anteprima dell'import: conteggi + esito per riga. Nessuna scrittura effettuata. */
export interface ImportPreview {
  totali: number
  nuovi: number
  duplicati: number
  errori: number
  righe: ImportRowResult[]
}

/** Report finale dopo la scrittura. */
export interface ImportReport {
  importati: number
  saltati: number
  errori: number
}
```

- [ ] **Step 3: Estendere l'interfaccia ElectronAPI**

In `src/types/shared.ts`, dentro `ElectronAPI`, nel blocco `clienti: { ... }`, aggiungere dopo `anonimizza`:

```ts
    import: {
      analizza: (path: string) => Promise<ImportPreview>
      esegui: (path: string) => Promise<ImportReport>
      template: (destPath: string) => Promise<void>
    }
```

Nel blocco `dialog: { ... }`, aggiungere dopo `showOpenDialog`:

```ts
    showSaveDialog: (options?: {
      title?: string
      defaultPath?: string
      filters?: { name: string; extensions: string[] }[]
    }) => Promise<{ canceled: boolean; filePath: string }>
```

- [ ] **Step 4: Verificare typecheck**

Run: `npm run typecheck`
Expected: PASS (i nuovi tipi non sono ancora usati, ma devono compilare).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/types/shared.ts
git commit -m "feat(import): dipendenza papaparse e tipi condivisi import CSV"
```

---

### Task 2: Logica di dominio (parse + analisi) — pura e testata

**Files:**
- Create: `src/main/domain/import-clienti.ts`
- Test: `tests/unit/domain/import-clienti.test.ts`

**Interfaces:**
- Consumes: `isCodiceFiscaleValid` da `./codice-fiscale`; tipi da `../../types/shared`.
- Produces:
  - `parseCsvClienti(content: string): RigaGrezza[]`
  - `analizzaImport(righe: RigaGrezza[], cfEsistenti: Set<string>, tessereEsistenti: Set<string>): ImportPreview`
  - `parseDataItaliana(s: string): string | null`
  - `interface RigaGrezza { riga: number; dati: Record<string, string> }`

- [ ] **Step 1: Scrivere i test (falliscono)**

Create `tests/unit/domain/import-clienti.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  parseCsvClienti,
  analizzaImport,
  parseDataItaliana,
} from '../../../src/main/domain/import-clienti'

const HEADER = 'codice_fiscale;nome;cognome;email'
// CF validi reali (superano il carattere di controllo)
const CF_A = 'RSSMRA85M01H501Z' // Mario Rossi
const CF_B = 'VRDLGI90A41H501B' // Luigi Verdi (esempio)

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
```

- [ ] **Step 2: Eseguire i test per verificarne il fallimento**

Run: `npx vitest run tests/unit/domain/import-clienti.test.ts`
Expected: FAIL con errore di import ("Cannot find module .../import-clienti").

- [ ] **Step 3: Implementare il modulo di dominio**

Create `src/main/domain/import-clienti.ts`:

```ts
/**
 * Parsing e analisi di un CSV di clienti per l'import additivo.
 * Logica pura: dipende solo da papaparse (puro JS) e dalla validazione CF.
 */

import Papa from 'papaparse'
import { isCodiceFiscaleValid } from './codice-fiscale'
import type { CreateClienteInput, ImportPreview, ImportRowResult } from '../../types/shared'

/** Colonne opzionali di tipo testo mappate 1:1 su CreateClienteInput. */
const CAMPI_TESTO = [
  'comune_nascita',
  'via',
  'civico',
  'citta',
  'provincia',
  'cap',
  'email',
  'telefono',
  'note',
] as const

export interface RigaGrezza {
  /** Numero di riga 1-based nel file (intestazione = riga 1). */
  riga: number
  /** Celle della riga, per intestazione normalizzata (minuscolo, trim). */
  dati: Record<string, string>
}

/**
 * Converte una data italiana `gg/mm/aaaa` in ISO `aaaa-mm-gg`.
 * Restituisce null se la stringa non è una data di calendario valida.
 */
export function parseDataItaliana(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const giorno = parseInt(m[1], 10)
  const mese = parseInt(m[2], 10)
  const anno = parseInt(m[3], 10)
  if (mese < 1 || mese > 12 || giorno < 1 || giorno > 31) return null
  // Verifica che la data esista davvero (es. 31/02 non valida)
  const d = new Date(Date.UTC(anno, mese - 1, giorno))
  if (
    d.getUTCFullYear() !== anno ||
    d.getUTCMonth() !== mese - 1 ||
    d.getUTCDate() !== giorno
  ) {
    return null
  }
  const mm = String(mese).padStart(2, '0')
  const dd = String(giorno).padStart(2, '0')
  return `${anno}-${mm}-${dd}`
}

/**
 * Parsa il contenuto CSV in righe grezze. Rileva automaticamente il
 * delimitatore (`,`/`;`/tab/`|`), rimuove il BOM, normalizza le intestazioni
 * (minuscolo + trim) e salta le righe vuote.
 */
export function parseCsvClienti(content: string): RigaGrezza[] {
  const senzaBom = content.replace(/^﻿/, '')
  const result = Papa.parse<Record<string, string>>(senzaBom, {
    header: true,
    skipEmptyLines: 'greedy',
    delimiter: '', // autodetect
    transformHeader: (h) => h.trim().toLowerCase(),
  })
  return result.data.map((dati, i) => ({
    // header = riga 1; la prima riga di dati è la riga 2 del file
    riga: i + 2,
    dati,
  }))
}

function cella(dati: Record<string, string>, chiave: string): string {
  return (dati[chiave] ?? '').trim()
}

/**
 * Analizza le righe grezze e le classifica in nuovo/duplicato/errore rispetto
 * ai CF e ai numeri tessera già esistenti. Non effettua alcuna scrittura.
 */
export function analizzaImport(
  righe: RigaGrezza[],
  cfEsistenti: Set<string>,
  tessereEsistenti: Set<string>,
): ImportPreview {
  const risultati: ImportRowResult[] = []
  const cfVistiNelFile = new Set<string>()
  const tessereVisteNelFile = new Set<string>()

  for (const { riga, dati } of righe) {
    const cfRaw = cella(dati, 'codice_fiscale').toUpperCase()
    const nome = cella(dati, 'nome')
    const cognome = cella(dati, 'cognome')
    const cf = cfRaw || null

    // 1. Campi obbligatori e formato CF
    if (!cfRaw) {
      risultati.push({ riga, esito: 'errore', cf, messaggio: 'Codice fiscale mancante.' })
      continue
    }
    if (!isCodiceFiscaleValid(cfRaw)) {
      risultati.push({ riga, esito: 'errore', cf, messaggio: 'Codice fiscale non valido.' })
      continue
    }
    if (!nome || !cognome) {
      risultati.push({ riga, esito: 'errore', cf, messaggio: 'Nome o cognome mancante.' })
      continue
    }

    // 2. Duplicato già in anagrafica (saltato, non modificato)
    if (cfEsistenti.has(cfRaw)) {
      risultati.push({ riga, esito: 'duplicato', cf, messaggio: 'Cliente già presente in anagrafica.' })
      continue
    }

    // 3. Duplicato all'interno dello stesso file
    if (cfVistiNelFile.has(cfRaw)) {
      risultati.push({ riga, esito: 'errore', cf, messaggio: 'Codice fiscale ripetuto nel file.' })
      continue
    }
    cfVistiNelFile.add(cfRaw)

    // 4. Campi opzionali
    const cliente: CreateClienteInput = { codice_fiscale: cfRaw, nome, cognome }

    const tessera = cella(dati, 'numero_tessera')
    if (tessera) {
      if (tessereEsistenti.has(tessera) || tessereVisteNelFile.has(tessera)) {
        risultati.push({ riga, esito: 'errore', cf, messaggio: `Numero tessera "${tessera}" già in uso.` })
        continue
      }
      tessereVisteNelFile.add(tessera)
      cliente.numero_tessera = tessera
    }

    const dataNascita = cella(dati, 'data_nascita')
    if (dataNascita) {
      const iso = parseDataItaliana(dataNascita)
      if (!iso) {
        risultati.push({ riga, esito: 'errore', cf, messaggio: `Data di nascita non valida: "${dataNascita}".` })
        continue
      }
      cliente.data_nascita = iso
    }

    const sesso = cella(dati, 'sesso').toUpperCase()
    if (sesso) {
      if (sesso !== 'M' && sesso !== 'F') {
        risultati.push({ riga, esito: 'errore', cf, messaggio: `Sesso non valido: "${sesso}" (atteso M o F).` })
        continue
      }
      cliente.sesso = sesso
    }

    for (const campo of CAMPI_TESTO) {
      const valore = cella(dati, campo)
      if (valore) cliente[campo] = valore
    }

    risultati.push({ riga, esito: 'nuovo', cf, cliente })
  }

  return {
    totali: risultati.length,
    nuovi: risultati.filter((r) => r.esito === 'nuovo').length,
    duplicati: risultati.filter((r) => r.esito === 'duplicato').length,
    errori: risultati.filter((r) => r.esito === 'errore').length,
    righe: risultati,
  }
}
```

- [ ] **Step 4: Eseguire i test per verificarne il successo**

Run: `npx vitest run tests/unit/domain/import-clienti.test.ts`
Expected: PASS (tutti i test verdi). Se un CF di esempio non passa il controllo, sostituirlo con uno valido calcolato e aggiornare le costanti nel test.

- [ ] **Step 5: Commit**

```bash
git add src/main/domain/import-clienti.ts tests/unit/domain/import-clienti.test.ts
git commit -m "feat(import): logica pura di parsing e analisi CSV clienti"
```

---

### Task 3: Funzioni repository (lettura insiemi + inserimento batch)

**Files:**
- Modify: `src/main/db/clients-repository.ts`
- Test: `tests/unit/import-clienti-repository.test.ts`

**Interfaces:**
- Consumes: `getDatabase`, `getNextNumeroTessera` (già presenti nel file).
- Produces:
  - `getTuttiCodiciFiscali(): Set<string>`
  - `getTutteTessere(): Set<string>`
  - `importClienti(nuovi: CreateClienteInput[]): number`

- [ ] **Step 1: Scrivere i test (falliscono)**

Create `tests/unit/import-clienti-repository.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

let _testDb: Database.Database | null = null

vi.mock('../../src/main/db/database', () => ({
  getDatabase: () => {
    if (!_testDb) throw new Error('Test DB non inizializzato')
    return _testDb
  }
}))

import { runMigrations } from '../../src/main/db/migrations'
import {
  createCliente,
  getClienteByCodiceFiscale,
  getTuttiCodiciFiscali,
  getTutteTessere,
  importClienti,
} from '../../src/main/db/clients-repository'
import type { CreateClienteInput } from '../../src/types/shared'

beforeEach(() => {
  _testDb = new Database(':memory:')
  _testDb.pragma('foreign_keys = ON')
  runMigrations(_testDb)
})

afterEach(() => {
  if (_testDb && _testDb.open) _testDb.close()
  _testDb = null
})

describe('getTuttiCodiciFiscali', () => {
  it('restituisce i CF esistenti in maiuscolo', () => {
    createCliente({ codice_fiscale: 'RSSMRA85M01H501Z', nome: 'Mario', cognome: 'Rossi' })
    const set = getTuttiCodiciFiscali()
    expect(set.has('RSSMRA85M01H501Z')).toBe(true)
  })
})

describe('importClienti', () => {
  const nuovi: CreateClienteInput[] = [
    { codice_fiscale: 'RSSMRA85M01H501Z', nome: 'Mario', cognome: 'Rossi' },
    { codice_fiscale: 'VRDLGI90A41H501B', nome: 'Luigi', cognome: 'Verdi' },
  ]

  it('inserisce tutti i clienti nuovi e ritorna il conteggio', () => {
    const n = importClienti(nuovi)
    expect(n).toBe(2)
    expect(getClienteByCodiceFiscale('RSSMRA85M01H501Z')).not.toBeNull()
    expect(getClienteByCodiceFiscale('VRDLGI90A41H501B')).not.toBeNull()
  })

  it('assegna numeri tessera automatici distinti', () => {
    importClienti(nuovi)
    const t = getTutteTessere()
    expect(t.size).toBe(2)
  })

  it('è atomico: se una riga viola UNIQUE, nessun cliente viene inserito', () => {
    createCliente({ codice_fiscale: 'RSSMRA85M01H501Z', nome: 'Mario', cognome: 'Rossi' })
    expect(() => importClienti(nuovi)).toThrow()
    // Solo il cliente pre-esistente resta; "Luigi Verdi" non è stato inserito
    expect(getClienteByCodiceFiscale('VRDLGI90A41H501B')).toBeNull()
  })
})
```

- [ ] **Step 2: Eseguire i test per verificarne il fallimento**

Run: `npx vitest run tests/unit/import-clienti-repository.test.ts`
Expected: FAIL (funzioni non esportate).

- [ ] **Step 3: Implementare le funzioni repository**

In `src/main/db/clients-repository.ts`, in fondo al file, aggiungere:

```ts
/** Insieme di tutti i codici fiscali presenti (maiuscolo), per la deduplica dell'import. */
export function getTuttiCodiciFiscali(): Set<string> {
  const db = getDatabase()
  const rows = db.prepare('SELECT codice_fiscale FROM clienti').all() as {
    codice_fiscale: string
  }[]
  return new Set(rows.map((r) => r.codice_fiscale.toUpperCase()))
}

/** Insieme dei numeri tessera già in uso, per la validazione dell'import. */
export function getTutteTessere(): Set<string> {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT numero_tessera FROM clienti WHERE numero_tessera IS NOT NULL')
    .all() as { numero_tessera: string }[]
  return new Set(rows.map((r) => r.numero_tessera))
}

/**
 * Inserisce in blocco i clienti nuovi in un'unica transazione atomica.
 * La numero_tessera assente viene assegnata automaticamente e progressivamente.
 * Restituisce il numero di clienti inseriti. In caso di violazione di vincolo
 * l'intera transazione viene annullata (nessun inserimento parziale).
 */
export function importClienti(nuovi: CreateClienteInput[]): number {
  const db = getDatabase()

  const insert = db.prepare(`
    INSERT INTO clienti (
      numero_tessera, nome, cognome, codice_fiscale,
      data_nascita, sesso, comune_nascita,
      via, civico, citta, provincia, cap,
      email, telefono, note
    ) VALUES (
      @numero_tessera, @nome, @cognome, @codice_fiscale,
      @data_nascita, @sesso, @comune_nascita,
      @via, @civico, @citta, @provincia, @cap,
      @email, @telefono, @note
    )
  `)

  const esegui = db.transaction((righe: CreateClienteInput[]): number => {
    let inseriti = 0
    for (const c of righe) {
      insert.run({
        numero_tessera: c.numero_tessera ?? getNextNumeroTessera(),
        nome: c.nome,
        cognome: c.cognome,
        codice_fiscale: c.codice_fiscale,
        data_nascita: c.data_nascita ?? null,
        sesso: c.sesso ?? null,
        comune_nascita: c.comune_nascita ?? null,
        via: c.via ?? null,
        civico: c.civico ?? null,
        citta: c.citta ?? null,
        provincia: c.provincia ?? null,
        cap: c.cap ?? null,
        email: c.email ?? null,
        telefono: c.telefono ?? null,
        note: c.note ?? null,
      })
      inseriti++
    }
    return inseriti
  })

  return esegui(nuovi)
}
```

Nota: `getNextNumeroTessera` legge `MAX(...)` ad ogni chiamata; dentro la transazione vede i propri INSERT precedenti, quindi i numeri risultano progressivi e senza collisioni.

- [ ] **Step 4: Eseguire i test per verificarne il successo**

Run: `npx vitest run tests/unit/import-clienti-repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/clients-repository.ts tests/unit/import-clienti-repository.test.ts
git commit -m "feat(import): funzioni repository per deduplica e inserimento batch"
```

---

### Task 4: Handler IPC e API preload

**Files:**
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `parseCsvClienti`, `analizzaImport` da `../domain/import-clienti`; `getTuttiCodiciFiscali`, `getTutteTessere`, `importClienti` da `../db/clients-repository`; tipi da `../../types/shared`.
- Produces: canali IPC `clienti:import:analizza`, `clienti:import:esegui`, `clienti:import:template`, `dialog:showSaveDialog`; metodi preload `window.api.clienti.import.*` e `window.api.dialog.showSaveDialog`.

- [ ] **Step 1: Aggiungere gli import nel main handlers**

In `src/main/ipc/handlers.ts`: aggiungere `readFileSync, writeFileSync` all'import esistente `from 'fs'` (riga 3, oggi `import { existsSync, unlinkSync } from 'fs'`), così diventa:

```ts
import { existsSync, unlinkSync, readFileSync, writeFileSync } from 'fs'
```

Aggiungere, vicino agli altri import di dominio/repository:

```ts
import { parseCsvClienti, analizzaImport } from '../domain/import-clienti'
```

Estendere l'import dal repository clienti (blocco `from '../db/clients-repository'`) con:

```ts
  getTuttiCodiciFiscali,
  getTutteTessere,
  importClienti
```

Assicurarsi che i tipi `ImportPreview`, `ImportReport` siano importati da `../../types/shared` (aggiungerli al blocco di import dei tipi esistente).

- [ ] **Step 2: Registrare gli handler IPC**

In `src/main/ipc/handlers.ts`, subito dopo l'handler `clienti:anonimizza`, aggiungere:

```ts
  ipcMain.handle(
    'clienti:import:analizza',
    (_event, path: string): ImportPreview => {
      try {
        const content = readFileSync(path, 'utf-8')
        const righe = parseCsvClienti(content)
        return analizzaImport(righe, getTuttiCodiciFiscali(), getTutteTessere())
      } catch (err) {
        log.error('[ipc] clienti:import:analizza errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'analisi del CSV")
      }
    }
  )

  ipcMain.handle(
    'clienti:import:esegui',
    (_event, path: string): ImportReport => {
      try {
        // Rilegge e rianalizza il file: non ci si fida di dati dal renderer
        const content = readFileSync(path, 'utf-8')
        const righe = parseCsvClienti(content)
        const preview = analizzaImport(righe, getTuttiCodiciFiscali(), getTutteTessere())
        const nuovi = preview.righe
          .filter((r) => r.esito === 'nuovo' && r.cliente)
          .map((r) => r.cliente!)
        const importati = importClienti(nuovi)
        return { importati, saltati: preview.duplicati, errori: preview.errori }
      } catch (err) {
        log.error('[ipc] clienti:import:esegui errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'import del CSV")
      }
    }
  )

  ipcMain.handle(
    'clienti:import:template',
    (_event, destPath: string): void => {
      try {
        const intestazione =
          'codice_fiscale;nome;cognome;numero_tessera;data_nascita;sesso;comune_nascita;via;civico;citta;provincia;cap;email;telefono;note'
        const esempio =
          'RSSMRA85M01H501Z;Mario;Rossi;;01/03/1985;M;Roma;Via Roma;10;Roma;RM;00100;mario.rossi@example.it;3331234567;'
        // BOM iniziale per compatibilità con Excel su Windows
        writeFileSync(destPath, `﻿${intestazione}\n${esempio}\n`, 'utf-8')
      } catch (err) {
        log.error('[ipc] clienti:import:template errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante la creazione del modello CSV')
      }
    }
  )
```

- [ ] **Step 3: Registrare l'handler dialog:showSaveDialog**

In `src/main/ipc/handlers.ts`, subito dopo l'handler `dialog:showOpenDialog`, aggiungere:

```ts
  ipcMain.handle(
    'dialog:showSaveDialog',
    async (
      event,
      options?: {
        title?: string
        defaultPath?: string
        filters?: { name: string; extensions: string[] }[]
      }
    ): Promise<{ canceled: boolean; filePath: string }> => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender)
        const dialogOptions: Electron.SaveDialogOptions = {
          title: options?.title,
          defaultPath: options?.defaultPath,
          filters: options?.filters
        }
        const result = win
          ? await dialog.showSaveDialog(win, dialogOptions)
          : await dialog.showSaveDialog(dialogOptions)
        return { canceled: result.canceled, filePath: result.filePath ?? '' }
      } catch (err) {
        log.error('[ipc] dialog:showSaveDialog errore:', err)
        throw err instanceof Error ? err : new Error('Errore apertura finestra di salvataggio file')
      }
    }
  )
```

- [ ] **Step 4: Estendere l'API nel preload**

In `src/preload/index.ts`, nel blocco `clienti: { ... }`, dopo `anonimizza`, aggiungere:

```ts
    import: {
      analizza(path: string): Promise<ImportPreview> {
        return ipcRenderer.invoke('clienti:import:analizza', path)
      },
      esegui(path: string): Promise<ImportReport> {
        return ipcRenderer.invoke('clienti:import:esegui', path)
      },
      template(destPath: string): Promise<void> {
        return ipcRenderer.invoke('clienti:import:template', destPath)
      }
    }
```

Nel blocco `dialog: { ... }`, dopo `showOpenDialog`, aggiungere:

```ts
    showSaveDialog(options?: {
      title?: string
      defaultPath?: string
      filters?: { name: string; extensions: string[] }[]
    }): Promise<{ canceled: boolean; filePath: string }> {
      return ipcRenderer.invoke('dialog:showSaveDialog', options)
    }
```

Aggiungere `ImportPreview`, `ImportReport` al blocco `import type { ... } from '../types/shared'` e al blocco di re-export dei tipi in fondo al file.

- [ ] **Step 5: Verificare typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (Nessun test unit per questi wrapper IPC: sono verificati dal typecheck e dai test e2e/manuali.)

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/handlers.ts src/preload/index.ts
git commit -m "feat(import): handler IPC analizza/esegui/template e dialog di salvataggio"
```

---

### Task 5: Stringhe i18n

**Files:**
- Modify: `src/renderer/src/i18n/locales/it.json`
- Modify: `src/renderer/src/i18n/locales/en.json`

**Interfaces:**
- Produces: chiavi `clienti.import.*` usate dal componente in Task 6.

- [ ] **Step 1: Aggiungere le chiavi in it.json**

In `src/renderer/src/i18n/locales/it.json`, dentro l'oggetto `"clienti"`, aggiungere la chiave `"import"`:

```json
    "import": {
      "pulsante": "Importa CSV",
      "titolo": "Importa clienti da CSV",
      "seleziona_file": "Seleziona file CSV",
      "scarica_modello": "Scarica modello CSV",
      "modello_salvato": "Modello CSV salvato.",
      "analisi_in_corso": "Analisi del file in corso…",
      "import_in_corso": "Import in corso…",
      "riepilogo": "Riepilogo",
      "nuovi": "Nuovi da importare",
      "duplicati": "Già presenti (saltati)",
      "errori": "Righe con errori",
      "totali": "Righe totali",
      "dettaglio_scarti": "Righe non importabili",
      "colonna_riga": "Riga",
      "colonna_cf": "Codice fiscale",
      "colonna_motivo": "Motivo",
      "conferma_import": "Importa {{count}} clienti",
      "nessun_nuovo": "Nessun cliente nuovo da importare.",
      "esito_titolo": "Import completato",
      "esito_importati": "{{count}} clienti importati.",
      "esito_saltati": "{{count}} già presenti.",
      "esito_errori": "{{count}} righe con errori.",
      "errore_analisi": "Impossibile leggere o analizzare il file CSV.",
      "errore_import": "Errore durante l'import dei clienti.",
      "chiudi": "Chiudi",
      "annulla": "Annulla"
    }
```

- [ ] **Step 2: Aggiungere le chiavi equivalenti in en.json**

In `src/renderer/src/i18n/locales/en.json`, dentro `"clienti"`, aggiungere:

```json
    "import": {
      "pulsante": "Import CSV",
      "titolo": "Import clients from CSV",
      "seleziona_file": "Select CSV file",
      "scarica_modello": "Download CSV template",
      "modello_salvato": "CSV template saved.",
      "analisi_in_corso": "Analyzing file…",
      "import_in_corso": "Importing…",
      "riepilogo": "Summary",
      "nuovi": "New to import",
      "duplicati": "Already present (skipped)",
      "errori": "Rows with errors",
      "totali": "Total rows",
      "dettaglio_scarti": "Non-importable rows",
      "colonna_riga": "Row",
      "colonna_cf": "Tax code",
      "colonna_motivo": "Reason",
      "conferma_import": "Import {{count}} clients",
      "nessun_nuovo": "No new clients to import.",
      "esito_titolo": "Import complete",
      "esito_importati": "{{count}} clients imported.",
      "esito_saltati": "{{count}} already present.",
      "esito_errori": "{{count}} rows with errors.",
      "errore_analisi": "Unable to read or analyze the CSV file.",
      "errore_import": "Error while importing clients.",
      "chiudi": "Close",
      "annulla": "Cancel"
    }
```

- [ ] **Step 3: Verificare che i JSON siano validi**

Run: `node -e "require('./src/renderer/src/i18n/locales/it.json'); require('./src/renderer/src/i18n/locales/en.json'); console.log('JSON validi')"`
Expected: stampa `JSON validi`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(import): stringhe i18n per import clienti CSV"
```

---

### Task 6: UI — modale di import e pulsante in ClientsPage

**Files:**
- Create: `src/renderer/src/components/clients/ImportClientiDialog.tsx`
- Modify: `src/renderer/src/pages/ClientsPage.tsx`

**Interfaces:**
- Consumes: `window.api.clienti.import.*`, `window.api.dialog.showOpenDialog`, `window.api.dialog.showSaveDialog`; componente `Modal`; chiavi i18n `clienti.import.*`; tipo `ImportPreview` da `../../../types/shared`.
- Produces: componente `ImportClientiDialog` con props `{ isOpen: boolean; onClose: () => void; onImported: () => void }`.

- [ ] **Step 1: Creare il componente ImportClientiDialog**

Create `src/renderer/src/components/clients/ImportClientiDialog.tsx`:

```tsx
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImportPreview } from '../../../types/shared'
import Modal from '../ui/Modal'

interface ImportClientiDialogProps {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}

type Step = 'seleziona' | 'anteprima' | 'esito'

export default function ImportClientiDialog({
  isOpen,
  onClose,
  onImported,
}: ImportClientiDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  const [step, setStep] = useState<Step>('seleziona')
  const [filePath, setFilePath] = useState<string>('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [report, setReport] = useState<{ importati: number; saltati: number; errori: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string>('')

  function reset(): void {
    setStep('seleziona')
    setFilePath('')
    setPreview(null)
    setReport(null)
    setBusy(false)
    setErrore('')
  }

  function handleClose(): void {
    reset()
    onClose()
  }

  async function handleScegliFile(): Promise<void> {
    setErrore('')
    const res = await window.api.dialog.showOpenDialog({
      title: t('clienti.import.seleziona_file'),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile'],
    })
    if (res.canceled || res.filePaths.length === 0) return
    const path = res.filePaths[0]
    setFilePath(path)
    setBusy(true)
    try {
      const p = await window.api.clienti.import.analizza(path)
      setPreview(p)
      setStep('anteprima')
    } catch {
      setErrore(t('clienti.import.errore_analisi'))
    } finally {
      setBusy(false)
    }
  }

  async function handleScaricaModello(): Promise<void> {
    setErrore('')
    const res = await window.api.dialog.showSaveDialog({
      title: t('clienti.import.scarica_modello'),
      defaultPath: 'modello-clienti.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })
    if (res.canceled || !res.filePath) return
    try {
      await window.api.clienti.import.template(res.filePath)
    } catch {
      setErrore(t('clienti.import.errore_analisi'))
    }
  }

  async function handleConferma(): Promise<void> {
    if (!filePath) return
    setBusy(true)
    setErrore('')
    try {
      const r = await window.api.clienti.import.esegui(filePath)
      setReport(r)
      setStep('esito')
      onImported()
    } catch {
      setErrore(t('clienti.import.errore_import'))
    } finally {
      setBusy(false)
    }
  }

  const scarti = preview?.righe.filter((r) => r.esito !== 'nuovo') ?? []

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('clienti.import.titolo')} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {errore && (
          <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700" role="alert">
            {errore}
          </div>
        )}

        {step === 'seleziona' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('clienti.import.riepilogo')}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={handleScegliFile}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-50"
              >
                {busy ? t('clienti.import.analisi_in_corso') : t('clienti.import.seleziona_file')}
              </button>
              <button
                type="button"
                onClick={handleScaricaModello}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {t('clienti.import.scarica_modello')}
              </button>
            </div>
          </div>
        )}

        {step === 'anteprima' && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Contatore label={t('clienti.import.totali')} valore={preview.totali} />
              <Contatore label={t('clienti.import.nuovi')} valore={preview.nuovi} accent="text-green-600 dark:text-green-400" />
              <Contatore label={t('clienti.import.duplicati')} valore={preview.duplicati} />
              <Contatore label={t('clienti.import.errori')} valore={preview.errori} accent="text-red-600 dark:text-red-400" />
            </div>

            {scarti.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {t('clienti.import.dettaglio_scarti')}
                </h3>
                <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">{t('clienti.import.colonna_riga')}</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">{t('clienti.import.colonna_cf')}</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">{t('clienti.import.colonna_motivo')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scarti.map((r) => (
                        <tr key={r.riga} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{r.riga}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{r.cf ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{r.messaggio}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {t('clienti.import.annulla')}
              </button>
              <button
                type="button"
                disabled={busy || preview.nuovi === 0}
                onClick={handleConferma}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-50"
              >
                {preview.nuovi === 0
                  ? t('clienti.import.nessun_nuovo')
                  : busy
                    ? t('clienti.import.import_in_corso')
                    : t('clienti.import.conferma_import', { count: preview.nuovi })}
              </button>
            </div>
          </div>
        )}

        {step === 'esito' && report && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('clienti.import.esito_titolo')}
            </h3>
            <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
              <li>{t('clienti.import.esito_importati', { count: report.importati })}</li>
              <li>{t('clienti.import.esito_saltati', { count: report.saltati })}</li>
              <li>{t('clienti.import.esito_errori', { count: report.errori })}</li>
            </ul>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
              >
                {t('clienti.import.chiudi')}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function Contatore({
  label,
  valore,
  accent,
}: {
  label: string
  valore: number
  accent?: string
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <div className={`text-2xl font-semibold ${accent ?? 'text-gray-900 dark:text-gray-100'}`}>{valore}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</div>
    </div>
  )
}
```

- [ ] **Step 2: Integrare il pulsante in ClientsPage**

In `src/renderer/src/pages/ClientsPage.tsx`:

Aggiungere l'import in cima (dopo gli altri import di componenti):
```tsx
import ImportClientiDialog from '../components/clients/ImportClientiDialog'
```

Aggiungere lo stato accanto agli altri `useState` (vicino a `showNewModal`):
```tsx
  const [showImportModal, setShowImportModal] = useState(false)
```

Nell'intestazione con la CTA, avvolgere i pulsanti in un contenitore e aggiungere il pulsante "Importa CSV" prima di "Nuovo cliente". Sostituire il blocco del solo bottone "Nuovo cliente" con:

```tsx
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="btn-importa-csv"
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {t('clienti.import.pulsante')}
          </button>
          <button
            type="button"
            data-testid="btn-nuovo-cliente"
            onClick={() => setShowNewModal(true)}
            className={[
              'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg',
              'bg-primary-600 hover:bg-primary-700 text-white transition-colors',
            ].join(' ')}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('clienti.nuovo')}
          </button>
        </div>
```

Aggiungere il modale in fondo al JSX, subito dopo il `<Modal>` "nuovo cliente":

```tsx
      {/* Modal import CSV */}
      <ImportClientiDialog
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={() =>
          loadClienti(currentSearch, activeFilter, filtroIscrizione, filtroCertificato, filtroTipoAbbonamento)
        }
      />
```

- [ ] **Step 3: Verificare typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Verifica manuale rapida (facoltativa ma consigliata)**

Run: `npm run dev`
Aprire la pagina Clienti → cliccare "Importa CSV" → "Scarica modello CSV" (salva un file) → riaprire e selezionarlo → verificare l'anteprima (1 nuovo) → confermare → verificare l'esito e la lista aggiornata.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/clients/ImportClientiDialog.tsx src/renderer/src/pages/ClientsPage.tsx
git commit -m "feat(import): UI modale import CSV e pulsante in pagina Clienti"
```

---

### Task 7: Verifica finale

**Files:** nessuno (solo verifica).

- [ ] **Step 1: Eseguire il gate di qualità completo**

Run: `npm run verify`
Expected: PASS su typecheck, lint, test e build:electron.

- [ ] **Step 2: Commit finale se necessario (formattazione)**

Se `npm run format` modifica file:
```bash
npm run format
git add -A
git commit -m "chore(import): formattazione"
```

---

## Note di self-review

- **Copertura spec:** formato/colonne (Task 2), autodetect delimitatore + BOM (Task 2), classificazione nuovo/duplicato/errore incl. duplicato in-file (Task 2), deduplica DB + inserimento atomico (Task 3), IPC analizza/esegui con re-lettura file + template + showSaveDialog (Task 4), i18n (Task 5), UI a 3 step + pulsante + modello scaricabile (Task 6), test unit (Task 2, 3), verify (Task 7).
- **Assunzione marcata:** i CF di esempio nei test devono essere codici formalmente validi; se il carattere di controllo non torna, ricalcolarli con `calcolaCF` e aggiornare le costanti (indicato nel Task 2, Step 4).
- **Fuori scope (YAGNI):** mappatura colonne dinamica, update dei clienti esistenti, export report errori, e2e Playwright (rinviabile).
```
