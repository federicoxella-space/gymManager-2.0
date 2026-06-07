# WP1 — Chiusura correttezza P0 + nuovi rilievi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettere in sicurezza i fix P0 già applicati chiudendo i nuovi rilievi N1–N2, colmando i buchi di test N3 e correggendo il filtro "scaduta" (A15a), più registrare le decisioni residue (A15b/A15c).

**Architecture:** Modifiche puntuali al layer dati (`memberships-repository.ts`, `clients-repository.ts`) con test di integrazione Vitest su DB SQLite in-memory (stesso pattern di `receipts-invariants.test.ts` / `memberships-invariants.test.ts`: `vi.mock` su `database.ts`, `runMigrations` su `:memory:`). Nessuna migrazione di schema, nessun cambiamento di UI/IPC.

**Tech Stack:** TypeScript (strict), better-sqlite3-multiple-ciphers, Vitest. La Definition of Done del progetto è `npm run verify` verde (typecheck + lint + test + build).

**Riferimenti:** `ANALYSYS.md` (sezione "Verifica dei fix applicati", voci N1, N2, N3, A15) · invarianti di dominio 1 e 6 in `CLAUDE.md` · skill `migrazioni-db` (non necessaria qui: nessuna migrazione).

**Convenzioni date (importante):** il dominio confronta date come stringhe `YYYY-MM-DD`. "Oggi" lato repository è `new Date().toISOString().slice(0, 10)` (UTC), coerente con `date('now')` di SQLite usato in `aggiornaStatoIscrizioni/Abbonamenti`. Nei test, per evitare dipendenza dal fuso, usare date di scadenza chiaramente nel passato (`'2000-01-01'`) o nel futuro (`'2999-12-31'`).

---

## File Structure

- `src/main/db/memberships-repository.ts` — Task 1 (`updateIscrizioneDate`), Task 2 (`updateAbbonamentoDate`). Responsabilità: persistenza iscrizioni/abbonamenti cliente.
- `src/main/db/clients-repository.ts` — Task 6 (`listClienti`, ramo filtro `stato_iscrizione === 'scaduta'`).
- `tests/unit/memberships-invariants.test.ts` — Task 1, 2, 3, 4 (aggiunte in coda; import estesi). Responsabilità: invarianti F2 e transizioni di stato.
- `tests/unit/receipts-invariants.test.ts` — Task 5 (un test aggiunto al `describe` esistente sulle ricevute al tutore).
- `tests/unit/clients-repository.test.ts` — Task 6 (**nuovo file**). Responsabilità: filtri di `listClienti`.
- `OPEN-QUESTIONS.md` — Task 7 (due voci nuove).
- `docs/DECISIONS.md` — Task 7 (annotazione su `005_update_test`).

---

## Task 1: N1 + N2 — `updateIscrizioneDate` preserva lo stato invalidato e racchiude check+update in transazione immediata

**Files:**
- Modify: `src/main/db/memberships-repository.ts:84-123`
- Test: `tests/unit/memberships-invariants.test.ts` (import + nuovo `describe` in coda)

- [ ] **Step 1: Aggiungere gli import necessari ai test**

In `tests/unit/memberships-invariants.test.ts`, estendere il blocco import da `memberships-repository` (righe 32-37) aggiungendo le funzioni usate nei Task 1–4:

```typescript
import {
  assegnaIscrizione,
  getIscrizioneAttiva,
  invalidaIscrizione,
  assegnaAbbonamento,
  updateIscrizioneDate,
  updateAbbonamentoDate,
  invalidaAbbonamento,
  getAbbonamento,
  aggiornaStatoIscrizioni,
  aggiornaStatoAbbonamenti
} from '../../src/main/db/memberships-repository'
```

- [ ] **Step 2: Aggiungere in coda al file un helper SQL per inserire iscrizioni con date/stato espliciti**

In coda a `tests/unit/memberships-invariants.test.ts` (dopo l'ultimo `describe`), aggiungere l'helper e il blocco di test. L'helper inserisce direttamente via SQL per controllare date e stato senza passare dalla logica di `assegnaIscrizione`:

```typescript
// ---------------------------------------------------------------------------
// WP1 — Modifica date iscrizione (N1/N2/A3)
// ---------------------------------------------------------------------------

/** Inserisce un'iscrizione con date e stato espliciti, ritorna l'id. */
function inserisciIscrizione(
  db: Database.Database,
  clienteId: number,
  tipoIscId: number,
  dataInizio: string,
  dataScadenza: string,
  stato: 'attiva' | 'scaduta' | 'invalidata'
): number {
  const info = db
    .prepare(
      `INSERT INTO iscrizioni_cliente
        (cliente_id, tipo_iscrizione_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, ?, ?, 30, 'da_incassare', ?)`
    )
    .run(clienteId, tipoIscId, dataInizio, dataScadenza, stato)
  return info.lastInsertRowid as number
}

describe('updateIscrizioneDate (WP1: N1/N2/A3)', () => {
  it('ricalcola lo stato a "scaduta" se la nuova scadenza è nel passato', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoIscrizione(db)
    const id = inserisciIscrizione(db, clienteId, tipoId, '2999-01-01', '2999-12-31', 'attiva')

    const updated = updateIscrizioneDate(id, '2000-01-01', '2000-12-31')

    expect(updated.stato).toBe('scaduta')
  })

  it('ricalcola lo stato a "attiva" se la nuova scadenza è nel futuro', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoIscrizione(db)
    const id = inserisciIscrizione(db, clienteId, tipoId, '2000-01-01', '2000-12-31', 'scaduta')

    const updated = updateIscrizioneDate(id, '2999-01-01', '2999-12-31')

    expect(updated.stato).toBe('attiva')
  })

  it('N1: NON riporta in vita un\'iscrizione invalidata modificandone le date', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoIscrizione(db)
    const id = inserisciIscrizione(db, clienteId, tipoId, '2000-01-01', '2000-12-31', 'invalidata')

    const updated = updateIscrizioneDate(id, '2999-01-01', '2999-12-31')

    expect(updated.stato).toBe('invalidata')
  })

  it('invariante 1: rifiuta se la modifica produrrebbe una seconda iscrizione attiva', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoIscrizione(db)
    // Una già attiva
    inserisciIscrizione(db, clienteId, tipoId, '2999-01-01', '2999-12-31', 'attiva')
    // Una scaduta da riportare in futuro → diventerebbe la seconda attiva
    const scaduta = inserisciIscrizione(db, clienteId, tipoId, '2000-01-01', '2000-12-31', 'scaduta')

    expect(() => updateIscrizioneDate(scaduta, '2998-01-01', '2998-12-31')).toThrow(
      'ISCRIZIONE_GIA_ATTIVA'
    )
  })
})
```

- [ ] **Step 3: Eseguire i nuovi test per vederli fallire**

Run: `npx vitest run tests/unit/memberships-invariants.test.ts -t "updateIscrizioneDate"`
Expected: FAIL — il test "N1" fallisce (`expected 'attiva' to be 'invalidata'`) perché il codice attuale (`memberships-repository.ts:92`) ricalcola lo stato ignorando quello corrente. Gli altri tre potrebbero già passare.

- [ ] **Step 4: Applicare il fix N1+N2 a `updateIscrizioneDate`**

Sostituire integralmente il corpo della funzione `updateIscrizioneDate` (`src/main/db/memberships-repository.ts:84-123`) con:

```typescript
export function updateIscrizioneDate(
  id: number,
  dataInizio: string,
  dataScadenza: string
): IscrizioneClienteRow {
  const db = getDatabase()

  const corrente = db
    .prepare('SELECT cliente_id, stato FROM iscrizioni_cliente WHERE id = ?')
    .get(id) as { cliente_id: number; stato: 'attiva' | 'scaduta' | 'invalidata' } | undefined
  if (!corrente) throw new Error(`Iscrizione con id ${id} non trovata`)

  const today = new Date().toISOString().slice(0, 10)
  // N1: un'iscrizione invalidata non viene riportata in vita dalla modifica delle date.
  const nuovoStato: 'attiva' | 'scaduta' | 'invalidata' =
    corrente.stato === 'invalidata'
      ? 'invalidata'
      : dataScadenza < today
        ? 'scaduta'
        : 'attiva'

  // N2: check invariante 1 + UPDATE nella stessa transazione immediata (write-lock subito).
  const esegui = db.transaction(() => {
    if (nuovoStato === 'attiva') {
      const altraAttiva = db
        .prepare(
          "SELECT id FROM iscrizioni_cliente WHERE cliente_id = ? AND stato = 'attiva' AND id != ?"
        )
        .get(corrente.cliente_id, id)
      if (altraAttiva) {
        throw new Error('ISCRIZIONE_GIA_ATTIVA')
      }
    }

    db.prepare(`
      UPDATE iscrizioni_cliente
      SET data_inizio = ?, data_scadenza = ?, stato = ?, data_modifica = datetime('now')
      WHERE id = ?
    `).run(dataInizio, dataScadenza, nuovoStato, id)
  })
  esegui.immediate()

  const updated = db
    .prepare('SELECT * FROM iscrizioni_cliente WHERE id = ?')
    .get(id) as IscrizioneClienteRow | undefined

  if (!updated) throw new Error(`Iscrizione con id ${id} non trovata dopo UPDATE`)
  return updated
}
```

- [ ] **Step 5: Eseguire i test per vederli passare**

Run: `npx vitest run tests/unit/memberships-invariants.test.ts -t "updateIscrizioneDate"`
Expected: PASS (4 test).

- [ ] **Step 6: Commit**

```bash
git add src/main/db/memberships-repository.ts tests/unit/memberships-invariants.test.ts
git commit -m "fix(memberships): updateIscrizioneDate preserva stato invalidato e usa transazione immediata (N1/N2)"
```

---

## Task 2: N1 — `updateAbbonamentoDate` preserva lo stato invalidato

**Files:**
- Modify: `src/main/db/memberships-repository.ts:234-256`
- Test: `tests/unit/memberships-invariants.test.ts` (nuovo `describe` in coda)

- [ ] **Step 1: Scrivere i test in coda al file**

Aggiungere in coda a `tests/unit/memberships-invariants.test.ts`:

```typescript
// ---------------------------------------------------------------------------
// WP1 — Modifica date abbonamento (N1/A3)
// ---------------------------------------------------------------------------

/** Inserisce un abbonamento con date e stato espliciti, ritorna l'id. */
function inserisciAbbonamento(
  db: Database.Database,
  clienteId: number,
  tipoAbbId: number,
  dataInizio: string,
  dataScadenza: string,
  stato: 'attivo' | 'scaduto' | 'invalidato'
): number {
  const info = db
    .prepare(
      `INSERT INTO abbonamenti_cliente
        (cliente_id, tipo_abbonamento_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, ?, ?, 40, 'da_incassare', ?)`
    )
    .run(clienteId, tipoAbbId, dataInizio, dataScadenza, stato)
  return info.lastInsertRowid as number
}

describe('updateAbbonamentoDate (WP1: N1/A3)', () => {
  it('ricalcola lo stato a "scaduto" se la nuova scadenza è nel passato', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoAbbonamento(db)
    const id = inserisciAbbonamento(db, clienteId, tipoId, '2999-01-01', '2999-12-31', 'attivo')

    const updated = updateAbbonamentoDate(id, '2000-01-01', '2000-12-31')

    expect(updated.stato).toBe('scaduto')
  })

  it('N1: NON riporta in vita un abbonamento invalidato modificandone le date', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoAbbonamento(db)
    const id = inserisciAbbonamento(db, clienteId, tipoId, '2000-01-01', '2000-12-31', 'invalidato')

    const updated = updateAbbonamentoDate(id, '2999-01-01', '2999-12-31')

    expect(updated.stato).toBe('invalidato')
  })
})
```

- [ ] **Step 2: Eseguire i test per vederli fallire**

Run: `npx vitest run tests/unit/memberships-invariants.test.ts -t "updateAbbonamentoDate"`
Expected: FAIL — il test "N1" fallisce (`expected 'attivo' to be 'invalidato'`).

- [ ] **Step 3: Applicare il fix N1 a `updateAbbonamentoDate`**

Sostituire il corpo della funzione `updateAbbonamentoDate` (`src/main/db/memberships-repository.ts:234-256`) con:

```typescript
export function updateAbbonamentoDate(
  id: number,
  dataInizio: string,
  dataScadenza: string
): AbbonamentoClienteRow {
  const db = getDatabase()

  const corrente = db
    .prepare('SELECT stato FROM abbonamenti_cliente WHERE id = ?')
    .get(id) as { stato: 'attivo' | 'scaduto' | 'invalidato' } | undefined
  if (!corrente) throw new Error(`Abbonamento con id ${id} non trovato`)

  const today = new Date().toISOString().slice(0, 10)
  // N1: un abbonamento invalidato non viene riportato in vita dalla modifica delle date.
  const nuovoStato: 'attivo' | 'scaduto' | 'invalidato' =
    corrente.stato === 'invalidato'
      ? 'invalidato'
      : dataScadenza < today
        ? 'scaduto'
        : 'attivo'

  db.prepare(`
    UPDATE abbonamenti_cliente
    SET data_inizio = ?, data_scadenza = ?, stato = ?, data_modifica = datetime('now')
    WHERE id = ?
  `).run(dataInizio, dataScadenza, nuovoStato, id)

  const updated = db
    .prepare('SELECT * FROM abbonamenti_cliente WHERE id = ?')
    .get(id) as AbbonamentoClienteRow | undefined

  if (!updated) throw new Error(`Abbonamento con id ${id} non trovato dopo UPDATE`)
  return updated
}
```

- [ ] **Step 4: Eseguire i test per vederli passare**

Run: `npx vitest run tests/unit/memberships-invariants.test.ts -t "updateAbbonamentoDate"`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/memberships-repository.ts tests/unit/memberships-invariants.test.ts
git commit -m "fix(memberships): updateAbbonamentoDate preserva stato invalidato (N1)"
```

---

## Task 3: N3 — Test di regressione per la transizione automatica degli stati (A2)

> Questi test coprono `aggiornaStatoIscrizioni`/`aggiornaStatoAbbonamenti`, già corretti dal fix A2 ma privi di test. Sono **guardie di regressione**: passano sul codice attuale e fallirebbero se qualcuno rimuovesse/alterasse la logica di transizione.

**Files:**
- Test: `tests/unit/memberships-invariants.test.ts` (nuovo `describe` in coda)

- [ ] **Step 1: Scrivere i test in coda al file**

Aggiungere in coda a `tests/unit/memberships-invariants.test.ts` (riusa `inserisciIscrizione`/`inserisciAbbonamento` dei Task 1–2):

```typescript
// ---------------------------------------------------------------------------
// WP1 — Transizione automatica stati scaduti (A2, guardia di regressione)
// ---------------------------------------------------------------------------

describe('aggiornaStatoIscrizioni / aggiornaStatoAbbonamenti (WP1: A2)', () => {
  it('porta a "scaduta" un\'iscrizione attiva con scadenza passata', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoIscrizione(db)
    const id = inserisciIscrizione(db, clienteId, tipoId, '2000-01-01', '2000-12-31', 'attiva')

    aggiornaStatoIscrizioni()

    const row = db
      .prepare('SELECT stato FROM iscrizioni_cliente WHERE id = ?')
      .get(id) as { stato: string }
    expect(row.stato).toBe('scaduta')
  })

  it('NON tocca un\'iscrizione attiva con scadenza futura', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoIscrizione(db)
    const id = inserisciIscrizione(db, clienteId, tipoId, '2999-01-01', '2999-12-31', 'attiva')

    aggiornaStatoIscrizioni()

    const row = db
      .prepare('SELECT stato FROM iscrizioni_cliente WHERE id = ?')
      .get(id) as { stato: string }
    expect(row.stato).toBe('attiva')
  })

  it('porta a "scaduto" un abbonamento attivo con scadenza passata', () => {
    const db = _testDb!
    const clienteId = creaCliente(db)
    const tipoId = creaTipoAbbonamento(db)
    const id = inserisciAbbonamento(db, clienteId, tipoId, '2000-01-01', '2000-12-31', 'attivo')

    aggiornaStatoAbbonamenti()

    const row = db
      .prepare('SELECT stato FROM abbonamenti_cliente WHERE id = ?')
      .get(id) as { stato: string }
    expect(row.stato).toBe('scaduto')
  })
})
```

- [ ] **Step 2: Eseguire i test**

Run: `npx vitest run tests/unit/memberships-invariants.test.ts -t "aggiornaStato"`
Expected: PASS (3 test) sul codice attuale — confermano che la transizione automatica funziona e la blindano contro regressioni.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/memberships-invariants.test.ts
git commit -m "test(memberships): copre la transizione automatica degli stati scaduti (A2)"
```

---

## Task 4: N3 — Test caso negativo intestazione ricevuta (A5: maggiorenne con dati tutore)

> Guardia di regressione per il fix A5: un cliente **maggiorenne** che ha comunque dati tutore valorizzati NON deve avere la ricevuta intestata al tutore.

**Files:**
- Test: `tests/unit/receipts-invariants.test.ts:482-498` (aggiungere un `it` dopo il test esistente sul minore, dentro lo stesso `describe`)

- [ ] **Step 1: Scrivere il test**

In `tests/unit/receipts-invariants.test.ts`, subito dopo il test esistente "per un minore con tutore, l'intestatario è il tutore" (chiude a riga 498), aggiungere nello stesso `describe`:

```typescript
  it('A5: per un MAGGIORENNE con dati tutore, l\'intestatario è il cliente (non il tutore)', () => {
    const db = _testDb!
    const clienteId = creaCliente(db, 'RSSMRA85T10H501Z', {
      data_nascita: '1985-01-01', // maggiorenne
      tutore_cf: 'BNCNNA10A01H501X',
      tutore_nome: 'Anna',
      tutore_cognome: 'Bianchi'
    })
    const r = creaRicevuta(buildInput(clienteId))

    expect(r.intestatario_cf).toBe('RSSMRA85T10H501Z')
    expect(r.intestatario_nome).toBe('Mario')
    expect(r.intestatario_cognome).toBe('Rossi')
    // Nessuna intestazione al tutore né CF assistito
    expect(r.tutore_cf).toBeNull()
    expect(r.assistito_cf).toBeNull()
  })
```

- [ ] **Step 2: Eseguire il test**

Run: `npx vitest run tests/unit/receipts-invariants.test.ts -t "MAGGIORENNE"`
Expected: PASS sul codice attuale — `receipts-repository.ts:81` richiede `isMinorenne(...)`, quindi per un adulto `haTutore` è `false`.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/receipts-invariants.test.ts
git commit -m "test(receipts): copre intestazione cliente per maggiorenne con dati tutore (A5)"
```

---

## Task 5: A15a — Il filtro "iscrizione scaduta" non deve includere clienti con sole iscrizioni invalidate

**Files:**
- Test: `tests/unit/clients-repository.test.ts` (**nuovo file**)
- Modify: `src/main/db/clients-repository.ts:129-133`

- [ ] **Step 1: Creare il nuovo file di test**

Creare `tests/unit/clients-repository.test.ts` con il consueto pattern (mock di `database.ts`, DB in-memory):

```typescript
/**
 * Test di integrazione per i filtri di listClienti (clients-repository).
 * DB SQLite in-memory + runMigrations, getDatabase() mockato.
 */

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
import { listClienti } from '../../src/main/db/clients-repository'

function creaCliente(db: Database.Database, cf: string): number {
  const info = db
    .prepare(`INSERT INTO clienti (nome, cognome, codice_fiscale) VALUES ('Mario', 'Rossi', ?)`)
    .run(cf)
  return info.lastInsertRowid as number
}

function creaTipoIscrizione(db: Database.Database): number {
  const info = db
    .prepare(`INSERT INTO tipi_iscrizione (nome, durata_mesi, prezzo_default) VALUES ('Annuale', 12, 30)`)
    .run()
  return info.lastInsertRowid as number
}

function inserisciIscrizione(
  db: Database.Database,
  clienteId: number,
  tipoId: number,
  stato: 'attiva' | 'scaduta' | 'invalidata'
): void {
  db.prepare(
    `INSERT INTO iscrizioni_cliente
      (cliente_id, tipo_iscrizione_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
     VALUES (?, ?, '2000-01-01', '2000-12-31', 30, 'da_incassare', ?)`
  ).run(clienteId, tipoId, stato)
}

beforeEach(() => {
  _testDb = new Database(':memory:')
  _testDb.pragma('foreign_keys = ON')
  runMigrations(_testDb)
})

afterEach(() => {
  if (_testDb && _testDb.open) _testDb.close()
  _testDb = null
})

describe('listClienti — filtro stato_iscrizione="scaduta" (WP1: A15a)', () => {
  it('include un cliente con un\'iscrizione scaduta', () => {
    const db = _testDb!
    const tipoId = creaTipoIscrizione(db)
    const c = creaCliente(db, 'RSSMRA85T10H501Z')
    inserisciIscrizione(db, c, tipoId, 'scaduta')

    const result = listClienti({ stato_iscrizione: 'scaduta' })

    expect(result.map((r) => r.id)).toContain(c)
  })

  it('A15a: NON include un cliente con sole iscrizioni invalidate', () => {
    const db = _testDb!
    const tipoId = creaTipoIscrizione(db)
    const c = creaCliente(db, 'BNCNNA10A01H501X')
    inserisciIscrizione(db, c, tipoId, 'invalidata')

    const result = listClienti({ stato_iscrizione: 'scaduta' })

    expect(result.map((r) => r.id)).not.toContain(c)
  })

  it('NON include un cliente con iscrizione attiva', () => {
    const db = _testDb!
    const tipoId = creaTipoIscrizione(db)
    const c = creaCliente(db, 'VRDLGU90A01H501A')
    inserisciIscrizione(db, c, tipoId, 'attiva')

    const result = listClienti({ stato_iscrizione: 'scaduta' })

    expect(result.map((r) => r.id)).not.toContain(c)
  })
})
```

- [ ] **Step 2: Eseguire i test per vederli fallire**

Run: `npx vitest run tests/unit/clients-repository.test.ts`
Expected: FAIL — il test "A15a" fallisce (il cliente con sola invalidata viene incluso) perché la query attuale (`clients-repository.ts:130-133`) usa `EXISTS(qualsiasi) AND NOT EXISTS(attiva)`.

- [ ] **Step 3: Correggere il ramo del filtro "scaduta"**

In `src/main/db/clients-repository.ts:129-133`, sostituire:

```typescript
  } else if (filters?.stato_iscrizione === 'scaduta') {
    extraWhere.push(
      `EXISTS (SELECT 1 FROM iscrizioni_cliente WHERE cliente_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM iscrizioni_cliente WHERE cliente_id = c.id AND stato = 'attiva')`
    )
  } else if (filters?.stato_iscrizione === 'assente') {
```

con (richiede esplicitamente un'iscrizione `scaduta`, mantenendo l'esclusione di chi ha già rinnovato con una attiva):

```typescript
  } else if (filters?.stato_iscrizione === 'scaduta') {
    extraWhere.push(
      `EXISTS (SELECT 1 FROM iscrizioni_cliente WHERE cliente_id = c.id AND stato = 'scaduta')
       AND NOT EXISTS (SELECT 1 FROM iscrizioni_cliente WHERE cliente_id = c.id AND stato = 'attiva')`
    )
  } else if (filters?.stato_iscrizione === 'assente') {
```

- [ ] **Step 4: Eseguire i test per vederli passare**

Run: `npx vitest run tests/unit/clients-repository.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/clients-repository.ts tests/unit/clients-repository.test.ts
git commit -m "fix(clients): il filtro iscrizione scaduta esclude clienti con sole iscrizioni invalidate (A15a)"
```

---

## Task 6: A15b + A15c — Registrazione decisioni (ricerca ricevute per numero, migrazione 005_update_test)

> Voci di **decisione/documentazione**, non bug di correttezza. Nessun cambiamento di comportamento del codice (modificarli sarebbe rischioso: `005` è già stato applicato ai DB rilasciati in 0.1.x; la ricerca lato `ReceiptsPage` è già vincolata all'anno selezionato lato client).

**Files:**
- Modify: `OPEN-QUESTIONS.md` (due voci nuove in coda)
- Modify: `docs/DECISIONS.md` (una nota su `005_update_test`)
- Modify: `src/main/db/receipts-repository.ts:242-254` (solo un commento esplicativo)

- [ ] **Step 1: Annotare le due decisioni in `OPEN-QUESTIONS.md`**

Aggiungere in coda a `OPEN-QUESTIONS.md`:

```markdown
- **[Aperta]** A15b — Ricerca ricevute per numero senza vincolo d'anno in `listRicevute` (`src/main/db/receipts-repository.ts:242-254`): cercando "1" via parametro `search` numerico si troverebbe la ricevuta n.1 di ogni anno. Assunzione adottata: in pratica la pagina Ricevute (`ReceiptsPage.tsx`) passa **sempre** un `filtroAnno` e applica un ulteriore filtro testuale client-side su `AAAA-N`, quindi il caso è latente. Si lascia il comportamento backend invariato (documentato a codice). Impatta: ricerca ricevute (UX). Da chiudere: se in futuro si esporrà una ricerca cross-anno, combinare numero+anno nella query.
- **[Da verificare]** A15c — Migrazione `005_update_test` (`src/main/db/migrations/005_update_test.ts`) in produzione: aggiunge la colonna `note_interne` a `clienti`, nata come verifica del percorso di aggiornamento F6. È già stata applicata ai DB rilasciati (0.1.x), quindi **non va rimossa** dall'array (creerebbe divergenza tra DB esistenti e nuove installazioni). Decisione da confermare: promuovere `note_interne` a campo reale (note interne sul cliente, da esporre in UI) oppure lasciarla come colonna nullable inerte. Vedi nota in `docs/DECISIONS.md`.
```

- [ ] **Step 2: Annotare la decisione su `005_update_test` in `docs/DECISIONS.md`**

Aggiungere in coda a `docs/DECISIONS.md` una nuova voce, proseguendo la numerazione esistente (l'ultima è D13, quindi **D14**), nello stesso stile a elenco puntato del file:

```markdown
- **D14 — `005_update_test` resta nell'array di produzione.**
La migrazione `005_update_test` (colonna `note_interne` su `clienti`) è già stata applicata ai DB
rilasciati nelle versioni 0.1.x. Rimuoverla dall'array romperebbe la coerenza tra DB esistenti
(che hanno già la colonna e la versione 5 in `schema_migrations`) e nuove installazioni. Decisione:
mantenerla. Resta aperta in `OPEN-QUESTIONS.md` (A15c) la scelta se valorizzare `note_interne` come
feature "note interne cliente" o lasciarla colonna inerte. Il campo è nullable e non usato: nessun
impatto funzionale attuale.
```

- [ ] **Step 3: Aggiungere il commento esplicativo nel codice della ricerca**

In `src/main/db/receipts-repository.ts`, subito sopra il blocco `if (filters?.search != null ...)` (riga 242), aggiungere:

```typescript
  // Nota (A15b, vedi OPEN-QUESTIONS): la ricerca per numero non vincola l'anno.
  // In pratica la UI passa sempre filters.anno (ANDato sotto), quindi il caso cross-anno è latente.
```

- [ ] **Step 4: Commit**

```bash
git add OPEN-QUESTIONS.md docs/DECISIONS.md src/main/db/receipts-repository.ts
git commit -m "docs(wp1): registra decisioni su ricerca ricevute (A15b) e migrazione 005_update_test (A15c)"
```

---

## Task 7: Verifica finale del work-package

**Files:** nessuno (solo verifica).

- [ ] **Step 1: Eseguire la suite di verifica completa (Definition of Done)**

Run: `npm run verify`
Expected: typecheck OK · lint 0 warning · tutti i test passati (i precedenti 272/273 + i nuovi: 4 in Task 1, 2 in Task 2, 3 in Task 3, 1 in Task 4, 3 in Task 5 = 13 nuovi) · build OK.

- [ ] **Step 2: Aggiornare lo stato delle voci in `ANALYSYS.md`**

Nella tabella "Stato delle voci dell'analisi" di `ANALYSYS.md`, marcare N1, N2, A15a come ✅ RISOLTO e N3 come ✅ RISOLTO (copertura test aggiunta); aggiornare la riga A3 rimuovendo la riserva "→ N1" (ora chiusa). Aggiungere una riga di chiusura WP1 con la data.

- [ ] **Step 3: Commit**

```bash
git add ANALYSYS.md
git commit -m "docs: aggiorna stato analisi dopo chiusura WP1 (N1/N2/N3/A15a)"
```

---

## Self-Review (eseguita)

**1. Copertura spec (WP1 = N1, N2, N3, A15):**
- N1 → Task 1 (iscrizioni) + Task 2 (abbonamenti). ✓
- N2 → Task 1 (transazione `immediate` attorno a check+UPDATE in `updateIscrizioneDate`). ✓
- N3 → Task 3 (A2: transizione stati) + Task 4 (A5 caso negativo) + i test di Task 1/2 (A3 ricalcolo date + invariante 1). ✓
- A15a (filtro scaduta) → Task 5. ✓
- A15b/A15c (decisioni) → Task 6. ✓

**2. Scansione placeholder:** nessun "TODO/TBD/handle edge cases"; ogni step di codice riporta il codice reale e ogni step di test il comando Vitest con l'esito atteso. ✓

**3. Coerenza dei tipi:** gli stati usati combaciano con `src/types/shared.ts:205,220` (iscrizioni `'attiva'|'scaduta'|'invalidata'`; abbonamenti `'attivo'|'scaduto'|'invalidato'`); le firme `updateIscrizioneDate(id, dataInizio, dataScadenza)` e `updateAbbonamentoDate(...)` combaciano con `api.d.ts:456,462`; gli helper di test (`creaCliente`, `creaTipoIscrizione`, `creaTipoAbbonamento`) esistono già nei rispettivi file. ✓

**Nota di rischio:** i test dei Task 3 e 4 passano sul codice attuale (sono guardie di regressione per fix già applicati, non red→green). È intenzionale: N3 chiede di colmare la copertura mancante sui fix P0. I Task 1, 2, 5 sono invece red→green genuini.
