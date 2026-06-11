# WP2 — Robustezza & validazione backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere i debiti di robustezza/validazione del layer dati (A7–A14): univocità tessera, validazioni ricevuta, blocco operazioni su clienti anonimizzati, coerenza date certificati, validazione catalogo, indicatori dashboard completi, atomicità settings, commenti CF + fixture esterna.

**Architecture:** Modifiche al layer dati (`clients-repository`, `receipts-repository`, `memberships-repository`, `catalog-repository`, `dashboard-repository`), al dominio (`catalogo`, `codice-fiscale`), agli handler IPC (`handlers.ts`) e — solo per A13 — al renderer (IndicatoriWidget + DashboardPage + i18n). Test di integrazione Vitest su DB SQLite in-memory col pattern già consolidato (`vi.mock` su `database.ts`, `runMigrations` su `:memory:`). **Nessuna migrazione di schema:** `numero_tessera` ha già `UNIQUE` (migration 002).

**Tech Stack:** TypeScript strict, better-sqlite3-multiple-ciphers, Vitest, React + i18next. DoD = `npm run verify` verde (typecheck + lint + test + build).

**Convenzioni di progetto:**
- Errori di dominio dal repository = codici stringa (`throw new Error('CODICE')`), come gli esistenti `NESSUNA_ISCRIZIONE_ATTIVA`, `CLIENTE_GIA_ANONIMIZZATO`.
- Errori di validazione dagli handler = `throw new Error(\`VALIDATION_ERROR: ${msg}\`)` dove `msg = errors.map(e => \`${e.field}: ${e.message}\`).join('; ')` (pattern di `clienti:create`, `handlers.ts:281-284`).
- "Oggi" lato repository = `new Date().toISOString().slice(0,10)`; in SQL il troncamento al giorno UTC è `date('now')`.
- Date nei test: passato `'2000-...'`, futuro `'2999-...'` per indipendenza dal fuso.
- Stati: iscrizioni `'attiva'|'scaduta'|'invalidata'`; abbonamenti `'attivo'|'scaduto'|'invalidato'`; cliente `'attivo'|'anonimizzato'`; tipi catalogo `'attivo'|'non_valido'`.

**Riferimenti:** `ANALYSYS.md` voci A7–A14 · invarianti dominio 4 e 7 (`CLAUDE.md`) · skill `ricevuta-fiscale`, `i18n`.

---

## File Structure

- `src/main/db/clients-repository.ts` — Task 1 (`createCliente`/`getNextNumeroTessera`), Task 4 (`listClienti` filtro certificati).
- `src/main/db/receipts-repository.ts` — Task 2 (`creaRicevuta`: stato cliente + validazione righe/riferimenti).
- `src/main/db/memberships-repository.ts` — Task 3 (`assegnaIscrizione`/`assegnaAbbonamento`: stato cliente).
- `src/main/domain/catalogo.ts` + `src/main/db/catalog-repository.ts` + `src/main/ipc/handlers.ts` — Task 5 (validazione catalogo + whitelist colonne).
- `src/types/shared.ts` + `src/main/db/dashboard-repository.ts` + `src/renderer/src/components/dashboard/IndicatoriWidget.tsx` + `src/renderer/src/pages/DashboardPage.tsx` + i18n — Task 6 (A13 indicatori).
- `src/main/ipc/handlers.ts` + `src/main/settings/store.ts` — Task 7 (A14 atomicità settings).
- `src/main/domain/codice-fiscale.ts` — Task 8 (A7a commenti), Task 9 (A7b fixture, INPUT richiesto).
- Test: `tests/unit/clients-repository.test.ts`, `tests/unit/receipts-invariants.test.ts`, `tests/unit/memberships-invariants.test.ts`, `tests/unit/domain/catalogo.test.ts`, `tests/unit/dashboard.test.ts`, `tests/unit/domain/codice-fiscale.test.ts`.

**Nota errori backend → UI:** i nuovi codici (`NUMERO_TESSERA_DUPLICATO`, `CLIENTE_ANONIMIZZATO`, `RICEVUTA_SENZA_RIGHE`, `RIFERIMENTO_NON_VALIDO`) sono **guardie difensive**: gli handler li ri-lanciano e il renderer mostra il messaggio generico esistente. La mappatura a messaggi i18n dedicati è fuori scope WP2 (tema UX, WP4).

---

## Task 1: A8 — `numero_tessera` univoco su override + creazione atomica

**Files:**
- Modify: `src/main/db/clients-repository.ts` (`createCliente`, righe ~21-75)
- Test: `tests/unit/clients-repository.test.ts` (append)

Il vincolo `UNIQUE` su `numero_tessera` esiste già (migration 002): oggi un override duplicato fallisce con errore SQLite grezzo, e `getNextNumeroTessera()` + INSERT non sono atomici. Avvolgiamo lettura+insert in `transaction().immediate()` e traduciamo il vincolo in un errore di dominio.

- [ ] **Step 1: Scrivere i test (append a `tests/unit/clients-repository.test.ts`)**

In coda al file (dopo l'ultimo `describe`), aggiungere — riusando gli helper esistenti `creaCliente`/`creaTipoIscrizione` NON serve qui; servono `runMigrations` e `listClienti` già importati. Aggiungere l'import di `createCliente` e `getNextNumeroTessera` al blocco import esistente:

```typescript
import { listClienti, createCliente, getNextNumeroTessera } from '../../src/main/db/clients-repository'
```

Poi:

```typescript
describe('createCliente — numero_tessera (WP2: A8)', () => {
  it('assegna numeri tessera progressivi quando non specificati', () => {
    const a = createCliente({ nome: 'Mario', cognome: 'Rossi', codice_fiscale: 'RSSMRA85T10H501Z' })
    const b = createCliente({ nome: 'Lucia', cognome: 'Verdi', codice_fiscale: 'VRDLCU90A41H501B' })
    expect(a.numero_tessera).toBe('1')
    expect(b.numero_tessera).toBe('2')
  })

  it('A8: un numero_tessera duplicato (override) lancia NUMERO_TESSERA_DUPLICATO', () => {
    createCliente({ numero_tessera: '100', nome: 'Mario', cognome: 'Rossi', codice_fiscale: 'RSSMRA85T10H501Z' })
    expect(() =>
      createCliente({ numero_tessera: '100', nome: 'Lucia', cognome: 'Verdi', codice_fiscale: 'VRDLCU90A41H501B' })
    ).toThrow('NUMERO_TESSERA_DUPLICATO')
  })

  it('getNextNumeroTessera tiene conto del massimo numerico esistente', () => {
    createCliente({ numero_tessera: '50', nome: 'Mario', cognome: 'Rossi', codice_fiscale: 'RSSMRA85T10H501Z' })
    expect(getNextNumeroTessera()).toBe('51')
  })
})
```

- [ ] **Step 2: Eseguire i test per vederli fallire**

Run: `npx vitest run tests/unit/clients-repository.test.ts -t "numero_tessera"`
Expected: FAIL — il test A8 fallisce con un errore SQLite grezzo (es. `UNIQUE constraint failed: clienti.numero_tessera`) invece di `NUMERO_TESSERA_DUPLICATO`.

- [ ] **Step 3: Rendere atomico `createCliente` e tradurre il vincolo**

In `src/main/db/clients-repository.ts`, individuare `createCliente` (inizia con `export function createCliente(data: CreateClienteInput): ClienteRow {`). Sostituire l'apertura della funzione fino a `const info = stmt.run({ ... })` con una versione che racchiude `getNextNumeroTessera()` + INSERT in una transazione immediata e cattura il vincolo. Concretamente, mantenere identico il blocco `stmt.run({...})` con tutti i campi, ma avvolgerlo così:

```typescript
export function createCliente(data: CreateClienteInput): ClienteRow {
  const db = getDatabase()

  let newId!: number

  const esegui = db.transaction(() => {
    const numeroTessera = data.numero_tessera ?? getNextNumeroTessera()

    const stmt = db.prepare(`
      INSERT INTO clienti (
        numero_tessera, nome, cognome, codice_fiscale,
        data_nascita, sesso, comune_nascita,
        via, civico, citta, provincia, cap,
        email, telefono, note,
        tutore_nome, tutore_cognome, tutore_cf,
        tutore_via, tutore_civico, tutore_citta, tutore_provincia, tutore_cap
      ) VALUES (
        @numero_tessera, @nome, @cognome, @codice_fiscale,
        @data_nascita, @sesso, @comune_nascita,
        @via, @civico, @citta, @provincia, @cap,
        @email, @telefono, @note,
        @tutore_nome, @tutore_cognome, @tutore_cf,
        @tutore_via, @tutore_civico, @tutore_citta, @tutore_provincia, @tutore_cap
      )
    `)

    const info = stmt.run({
      numero_tessera: numeroTessera,
      nome: data.nome,
      cognome: data.cognome,
      codice_fiscale: data.codice_fiscale,
      data_nascita: data.data_nascita ?? null,
      sesso: data.sesso ?? null,
      comune_nascita: data.comune_nascita ?? null,
      via: data.via ?? null,
      civico: data.civico ?? null,
      citta: data.citta ?? null,
      provincia: data.provincia ?? null,
      cap: data.cap ?? null,
      email: data.email ?? null,
      telefono: data.telefono ?? null,
      note: data.note ?? null,
      tutore_nome: data.tutore_nome ?? null,
      tutore_cognome: data.tutore_cognome ?? null,
      tutore_cf: data.tutore_cf ?? null,
      tutore_via: data.tutore_via ?? null,
      tutore_civico: data.tutore_civico ?? null,
      tutore_citta: data.tutore_citta ?? null,
      tutore_provincia: data.tutore_provincia ?? null,
      tutore_cap: data.tutore_cap ?? null
    })

    newId = info.lastInsertRowid as number
  })

  try {
    esegui.immediate()
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed:\s*clienti\.numero_tessera/i.test(err.message)) {
      throw new Error('NUMERO_TESSERA_DUPLICATO')
    }
    throw err
  }

  const created = getCliente(newId)
  if (!created) {
    throw new Error('Errore durante la creazione del cliente: record non trovato dopo INSERT')
  }
  return created
}
```

(Non modificare `getNextNumeroTessera`: leggendolo ora dentro la transazione immediata, `MAX+1` e l'INSERT condividono il write-lock.)

- [ ] **Step 4: Eseguire i test per vederli passare**

Run: `npx vitest run tests/unit/clients-repository.test.ts` → expect tutti PASS (i 4 di A15a + i 3 nuovi).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/clients-repository.ts tests/unit/clients-repository.test.ts
git commit -m "fix(clients): createCliente atomico + NUMERO_TESSERA_DUPLICATO su override duplicato (A8)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: A9 + A10 — `creaRicevuta`: blocca cliente anonimizzato, righe vuote e riferimenti estranei

**Files:**
- Modify: `src/main/db/receipts-repository.ts` (`creaRicevuta`)
- Test: `tests/unit/receipts-invariants.test.ts` (append)

`creaRicevuta` oggi: (A10) non legge `cliente.stato`, quindi si può emettere a un cliente anonimizzato; (A9) non verifica che `input.righe` sia non vuoto né che ogni `riferimentoId` appartenga al `clienteId` (si può marcare "pagata" la voce di un altro cliente).

- [ ] **Step 1: Scrivere i test (append a `tests/unit/receipts-invariants.test.ts`)**

Gli helper `creaCliente`, `creaTipoIscrizione`, `assegnaIscrizione`, `buildInput` esistono già nel file. Aggiungere in coda:

```typescript
// ---------------------------------------------------------------------------
// WP2 — Validazioni creaRicevuta (A9/A10)
// ---------------------------------------------------------------------------

describe('creaRicevuta — validazioni (WP2: A9/A10)', () => {
  it('A10: rifiuta l\'emissione per un cliente anonimizzato', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    db.prepare("UPDATE clienti SET stato = 'anonimizzato' WHERE id = ?").run(clienteId)

    expect(() => creaRicevuta(buildInput(clienteId))).toThrow('CLIENTE_ANONIMIZZATO')
  })

  it('A9: rifiuta una ricevuta senza righe', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    expect(() => creaRicevuta(buildInput(clienteId, { righe: [] }))).toThrow('RICEVUTA_SENZA_RIGHE')
  })

  it('A9: rifiuta una riga il cui riferimentoId non appartiene al cliente', () => {
    const db = _testDb!
    const tipoIscId = creaTipoIscrizione(db)
    const clienteA = creaCliente(db, 'RSSMRA85T10H501Z')
    const clienteB = creaCliente(db, 'VRDLCU90A41H501B')
    // iscrizione del cliente B
    const iscB = assegnaIscrizione(db, clienteB, tipoIscId)

    // ricevuta per il cliente A che referenzia l'iscrizione di B
    const input = buildInput(clienteA, {
      righe: [
        { tipo: 'iscrizione', riferimentoId: iscB, descrizione: 'Iscrizione', prezzo: 30 }
      ]
    })
    expect(() => creaRicevuta(input)).toThrow('RIFERIMENTO_NON_VALIDO')
  })

  it('accetta una riga il cui riferimentoId appartiene al cliente', () => {
    const db = _testDb!
    const tipoIscId = creaTipoIscrizione(db)
    const clienteA = creaCliente(db, 'RSSMRA85T10H501Z')
    const iscA = assegnaIscrizione(db, clienteA, tipoIscId)

    const input = buildInput(clienteA, {
      righe: [
        { tipo: 'iscrizione', riferimentoId: iscA, descrizione: 'Iscrizione', prezzo: 30 }
      ]
    })
    const r = creaRicevuta(input)
    expect(r.righe.length).toBe(1)
  })
})
```

- [ ] **Step 2: Eseguire i test per vederli fallire**

Run: `npx vitest run tests/unit/receipts-invariants.test.ts -t "validazioni"`
Expected: FAIL — nessuno dei controlli esiste ancora (l'emissione anonimizzato/righe-vuote/riferimento-estraneo va a buon fine o fallisce con errore diverso).

- [ ] **Step 3: Aggiungere le validazioni in `creaRicevuta`**

In `src/main/db/receipts-repository.ts`, dentro `creaRicevuta`:

(a) Aggiungere `stato` alla colonna selezionata dal cliente. Nella `SELECT ... FROM clienti WHERE id = ?` (la stringa che inizia con `'SELECT id, nome, cognome, codice_fiscale, data_nascita, via, ...'`), aggiungere `stato` all'elenco colonne e al tipo del cast. Cioè: la prima riga della stringa SQL diventa
`'SELECT id, nome, cognome, codice_fiscale, data_nascita, stato, via, civico, citta, provincia, cap,'`
e nel tipo del cast aggiungere il campo `stato: 'attivo' | 'anonimizzato'` accanto a `id: number`.

(b) Subito dopo il blocco `if (!cliente) { throw new Error(\`Cliente con id ${input.clienteId} non trovato\`) }`, inserire le tre validazioni:

```typescript
  // A10: non si emettono ricevute a clienti anonimizzati (invariante 7: storico preservato,
  // ma nessuna NUOVA operazione su un soggetto cancellato).
  if (cliente.stato !== 'attivo') {
    throw new Error('CLIENTE_ANONIMIZZATO')
  }

  // A9: almeno una riga
  if (!input.righe || input.righe.length === 0) {
    throw new Error('RICEVUTA_SENZA_RIGHE')
  }

  // A9: ogni riga con riferimento a iscrizione/abbonamento deve appartenere a questo cliente
  for (const riga of input.righe) {
    if (riga.riferimentoId == null) continue
    if (riga.tipo === 'iscrizione') {
      const ok = db
        .prepare('SELECT 1 FROM iscrizioni_cliente WHERE id = ? AND cliente_id = ?')
        .get(riga.riferimentoId, input.clienteId)
      if (!ok) throw new Error('RIFERIMENTO_NON_VALIDO')
    } else if (riga.tipo === 'abbonamento') {
      const ok = db
        .prepare('SELECT 1 FROM abbonamenti_cliente WHERE id = ? AND cliente_id = ?')
        .get(riga.riferimentoId, input.clienteId)
      if (!ok) throw new Error('RIFERIMENTO_NON_VALIDO')
    }
  }
```

(Le righe di tipo `'libera'` con `riferimentoId` nullo passano senza controllo, coerente con il modello.)

- [ ] **Step 4: Eseguire i test per vederli passare**

Run: `npx vitest run tests/unit/receipts-invariants.test.ts` → expect tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/receipts-repository.ts tests/unit/receipts-invariants.test.ts
git commit -m "fix(receipts): creaRicevuta blocca cliente anonimizzato, righe vuote e riferimenti estranei (A9/A10)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: A10 — Blocca assegnazioni a clienti anonimizzati

**Files:**
- Modify: `src/main/db/memberships-repository.ts` (`assegnaIscrizione`, `assegnaAbbonamento`)
- Test: `tests/unit/memberships-invariants.test.ts` (append)

- [ ] **Step 1: Scrivere i test (append a `tests/unit/memberships-invariants.test.ts`)**

Gli helper `creaCliente`, `creaTipoIscrizione`, `creaTipoAbbonamento` esistono. `assegnaIscrizione`/`assegnaAbbonamento` (le funzioni del repository) sono già importate. Aggiungere in coda:

```typescript
// ---------------------------------------------------------------------------
// WP2 — Blocco assegnazioni a clienti anonimizzati (A10)
// ---------------------------------------------------------------------------

describe('assegnazioni — cliente anonimizzato (WP2: A10)', () => {
  it('assegnaIscrizione rifiuta un cliente anonimizzato', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoIscrizione(db)
    db.prepare("UPDATE clienti SET stato = 'anonimizzato' WHERE id = ?").run(clienteId)

    expect(() =>
      assegnaIscrizione({
        cliente_id: clienteId,
        tipo_iscrizione_id: tipoId,
        data_inizio: '2025-01-01',
        data_scadenza: '2025-12-31',
        prezzo: 30,
        stato_pagamento: 'da_incassare'
      })
    ).toThrow('CLIENTE_ANONIMIZZATO')
  })

  it('assegnaAbbonamento rifiuta un cliente anonimizzato', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoAbbId = creaTipoAbbonamento(db)
    db.prepare("UPDATE clienti SET stato = 'anonimizzato' WHERE id = ?").run(clienteId)

    expect(() =>
      assegnaAbbonamento({
        cliente_id: clienteId,
        tipo_abbonamento_id: tipoAbbId,
        data_inizio: '2025-01-01',
        data_scadenza: '2025-01-31',
        prezzo: 40,
        stato_pagamento: 'da_incassare'
      })
    ).toThrow('CLIENTE_ANONIMIZZATO')
  })
})
```

NOTA: verificare la forma esatta di `AssegnaIscrizioneInput`/`AssegnaAbbonamentoInput` in `src/types/shared.ts` e adattare i campi dell'oggetto se differiscono (es. `metodo_pagamento` opzionale). Il punto del test è solo il `throw`.

- [ ] **Step 2: Eseguire i test per vederli fallire**

Run: `npx vitest run tests/unit/memberships-invariants.test.ts -t "anonimizzato"`
Expected: FAIL — l'assegnazione va a buon fine (nessun controllo su stato cliente). Per `assegnaAbbonamento` potrebbe servire prima un'iscrizione attiva; vedi nota sotto.

> Se `assegnaAbbonamento` fallisce con `NESSUNA_ISCRIZIONE_ATTIVA` invece di completare, è perché il controllo dello stato cliente va messo **prima** di quello dell'iscrizione attiva (vedi Step 3): in tal caso il test rosso mostrerà comunque un messaggio diverso da `CLIENTE_ANONIMIZZATO`, confermando il gap.

- [ ] **Step 3: Aggiungere il controllo stato cliente**

In `src/main/db/memberships-repository.ts`:

(a) In `assegnaIscrizione`, come **prima** istruzione dopo `const db = getDatabase()`:

```typescript
  const cliente = db.prepare('SELECT stato FROM clienti WHERE id = ?').get(data.cliente_id) as
    | { stato: 'attivo' | 'anonimizzato' }
    | undefined
  if (!cliente) throw new Error('CLIENTE_NOT_FOUND')
  if (cliente.stato !== 'attivo') throw new Error('CLIENTE_ANONIMIZZATO')
```

(b) In `assegnaAbbonamento`, inserire lo stesso blocco come **prima** del controllo `getIscrizioneAttiva(...)` (così un cliente anonimizzato dà `CLIENTE_ANONIMIZZATO`, non `NESSUNA_ISCRIZIONE_ATTIVA`):

```typescript
  const cliente = db.prepare('SELECT stato FROM clienti WHERE id = ?').get(data.cliente_id) as
    | { stato: 'attivo' | 'anonimizzato' }
    | undefined
  if (!cliente) throw new Error('CLIENTE_NOT_FOUND')
  if (cliente.stato !== 'attivo') throw new Error('CLIENTE_ANONIMIZZATO')
```

- [ ] **Step 4: Eseguire i test per vederli passare**

Run: `npx vitest run tests/unit/memberships-invariants.test.ts` → expect tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/memberships-repository.ts tests/unit/memberships-invariants.test.ts
git commit -m "fix(memberships): blocca assegnazione iscrizione/abbonamento a clienti anonimizzati (A10)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: A11 — `listClienti`: filtro certificati con `julianday(date('now'))` (no frazione di giorno)

**Files:**
- Modify: `src/main/db/clients-repository.ts` (`listClienti`, 3 occorrenze nel blocco `stato_certificato`)
- Test: `tests/unit/clients-repository.test.ts` (append)

`julianday('now')` include la frazione di giorno: un certificato che scade **oggi** dà differenza negativa nel pomeriggio e finisce tra gli "scaduti" invece che "in scadenza". Si tronca al giorno con `date('now')` (mezzanotte UTC), rendendo la differenza un intero di giorni.

- [ ] **Step 1: Determinare le colonne di `certificati_medici`**

LEGGERE la migrazione che crea `certificati_medici` (cercare `CREATE TABLE` in `src/main/db/migrations/003_memberships.ts`, o il file di migrazione che la definisce) e annotare le colonne NOT NULL, così l'helper di test inserisce un certificato valido. Servono almeno `cliente_id`, `tipo`, `data_scadenza` (più eventuali NOT NULL come `data_rilascio`).

- [ ] **Step 2: Scrivere il test (append a `tests/unit/clients-repository.test.ts`)**

Adattare i nomi/colonne dell'INSERT a quanto trovato allo Step 1. Struttura:

```typescript
describe('listClienti — filtro certificato in scadenza oggi (WP2: A11)', () => {
  it('un certificato che scade OGGI è "in_scadenza", non "scaduto"', () => {
    const db = _testDb!
    const c = creaCliente(db, 'RSSMRA85T10H501Z')
    // data_scadenza = oggi (UTC) — adattare le colonne NOT NULL allo schema reale (Step 1)
    db.prepare(
      `INSERT INTO certificati_medici (cliente_id, tipo, data_rilascio, data_scadenza)
       VALUES (?, 'agonistico', date('now','-365 days'), date('now'))`
    ).run(c)

    const inScadenza = listClienti({ stato_certificato: 'in_scadenza' }, 30)
    const scaduti = listClienti({ stato_certificato: 'scaduto' }, 30)

    expect(inScadenza.map((r) => r.id)).toContain(c)
    expect(scaduti.map((r) => r.id)).not.toContain(c)
  })
})
```

- [ ] **Step 3: Eseguire il test per vederlo fallire**

Run: `npx vitest run tests/unit/clients-repository.test.ts -t "scade OGGI"`
Expected: FAIL — con `julianday('now')` (frazione di giorno) il certificato di oggi risulta `scaduto` e non `in_scadenza`.

> Se il test passasse già (es. eseguito a mezzanotte UTC esatta), è comunque corretto includerlo come guardia: la fix lo rende deterministico.

- [ ] **Step 4: Applicare la fix**

In `src/main/db/clients-repository.ts`, nel blocco del filtro `stato_certificato` (i tre rami `'scaduto'`, `'in_scadenza'`, `'valido'`), sostituire ogni occorrenza di `julianday('now')` con `julianday(date('now'))`. Le tre clausole diventano:

```typescript
  if (filters?.stato_certificato === 'scaduto') {
    extraWhere.push(
      `cm.data_scadenza IS NOT NULL AND julianday(cm.data_scadenza) < julianday(date('now'))`
    )
  } else if (filters?.stato_certificato === 'in_scadenza') {
    extraWhere.push(
      `cm.data_scadenza IS NOT NULL AND julianday(cm.data_scadenza) - julianday(date('now')) BETWEEN 0 AND ?`
    )
    extraParams.push(giorniPreavvisoCert)
  } else if (filters?.stato_certificato === 'valido') {
    extraWhere.push(
      `cm.data_scadenza IS NOT NULL AND julianday(cm.data_scadenza) - julianday(date('now')) > ?`
    )
    extraParams.push(giorniPreavvisoCert)
  }
```

- [ ] **Step 5: Eseguire il test per vederlo passare**

Run: `npx vitest run tests/unit/clients-repository.test.ts` → expect tutti PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/db/clients-repository.ts tests/unit/clients-repository.test.ts
git commit -m "fix(clients): filtro certificati usa julianday(date('now')) per troncare al giorno (A11)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: A12 — Validazione catalogo negli handler + whitelist colonne negli update

**Files:**
- Modify: `src/main/domain/catalogo.ts` (nuova `validaTipoUpdate`)
- Modify: `src/main/db/catalog-repository.ts` (`updateTipoIscrizione`, `updateTipoAbbonamento`: whitelist)
- Modify: `src/main/ipc/handlers.ts` (4 handler: create+update iscrizione/abbonamento)
- Test: `tests/unit/domain/catalogo.test.ts` (append)

Oggi gli handler `catalogo:*:create/update` chiamano il repository senza validazione, e gli update costruiscono il `SET` iterando `Object.keys(data)` (input IPC non tipizzato a runtime): si possono impostare `durata_mesi`/`prezzo` ≤ 0 o colonne arbitrarie.

- [ ] **Step 1: Scrivere i test di dominio (append a `tests/unit/domain/catalogo.test.ts`)**

Aggiungere l'import di `validaTipoUpdate` al blocco import da `catalogo` e questo describe:

```typescript
describe('validaTipoUpdate (WP2: A12)', () => {
  it('accetta un input vuoto (nessun campo da validare)', () => {
    expect(validaTipoUpdate({}).valid).toBe(true)
  })

  it('rifiuta nome vuoto se presente', () => {
    const res = validaTipoUpdate({ nome: '   ' })
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.field === 'nome')).toBe(true)
  })

  it('rifiuta durata_mesi < 1 se presente', () => {
    const res = validaTipoUpdate({ durata_mesi: 0 })
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.field === 'durata_mesi')).toBe(true)
  })

  it('rifiuta prezzo_default negativo se presente', () => {
    const res = validaTipoUpdate({ prezzo_default: -1 })
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.field === 'prezzo_default')).toBe(true)
  })

  it('accetta valori validi', () => {
    expect(validaTipoUpdate({ nome: 'Mensile', durata_mesi: 1, prezzo_default: 40 }).valid).toBe(true)
  })
})
```

- [ ] **Step 2: Eseguire i test per vederli fallire**

Run: `npx vitest run tests/unit/domain/catalogo.test.ts -t "validaTipoUpdate"`
Expected: FAIL — `validaTipoUpdate` non esiste (errore di import/compilazione del test).

- [ ] **Step 3: Aggiungere `validaTipoUpdate` in `catalogo.ts`**

In `src/main/domain/catalogo.ts`, dopo `validaTipoAbbonamento` (riga ~51), aggiungere:

```typescript
/**
 * Validazione parziale per l'aggiornamento di un tipo (iscrizione o abbonamento):
 * controlla solo i campi presenti nell'input.
 */
export function validaTipoUpdate(input: Partial<CreateTipoInput>): ValidationResult {
  const errors: Array<{ field: string; message: string }> = []

  if ('nome' in input) {
    if (!input.nome || input.nome.trim().length === 0) {
      errors.push({ field: 'nome', message: 'Il nome è obbligatorio.' })
    }
  }
  if ('durata_mesi' in input) {
    if (!Number.isFinite(input.durata_mesi as number) || (input.durata_mesi as number) < 1) {
      errors.push({ field: 'durata_mesi', message: 'La durata deve essere di almeno 1 mese.' })
    }
  }
  if ('prezzo_default' in input) {
    if (!Number.isFinite(input.prezzo_default as number) || (input.prezzo_default as number) < 0) {
      errors.push({ field: 'prezzo_default', message: 'Il prezzo non può essere negativo.' })
    }
  }

  return { valid: errors.length === 0, errors }
}
```

- [ ] **Step 4: Eseguire i test di dominio per vederli passare**

Run: `npx vitest run tests/unit/domain/catalogo.test.ts` → expect tutti PASS.

- [ ] **Step 5: Whitelist colonne negli update del repository**

In `src/main/db/catalog-repository.ts`:

In `updateTipoIscrizione`, sostituire la riga `const fields = Object.keys(data) as (keyof UpdateTipoIscrizioneInput)[]` con un filtro su colonne consentite:

```typescript
  const COLONNE_ISCRIZIONE = ['nome', 'descrizione', 'durata_mesi', 'prezzo_default', 'stato'] as const
  const fields = (Object.keys(data) as (keyof UpdateTipoIscrizioneInput)[]).filter((f) =>
    (COLONNE_ISCRIZIONE as readonly string[]).includes(f as string)
  )
```

In `updateTipoAbbonamento`, analogamente:

```typescript
  const COLONNE_ABBONAMENTO = ['nome', 'descrizione', 'durata_mesi', 'prezzo_default', 'categoria', 'colore', 'stato'] as const
  const fields = (Object.keys(data) as (keyof UpdateTipoAbbonamentoInput)[]).filter((f) =>
    (COLONNE_ABBONAMENTO as readonly string[]).includes(f as string)
  )
```

(Il resto delle funzioni — il ramo `fields.length === 0`, la costruzione di `setClauses`, lo `stmt.run({ ...data, id })` — resta invariato. Nota: `stmt.run({ ...data, id })` passa parametri nominali extra non usati: better-sqlite3 li ignora se non referenziati nello SQL, e lo SQL ora referenzia solo le colonne whitelisted.)

- [ ] **Step 6: Chiamare la validazione nei 4 handler**

In `src/main/ipc/handlers.ts`, aggiungere gli import di `validaTipoIscrizione`, `validaTipoAbbonamento`, `validaTipoUpdate` da `../domain/catalogo` (verificare il percorso relativo usato per gli altri import di dominio nel file). Poi, in ciascun handler, inserire il guard PRIMA della chiamata al repository, con lo stesso pattern di `clienti:create`:

In `catalogo:tipiIscrizione:create` (prima di `return createTipoIscrizione(data)`):
```typescript
      const validation = validaTipoIscrizione(data)
      if (!validation.valid) {
        const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
        throw new Error(`VALIDATION_ERROR: ${errorMsg}`)
      }
```

In `catalogo:tipiAbbonamento:create` (prima di `return createTipoAbbonamento(data)`): identico ma con `validaTipoAbbonamento(data)`.

In `catalogo:tipiIscrizione:update` e `catalogo:tipiAbbonamento:update` (prima di `return updateTipo...(id, data)`):
```typescript
      const validation = validaTipoUpdate(data)
      if (!validation.valid) {
        const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
        throw new Error(`VALIDATION_ERROR: ${errorMsg}`)
      }
```

- [ ] **Step 7: Typecheck + test mirati**

Run: `npx tsc --noEmit -p tsconfig.node.json` (expect no errors) e `npx vitest run tests/unit/domain/catalogo.test.ts tests/unit/memberships-invariants.test.ts` (expect PASS — quest'ultimo per non regredire i test catalogo esistenti).

- [ ] **Step 8: Commit**

```bash
git add src/main/domain/catalogo.ts src/main/db/catalog-repository.ts src/main/ipc/handlers.ts tests/unit/domain/catalogo.test.ts
git commit -m "fix(catalogo): valida create/update negli handler e whitelist colonne update (A12)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: A13 — Indicatori dashboard: aggiungi "iscrizioni/abbonamenti in scadenza"

**Files:**
- Modify: `src/types/shared.ts` (`WidgetIndicatori`)
- Modify: `src/main/db/dashboard-repository.ts` (copia locale `WidgetIndicatori` + `getIndicatori`)
- Modify: `src/renderer/src/components/dashboard/IndicatoriWidget.tsx`
- Modify: `src/renderer/src/pages/DashboardPage.tsx` (grid)
- Modify: `src/renderer/src/i18n/locales/it.json`, `en.json`
- Test: `tests/unit/dashboard.test.ts` (append)

I parametri `giorniPreavvisoIsc`/`giorniPreavvisoAbb` arrivano fino a `getIndicatori` e vengono scartati (`void`). Aggiungiamo due conteggi (riusando la SQL di `getClientiInScadenza`) e due tile **non cliccabili** (come "incassi"). Drill-down su lista clienti fuori scope (tema B9).

- [ ] **Step 1: Estendere il tipo `WidgetIndicatori` (entrambe le copie)**

In `src/types/shared.ts`, nell'interfaccia `WidgetIndicatori`, aggiungere dopo `certificati_scaduti: number`:
```typescript
  iscrizioni_in_scadenza: number
  abbonamenti_in_scadenza: number
```
In `src/main/db/dashboard-repository.ts`, fare la **stessa** aggiunta nella copia locale dell'interfaccia `WidgetIndicatori` (righe ~16-23).

- [ ] **Step 2: Scrivere il test (append a `tests/unit/dashboard.test.ts`)**

LEGGERE prima `tests/unit/dashboard.test.ts` per riusare i suoi helper (creazione cliente/tipo/iscrizione/abbonamento e come invoca `getIndicatori`, in particolare i parametri `oggi`, `giorniPreavvisoIsc`, `giorniPreavvisoAbb`). Aggiungere un test che inserisce un'iscrizione attiva in scadenza entro la finestra e un abbonamento attivo in scadenza entro la finestra, e verifica i conteggi:

```typescript
describe('getIndicatori — in scadenza iscrizioni/abbonamenti (WP2: A13)', () => {
  it('conta iscrizioni e abbonamenti attivi in scadenza entro il preavviso', () => {
    const db = _testDb!
    const clienteId = /* helper esistente: crea cliente attivo */
    const tipoIsc = /* helper esistente: crea tipo iscrizione */
    const tipoAbb = /* helper esistente: crea tipo abbonamento */
    // iscrizione attiva che scade tra 5 giorni
    db.prepare(
      `INSERT INTO iscrizioni_cliente (cliente_id, tipo_iscrizione_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, date('now','-30 days'), date('now','+5 days'), 30, 'da_incassare', 'attiva')`
    ).run(clienteId, tipoIsc)
    // abbonamento attivo che scade tra 5 giorni
    db.prepare(
      `INSERT INTO abbonamenti_cliente (cliente_id, tipo_abbonamento_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, date('now','-30 days'), date('now','+5 days'), 40, 'da_incassare', 'attivo')`
    ).run(clienteId, tipoAbb)

    const oggi = new Date().toISOString().slice(0, 10)
    const ind = getIndicatori(oggi, 30, 30, 30)

    expect(ind.iscrizioni_in_scadenza).toBe(1)
    expect(ind.abbonamenti_in_scadenza).toBe(1)
  })
})
```

(Compilare i `/* helper esistente */` con gli helper realmente presenti in `dashboard.test.ts` dopo averlo letto.)

- [ ] **Step 3: Eseguire il test per vederlo fallire**

Run: `npx vitest run tests/unit/dashboard.test.ts -t "in scadenza iscrizioni"`
Expected: FAIL — `ind.iscrizioni_in_scadenza`/`abbonamenti_in_scadenza` sono `undefined` (campi non ancora prodotti).

- [ ] **Step 4: Aggiungere i due conteggi in `getIndicatori`**

In `src/main/db/dashboard-repository.ts`, dentro `getIndicatori`, prima delle righe `void giorniPreavvisoIsc` / `void giorniPreavvisoAbb`, aggiungere:

```typescript
  // iscrizioni in scadenza: attive (non invalidate) entro la finestra di preavviso
  const iscInScadenzaRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM iscrizioni_cliente ic
       JOIN clienti c ON c.id = ic.cliente_id
       WHERE c.stato = 'attivo'
         AND ic.stato != 'invalidata'
         AND julianday(ic.data_scadenza) - julianday(:oggi) BETWEEN 0 AND :giorni`
    )
    .get({ oggi, giorni: giorniPreavvisoIsc }) as { cnt: number }

  // abbonamenti in scadenza: attivi (non invalidati) entro la finestra di preavviso
  const abbInScadenzaRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM abbonamenti_cliente ac
       JOIN clienti c ON c.id = ac.cliente_id
       WHERE c.stato = 'attivo'
         AND ac.stato != 'invalidato'
         AND julianday(ac.data_scadenza) - julianday(:oggi) BETWEEN 0 AND :giorni`
    )
    .get({ oggi, giorni: giorniPreavvisoAbb }) as { cnt: number }
```

Rimuovere le due righe `void giorniPreavvisoIsc` / `void giorniPreavvisoAbb` (e il commento che le precede). Nel `return`, aggiungere dopo `certificati_scaduti: certScadutiRow.cnt,`:
```typescript
    iscrizioni_in_scadenza: iscInScadenzaRow.cnt,
    abbonamenti_in_scadenza: abbInScadenzaRow.cnt,
```

- [ ] **Step 5: Eseguire il test repo per vederlo passare**

Run: `npx vitest run tests/unit/dashboard.test.ts` → expect tutti PASS.

- [ ] **Step 6: Aggiungere le chiavi i18n**

In `src/renderer/src/i18n/locales/it.json`, nel blocco `dashboard.indicatori`, dopo `"certificati": "Certificati in scadenza",` aggiungere:
```json
      "iscrizioni_in_scadenza": "Iscrizioni in scadenza",
      "abbonamenti_in_scadenza": "Abbonamenti in scadenza",
```
In `src/renderer/src/i18n/locales/en.json`, nello stesso punto:
```json
      "iscrizioni_in_scadenza": "Expiring memberships",
      "abbonamenti_in_scadenza": "Expiring subscriptions",
```

- [ ] **Step 7: Aggiungere i due tile nel widget**

In `src/renderer/src/components/dashboard/IndicatoriWidget.tsx`:

(a) Nel ramo `hasError`, cambiare `col-span-4` in `col-span-2 lg:col-span-3` (per coerenza con la nuova griglia a 3 colonne dello Step 8). Riga 84: `className="col-span-2 lg:col-span-3 rounded-xl bg-red-50 ..."`.

(b) Nel `return`, dopo il tile `certificati` (chiude a riga 117) e PRIMA del tile `incassi`, aggiungere due tile non cliccabili:
```tsx
      <StatCard
        label={t('dashboard.indicatori.iscrizioni_in_scadenza')}
        value={data?.iscrizioni_in_scadenza ?? 0}
        colorClasses="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-900 dark:text-amber-100"
        isLoading={isLoading}
      />
      <StatCard
        label={t('dashboard.indicatori.abbonamenti_in_scadenza')}
        value={data?.abbonamenti_in_scadenza ?? 0}
        colorClasses="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700 text-purple-900 dark:text-purple-100"
        isLoading={isLoading}
      />
```

- [ ] **Step 8: Adeguare la griglia in DashboardPage**

In `src/renderer/src/pages/DashboardPage.tsx`, alla riga del wrapper degli indicatori, cambiare `className="grid grid-cols-2 lg:grid-cols-4 gap-4"` in `className="grid grid-cols-2 lg:grid-cols-3 gap-4"` (6 tile → 3×2 su desktop, 2×3 su mobile). Nessun nuovo callback (i due tile sono non cliccabili).

- [ ] **Step 9: Verifica completa (tocca renderer + i18n)**

Run: `npm run verify` (typecheck + lint + test + build) → expect verde. Verificare che il conteggio chiavi i18n IT/EN resti allineato (la skill `i18n` richiede parità di chiavi).

- [ ] **Step 10: Commit**

```bash
git add src/types/shared.ts src/main/db/dashboard-repository.ts src/renderer/src/components/dashboard/IndicatoriWidget.tsx src/renderer/src/pages/DashboardPage.tsx src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json tests/unit/dashboard.test.ts
git commit -m "feat(dashboard): indicatori 'iscrizioni/abbonamenti in scadenza' usando i preavvisi (A13)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: A14 — `settings:set` atomico (SQLite in transazione, poi file JSON)

**Files:**
- Modify: `src/main/settings/store.ts` (nuova `applyAppSettingsToDb`)
- Modify: `src/main/ipc/handlers.ts` (`settings:set`)
- Test: `tests/unit/settings-sync.test.ts` (**nuovo file**, testa solo la funzione pura `applyAppSettingsToDb`)

Oggi `settings:set` scrive prima il JSON poi fa upsert su SQLite con `.run()` individuali (non in transazione): un crash a metà lascia JSON e DB divergenti. Estraiamo la sincronizzazione SQLite in una funzione testabile che usa una transazione, e la eseguiamo **prima** della scrittura del file (così se SQLite fallisce il JSON non viene toccato).

- [ ] **Step 1: Scrivere il test (nuovo file `tests/unit/settings-sync.test.ts`)**

```typescript
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
import { applyAppSettingsToDb } from '../../src/main/settings/store'

beforeEach(() => {
  _testDb = new Database(':memory:')
  _testDb.pragma('foreign_keys = ON')
  runMigrations(_testDb)
})
afterEach(() => {
  if (_testDb && _testDb.open) _testDb.close()
  _testDb = null
})

describe('applyAppSettingsToDb (WP2: A14)', () => {
  it('fa upsert dei soli campi presenti in app_settings', () => {
    const db = _testDb!
    applyAppSettingsToDb(db, { receipt_start_number: 5, ragione_sociale: 'ASD Test' })

    const n = db.prepare(`SELECT value FROM app_settings WHERE key = 'receipt_start_number'`).get() as { value: string }
    const r = db.prepare(`SELECT value FROM app_settings WHERE key = 'ragione_sociale'`).get() as { value: string }
    expect(n.value).toBe('5')
    expect(r.value).toBe('ASD Test')
  })

  it('è atomico: un valore non sincronizzato non lascia scritture parziali', () => {
    const db = _testDb!
    applyAppSettingsToDb(db, { receipt_start_number: 1 })
    // un secondo upsert aggiorna senza creare duplicati
    applyAppSettingsToDb(db, { receipt_start_number: 2 })
    const rows = db.prepare(`SELECT COUNT(*) AS c FROM app_settings WHERE key = 'receipt_start_number'`).get() as { c: number }
    expect(rows.c).toBe(1)
  })
})
```

- [ ] **Step 2: Eseguire il test per vederlo fallire**

Run: `npx vitest run tests/unit/settings-sync.test.ts`
Expected: FAIL — `applyAppSettingsToDb` non esiste.

- [ ] **Step 3: Estrarre `applyAppSettingsToDb` in `store.ts`**

In `src/main/settings/store.ts`, aggiungere (con gli import necessari: `import type Database from 'better-sqlite3-multiple-ciphers'` e il tipo `AppSettings` già presente nel file):

```typescript
/**
 * Sincronizza i campi condivisi di AppSettings nella tabella SQLite app_settings,
 * in un'unica transazione (atomica). Scrive solo i campi presenti in `settings`.
 */
export function applyAppSettingsToDb(db: Database.Database, settings: Partial<AppSettings>): void {
  const upsert = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
  const campi = ['receipt_start_number', 'dicitura_pie', 'ragione_sociale', 'indirizzo_attivita', 'codice_fiscale_piva', 'logo_base64', 'backup_on_close'] as const
  const esegui = db.transaction(() => {
    for (const key of campi) {
      const v = settings[key]
      if (v !== undefined) {
        upsert.run(key, String(v))
      }
    }
  })
  esegui()
}
```

- [ ] **Step 4: Eseguire il test per vederlo passare**

Run: `npx vitest run tests/unit/settings-sync.test.ts` → expect 2 PASS.

- [ ] **Step 5: Riordinare `settings:set` (SQLite prima, file dopo)**

In `src/main/ipc/handlers.ts`, nel handler `settings:set`, sostituire il corpo del `try` con questo ordine (SQLite in transazione PRIMA, poi scrittura file): importare `applyAppSettingsToDb` da `../settings/store` (insieme a `loadSettings`/`saveSettings` già importati) e:

```typescript
      const current = loadSettings()
      const updated: AppSettings = { ...current, ...settings }

      // 1) SQLite per primo, in transazione (atomico). Se fallisce, il file NON viene scritto.
      if (isDatabaseOpen()) {
        applyAppSettingsToDb(getDatabase(), settings)
      }

      // 2) Solo dopo il successo SQLite, persiste il file JSON.
      saveSettings(updated)
```

(Rimuovere il vecchio blocco inline con `upsert = db.prepare(...)` e i `.run()` individuali, ora sostituiti da `applyAppSettingsToDb`.)

- [ ] **Step 6: Verifica e commit**

Run: `npx tsc --noEmit -p tsconfig.node.json` (expect no errors) e `npx vitest run tests/unit/settings-sync.test.ts`.

```bash
git add src/main/settings/store.ts src/main/ipc/handlers.ts tests/unit/settings-sync.test.ts
git commit -m "fix(settings): settings:set scrive SQLite in transazione prima del file JSON (A14)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: A7a — Correggere i commenti JSDoc invertiti delle tabelle CF

**Files:**
- Modify: `src/main/domain/codice-fiscale.ts` (commenti su `VALORI_PARI`/`VALORI_DISPARI`, righe ~10 e ~22)

L'algoritmo è corretto (round-trip verde). I **commenti** JSDoc sulle due tabelle sono etichettati al contrario rispetto alla terminologia ufficiale (1-indexed) dell'Agenzia delle Entrate: `VALORI_PARI` è in realtà usata per le posizioni che la specifica chiama "dispari" e viceversa. Solo commenti — nessun cambio di comportamento.

- [ ] **Step 1: Correggere i due commenti**

In `src/main/domain/codice-fiscale.ts`:

Sostituire il commento sopra `VALORI_PARI` (riga ~10):
```typescript
/** Valori per i caratteri in posizione PARI (0-based: 1,3,5,...) */
```
con:
```typescript
/**
 * Valori per i caratteri in posizione PARI secondo la specifica ufficiale (1-indexed: 2°,4°,6°...),
 * che corrispondono agli indici 0-based 1,3,5,... usati nel ciclo di calcolaCarattereControllo.
 */
```

Sostituire il commento sopra `VALORI_DISPARI` (riga ~22):
```typescript
/** Valori per i caratteri in posizione DISPARI (0-based: 0,2,4,...) */
```
con:
```typescript
/**
 * Valori per i caratteri in posizione DISPARI secondo la specifica ufficiale (1-indexed: 1°,3°,5°...),
 * che corrispondono agli indici 0-based 0,2,4,... usati nel ciclo di calcolaCarattereControllo.
 */
```

- [ ] **Step 2: Verifica (nessun comportamento cambiato)**

Run: `npx vitest run tests/unit/domain/codice-fiscale.test.ts` → expect tutti PASS (invariati).

- [ ] **Step 3: Commit**

```bash
git add src/main/domain/codice-fiscale.ts
git commit -m "docs(cf): corregge le etichette JSDoc invertite delle tabelle pari/dispari (A7a)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: A7b — Fixture CF reale verso riferimento esterno *(INPUT richiesto)*

**Files:**
- Modify: `tests/unit/domain/codice-fiscale.test.ts` (append)
- Modify: `OPEN-QUESTIONS.md` (chiusura nota CF / fonte)

> **INPUT RICHIESTO PRIMA DI ESEGUIRE:** un CF reale verificato + i dati anagrafici corrispondenti + la fonte. Il controller (utente) fornisce:
> - `CF_REALE` (16 caratteri),
> - dati per il round-trip: `nome`, `cognome`, `data_nascita` (YYYY-MM-DD), `sesso` ('M'/'F'), `codiceComune` (Belfiore, es. 'H501'),
> - `FONTE` (URL/descrizione, es. esempio ufficiale Agenzia delle Entrate).
> Non inventare un CF: senza questi dati il task resta in attesa.

- [ ] **Step 1: Aggiungere il test fixture (sostituire i segnaposto MAIUSCOLI con i valori forniti)**

In `tests/unit/domain/codice-fiscale.test.ts`, append:

```typescript
// Fonte del CF di riferimento: <FONTE>
describe('codice-fiscale — verifica contro CF reale (A7b)', () => {
  const CF_REALE = '<CF_REALE>'

  it('isCodiceFiscaleValid accetta il CF reale di riferimento', () => {
    expect(isCodiceFiscaleValid(CF_REALE)).toBe(true)
  })

  it('calcolaCF riproduce il CF reale dai dati anagrafici', () => {
    const cf = calcolaCF('<nome>', '<cognome>', '<data_nascita>', '<sesso>', '<codiceComune>')
    expect(cf).toBe(CF_REALE)
  })
})
```

- [ ] **Step 2: Eseguire il test**

Run: `npx vitest run tests/unit/domain/codice-fiscale.test.ts -t "CF reale"`
Expected: PASS. Se `calcolaCF` NON riproduce il CF (es. omocodia o dati incompleti), riportare lo scostamento al controller invece di forzare: potrebbe indicare un caso di omocodia da gestire separatamente, oppure dati anagrafici imprecisi.

- [ ] **Step 3: Aggiornare `OPEN-QUESTIONS.md`**

Trasformare la voce `[Assunzione]` sull'algoritmo CF (round-trip interno) in `[Chiusa]` annotando che è stata aggiunta una fixture con CF reale da `<FONTE>`.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/domain/codice-fiscale.test.ts OPEN-QUESTIONS.md
git commit -m "test(cf): aggiunge fixture di validazione contro un CF reale di fonte ufficiale (A7b)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Verifica finale + aggiornamento `ANALYSYS.md`

**Files:** `ANALYSYS.md`

- [ ] **Step 1: `npm run verify` completo**

Run: `npm run verify` → expect verde (typecheck + lint 0 warning + tutti i test + build). Annotare il totale test.

- [ ] **Step 2: Aggiornare la tabella stato in `ANALYSYS.md`**

Nella sezione "Stato delle voci dell'analisi", spostare A7 (a8/a9/a10/a11/a12/a13/a14) da APERTO a risolto. Concretamente: cambiare la riga aggregata "APERTO" in modo che elenchi solo le voci ancora aperte (B1–B12, C2, C3, C6–C13, D1–D12, N4, N5) e aggiungere una riga/nota: "A7a, A8, A9, A10, A11, A12, A13, A14 risolti in WP2 (2026-06-11); A7b fixture aggiunta (CF reale)." Aggiungere in coda alla sezione "Verifica «verde»" una frase: "**WP2 chiuso il 2026-06-11:** A7–A14 risolti e verificati; `npm run verify` verde."

- [ ] **Step 3: Commit**

```bash
git add ANALYSYS.md
git commit -m "docs: aggiorna stato analisi dopo chiusura WP2 (A7-A14)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (eseguita)

**1. Copertura spec (WP2 = A7–A14):**
- A7 → Task 8 (commenti) + Task 9 (fixture reale, input utente). ✓
- A8 → Task 1 (atomicità + errore duplicato; UNIQUE già esistente). ✓
- A9 → Task 2 (righe non vuote + appartenenza riferimenti; indirizzo obbligatorio rinviato a WP4/B6, annotato). ✓
- A10 → Task 2 (creaRicevuta) + Task 3 (assegnazioni). ✓
- A11 → Task 4 (`julianday(date('now'))`). ✓
- A12 → Task 5 (validazione handler + whitelist). ✓
- A13 → Task 6 (conteggi + UI). ✓
- A14 → Task 7 (SQLite in transazione prima del file). ✓

**2. Scansione placeholder:** unico punto con valori da fornire = Task 9 (A7b), esplicitamente marcato "INPUT RICHIESTO" perché un CF reale non può essere inventato (vincolo anti-allucinazione di CLAUDE.md). Tre task richiedono una lettura mirata di uno schema/file prima di scrivere il test (certificati_medici in Task 4; helper di `dashboard.test.ts` in Task 6; tipi `Assegna*Input` in Task 3): sono dettagli d'esecuzione, non lacune di design, e l'istruzione di lettura è esplicita.

**3. Coerenza tipi/firme:** stati e union allineati a `src/types/shared.ts` (cliente `'attivo'|'anonimizzato'`, tipi `'attivo'|'non_valido'`); `WidgetIndicatori` aggiornato in **entrambe** le copie (shared.ts + dashboard-repository.ts); codici errore nuovi coerenti (`NUMERO_TESSERA_DUPLICATO`, `CLIENTE_ANONIMIZZATO`, `RICEVUTA_SENZA_RIGHE`, `RIFERIMENTO_NON_VALIDO`); pattern handler `VALIDATION_ERROR:` identico a `clienti:create`.

**Note di rischio / decisioni:**
- A9 indirizzo obbligatorio NON incluso (accoppiato a B6, WP4): qui solo righe-vuote + appartenenza, che sono correttezza dati pura.
- A11 risolto con `date('now')` (UTC, niente churn IPC/renderer); la differenza UTC-vs-`:oggi`-locale della dashboard resta minima e accettabile (monoutente IT) — annotare in OPEN-QUESTIONS se si vuole uniformare passando `oggi`.
- A13 tile non cliccabili (drill-down = B9/WP4).
- I codici errore backend non hanno messaggi i18n dedicati nel renderer (guardie difensive); mapping UI = WP4.
