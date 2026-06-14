# B7 — Tutore come cliente collegato (FK) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development per implementare task-by-task. Gli step usano checkbox (`- [ ]`).

**Goal:** Trasformare il tutore di un minore da campi free-text denormalizzati a un **riferimento (FK) a un Cliente registrato** (`tutore_id`), con indirizzo della ricevuta preso dal cliente-tutore e blocco emissione per minori senza tutore.

**Architecture:** FK in scrittura (`clienti.tutore_id`), campi `tutore_*` **derivati via JOIN** in lettura (read-model). Clean slate: migrazione `007` rimuove le 8 colonne `tutore_*` e aggiunge `tutore_id`. `creaRicevuta` risolve il tutore dalla FK e ne fa snapshot. Spec di riferimento: `docs/superpowers/specs/2026-06-14-b7-tutore-cliente-collegato-design.md`.

**Tech Stack:** Electron + React + TypeScript (strict) + better-sqlite3-multiple-ciphers (SQLite 3.50.x, `DROP COLUMN` supportato) + i18next. Test: Vitest (node-only).

**Verifica (DoD «verde»):** `npm run verify` (typecheck + `eslint --max-warnings 0` + Vitest + build) verde dopo ogni task. È una modifica con backend+migrazione → **test Vitest inclusi**. Stringhe UI nuove sempre in i18n (IT/EN allineate). Trailer commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File coinvolti (mappa)

| File | Responsabilità | Task |
|---|---|---|
| `src/main/db/migrations/007_tutore_fk.ts` (Create) · `migrations.ts` | schema: +`tutore_id`, −8 colonne `tutore_*` | T1 |
| `tests/unit/migrations.test.ts` (o nuovo) | verifica migrazione 007 | T1 |
| `src/types/shared.ts` · `src/renderer/src/types/api.d.ts` | `ClienteRow.tutore_id` + `tutore_*` derivati; `CreateClienteInput.tutore_id` | T2 |
| `src/main/db/clients-repository.ts` | create/update/get/list/anonimizza con `tutore_id` + JOIN + validazioni | T3 |
| `tests/unit/clients-repository.test.ts` | test repository tutore | T3 |
| `src/main/db/receipts-repository.ts` (`creaRicevuta`) | risolve tutore via FK, snapshot, blocco `TUTORE_RICHIESTO` | T4 |
| `tests/unit/receipts-invariants.test.ts` | refactor A4/A5 + nuovi casi | T4 |
| `src/renderer/src/components/clients/ClientForm.tsx` + i18n | sezione Tutore = ricerca/selezione cliente | T5 |
| `src/renderer/src/components/receipts/EmittiRicevutaForm.tsx` + `utils/dominio.ts` + i18n | blocco "collega un tutore" per minore senza tutore | T6 |
| `ANALYSYS.md` · `OPEN-QUESTIONS.md` | chiusura B7 | T7 |

**Nota IPC:** non servono nuove IPC. La ricerca tutore riusa `window.api.clienti.list({ search })` (già esistente). I dati del tutore selezionato/esistente arrivano dai campi `tutore_*` derivati su `ClienteRow` o dai risultati di `clienti.list`.

---

## Task 1: Migrazione 007 — schema `tutore_id`

**Files:**
- Create: `src/main/db/migrations/007_tutore_fk.ts`
- Modify: `src/main/db/migrations.ts`
- Test: `tests/unit/migrations.test.ts`

- [ ] **Step 1: scrivere la migrazione.** Creare `src/main/db/migrations/007_tutore_fk.ts`:

```ts
import type Database from 'better-sqlite3-multiple-ciphers'
import type { Migration } from '../migrations'

/**
 * B7: il tutore di un minore diventa un riferimento a un cliente registrato.
 * Clean slate: rimuove le colonne free-text tutore_* da clienti e aggiunge tutore_id (FK su clienti.id).
 * I minori esistenti perdono il collegamento (da ri-collegare a mano). Le ricevute già emesse (snapshot) non cambiano.
 */
const migration007: Migration = {
  version: 7,
  description: 'Tutore come cliente collegato: +tutore_id, rimuove colonne tutore_* free-text',

  up(db: Database.Database): void {
    db.exec(`ALTER TABLE clienti ADD COLUMN tutore_id INTEGER REFERENCES clienti(id)`)
    for (const col of [
      'tutore_nome', 'tutore_cognome', 'tutore_cf',
      'tutore_via', 'tutore_civico', 'tutore_citta', 'tutore_provincia', 'tutore_cap'
    ]) {
      db.exec(`ALTER TABLE clienti DROP COLUMN ${col}`)
    }
  },

  down(db: Database.Database): void {
    // Best-effort: ripristina le colonne free-text e rimuove tutore_id.
    for (const col of [
      'tutore_nome', 'tutore_cognome', 'tutore_cf',
      'tutore_via', 'tutore_civico', 'tutore_citta', 'tutore_provincia', 'tutore_cap'
    ]) {
      db.exec(`ALTER TABLE clienti ADD COLUMN ${col} TEXT`)
    }
    db.exec(`ALTER TABLE clienti DROP COLUMN tutore_id`)
  }
}

export default migration007
```

- [ ] **Step 2: registrare la migrazione** in `src/main/db/migrations.ts`: aggiungere l'import `import migration007 from './migrations/007_tutore_fk'` e includerlo in fondo all'array `migrations` (`… migration006, migration007]`).

- [ ] **Step 3: test della migrazione.** In `tests/unit/migrations.test.ts` (LEGGILO per riusare l'helper che apre un DB e lancia `runMigrations`) aggiungere:

```ts
it('migrazione 007: clienti ha tutore_id e non ha più le colonne tutore_* free-text', () => {
  const db = openTestDbConMigrazioni() // usa l'helper realmente presente nel file
  const cols = (db.prepare("PRAGMA table_info(clienti)").all() as { name: string }[]).map((c) => c.name)
  expect(cols).toContain('tutore_id')
  for (const c of ['tutore_nome','tutore_cognome','tutore_cf','tutore_via','tutore_civico','tutore_citta','tutore_provincia','tutore_cap']) {
    expect(cols).not.toContain(c)
  }
  db.close()
})
```

- [ ] **Step 4: `npm run verify`** → VERDE (nuovo test passa). Se l'helper di apertura DB ha un nome diverso, adattarlo a quello reale del file.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations/007_tutore_fk.ts src/main/db/migrations.ts tests/unit/migrations.test.ts
git commit -m "feat(b7): migrazione 007 — tutore_id FK, rimuove colonne tutore_* free-text"
```

---

## Task 2: Tipi — `ClienteRow` / `CreateClienteInput`

**Files:**
- Modify: `src/types/shared.ts`
- Modify: `src/renderer/src/types/api.d.ts`

**Contesto:** `ClienteRow` (shared.ts:53) ha oggi `tutore_nome/cognome/cf/via/civico/citta/provincia/cap` come campi stored (righe 70-77). `CreateClienteInput` (riga 93) li ha come input (righe 109-116). Le due copie (`shared.ts` e `api.d.ts`) devono restare in pari.

- [ ] **Step 1: `ClienteRow` in `shared.ts`** — sostituire le 8 righe `tutore_nome … tutore_cap` con:

```ts
  /** FK al cliente-tutore (per i minori). */
  tutore_id: number | null
  /** Campi tutore DERIVATI via JOIN dal cliente-tutore (read-only, null se nessun tutore). */
  tutore_nome: string | null
  tutore_cognome: string | null
  tutore_cf: string | null
  tutore_via: string | null
  tutore_civico: string | null
  tutore_citta: string | null
  tutore_provincia: string | null
  tutore_cap: string | null
```

- [ ] **Step 2: `CreateClienteInput` in `shared.ts`** — sostituire le righe `tutore_nome?/cognome?/cf?/via?/…/cap?` (109-116) con:

```ts
  tutore_id?: number | null
```

- [ ] **Step 3: `UpdateClienteInput`** — LEGGI come è definito (probabilmente `Partial<CreateClienteInput>` o un'interfaccia dedicata). Se è dedicato, applica la stessa sostituzione (rimuovi i `tutore_*`, aggiungi `tutore_id?: number | null`). Se è `Partial<CreateClienteInput>`, eredita automaticamente.

- [ ] **Step 4: `api.d.ts`** — replicare ESATTAMENTE le stesse modifiche di `ClienteRow`/`CreateClienteInput`/`UpdateClienteInput` nel mirror `src/renderer/src/types/api.d.ts`. NON toccare i campi `tutore_nome/cognome/cf` della **RicevutaRow** (snapshot, restano).

- [ ] **Step 5: `npm run verify`** — Atteso: **typecheck FALLISCE** (i consumatori usano ancora i vecchi campi). È previsto: i task 3-6 li sistemano. Per chiudere questo task in isolamento, è accettabile che il verify sia rosso QUI; il commit avviene comunque perché i tipi sono la base. **In subagent-driven**, questo task e il Task 3 possono essere considerati un'unica unità se il reviewer preferisce verify verde: in tal caso esegui Task 2+Task 3 e committa insieme. Decisione operativa: **unire commit di Task 2 e Task 3** per mantenere `verify` verde.

> NOTA PER L'ESECUTORE: per rispettare la DoD (verify verde a ogni commit), implementa Task 2 e Task 3 nello stesso ciclo e fai **un solo commit** alla fine del Task 3. Lo Step 5 qui sopra non fa commit isolato.

---

## Task 3: Repository clienti — `tutore_id` + JOIN + validazioni

**Files:**
- Modify: `src/main/db/clients-repository.ts`
- Test: `tests/unit/clients-repository.test.ts`

**Contesto:** vedi il file letto. `getCliente` fa `SELECT * FROM clienti` (va trasformato in JOIN per esporre i `tutore_*` derivati). `createCliente` elenca le colonne `tutore_*` nell'INSERT. `updateCliente` usa SET dinamico da `Object.keys(data)`. `anonimizzaCliente` azzera le colonne `tutore_*` (non esisteranno più). `listClienti` fa `SELECT c.*` con vari JOIN.

- [ ] **Step 1: helper di validazione tutore.** In cima al modulo (dopo gli import) aggiungere:

```ts
function validaTutore(db: ReturnType<typeof getDatabase>, tutoreId: number | null | undefined, selfId?: number): void {
  if (tutoreId == null) return
  if (selfId !== undefined && tutoreId === selfId) throw new Error('TUTORE_SE_STESSO')
  const esiste = db.prepare('SELECT 1 FROM clienti WHERE id = ?').get(tutoreId)
  if (!esiste) throw new Error('TUTORE_NON_TROVATO')
}
```

- [ ] **Step 2: SELECT con JOIN condiviso.** Sostituire `getCliente` e `getClienteByCodiceFiscale` perché espongano i `tutore_*` derivati. Definire una costante con la SELECT base:

```ts
const SELECT_CLIENTE = `
  SELECT c.*,
    tut.nome AS tutore_nome, tut.cognome AS tutore_cognome, tut.codice_fiscale AS tutore_cf,
    tut.via AS tutore_via, tut.civico AS tutore_civico, tut.citta AS tutore_citta,
    tut.provincia AS tutore_provincia, tut.cap AS tutore_cap
  FROM clienti c
  LEFT JOIN clienti tut ON tut.id = c.tutore_id
`

export function getCliente(id: number): ClienteRow | null {
  const db = getDatabase()
  const row = db.prepare(`${SELECT_CLIENTE} WHERE c.id = ?`).get(id)
  return (row as ClienteRow) ?? null
}

export function getClienteByCodiceFiscale(cf: string): ClienteRow | null {
  const db = getDatabase()
  const row = db.prepare(`${SELECT_CLIENTE} WHERE c.codice_fiscale = ?`).get(cf)
  return (row as ClienteRow) ?? null
}
```

- [ ] **Step 3: `createCliente`** — nell'INSERT rimuovere le 8 colonne `tutore_*` e aggiungere `tutore_id`; nel `run({...})` rimuovere i `tutore_*` e aggiungere `tutore_id: data.tutore_id ?? null`. Prima dell'INSERT (dentro o prima della transazione), validare: `validaTutore(db, data.tutore_id)` (no selfId in creazione). INSERT aggiornato:

```ts
    const stmt = db.prepare(`
      INSERT INTO clienti (
        numero_tessera, nome, cognome, codice_fiscale,
        data_nascita, sesso, comune_nascita,
        via, civico, citta, provincia, cap,
        email, telefono, note, tutore_id
      ) VALUES (
        @numero_tessera, @nome, @cognome, @codice_fiscale,
        @data_nascita, @sesso, @comune_nascita,
        @via, @civico, @citta, @provincia, @cap,
        @email, @telefono, @note, @tutore_id
      )
    `)
    const info = stmt.run({
      numero_tessera: numeroTessera,
      nome: data.nome, cognome: data.cognome, codice_fiscale: data.codice_fiscale,
      data_nascita: data.data_nascita ?? null, sesso: data.sesso ?? null, comune_nascita: data.comune_nascita ?? null,
      via: data.via ?? null, civico: data.civico ?? null, citta: data.citta ?? null,
      provincia: data.provincia ?? null, cap: data.cap ?? null,
      email: data.email ?? null, telefono: data.telefono ?? null, note: data.note ?? null,
      tutore_id: data.tutore_id ?? null
    })
```

  Aggiungere `validaTutore(db, data.tutore_id)` prima di `esegui.immediate()` (o all'inizio della transazione).

- [ ] **Step 4: `updateCliente`** — prima di costruire l'UPDATE dinamico, se `data` contiene `tutore_id`, validare: `validaTutore(db, data.tutore_id as number | null, id)`. (La SET dinamica esistente gestirà `tutore_id` come qualsiasi altro campo.)

- [ ] **Step 5: `anonimizzaCliente`** — nell'UPDATE sostituire le 8 righe `tutore_* = NULL` con una sola riga `tutore_id = NULL,`.

- [ ] **Step 6: `listClienti`** — aggiungere al blocco FROM/JOIN il join al tutore e ai campi selezionati. Nella `SELECT c.*, …` aggiungere gli alias tutore, e dopo gli altri LEFT JOIN aggiungere `LEFT JOIN clienti tut ON tut.id = c.tutore_id`:

```sql
    SELECT c.*,
      cm.data_scadenza AS cert_scadenza,
      cm.tipo AS cert_tipo,
      ic.stato AS iscrizione_stato,
      ic.data_scadenza AS iscrizione_scadenza,
      COALESCE(ac.cnt, 0) AS abbonamenti_attivi_count,
      tut.nome AS tutore_nome, tut.cognome AS tutore_cognome, tut.codice_fiscale AS tutore_cf,
      tut.via AS tutore_via, tut.civico AS tutore_civico, tut.citta AS tutore_citta,
      tut.provincia AS tutore_provincia, tut.cap AS tutore_cap
    FROM clienti c
    LEFT JOIN ( … ) cm ON …
    LEFT JOIN ( … ) ic ON …
    LEFT JOIN ( … ) ac ON …
    LEFT JOIN clienti tut ON tut.id = c.tutore_id
    WHERE c.stato = ?
      …
```

- [ ] **Step 7: test repository.** In `tests/unit/clients-repository.test.ts` (LEGGILO per gli helper) aggiungere:

```ts
it('collega un tutore via tutore_id ed espone i campi tutore_* derivati', () => {
  const tutore = createCliente({ nome: 'Mario', cognome: 'Rossi', codice_fiscale: 'RSSMRA80A01H501U', via: 'Via Roma', civico: '1', citta: 'Roma', cap: '00100' })
  const minore = createCliente({ nome: 'Luca', cognome: 'Rossi', codice_fiscale: 'RSSLCU15A01H501A', data_nascita: '2015-01-01', tutore_id: tutore.id })
  const letto = getCliente(minore.id)!
  expect(letto.tutore_id).toBe(tutore.id)
  expect(letto.tutore_nome).toBe('Mario')
  expect(letto.tutore_cf).toBe('RSSMRA80A01H501U')
  expect(letto.tutore_via).toBe('Via Roma')
})

it('rifiuta un tutore inesistente', () => {
  expect(() => createCliente({ nome: 'X', cognome: 'Y', codice_fiscale: 'XXXYYY80A01H501U', tutore_id: 999999 })).toThrow('TUTORE_NON_TROVATO')
})

it('rifiuta il self-reference in update (TUTORE_SE_STESSO)', () => {
  const c = createCliente({ nome: 'A', cognome: 'B', codice_fiscale: 'AAABBB80A01H501U' })
  expect(() => updateCliente(c.id, { tutore_id: c.id })).toThrow('TUTORE_SE_STESSO')
})
```

  (Adatta i CF/nomi se collidono con altri test; importa le funzioni necessarie.)

- [ ] **Step 8: `npm run verify`** → VERDE (typecheck ora compila grazie ai Task 2+3; i nuovi test passano).

- [ ] **Step 9: Commit (unico per Task 2 + Task 3)**

```bash
git add src/types/shared.ts src/renderer/src/types/api.d.ts src/main/db/clients-repository.ts tests/unit/clients-repository.test.ts
git commit -m "feat(b7): tutore_id su ClienteRow/Input + repository con JOIN derivato e validazioni"
```

---

## Task 4: `creaRicevuta` — risolve tutore via FK + blocco minore senza tutore

**Files:**
- Modify: `src/main/db/receipts-repository.ts`
- Test: `tests/unit/receipts-invariants.test.ts`

**Contesto:** in `creaRicevuta` la query del cliente seleziona oggi le colonne `tutore_*` (righe ~60-73) e calcola `haTutore`/intestatario da quelle (righe ~113-129). Vanno sostituite con la risoluzione via `tutore_id`.

- [ ] **Step 1: query cliente.** Nella SELECT del cliente, sostituire le 8 colonne `tutore_*` con `tutore_id` (e mantenere `data_nascita`, `nome`, `cognome`, `codice_fiscale`, `via`, `civico`, `citta`, `provincia`, `cap`, `stato`). Aggiornare anche il tipo inline dell'oggetto `cliente` di conseguenza (`tutore_id: number | null` al posto dei `tutore_*`).

- [ ] **Step 2: risoluzione tutore + blocchi.** Sostituire il blocco intestatario (righe ~113-129) con:

```ts
  const minorenne = isMinorenne(cliente.data_nascita ?? null)

  // B7: per un minore l'emissione richiede un tutore collegato.
  if (minorenne && cliente.tutore_id == null) {
    throw new Error('TUTORE_RICHIESTO')
  }

  const haTutore = minorenne && cliente.tutore_id != null
  const tutore = haTutore
    ? (db.prepare(
        'SELECT nome, cognome, codice_fiscale, via, civico, citta, provincia, cap FROM clienti WHERE id = ?'
      ).get(cliente.tutore_id) as {
        nome: string; cognome: string; codice_fiscale: string
        via: string | null; civico: string | null; citta: string | null
        provincia: string | null; cap: string | null
      } | undefined)
    : undefined

  const intestatarioNome = haTutore ? (tutore?.nome ?? '') : cliente.nome
  const intestatarioCognome = haTutore ? (tutore?.cognome ?? '') : cliente.cognome
  const intestatarioCf = haTutore ? (tutore?.codice_fiscale ?? '') : cliente.codice_fiscale
  const intestatarioVia = haTutore ? (tutore?.via ?? null) : cliente.via
  const intestatarioCivico = haTutore ? (tutore?.civico ?? null) : cliente.civico
  const intestatarioCitta = haTutore ? (tutore?.citta ?? null) : cliente.citta
  const intestatarioProvincia = haTutore ? (tutore?.provincia ?? null) : cliente.provincia
  const intestatarioCap = haTutore ? (tutore?.cap ?? null) : cliente.cap

  const tutoreNome = haTutore ? (tutore?.nome ?? null) : null
  const tutoreCognome = haTutore ? (tutore?.cognome ?? null) : null
  const tutoreCf = haTutore ? (tutore?.codice_fiscale ?? null) : null
  const assistitoCf = haTutore ? cliente.codice_fiscale : null
```

  (Il resto di `creaRicevuta` — INSERT con questi valori, dicitura "Tutore di [assistito_cf]" — resta invariato.)

- [ ] **Step 3: refactor test A4/A5 + nuovi casi** in `tests/unit/receipts-invariants.test.ts`. LEGGI i test esistenti che creano un cliente minore con `tutore_nome/tutore_cf` in input: ora devono creare **due** clienti (tutore + minore con `tutore_id`). Aggiornare e aggiungere:

```ts
it('ricevuta a minore con tutore collegato: intestatario = tutore, assistito_cf = CF minore', () => {
  const tutore = createCliente({ nome: 'Anna', cognome: 'Bianchi', codice_fiscale: 'BNCNNA80A41H501Y', via: 'Via Po', civico: '2', citta: 'Roma', cap: '00100' })
  const minore = createCliente({ nome: 'Sara', cognome: 'Bianchi', codice_fiscale: 'BNCSRA15A41H501W', data_nascita: '2015-01-01', tutore_id: tutore.id, via: 'Via Po', civico: '2', citta: 'Roma', cap: '00100' })
  const ric = creaRicevuta({ clienteId: minore.id, dataEmissione: '2026-01-10', righe: [{ tipo: 'libera', descrizione: 'Quota', prezzo: 50 }], metodoPagamento: 'contanti', statoPagamento: 'pagato' })
  expect(ric.intestatario_cf).toBe('BNCNNA80A41H501Y') // tutore
  expect(ric.assistito_cf).toBe('BNCSRA15A41H501W')    // minore
})

it('ricevuta a minore SENZA tutore collegato: emissione bloccata (TUTORE_RICHIESTO)', () => {
  const minore = createCliente({ nome: 'Gino', cognome: 'Verdi', codice_fiscale: 'VRDGNI15A01H501B', data_nascita: '2015-01-01', via: 'Via X', civico: '1', citta: 'Roma', cap: '00100' })
  expect(() => creaRicevuta({ clienteId: minore.id, dataEmissione: '2026-01-10', righe: [{ tipo: 'libera', descrizione: 'Quota', prezzo: 50 }], metodoPagamento: 'contanti', statoPagamento: 'pagato' })).toThrow('TUTORE_RICHIESTO')
})

it('ricevuta a maggiorenne con tutore_id valorizzato: intestatario = cliente (haTutore falso)', () => {
  const t = createCliente({ nome: 'T', cognome: 'T', codice_fiscale: 'TTTTTT80A01H501U' })
  const adulto = createCliente({ nome: 'Paolo', cognome: 'Neri', codice_fiscale: 'NREPLA80A01H501Z', data_nascita: '1980-01-01', tutore_id: t.id, via: 'Via Y', civico: '3', citta: 'Roma', cap: '00100' })
  const ric = creaRicevuta({ clienteId: adulto.id, dataEmissione: '2026-01-10', righe: [{ tipo: 'libera', descrizione: 'Quota', prezzo: 50 }], metodoPagamento: 'contanti', statoPagamento: 'pagato' })
  expect(ric.intestatario_cf).toBe('NREPLA80A01H501Z')
  expect(ric.assistito_cf).toBeNull()
})
```

  (Adatta la forma esatta di `creaRicevuta(input)` e dei campi riga a quella reale del file/`RicevutaInput`; LEGGI i test esistenti per la firma corretta.)

- [ ] **Step 4: `npm run verify`** → VERDE (tutti i test, inclusi gli A4/A5 aggiornati, passano).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/receipts-repository.ts tests/unit/receipts-invariants.test.ts
git commit -m "feat(b7): creaRicevuta risolve il tutore via FK + blocco TUTORE_RICHIESTO per minori senza tutore"
```

---

## Task 5: ClientForm — sezione Tutore come ricerca/selezione cliente

**Files:**
- Modify: `src/renderer/src/components/clients/ClientForm.tsx`
- Modify: `src/renderer/src/i18n/locales/it.json`, `en.json`

**Contesto:** oggi la sezione Tutore (mostrata per i minorenni) ha tre campi testo `tutore_nome/cognome/cf` legati a `FormData`. Vanno sostituiti con un campo di ricerca cliente che imposta `tutore_id`. `FormData` ha attualmente `tutore_nome/cognome/cf` (righe ~29-31): rimuoverli e gestire `tutore_id` separatamente.

- [ ] **Step 1: i18n.** In `it.json` (sezione `clienti.form`) aggiungere: `tutore_cerca` ("Cerca il tutore tra i clienti"), `tutore_selezionato` ("Tutore: {{nome}} ({{cf}})"), `tutore_rimuovi` ("Rimuovi tutore"), `tutore_nessuno` ("Nessun tutore collegato"), `tutore_avviso_minorenne` ("Attenzione: il cliente selezionato risulta minorenne."). In `en.json` le traduzioni corrispondenti. Copie allineate.

- [ ] **Step 2: stato e tipi.** In `ClientForm`:
  - rimuovere `tutore_nome/tutore_cognome/tutore_cf` da `FormData` (type e `buildInitialData`).
  - aggiungere stato: `const [tutoreId, setTutoreId] = useState<number | null>(initialData?.tutore_id ?? null)` e `const [tutoreInfo, setTutoreInfo] = useState<{ nome: string; cognome: string; codice_fiscale: string } | null>(initialData?.tutore_id ? { nome: initialData.tutore_nome ?? '', cognome: initialData.tutore_cognome ?? '', codice_fiscale: initialData.tutore_cf ?? '' } : null)` (usa i campi `tutore_*` derivati presenti su `ClienteRow`).
  - stato ricerca: `const [tutoreQuery, setTutoreQuery] = useState('')` e `const [tutoreRisultati, setTutoreRisultati] = useState<ClienteRow[]>([])`.

- [ ] **Step 3: ricerca.** Al cambio di `tutoreQuery` (≥2 caratteri), chiamare `window.api.clienti.list({ search: query })`, escludere il cliente corrente in edit (`initialData?.id`) e i clienti anonimizzati, e popolare `tutoreRisultati`. Selezionando un risultato: `setTutoreId(c.id)`, `setTutoreInfo({nome,cognome,codice_fiscale})`, svuotare query/risultati. Se il selezionato è minorenne (`isMinorenne(c.data_nascita)`), mostrare l'avviso non bloccante `tutore_avviso_minorenne`. Azione "rimuovi" → `setTutoreId(null); setTutoreInfo(null)`.

- [ ] **Step 4: markup.** Sostituire i tre campi testo della sezione Tutore con: il campo di ricerca + lista risultati (riusa lo stile dell'autocomplete comune già presente nel form), il riquadro "Tutore selezionato" (nome + CF + bottone rimuovi) o "Nessun tutore collegato", e l'eventuale avviso minorenne.

- [ ] **Step 5: submit.** Nel payload `CreateClienteInput`/update, rimuovere `tutore_nome/cognome/cf` e aggiungere `tutore_id: tutoreId`.

- [ ] **Step 6: `npm run verify`** → VERDE.

- [ ] **Step 7: Checklist manuale:** per un minore, cerco un cliente, lo seleziono come tutore (compare nome+CF); se è minorenne vedo l'avviso; salvo → `tutore_id` persistito; in edit il tutore risulta già selezionato.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/clients/ClientForm.tsx src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(b7): sezione Tutore in ClientForm come ricerca/selezione cliente (tutore_id)"
```

---

## Task 6: EmittiRicevutaForm — blocco "collega un tutore" per minore senza tutore

**Files:**
- Modify: `src/renderer/src/components/receipts/EmittiRicevutaForm.tsx`
- Modify: `src/renderer/src/utils/dominio.ts`
- Modify: `src/renderer/src/i18n/locales/it.json`, `en.json`

**Contesto:** WP4 ha introdotto in `EmittiRicevutaForm` un blocco quando `indirizzoIntestatarioCompleto(cliente)` è falso (helper in `utils/dominio.ts`). Con B7, gli helper `calcolaIntestatario`/`indirizzoIntestatarioCompleto` leggono i `tutore_*` **derivati** (già presenti su `ClienteRow`) → funzionano senza modifiche sostanziali. Va aggiunto il blocco per il caso "minore senza tutore".

- [ ] **Step 1: helper.** In `utils/dominio.ts` aggiungere:

```ts
/** true se il cliente è minorenne ma non ha un tutore collegato (emissione bloccata, B7). */
export function minoreSenzaTutore(cliente: ClienteRow): boolean {
  return isMinorenne(cliente.data_nascita) && cliente.tutore_id == null
}
```

  Verificare che `calcolaIntestatario` e `indirizzoIntestatarioCompleto` usino `Boolean(cliente.tutore_cf)` per rilevare il tutore: con B7, `tutore_cf` è derivato dal JOIN e vale non-null solo se c'è `tutore_id`, quindi la logica resta corretta. (Se preferisci, sostituisci la condizione interna con `cliente.tutore_id != null` per chiarezza — equivalente.)

- [ ] **Step 2: i18n.** Aggiungere `ricevute.blocco_tutore_mancante` ("Per un minore la ricevuta è intestata al tutore. Collega un tutore al cliente prima di emettere.") in it/en.

- [ ] **Step 3: EmittiRicevutaForm.** LEGGI come è implementato il blocco indirizzo (variabile tipo `indirizzoMancante` e il banner che disabilita l'emissione). Aggiungere un blocco analogo: `const tutoreMancante = minoreSenzaTutore(cliente)`; mostrare il banner `ricevute.blocco_tutore_mancante` e disabilitare il pulsante di emissione quando `tutoreMancante` (in combinazione con il blocco indirizzo esistente). Il blocco tutore ha priorità logica (se manca il tutore, l'indirizzo del tutore non è nemmeno valutabile).

- [ ] **Step 4: `npm run verify`** → VERDE.

- [ ] **Step 5: Checklist manuale:** aprendo "Emetti ricevuta" per un minore senza tutore → banner "collega un tutore" e pulsante emissione disabilitato; collegato il tutore (con indirizzo completo) → emissione possibile e intestatario = tutore.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/receipts/EmittiRicevutaForm.tsx src/renderer/src/utils/dominio.ts src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(b7): blocco emissione ricevuta per minore senza tutore collegato"
```

---

## Task 7: Review olistica + chiusura documentale

- [ ] **Step 1:** dispatch reviewer di sola lettura sull'intero diff vs `main`: copertura della spec B7, correttezza migrazione/JOIN/risoluzione tutore, blocchi (`TUTORE_RICHIESTO`, self-reference), niente stringhe hardcoded, parità chiavi IT/EN, niente `any`.

- [ ] **Step 2: `ANALYSYS.md`** — marcare B7 come ✅ RISOLTO (WP/B7, 2026-06-14) con evidenza; aggiornare la riga "APERTO" (rimuovere B7); nota di chiusura nel paragrafo "Verifica «verde»".

- [ ] **Step 3: `OPEN-QUESTIONS.md`** — aggiornare/chiudere la voce B6/B7 (l'indirizzo intestatario per il minore ora viene dal cliente-tutore; emissione bloccata se manca il tutore).

- [ ] **Step 4: `npm run verify` finale** → VERDE (conteggio test aumentato per i nuovi casi).

- [ ] **Step 5: commit docs**

```bash
git add ANALYSYS.md OPEN-QUESTIONS.md
git commit -m "docs: chiusura B7 (tutore come cliente collegato via FK)"
```

- [ ] **Step 6:** usare la skill **superpowers:finishing-a-development-branch** per chiudere il branch `b7-tutore-cliente`.

---

## Self-Review (eseguita in fase di stesura)

**Copertura spec:**
- §1 Migrazione → T1 · §2 Repository → T3 · §3 Tipi → T2 · §4 UI ClientForm → T5 · §5 Logica ricevuta (creaRicevuta + helper + blocco minore-senza-tutore) → T4 (backend) + T6 (renderer) · §6 Edge case → coperti in T4 (maggiorenne con tutore_id; minore senza tutore) e documentati in T7 (anonimizzato) · §7 Test → T1/T3/T4. **Tutti coperti.**

**Placeholder scan:** i task con "LEGGI il file" (T1 helper test, T3 test, T4 test/firma, T5 markup, T6 blocco) forniscono codice concreto + schema esatto; gli adattamenti richiesti sono nomi-helper/firme reali, non requisiti vaghi. Codice completo per migrazione, tipi, repository, creaRicevuta.

**Coerenza tipi/nomi:** `tutore_id: number | null` coerente in ClienteRow, CreateClienteInput, repository (`data.tutore_id`), creaRicevuta (`cliente.tutore_id`), ClientForm (`tutoreId`). Errori: `TUTORE_SE_STESSO`, `TUTORE_NON_TROVATO`, `TUTORE_RICHIESTO` usati coerentemente tra repository/creaRicevuta e test. Campi derivati `tutore_*` esposti identici da `getCliente`/`listClienti` e letti dagli helper renderer.

**Note operative:** Task 2 e Task 3 si committano insieme (un solo commit) per mantenere `verify` verde. Nessuna nuova IPC (riusa `clienti.list({search})`). I campi `tutore_*` della RicevutaRow (snapshot) NON vanno toccati.
