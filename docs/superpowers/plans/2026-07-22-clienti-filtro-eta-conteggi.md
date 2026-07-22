# Filtro età e conteggi pagina Clienti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere alla pagina Clienti un filtro età (minorenni/maggiorenni), il numero totale di clienti e il rapporto compatto filtrati/totale (es. 250/1333).

**Architecture:** Il filtro età è una clausola SQL in `listClienti` calcolata da `data_nascita`; il totale è una nuova query `contaClientiAttivi` esposta via IPC `clienti:count`. Il numeratore del rapporto è la lunghezza dell'array già caricato in `ClientsPage` (lista non paginata).

**Tech Stack:** Electron + React + TypeScript + Tailwind, better-sqlite3-multiple-ciphers, i18next, Vitest.

## Global Constraints

- KISS; niente astrazioni premature.
- TypeScript strict; niente `any` senza motivazione.
- Stringhe UI **sempre** i18n (namespace `clienti.*`); mai hardcoded.
- Solo lettura/UI: nessun impatto su dominio scritturale, ricevute, backup, migrazioni.
- Età coerente con `isMinorenne`: minorenne = nato < 18 anni fa; al 18° compleanno esatto → maggiorenne. Clienti con `data_nascita` NULL esclusi da minorenni e maggiorenni.
- Denominatore del rapporto = totale clienti `stato='attivo'`, indipendente dai filtri.
- Formato compatto `filtrati/totale`; quando `filtrati === totale` mostrare solo il totale.
- `api.d.ts` NON si modifica a mano (importa `ElectronAPI` da `shared.ts`).
- Test in `tests/unit/**/*.test.ts`, DB in-memory con `runMigrations` e `getDatabase` mockato (pattern di `tests/unit/clients-repository.test.ts`).
- `npm run verify` (typecheck + lint + test + build:electron) deve restare verde.

---

### Task 1: Backend — filtro età, conteggio totale, IPC e tipi + test

**Files:**
- Modify: `src/types/shared.ts` (`ClientiFilters`, `ElectronAPI.clienti`)
- Modify: `src/main/db/clients-repository.ts` (`listClienti`, nuova `contaClientiAttivi`)
- Modify: `src/main/ipc/handlers.ts` (handler `clienti:count`)
- Modify: `src/preload/index.ts` (`clienti.count`)
- Test: `tests/unit/clienti-eta-conteggio.test.ts`

**Interfaces:**
- Produces:
  - `ClientiFilters.eta?: 'minorenne' | 'maggiorenne'`
  - `contaClientiAttivi(): number`
  - IPC `clienti:count` → `number`; preload `window.api.clienti.count(): Promise<number>`
  - `ElectronAPI.clienti.count: () => Promise<number>`

- [ ] **Step 1: Scrivere i test (falliscono)**

Create `tests/unit/clienti-eta-conteggio.test.ts`:

```ts
/**
 * Test per il filtro età di listClienti e per contaClientiAttivi.
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
import { listClienti, contaClientiAttivi } from '../../src/main/db/clients-repository'

/** Inserisce un cliente con data di nascita e stato opzionali. */
function inserisci(
  db: Database.Database,
  cf: string,
  dataNascita: string | null,
  stato: 'attivo' | 'anonimizzato' = 'attivo'
): void {
  db.prepare(
    `INSERT INTO clienti (nome, cognome, codice_fiscale, data_nascita, stato)
     VALUES ('Nome', 'Cognome', ?, ?, ?)`
  ).run(cf, dataNascita, stato)
}

/** Restituisce una data ISO di `anni` fa rispetto a oggi. */
function isoAnniFa(anni: number): string {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - anni)
  return d.toISOString().slice(0, 10)
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

describe('listClienti — filtro eta', () => {
  beforeEach(() => {
    const db = _testDb!
    inserisci(db, 'MINORE', isoAnniFa(10)) // 10 anni → minorenne
    inserisci(db, 'ADULTO', isoAnniFa(30)) // 30 anni → maggiorenne
    inserisci(db, 'SENZADATA', null)       // data mancante → escluso da entrambi
  })

  it("eta='minorenne' restituisce solo i minorenni con data nota", () => {
    const rows = listClienti({ eta: 'minorenne' })
    const cf = rows.map((r) => r.codice_fiscale)
    expect(cf).toContain('MINORE')
    expect(cf).not.toContain('ADULTO')
    expect(cf).not.toContain('SENZADATA')
  })

  it("eta='maggiorenne' restituisce solo i maggiorenni con data nota", () => {
    const rows = listClienti({ eta: 'maggiorenne' })
    const cf = rows.map((r) => r.codice_fiscale)
    expect(cf).toContain('ADULTO')
    expect(cf).not.toContain('MINORE')
    expect(cf).not.toContain('SENZADATA')
  })

  it('senza filtro eta include tutti (anche senza data)', () => {
    const rows = listClienti()
    expect(rows).toHaveLength(3)
  })
})

describe('contaClientiAttivi', () => {
  it('conta solo i clienti con stato attivo', () => {
    const db = _testDb!
    inserisci(db, 'A1', isoAnniFa(20))
    inserisci(db, 'A2', isoAnniFa(25))
    inserisci(db, 'ANON', isoAnniFa(40), 'anonimizzato')
    expect(contaClientiAttivi()).toBe(2)
  })
})
```

- [ ] **Step 2: Eseguire i test per verificarne il fallimento**

Run: `npx vitest run tests/unit/clienti-eta-conteggio.test.ts`
Expected: FAIL (`contaClientiAttivi` non esportata; il filtro `eta` non è ancora nel tipo/query).

- [ ] **Step 3: Aggiungere il campo `eta` a `ClientiFilters` (shared.ts)**

In `src/types/shared.ts`, nell'interfaccia `ClientiFilters`, aggiungere il campo (dopo `tipo_abbonamento_id?`):

```ts
  /** Filtro per fascia d'età (minorenne/maggiorenne); i clienti senza data di nascita sono esclusi. */
  eta?: 'minorenne' | 'maggiorenne'
```

- [ ] **Step 4: Aggiungere `count` a `ElectronAPI.clienti` (shared.ts)**

In `src/types/shared.ts`, nel blocco `clienti: { ... }` dell'interfaccia `ElectronAPI`, dopo `anonimizza: (id: number) => Promise<void>` (e dopo il blocco `import` già presente), aggiungere:

```ts
    count: () => Promise<number>
```

- [ ] **Step 5: Implementare la clausola età e `contaClientiAttivi` (repository)**

In `src/main/db/clients-repository.ts`, dentro `listClienti`, nella sezione che costruisce `extraWhere` (dopo il blocco `tipo_abbonamento_id`), aggiungere:

```ts
  if (filters?.eta === 'minorenne') {
    extraWhere.push(
      `c.data_nascita IS NOT NULL AND date(c.data_nascita) > date('now','-18 years')`
    )
  } else if (filters?.eta === 'maggiorenne') {
    extraWhere.push(
      `c.data_nascita IS NOT NULL AND date(c.data_nascita) <= date('now','-18 years')`
    )
  }
```

(Non aggiunge parametri bindati: le espressioni sono letterali SQL.)

In fondo al file, aggiungere:

```ts
/** Numero di clienti con stato 'attivo' (totale della pagina Clienti). */
export function contaClientiAttivi(): number {
  const db = getDatabase()
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM clienti WHERE stato = 'attivo'`)
    .get() as { n: number }
  return row.n
}
```

- [ ] **Step 6: Eseguire i test per verificarne il successo**

Run: `npx vitest run tests/unit/clienti-eta-conteggio.test.ts`
Expected: PASS.

- [ ] **Step 7: Registrare l'handler IPC `clienti:count`**

In `src/main/ipc/handlers.ts`:

Estendere l'import da `../db/clients-repository` aggiungendo `contaClientiAttivi` all'elenco già presente (`createCliente, getCliente, updateCliente, listClienti, anonimizzaCliente, …`).

Subito dopo l'handler `clienti:list`, aggiungere:

```ts
  ipcMain.handle('clienti:count', (): number => {
    try {
      return contaClientiAttivi()
    } catch (err) {
      log.error('[ipc] clienti:count errore:', err)
      throw err instanceof Error ? err : new Error('Errore nel conteggio clienti')
    }
  })
```

- [ ] **Step 8: Esporre `count` nel preload**

In `src/preload/index.ts`, nel blocco `clienti: { ... }`, dopo `anonimizza(...)` (e dopo il blocco `import: { ... }`), aggiungere:

```ts
    count(): Promise<number> {
      return ipcRenderer.invoke('clienti:count')
    }
```

- [ ] **Step 9: Verificare typecheck, lint e test**

Run: `npm run typecheck && npm run lint && npx vitest run tests/unit/clienti-eta-conteggio.test.ts`
Expected: PASS su tutti.

- [ ] **Step 10: Commit**

```bash
git add src/types/shared.ts src/main/db/clients-repository.ts src/main/ipc/handlers.ts src/preload/index.ts tests/unit/clienti-eta-conteggio.test.ts
git commit -m "feat(clienti): filtro età in listClienti e conteggio totale (IPC clienti:count)"
```

---

### Task 2: Renderer — filtro Età, riga conteggio e i18n

**Files:**
- Modify: `src/renderer/src/pages/ClientsPage.tsx`
- Modify: `src/renderer/src/i18n/locales/it.json`
- Modify: `src/renderer/src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `ClientiFilters.eta`, `window.api.clienti.count()` (Task 1); chiavi i18n nuove sotto `clienti.*`.

- [ ] **Step 1: Aggiungere le chiavi i18n (it.json)**

In `src/renderer/src/i18n/locales/it.json`, dentro `clienti.filtri`, aggiungere:

```json
      "eta": "Età",
      "eta_minorenni": "Minorenni",
      "eta_maggiorenni": "Maggiorenni",
```

e dentro `clienti` (allo stesso livello di `filtri`), aggiungere:

```json
    "conteggio_totale": "{{totale}} clienti",
    "conteggio_filtrati": "{{filtrati}}/{{totale}}",
```

- [ ] **Step 2: Aggiungere le chiavi i18n (en.json)**

In `src/renderer/src/i18n/locales/en.json`, dentro `clienti.filtri`:

```json
      "eta": "Age",
      "eta_minorenni": "Minors",
      "eta_maggiorenni": "Adults",
```

e dentro `clienti`:

```json
    "conteggio_totale": "{{totale}} clients",
    "conteggio_filtrati": "{{filtrati}}/{{totale}}",
```

- [ ] **Step 3: Validare i JSON**

Run: `node -e "require('./src/renderer/src/i18n/locales/it.json'); require('./src/renderer/src/i18n/locales/en.json'); console.log('JSON validi')"`
Expected: stampa `JSON validi`.

- [ ] **Step 4: Aggiungere il tipo, gli stati e aggiornare `loadClienti` (ClientsPage.tsx)**

Vicino agli altri alias di tipo in cima al componente (dopo `StatoCertificatoFilter`), aggiungere:

```tsx
type EtaFilter = '' | 'minorenne' | 'maggiorenne'
```

Vicino agli altri `useState` dei filtri (dopo `filtroTipoAbbonamento`), aggiungere:

```tsx
  const [filtroEta, setFiltroEta] = useState<EtaFilter>('')
  const [totaleClienti, setTotaleClienti] = useState<number | null>(null)
```

Sostituire la firma e il corpo di `loadClienti` (righe ~38-66) aggiungendo il parametro `eta`:

```tsx
  const loadClienti = useCallback(
    async (
      search: string,
      extraFilter?: ClientiFilters,
      isc?: StatoIscrizioneFilter,
      cert?: StatoCertificatoFilter,
      tipoAbb?: TipoAbbonamentoRow | null,
      eta?: EtaFilter,
    ): Promise<void> => {
      setIsLoading(true)
      setLoadError(false)
      try {
        const filters: ClientiFilters = {
          ...(extraFilter ?? {}),
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(isc ? { stato_iscrizione: isc as ClientiFilters['stato_iscrizione'] } : {}),
          ...(cert ? { stato_certificato: cert as ClientiFilters['stato_certificato'] } : {}),
          ...(tipoAbb ? { tipo_abbonamento_id: tipoAbb.id } : {}),
          ...(eta ? { eta } : {}),
        }
        const hasFilters = Object.keys(filters).length > 0
        const data = await window.api.clienti.list(hasFilters ? filters : undefined)
        setClienti(data)
      } catch {
        setLoadError(true)
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )
```

- [ ] **Step 5: Caricare il totale al mount (ClientsPage.tsx)**

Dopo l'effetto che carica i tipi abbonamento (il blocco `useEffect` con `catalogo.tipiAbbonamento`), aggiungere:

```tsx
  // Totale clienti attivi (denominatore del rapporto), caricato una sola volta
  useEffect(() => {
    window.api.clienti
      .count()
      .then(setTotaleClienti)
      .catch(() => {
        // Silenzioso: la riga di conteggio non verrà mostrata
      })
  }, [])
```

- [ ] **Step 6: Propagare `filtroEta` a tutte le chiamate di `loadClienti`**

Aggiornare le 8 chiamate esistenti aggiungendo l'argomento `eta` come 6° parametro, e aggiungere il nuovo handler. Modifiche esatte:

Nell'effetto `initialFilter` (reset filtri) — aggiungere `setFiltroEta('')` insieme agli altri reset, e la chiamata diventa:
```tsx
      void loadClienti('', initialFilter, '', '', null, '')
```

Effetto di mount:
```tsx
    void loadClienti('', activeFilter, filtroIscrizione, filtroCertificato, filtroTipoAbbonamento, filtroEta)
```

`handleRefresh`:
```tsx
    void loadClienti(search, activeFilter, filtroIscrizione, filtroCertificato, filtroTipoAbbonamento, filtroEta)
```

`handleFiltroIscrizioneChange`:
```tsx
    void loadClienti(currentSearch, activeFilter, value, filtroCertificato, filtroTipoAbbonamento, filtroEta)
```

`handleFiltroCertificatoChange`:
```tsx
    void loadClienti(currentSearch, activeFilter, filtroIscrizione, value, filtroTipoAbbonamento, filtroEta)
```

`handleFiltroTipoAbbonamentoChange`:
```tsx
    void loadClienti(currentSearch, activeFilter, filtroIscrizione, filtroCertificato, tipo, filtroEta)
```

`handleClienteUpdated`:
```tsx
    void loadClienti(currentSearch, activeFilter, filtroIscrizione, filtroCertificato, filtroTipoAbbonamento, filtroEta)
```

`handleNewSuccess`:
```tsx
    void loadClienti(currentSearch, activeFilter, filtroIscrizione, filtroCertificato, filtroTipoAbbonamento, filtroEta)
```

Aggiungere il nuovo handler (accanto agli altri `handleFiltro*`):
```tsx
  function handleFiltroEtaChange(value: EtaFilter): void {
    setFiltroEta(value)
    void loadClienti(currentSearch, activeFilter, filtroIscrizione, filtroCertificato, filtroTipoAbbonamento, value)
  }
```

- [ ] **Step 7: Aggiungere il `<select>` "Età" tra i filtri (ClientsPage.tsx)**

Nel gruppo dei filtri, dopo il blocco del select "Tipo abbonamento" (`filtro-tipo-abbonamento`), aggiungere:

```tsx
        {/* Età */}
        <div>
          <label
            htmlFor="filtro-eta"
            className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
          >
            {t('clienti.filtri.eta')}
          </label>
          <select
            id="filtro-eta"
            value={filtroEta}
            onChange={(e) => handleFiltroEtaChange(e.target.value as EtaFilter)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('clienti.filtri.tutti')}</option>
            <option value="minorenne">{t('clienti.filtri.eta_minorenni')}</option>
            <option value="maggiorenne">{t('clienti.filtri.eta_maggiorenni')}</option>
          </select>
        </div>
```

- [ ] **Step 8: Aggiungere la riga di conteggio sopra la lista (ClientsPage.tsx)**

Subito prima del componente `<ClientList ... />` (nella vista lista), aggiungere:

```tsx
      {totaleClienti !== null && !isLoading && (
        <p
          className="text-sm text-gray-500 dark:text-gray-400"
          data-testid="clienti-conteggio"
        >
          {clienti.length === totaleClienti
            ? t('clienti.conteggio_totale', { totale: totaleClienti })
            : t('clienti.conteggio_filtrati', { filtrati: clienti.length, totale: totaleClienti })}
        </p>
      )}
```

- [ ] **Step 9: Verificare typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/pages/ClientsPage.tsx src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(clienti): filtro Età e riga conteggio filtrati/totale nella pagina Clienti"
```

---

### Task 3: Verifica finale

**Files:** nessuno (solo verifica).

- [ ] **Step 1: Gate di qualità completo**

Run: `npm run verify`
Expected: PASS su typecheck, lint, test, build:electron.

- [ ] **Step 2: Verifica manuale (consigliata)**

Run: `npm run dev`
- Pagina Clienti: il select "Età" filtra minorenni/maggiorenni; i clienti senza data di nascita non compaiono in nessuna delle due.
- La riga sopra la lista mostra il totale (es. "1333 clienti") e, quando i filtri restringono, il rapporto compatto (es. "250/1333").

- [ ] **Step 3: Commit di formattazione se necessario**

Se `npm run format` modifica file:
```bash
npm run format
git add -A
git commit -m "chore(clienti): formattazione"
```

---

## Note di self-review

- **Copertura spec:** filtro età SQL coerente con `isMinorenne`, NULL esclusi (Task 1, Step 5 + test); `contaClientiAttivi` + IPC/preload/tipo (Task 1); UI select Età + riga conteggio compatta con regola "solo totale se non ristretto" (Task 2); i18n it/en (Task 2); verify (Task 3).
- **`count` in ElectronAPI:** aggiungerlo in `shared.ts` (Step 4) richiede l'implementazione preload nello stesso commit (Step 8), altrimenti il typecheck fallisce (l'oggetto `api` è tipato `ElectronAPI`). Entrambi sono nel Task 1.
- **api.d.ts:** non modificato — importa `ElectronAPI` da `shared.ts` (consolidamento precedente).
- **Numeratore = `clienti.length`:** valido perché la lista non è paginata (assunzione dichiarata nella spec).
- **Fuori scope (YAGNI):** terza voce "data mancante", conteggio filtrato lato server, separatore delle migliaia.
```
