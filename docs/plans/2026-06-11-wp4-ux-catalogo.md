# WP4 — UX & Catalogo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere i punti UX/catalogo percepiti come bloccanti dall'utente: feedback d'errore e disabilitazione corretta del pulsante "Elimina" del catalogo (B5/C2/C3), colore primario applicato all'intera scala 50–900 (N5), file picker nel ripristino locale con conferma di successo (C6), e indirizzo + conferma con numero nell'emissione ricevute (B6/C9).

**Architecture:** Quattro cluster indipendenti. Dove la logica è pura (generazione scala colore, calcolo intestatario/indirizzo, conteggio assegnazioni) viene estratta in funzioni testabili con Vitest; le modifiche puramente UI (componenti React) sono verificate da typecheck + lint + build (il progetto non ha un harness di test di componenti React) e descritte con codice completo. I tipi vivono in **due** copie da tenere allineate: `src/types/shared.ts` (main/preload) e `src/renderer/src/types/api.d.ts` (ambient globale del renderer).

**Tech Stack:** Electron + React + TypeScript (strict) + Tailwind; `better-sqlite3-multiple-ciphers`; Vitest; i18next (it/en). IPC via preload (`contextIsolation`).

---

## Convenzioni del progetto (leggere prima di iniziare)

- **Definizione di «verde» (DoD):** `npm run verify` = typecheck + `eslint src --ext .ts,.tsx --max-warnings 0` + Vitest + `electron-vite build`. Nessun task è "fatto" senza verify verde a fine plan.
- **Stringhe sempre esternalizzate** in `src/renderer/src/i18n/locales/it.json` e `en.json` (mai hardcoded in UI).
- **Tipi duplicati:** ogni nuovo campo su una riga/`ElectronAPI` va aggiunto **sia** in `src/types/shared.ts` **sia** in `src/renderer/src/types/api.d.ts` (TS non incrocia le due: `api.d.ts` è una dichiarazione ambient). Vedi precedente WP2 (`WidgetIndicatori`).
- **Harness test repository (Vitest, node env):** `vi.mock('electron-log', …)` + `vi.mock('../../src/main/db/database', () => ({ getDatabase: () => _testDb }))` + `new Database(':memory:')` con `runMigrations(_testDb)` in `beforeEach`. Vedi `tests/unit/clients-repository.test.ts` come riferimento esatto.
- **Date test timezone-safe:** usare date lontane (`'2000-…'` / `'2999-…'`) o `date('now','±N days')`.
- **Errori:** i repository lanciano stringhe-codice (`new Error('TIPO_ASSEGNATO')`); gli handler IPC validano con il pattern `VALIDATION_ERROR: …`.
- **Canali IPC:** convenzione `dominio:azione` o `dominio:entita:verbo`. I payload di `delete`/`invalida` sono oggetti `{ id }` (vedi preload), **non** numeri nudi.
- **Commit:** conventional commits con trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Scope di WP4 (e cosa è rinviato)

**In scope (questo plan):** B5 + C2 + C3 (catalogo), N5 (scala colore), C6 + conferma restore (C13-restore), B6 + C9 (emissione ricevuta).

**Rinviato a un futuro WP4b/WP5** (item indipendenti e a basso accoppiamento, non bloccanti per i cluster sopra):
- C7 (messaggi di validazione i18n per Assegna*/Tipo*/Certificato form)
- C8 (validazione client-side `ClientForm`)
- C10 (conferma chiusura modale con modifiche pendenti)
- C11 (scroll orizzontale tabelle strette)
- C12 (rinnovo iscrizione atomico lato backend — richiede nuovo IPC)
- C13 residui (helper `formatNomeCliente`, banner update, hint password, warning formato CF)
- B7 (indirizzo tutore nel form cliente) e B12 (gap minori catalogo: ricerca, plurali i18n)

> **Nota B6/B7:** in WP4 la verifica indirizzo (Task 8) controlla i campi che `creaRicevuta` scrive **realmente** come indirizzo intestatario (tutore quando il cliente è minore con tutore, altrimenti il cliente). L'allineamento alla spec «ricevuta al tutore usa l'indirizzo del minore» è B7 ed è fuori scope qui: va annotato in `OPEN-QUESTIONS.md` (vedi Task 12).

---

## File Structure

**Nuovi file:**
- `tests/unit/catalog-repository.test.ts` — test `assegnati_count` (Task 1)
- `tests/unit/theme.test.ts` — test funzione pura `scalaPrimaria` (Task 4)
- `tests/unit/dominio-renderer.test.ts` — test `calcolaIntestatario` / `indirizzoIntestatarioCompleto` (Task 7)
- `src/renderer/src/utils/pdf.ts` — helper `apriPdfBase64` (Task 9)

**File modificati:**
- `src/main/db/catalog-repository.ts` — `listTipiIscrizione`/`listTipiAbbonamento` con `assegnati_count` (Task 1)
- `src/types/shared.ts` + `src/renderer/src/types/api.d.ts` — `assegnati_count` su `TipoIscrizioneRow`/`TipoAbbonamentoRow` (Task 1); sezione `dialog` su `ElectronAPI` (Task 5)
- `src/renderer/src/components/ui/ConfirmDialog.tsx` — prop opzionale `errorMessage` (Task 2)
- `src/renderer/src/pages/CatalogoPage.tsx` — disable Elimina + tooltip condizionale + catch con messaggio (Task 3)
- `src/renderer/src/theme.ts` — `scalaPrimaria` + `applyPrimaryColor` su tutte le var (Task 4)
- `src/main/ipc/handlers.ts` — handler `dialog:showOpenDialog` (Task 5); nessuna modifica a `ricevute:crea`
- `src/preload/index.ts` — bridge `dialog.showOpenDialog` (Task 5)
- `src/renderer/src/components/backup/RestoreDialog.tsx` — Sfoglia… + success (Task 6)
- `src/renderer/src/utils/dominio.ts` — `calcolaIntestatario` + `indirizzoIntestatarioCompleto` (Task 7)
- `src/renderer/src/components/receipts/EmittiRicevutaForm.tsx` — prop `cliente`, header intestatario, blocco indirizzo, stato success (Task 8 + 9)
- `src/renderer/src/components/clients/ClientDetail.tsx` — passa `cliente` al form (Task 8)
- `src/renderer/src/i18n/locales/it.json` + `en.json` — nuove chiavi (Task 3, 6, 8)
- `ANALYSYS.md` — stato voci (Task 12); `OPEN-QUESTIONS.md` — nota B7 (Task 12)

---

## Cluster A — Catalogo: Elimina disabilitato + feedback errore (B5/C2/C3)

### Task 1: Backend — esporre `assegnati_count` per tipo

**Files:**
- Modify: `src/main/db/catalog-repository.ts:71-79` e `:170-178`
- Modify: `src/types/shared.ts` (interfacce `TipoIscrizioneRow`, `TipoAbbonamentoRow`)
- Modify: `src/renderer/src/types/api.d.ts:123-132` e `:134-145`
- Test: `tests/unit/catalog-repository.test.ts` (create)

- [ ] **Step 1: Scrivere il test che fallisce**

Create `tests/unit/catalog-repository.test.ts`:

```ts
/**
 * Test di integrazione per catalog-repository.
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
import {
  createTipoIscrizione,
  listTipiIscrizione,
  createTipoAbbonamento,
  listTipiAbbonamento
} from '../../src/main/db/catalog-repository'

function creaCliente(db: Database.Database, cf: string): number {
  const info = db
    .prepare(`INSERT INTO clienti (nome, cognome, codice_fiscale) VALUES ('Mario', 'Rossi', ?)`)
    .run(cf)
  return info.lastInsertRowid as number
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

describe('listTipiIscrizione — assegnati_count (B5)', () => {
  it('è 0 per un tipo non assegnato', () => {
    createTipoIscrizione({ nome: 'Annuale', durata_mesi: 12, prezzo_default: 30 })
    const tipi = listTipiIscrizione(true)
    expect(tipi).toHaveLength(1)
    expect(tipi[0].assegnati_count).toBe(0)
  })

  it('conta i clienti assegnati (incluse iscrizioni non attive)', () => {
    const db = _testDb!
    const tipo = createTipoIscrizione({ nome: 'Annuale', durata_mesi: 12, prezzo_default: 30 })
    const c1 = creaCliente(db, 'RSSMRA85T10H501Z')
    const c2 = creaCliente(db, 'BNCLRA90A41H501B')
    db.prepare(
      `INSERT INTO iscrizioni_cliente (cliente_id, tipo_iscrizione_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, '2000-01-01', '2000-12-31', 30, 'da_incassare', 'attiva')`
    ).run(c1, tipo.id)
    db.prepare(
      `INSERT INTO iscrizioni_cliente (cliente_id, tipo_iscrizione_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, '2000-01-01', '2000-12-31', 30, 'da_incassare', 'scaduta')`
    ).run(c2, tipo.id)

    const tipo2 = listTipiIscrizione(true).find((t) => t.id === tipo.id)!
    expect(tipo2.assegnati_count).toBe(2)
  })
})

describe('listTipiAbbonamento — assegnati_count (B5)', () => {
  it('conta i clienti assegnati', () => {
    const db = _testDb!
    const tipo = createTipoAbbonamento({ nome: 'Sala pesi', durata_mesi: 1, prezzo_default: 40 })
    const c1 = creaCliente(db, 'RSSMRA85T10H501Z')
    db.prepare(
      `INSERT INTO abbonamenti_cliente (cliente_id, tipo_abbonamento_id, data_inizio, data_scadenza, prezzo, stato_pagamento, stato)
       VALUES (?, ?, '2000-01-01', '2000-01-31', 40, 'da_incassare', 'attivo')`
    ).run(c1, tipo.id)

    const tipo2 = listTipiAbbonamento(true).find((t) => t.id === tipo.id)!
    expect(tipo2.assegnati_count).toBe(1)
  })
})
```

> Nota: `createTipoAbbonamento` accetta `{ nome, durata_mesi, prezzo_default }` (categoria/colore opzionali → default backend). Se la firma richiede `colore`, leggere `createTipoAbbonamento` in `catalog-repository.ts` e aggiungere i campi mancanti all'oggetto; non inventare colonne.

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `npx vitest run tests/unit/catalog-repository.test.ts`
Expected: FAIL — `assegnati_count` non esiste sul tipo (typecheck/asserzione `undefined`).

- [ ] **Step 3: Aggiungere il campo ai tipi (entrambe le copie)**

In `src/types/shared.ts`, dentro `interface TipoIscrizioneRow` aggiungere (dopo `data_modifica`):

```ts
  /** Numero di clienti a cui il tipo è assegnato (storico incluso). 0 ⇒ eliminabile. */
  assegnati_count: number
```

Stessa riga dentro `interface TipoAbbonamentoRow`.

In `src/renderer/src/types/api.d.ts`, replicare in `interface TipoIscrizioneRow` (dopo `data_modifica: string`, riga ~131) e `interface TipoAbbonamentoRow` (dopo `data_modifica: string`, riga ~144):

```ts
    assegnati_count: number
```

- [ ] **Step 4: Modificare le query di list**

In `src/main/db/catalog-repository.ts`, sostituire `listTipiIscrizione` (71-79):

```ts
export function listTipiIscrizione(includeNonValidi = false): TipoIscrizioneRow[] {
  const db = getDatabase()

  const where = includeNonValidi ? '' : "WHERE t.stato = 'attivo'"
  const sql = `
    SELECT t.*,
           (SELECT COUNT(*) FROM iscrizioni_cliente ic WHERE ic.tipo_iscrizione_id = t.id) AS assegnati_count
    FROM tipi_iscrizione t
    ${where}
    ORDER BY t.nome
  `
  return db.prepare(sql).all() as TipoIscrizioneRow[]
}
```

Sostituire `listTipiAbbonamento` (170-178):

```ts
export function listTipiAbbonamento(includeNonValidi = false): TipoAbbonamentoRow[] {
  const db = getDatabase()

  const where = includeNonValidi ? '' : "WHERE t.stato = 'attivo'"
  const sql = `
    SELECT t.*,
           (SELECT COUNT(*) FROM abbonamenti_cliente ac WHERE ac.tipo_abbonamento_id = t.id) AS assegnati_count
    FROM tipi_abbonamento t
    ${where}
    ORDER BY t.nome
  `
  return db.prepare(sql).all() as TipoAbbonamentoRow[]
}
```

- [ ] **Step 5: Eseguire il test e verificare che passi**

Run: `npx vitest run tests/unit/catalog-repository.test.ts`
Expected: PASS (3 test).

- [ ] **Step 6: Commit**

```bash
git add tests/unit/catalog-repository.test.ts src/main/db/catalog-repository.ts src/types/shared.ts src/renderer/src/types/api.d.ts
git commit -m "feat(catalogo): espone assegnati_count per tipo (B5)"
```

---

### Task 2: `ConfirmDialog` — prop `errorMessage` (banner inline)

**Files:**
- Modify: `src/renderer/src/components/ui/ConfirmDialog.tsx`

> UI pura: nessun test di componente nel progetto. Verifica via typecheck + lint + build (verify finale).

- [ ] **Step 1: Aggiungere la prop all'interfaccia**

In `ConfirmDialog.tsx`, dentro `interface ConfirmDialogProps` (dopo `isLoading?: boolean`, riga 15):

```ts
  /** Messaggio d'errore da mostrare nel dialog senza chiuderlo (es. vincolo violato). */
  errorMessage?: string | null
```

- [ ] **Step 2: Destrutturare la prop**

Nella firma del componente (dopo `isLoading = false,`, riga 27):

```ts
  errorMessage = null,
```

- [ ] **Step 3: Renderizzare il banner**

In `ConfirmDialog.tsx`, dentro `<div className="space-y-5">`, subito **dopo** `<p …>{message}</p>` (riga 34), aggiungere:

```tsx
        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400"
          >
            {errorMessage}
          </div>
        )}
```

- [ ] **Step 4: Verifica typecheck**

Run: `npx tsc --noEmit -p tsconfig.web.json` (o `npm run typecheck`)
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/ConfirmDialog.tsx
git commit -m "feat(ui): ConfirmDialog supporta un banner errorMessage inline (C2)"
```

---

### Task 3: `CatalogoPage` — disabilita Elimina + tooltip condizionale + catch

**Files:**
- Modify: `src/renderer/src/pages/CatalogoPage.tsx` (entrambi i tab)
- Modify: `src/renderer/src/i18n/locales/it.json` e `en.json` (namespace `catalogo`)

- [ ] **Step 1: Aggiungere le chiavi i18n**

In `it.json`, namespace `catalogo`, **aggiungere** dopo `"tipo_assegnato_tooltip"`:

```json
    "elimina_non_consentito": "Non eliminabile: assegnato a {{count}} clienti (puoi invalidarlo).",
    "elimina_errore": "Impossibile eliminare: tipo già assegnato a dei clienti.",
```

In `en.json`, stesse chiavi:

```json
    "elimina_non_consentito": "Cannot delete: assigned to {{count}} clients (you can invalidate it).",
    "elimina_errore": "Cannot delete: type already assigned to clients.",
```

- [ ] **Step 2: Aggiungere lo stato d'errore in `TipiIscrizioneTab`**

In `CatalogoPage.tsx`, dopo `const [isActioning, setIsActioning] = useState(false)` (riga 70) aggiungere:

```tsx
  const [eliminaError, setEliminaError] = useState<string | null>(null)
```

- [ ] **Step 3: Riscrivere `handleElimina` (iscrizioni) con catch**

Sostituire `handleElimina` (126-136) con:

```tsx
  async function handleElimina(): Promise<void> {
    if (!eliminaTarget) return
    setIsActioning(true)
    setEliminaError(null)
    try {
      await window.api.catalogo.tipiIscrizione.delete(eliminaTarget.id)
      setTipi((prev) => prev.filter((t) => t.id !== eliminaTarget.id))
      setEliminaTarget(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setEliminaError(msg.includes('TIPO_ASSEGNATO') ? t('catalogo.elimina_errore') : t('common.error_generic'))
    } finally {
      setIsActioning(false)
    }
  }
```

> Cambiamento chiave: il dialog **non** si chiude più nel `finally`; si chiude solo in caso di successo (`setEliminaTarget(null)`). In errore resta aperto col banner.

- [ ] **Step 4: Pulire lo stato d'errore alla chiusura e collegarlo al dialog (iscrizioni)**

Sostituire il `ConfirmDialog` di elimina iscrizioni (247-257) con:

```tsx
      <ConfirmDialog
        isOpen={eliminaTarget !== null}
        onClose={() => {
          setEliminaTarget(null)
          setEliminaError(null)
        }}
        onConfirm={() => void handleElimina()}
        title={t('catalogo.elimina_conferma_titolo')}
        message={t('catalogo.elimina_conferma_msg')}
        confirmLabel={t('catalogo.azioni.elimina')}
        variant="danger"
        isLoading={isActioning}
        errorMessage={eliminaError}
      />
```

- [ ] **Step 5: Disabilitare il bottone Elimina + tooltip condizionale (iscrizioni)**

Il bottone Elimina riceve già `onElimina` dalla riga. La condizione di disabilitazione usa `assegnati_count`. Individuare il componente riga (es. `TipoIscrizioneRow`) e dove riceve i dati del tipo: il bottone (323-331) va reso dipendente da `tipo.assegnati_count`. Sostituire il bottone (323-331) con:

```tsx
          <button
            type="button"
            onClick={onElimina}
            disabled={tipo.assegnati_count > 0}
            title={
              tipo.assegnati_count > 0
                ? t('catalogo.elimina_non_consentito', { count: tipo.assegnati_count })
                : t('catalogo.azioni.elimina')
            }
            className="p-1.5 rounded-md text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-500 disabled:hover:bg-transparent"
          >
            <TrashIcon />
            <span className="sr-only">{t('catalogo.azioni.elimina')}</span>
          </button>
```

> Verificare che il componente riga riceva `tipo` (l'oggetto `TipoIscrizioneRow`). Se passa solo callback senza l'oggetto, aggiungere alla sua props `tipo: TipoIscrizioneRow` e passarlo dal `.map(...)` chiamante. Leggere il punto esatto (intorno a 300-340) e adattare il prop-drilling minimo.

- [ ] **Step 6: Replicare Step 2–5 in `TipiAbbonamentoTab`**

Stesse identiche modifiche per il tab abbonamenti:
- stato `eliminaError` dopo riga 354;
- `handleElimina` (410-420) riscritto come Step 3 ma con `window.api.catalogo.tipiAbbonamento.delete(...)`;
- `ConfirmDialog` elimina abbonamenti (525-534) con `onClose` che azzera anche `eliminaError` e `errorMessage={eliminaError}`;
- bottone Elimina abbonamenti (608-616) con `disabled={tipo.assegnati_count > 0}` e `title` condizionale come Step 5.

- [ ] **Step 7: Verifica typecheck + lint**

Run: `npm run typecheck && npx eslint src --ext .ts,.tsx --max-warnings 0`
Expected: nessun errore/warning. (`common.error_generic` esiste già in it/en.)

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/pages/CatalogoPage.tsx src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(catalogo): disabilita Elimina se assegnato + feedback errore nel dialog (B5/C2/C3)"
```

---

## Cluster B — Colore primario su tutta la scala (N5)

### Task 4: `theme.ts` — generare la scala 50–900 dal colore scelto

**Files:**
- Modify: `src/renderer/src/theme.ts`
- Test: `tests/unit/theme.test.ts` (create)

> Contesto: `tailwind.config.ts` mappa `primary-50..900` a `rgb(var(--color-primary-N) / <alpha-value>)`; `globals.css` dichiara le 10 variabili come **triplette separate da spazio** (`59 130 246`). Oggi `applyPrimaryColor` imposta solo `--color-primary-500` e per giunta con la forma a virgole (`37,99,235`), incompatibile con la sintassi `rgb(... / <alpha>)`. Questo task genera le 10 sfumature e le scrive **separate da spazio**.

- [ ] **Step 1: Scrivere il test della funzione pura**

Create `tests/unit/theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { scalaPrimaria } from '../../src/renderer/src/theme'

describe('scalaPrimaria', () => {
  it('mantiene il colore base sulla sfumatura 500 (in forma "r g b")', () => {
    const scala = scalaPrimaria('37,99,235')
    expect(scala[500]).toBe('37 99 235')
  })

  it('produce tutte e 10 le sfumature', () => {
    const scala = scalaPrimaria('37,99,235')
    expect(Object.keys(scala).map(Number).sort((a, b) => a - b)).toEqual([
      50, 100, 200, 300, 400, 500, 600, 700, 800, 900
    ])
  })

  it('schiarisce verso il 50 e scurisce verso il 900', () => {
    const scala = scalaPrimaria('37,99,235')
    const lum = (s: string): number => s.split(' ').reduce((a, v) => a + Number(v), 0)
    expect(lum(scala[50])).toBeGreaterThan(lum(scala[500]))
    expect(lum(scala[900])).toBeLessThan(lum(scala[500]))
  })

  it('clampa i valori entro 0..255 e arrotonda a interi', () => {
    const scala = scalaPrimaria('250,250,250')
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
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `npx vitest run tests/unit/theme.test.ts`
Expected: FAIL — `scalaPrimaria` non esportata.

- [ ] **Step 3: Implementare `scalaPrimaria` e riscrivere `applyPrimaryColor`**

In `src/renderer/src/theme.ts`, sostituire la funzione `applyPrimaryColor` (righe 19-21) con:

```ts
/** Sfumature Tailwind: chiave = shade, valore = frazione di mix.
 *  50–400 schiariscono verso il bianco; 600–900 scuriscono verso il nero. */
const MIX_BIANCO: Record<number, number> = { 50: 0.9, 100: 0.8, 200: 0.6, 300: 0.4, 400: 0.2 }
const MIX_NERO: Record<number, number> = { 600: 0.12, 700: 0.24, 800: 0.36, 900: 0.48 }

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

/**
 * Genera l'intera scala primaria 50–900 da un colore base "r,g,b" (la sfumatura 500).
 * Ritorna una mappa shade → tripletta "r g b" (separata da spazio, formato richiesto da Tailwind),
 * oppure null se l'input non è una tripletta valida.
 */
export function scalaPrimaria(rgb: string): Record<number, string> | null {
  const parts = rgb.split(',').map((s) => Number(s.trim()))
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null
  const [r, g, b] = parts.map(clamp)

  const scala: Record<number, string> = {}
  for (const shade of [50, 100, 200, 300, 400] as const) {
    const p = MIX_BIANCO[shade]
    scala[shade] = `${clamp(r + (255 - r) * p)} ${clamp(g + (255 - g) * p)} ${clamp(b + (255 - b) * p)}`
  }
  scala[500] = `${r} ${g} ${b}`
  for (const shade of [600, 700, 800, 900] as const) {
    const p = MIX_NERO[shade]
    scala[shade] = `${clamp(r * (1 - p))} ${clamp(g * (1 - p))} ${clamp(b * (1 - p))}`
  }
  return scala
}

/** Applica il colore primario custom (stringa "r,g,b") impostando tutte le variabili CSS 50–900. */
export function applyPrimaryColor(primaryColor: string): void {
  const scala = scalaPrimaria(primaryColor)
  if (!scala) return
  const root = document.documentElement
  for (const shade of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const) {
    root.style.setProperty(`--color-primary-${shade}`, scala[shade])
  }
}
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `npx vitest run tests/unit/theme.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Verifica manuale rapida (descrizione)**

In dev (`npm run dev`): Impostazioni → scegliere un preset (es. Verde) → Salva. Header, voce di nav attiva e bottoni primari (che usano `primary-600/700`) devono cambiare colore **immediatamente** senza riavvio. (Prima del fix cambiava solo elementi che usano `primary-500`.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/theme.ts tests/unit/theme.test.ts
git commit -m "feat(theme): deriva l'intera scala primaria 50-900 dal colore scelto (N5)"
```

---

## Cluster C — Ripristino locale: file picker + conferma (C6 + C13-restore)

### Task 5: Backend — IPC `dialog:showOpenDialog`

**Files:**
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/types/api.d.ts` (sezione `ElectronAPI`)

> IPC che apre un dialog nativo: non unit-testabile nel harness corrente. Verifica via typecheck + build + manuale.

- [ ] **Step 1: Aggiungere l'handler IPC**

In `src/main/ipc/handlers.ts`: assicurarsi che `dialog` e `BrowserWindow` siano importati da `electron` (in cima al file; se manca `dialog`/`BrowserWindow`, aggiungerli all'import esistente `import { ipcMain, … } from 'electron'`). Poi, vicino agli altri handler `backup:*` (dopo `backup:ripristina`, intorno a riga 881), aggiungere:

```ts
  ipcMain.handle(
    'dialog:showOpenDialog',
    async (
      event,
      options?: { title?: string; filters?: { name: string; extensions: string[] }[] }
    ): Promise<{ canceled: boolean; filePaths: string[] }> => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
        const result = await dialog.showOpenDialog(win!, {
          title: options?.title,
          properties: ['openFile'],
          filters: options?.filters ?? [{ name: 'Database', extensions: ['db'] }]
        })
        return { canceled: result.canceled, filePaths: result.filePaths }
      } catch (err) {
        log.error('[ipc] dialog:showOpenDialog errore:', err)
        throw err instanceof Error ? err : new Error('Errore apertura finestra di selezione file')
      }
    }
  )
```

> Se `BrowserWindow.fromWebContents(...)` può essere `null`, `showOpenDialog` accetta anche la forma senza finestra: in tal caso usare `win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts)`. Adattare leggendo la firma installata di Electron in `node_modules/electron/electron.d.ts` (non inventare).

- [ ] **Step 2: Esporre nel preload**

In `src/preload/index.ts`, aggiungere una sezione `dialog` all'oggetto `api` (es. dopo il blocco `backup`, prima della chiusura dell'oggetto):

```ts
  dialog: {
    showOpenDialog(options?: {
      title?: string
      filters?: { name: string; extensions: string[] }[]
    }): Promise<{ canceled: boolean; filePaths: string[] }> {
      return ipcRenderer.invoke('dialog:showOpenDialog', options)
    }
  },
```

- [ ] **Step 3: Tipizzare in `ElectronAPI`**

In `src/renderer/src/types/api.d.ts`, dentro l'interfaccia `ElectronAPI`, aggiungere (es. accanto a `backup`):

```ts
    dialog: {
      showOpenDialog: (options?: {
        title?: string
        filters?: { name: string; extensions: string[] }[]
      }) => Promise<{ canceled: boolean; filePaths: string[] }>
    }
```

> Se `ElectronAPI` è dichiarata anche in `src/types/shared.ts` (il preload importa `ElectronAPI` da `../types/shared`), aggiungere la stessa sezione `dialog` lì. Verificare leggendo `shared.ts`: tenere allineate entrambe le copie.

- [ ] **Step 4: Verifica typecheck + build**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/handlers.ts src/preload/index.ts src/renderer/src/types/api.d.ts src/types/shared.ts
git commit -m "feat(ipc): handler dialog:showOpenDialog per la selezione file nativa (C6)"
```

---

### Task 6: `RestoreDialog` — Sfoglia… + conferma successo

**Files:**
- Modify: `src/renderer/src/components/backup/RestoreDialog.tsx`
- Modify: `src/renderer/src/i18n/locales/it.json` e `en.json` (namespace `backup`)

- [ ] **Step 1: Aggiungere le chiavi i18n**

In `it.json`, namespace `backup`, aggiungere:

```json
    "ripristina_sfoglia": "Sfoglia…",
    "ripristina_completato": "Ripristino completato. L'app verrà riavviata.",
```

In `en.json`:

```json
    "ripristina_sfoglia": "Browse…",
    "ripristina_completato": "Restore completed. The app will restart.",
```

- [ ] **Step 2: Aggiungere lo stato `success` e l'handler Sfoglia**

In `RestoreDialog.tsx`, dopo `const [error, setError] = useState<string | null>(null)` (riga 16) aggiungere:

```tsx
  const [success, setSuccess] = useState(false)
```

E una funzione (vicino a `handleSubmit`):

```tsx
  async function handleSfoglia(): Promise<void> {
    setError(null)
    try {
      const res = await window.api.dialog.showOpenDialog({
        filters: [{ name: 'GymManager Backup', extensions: ['db'] }]
      })
      if (!res.canceled && res.filePaths[0]) {
        setBackupPath(res.filePaths[0])
      }
    } catch {
      setError(t('backup.ripristina_errore'))
    }
  }
```

- [ ] **Step 3: Impostare `success` dopo il ripristino**

In `handleSubmit`, sostituire `handleClose()` (riga 42) dentro il `try` con:

```tsx
      setSuccess(true)
      setTimeout(() => {
        if ('restart' in window.api.app) {
          void (window.api.app as { restart?: () => void }).restart?.()
        } else {
          window.location.reload()
        }
      }, 2000)
```

> Mirror del pattern di `ResetPasswordDialog.tsx:59-67`. Dopo il ripristino il DB su disco è sostituito: la sessione DB del renderer è stantia, serve un reload/riavvio.

- [ ] **Step 4: Azzerare `success` alla chiusura**

In `handleClose` (la funzione che resetta lo stato e chiama `onClose()`), aggiungere `setSuccess(false)` insieme agli altri reset.

- [ ] **Step 5: Sostituire l'input testo con campo read-only + Sfoglia, e mostrare il banner success**

Sostituire il blocco `<input type="text">` (76-84) con:

```tsx
            <div className="flex gap-2">
              <input
                id="restore-path"
                type="text"
                value={backupPath}
                readOnly
                placeholder={t('backup.ripristina_percorso_placeholder')}
                className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => void handleSfoglia()}
                disabled={isLoading}
                className="shrink-0 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('backup.ripristina_sfoglia')}
              </button>
            </div>
```

Poi, all'inizio del corpo del form (subito dentro il contenitore del contenuto, prima dei campi), avvolgere la UI esistente in un ramo che mostra il banner di successo. Individuare il `return` del componente e, in cima al contenuto, aggiungere:

```tsx
      {success ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400"
        >
          {t('backup.ripristina_completato')}
        </div>
      ) : (
        <>
          {/* ⬇️ qui rientra TUTTO il contenuto attuale del form (campi, avviso, pulsanti, errore) */}
        </>
      )}
```

> Spostare il markup esistente del form dentro il ramo `else`. Mantenere il blocco `{error !== null && …}` esistente (107-114) dentro l'`else`.

- [ ] **Step 6: Verifica typecheck + lint**

Run: `npm run typecheck && npx eslint src --ext .ts,.tsx --max-warnings 0`
Expected: pulito.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/backup/RestoreDialog.tsx src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(backup): file picker 'Sfoglia…' e conferma di successo nel ripristino (C6/C13)"
```

---

## Cluster D — Emissione ricevuta: indirizzo + intestatario + conferma (B6/C9)

### Task 7: Helper renderer puri — intestatario e indirizzo

**Files:**
- Modify: `src/renderer/src/utils/dominio.ts`
- Test: `tests/unit/dominio-renderer.test.ts` (create)

> `utils/dominio.ts` contiene già `isMinorenne` (puro, niente React/DOM): è importabile in Vitest node env.

- [ ] **Step 1: Scrivere il test che fallisce**

Create `tests/unit/dominio-renderer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  calcolaIntestatario,
  indirizzoIntestatarioCompleto
} from '../../src/renderer/src/utils/dominio'
import type { ClienteRow } from '../../src/renderer/src/types/api'

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

  it('per un minore con tutore controlla l\'indirizzo del tutore (come scritto da creaRicevuta)', () => {
    const minoreConTutoreSenzaIndirizzo = baseCliente({
      data_nascita: '2015-01-01',
      tutore_cf: 'VRDNNA80A41F205X',
      tutore_nome: 'Anna',
      tutore_cognome: 'Verdi'
    })
    expect(indirizzoIntestatarioCompleto(minoreConTutoreSenzaIndirizzo)).toBe(false)

    minoreConTutoreSenzaIndirizzo.tutore_via = 'Via Po'
    minoreConTutoreSenzaIndirizzo.tutore_citta = 'Torino'
    minoreConTutoreSenzaIndirizzo.tutore_cap = '10100'
    expect(indirizzoIntestatarioCompleto(minoreConTutoreSenzaIndirizzo)).toBe(true)
  })
})
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `npx vitest run tests/unit/dominio-renderer.test.ts`
Expected: FAIL — funzioni non esportate.

- [ ] **Step 3: Implementare gli helper**

In `src/renderer/src/utils/dominio.ts`, aggiungere in fondo (il file esporta già `isMinorenne`; usarlo):

```ts
import type { ClienteRow } from '../types/api'

export interface IntestatarioCalcolato {
  nome: string
  cognome: string
  cf: string
  /** CF del minore assistito; valorizzato solo quando l'intestatario è il tutore. */
  assistitoCf: string | null
  /** true se il cliente è minorenne e ha un tutore (intestatario = tutore). */
  isTutore: boolean
}

/** Replica lato renderer della logica intestatario di creaRicevuta (receipts-repository.ts). */
export function calcolaIntestatario(cliente: ClienteRow): IntestatarioCalcolato {
  const haTutore = Boolean(cliente.tutore_cf) && isMinorenne(cliente.data_nascita)
  if (haTutore) {
    return {
      nome: cliente.tutore_nome ?? '',
      cognome: cliente.tutore_cognome ?? '',
      cf: cliente.tutore_cf ?? '',
      assistitoCf: cliente.codice_fiscale,
      isTutore: true
    }
  }
  return {
    nome: cliente.nome,
    cognome: cliente.cognome,
    cf: cliente.codice_fiscale,
    assistitoCf: null,
    isTutore: false
  }
}

/**
 * true se l'indirizzo che finirà sulla ricevuta (via + città + cap) è completo.
 * Controlla gli stessi campi che creaRicevuta scrive come intestatario:
 * tutore_* quando il cliente è minore con tutore, altrimenti i campi del cliente.
 * (NB: l'allineamento alla spec «ricevuta al tutore usa l'indirizzo del minore» è B7, fuori scope.)
 */
export function indirizzoIntestatarioCompleto(cliente: ClienteRow): boolean {
  const haTutore = Boolean(cliente.tutore_cf) && isMinorenne(cliente.data_nascita)
  const via = haTutore ? cliente.tutore_via : cliente.via
  const citta = haTutore ? cliente.tutore_citta : cliente.citta
  const cap = haTutore ? cliente.tutore_cap : cliente.cap
  return Boolean(via?.trim() && citta?.trim() && cap?.trim())
}
```

> `ClienteRow` è dichiarata come global ambient in `api.d.ts`. Se l'import `from '../types/api'` non risolve in Vitest, usare il riferimento globale già in uso nel renderer (verificare come `isMinorenne` o altri util tipizzano `ClienteRow`); in caso, definire il tipo via `import type { ClienteRow } from '../types/api'` con un file `api.d.ts` che esporta. Adattare al pattern esistente del repo senza introdurre `any`.

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `npx vitest run tests/unit/dominio-renderer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/utils/dominio.ts tests/unit/dominio-renderer.test.ts
git commit -m "feat(ricevute): helper renderer calcolaIntestatario + indirizzoIntestatarioCompleto (B6/C9)"
```

---

### Task 8: `EmittiRicevutaForm` + `ClientDetail` — prop cliente, header intestatario, blocco indirizzo

**Files:**
- Modify: `src/renderer/src/components/clients/ClientDetail.tsx` (modal, ~1147-1159)
- Modify: `src/renderer/src/components/receipts/EmittiRicevutaForm.tsx`
- Modify: `src/renderer/src/i18n/locales/it.json` e `en.json` (namespace `ricevute.form`)

- [ ] **Step 1: Aggiungere le chiavi i18n**

In `it.json`, namespace `ricevute.form`:

```json
    "intestatario": "Intestatario",
    "tutore_di": "Tutore di {{cf}}",
    "indirizzo_mancante": "Completa l'indirizzo dell'intestatario nella scheda cliente prima di emettere la ricevuta.",
    "emessa_ok": "Ricevuta {{numero}} emessa.",
    "visualizza_pdf": "Visualizza PDF",
    "chiudi": "Chiudi"
```

In `en.json`:

```json
    "intestatario": "Recipient",
    "tutore_di": "Guardian of {{cf}}",
    "indirizzo_mancante": "Complete the recipient's address in the client profile before issuing the receipt.",
    "emessa_ok": "Receipt {{numero}} issued.",
    "visualizza_pdf": "View PDF",
    "chiudi": "Close"
```

- [ ] **Step 2: Passare `cliente` al form da `ClientDetail`**

In `ClientDetail.tsx`, il modal (1147-1159) va reso condizionale alla presenza di `cliente` (stato `ClienteRow | null`) e gli passa `cliente`:

```tsx
      {cliente && (
        <Modal
          isOpen={showEmittiRicevuta}
          onClose={() => setShowEmittiRicevuta(false)}
          title={t('ricevute.form.titolo')}
          maxWidth="max-w-2xl"
        >
          <EmittiRicevutaForm
            clienteId={clienteId}
            cliente={cliente}
            onSuccess={handleRicevutaCreata}
            onCancel={() => setShowEmittiRicevuta(false)}
          />
        </Modal>
      )}
```

- [ ] **Step 3: Aggiornare props e import in `EmittiRicevutaForm`**

Sostituire l'interfaccia props (10-14):

```tsx
interface EmittiRicevutaFormProps {
  clienteId: number
  cliente: ClienteRow
  onSuccess: (ricevuta: RicevutaConRighe) => void
  onCancel: () => void
}
```

Aggiungere `cliente` ai parametri destrutturati del componente. Aggiungere gli import in cima al file:

```tsx
import { calcolaIntestatario, indirizzoIntestatarioCompleto } from '../../utils/dominio'
import { apriPdfBase64 } from '../../utils/pdf'
```

(`ClienteRow` è globale ambient; se il file importa già altri tipi, seguire lo stesso schema.)

- [ ] **Step 4: Calcolare intestatario/indirizzo e stato success**

Dentro il componente, dopo gli `useState` esistenti (riga ~69) aggiungere:

```tsx
  const intestatario = calcolaIntestatario(cliente)
  const indirizzoOk = indirizzoIntestatarioCompleto(cliente)
  const [ricevutaEmessa, setRicevutaEmessa] = useState<RicevutaConRighe | null>(null)
  const [pdfError, setPdfError] = useState(false)
```

- [ ] **Step 5: Bloccare il submit se l'indirizzo manca, e passare a success al salvataggio**

In `handleSubmit`, all'inizio (dopo `if (!validate()) return`), aggiungere:

```tsx
    if (!indirizzoOk) {
      setValidationError(t('ricevute.form.indirizzo_mancante'))
      return
    }
```

E sostituire `onSuccess(ricevuta)` (in fondo al `try`) con:

```tsx
      setRicevutaEmessa(ricevuta)
```

> Il modale resta aperto sulla schermata di conferma; `onSuccess` (che aggiorna la lista) viene chiamato alla chiusura — Step 7.

- [ ] **Step 6: Header intestatario in cima al form**

Subito dopo l'apertura del `<form …>` (prima dei campi), inserire:

```tsx
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
          <span className="text-gray-500 dark:text-gray-400">{t('ricevute.form.intestatario')}: </span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {intestatario.nome} {intestatario.cognome}
          </span>
          {intestatario.isTutore && intestatario.assistitoCf && (
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              {t('ricevute.form.tutore_di', { cf: intestatario.assistitoCf })}
            </span>
          )}
          {!indirizzoOk && (
            <p role="alert" className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              {t('ricevute.form.indirizzo_mancante')}
            </p>
          )}
        </div>
```

- [ ] **Step 7: Schermata di conferma (success) con numero + Visualizza PDF**

All'inizio del corpo renderizzato (prima del check `submitState === 'loading'`), aggiungere il ramo success:

```tsx
  if (ricevutaEmessa) {
    const numeroFmt = `${ricevutaEmessa.anno}-${ricevutaEmessa.numero}`
    async function handleVisualizza(): Promise<void> {
      setPdfError(false)
      try {
        const base64 = await window.api.pdf.genera({ ricevutaId: ricevutaEmessa!.id })
        apriPdfBase64(base64)
      } catch {
        setPdfError(true)
      }
    }
    return (
      <div className="space-y-5">
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400"
        >
          {t('ricevute.form.emessa_ok', { numero: numeroFmt })}
        </div>
        {pdfError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {t('ricevute.errore_caricamento')}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => void handleVisualizza()}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
          >
            {t('ricevute.form.visualizza_pdf')}
          </button>
          <button
            type="button"
            onClick={() => onSuccess(ricevutaEmessa)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
          >
            {t('ricevute.form.chiudi')}
          </button>
        </div>
      </div>
    )
  }
```

> Alla chiusura `onSuccess(ricevutaEmessa)` esegue il comportamento esistente in `ClientDetail.handleRicevutaCreata` (chiude il modale + prepende alla lista).

- [ ] **Step 8: Verifica typecheck + lint**

Run: `npm run typecheck && npx eslint src --ext .ts,.tsx --max-warnings 0`
Expected: pulito.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/receipts/EmittiRicevutaForm.tsx src/renderer/src/components/clients/ClientDetail.tsx src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(ricevute): intestatario in testa, blocco se indirizzo mancante, conferma con numero+PDF (B6/C9)"
```

---

### Task 9: Util `apriPdfBase64` (DRY per la conferma ricevuta)

**Files:**
- Create: `src/renderer/src/utils/pdf.ts`

> Estrae il pattern duplicato (oggi presente in `ClientDetail.tsx:273-280` e `ReceiptsPage.tsx:19-24`) per il nuovo codice della conferma ricevuta. NON si rifattorizzano le 2 occorrenze esistenti (fuori scope).

- [ ] **Step 1: Creare il file**

Create `src/renderer/src/utils/pdf.ts`:

```ts
/** Apre un PDF (stringa base64) in una nuova finestra del browser. */
export function apriPdfBase64(base64: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}
```

- [ ] **Step 2: Verifica typecheck**

Run: `npm run typecheck`
Expected: nessun errore (l'import in Task 8 risolve).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/utils/pdf.ts
git commit -m "chore(ricevute): util apriPdfBase64 condivisa per il nuovo flusso di conferma"
```

> Questo task può essere eseguito **prima** di Task 8 Step 3 (l'import dipende da esso). Se si esegue subagent-driven, ordinare: Task 7 → Task 9 → Task 8.

---

## Gate finale

### Task 10: `npm run verify` verde

- [ ] **Step 1: Eseguire il verify completo**

Run: `npm run verify`
Expected: typecheck OK · lint 0 warning · tutti i test passati (i ~314 esistenti + i nuovi di Task 1/4/7) · build OK.

- [ ] **Step 2: Se rosso**, correggere e ripetere finché verde. Non procedere oltre senza verde.

### Task 11: Verifica manuale dei 4 flussi (descrizione)

In `npm run dev`:
- [ ] Catalogo: un tipo **assegnato** mostra "Elimina" disabilitato col tooltip "assegnato a N clienti"; "Invalida" resta attivo. Un tipo **non assegnato** è eliminabile. (Se in qualche modo l'elimina di un assegnato venisse tentato, il dialog mostra il banner rosso e resta aperto.)
- [ ] Impostazioni: cambio colore primario → header/bottoni cambiano subito.
- [ ] Backup → Ripristina: "Sfoglia…" apre il dialog nativo `.db`; dopo il ripristino compare il banner verde e l'app si riavvia.
- [ ] Scheda cliente → Emetti ricevuta: header con intestatario (e "Tutore di …" per i minori); se l'indirizzo manca, il submit è bloccato con avviso; al salvataggio, conferma con `AAAA-N` e "Visualizza PDF".

### Task 12: Aggiornare documentazione

**Files:**
- Modify: `ANALYSYS.md`
- Modify: `OPEN-QUESTIONS.md`

- [ ] **Step 1:** In `ANALYSYS.md`, nella riga di stato finale (intorno a 583/645), aggiungere: **WP4 chiuso il 2026-06-11:** B5/C2/C3 (Elimina disabilitato + feedback errore), N5 (scala colore 50–900), C6 + conferma restore, B6/C9 (intestatario + indirizzo + conferma ricevuta) risolti e verificati; `npm run verify` verde. Aggiornare la cella corrispondente della tabella stato (B5, C2, C3, C6, B6, C9, N5 → ✅ RISOLTO).

- [ ] **Step 2:** In `OPEN-QUESTIONS.md`, registrare la nota B7: «La verifica indirizzo all'emissione (WP4/B6) controlla i campi che `creaRicevuta` scrive come intestatario (tutore_* per i minori con tutore). La spec FUNZIONALITA.md:13 chiede che la ricevuta al tutore usi l'indirizzo del minore: allineamento rinviato a B7 (form indirizzo tutore + logica creaRicevuta).»

- [ ] **Step 3: Commit**

```bash
git add ANALYSYS.md OPEN-QUESTIONS.md
git commit -m "docs: chiusura WP4 (B5/C2/C3, N5, C6, B6/C9) + nota B7 in OPEN-QUESTIONS"
```

---

## Self-Review (eseguito in fase di scrittura)

- **Spec coverage:** B5/C2/C3 → Task 1-3; N5 → Task 4; C6 + C13-restore → Task 5-6; B6 + C9 → Task 7-9. Gate → Task 10-12. Item C7/C8/C10/C11/C12/C13-residui/B7/B12 esplicitamente rinviati (sezione Scope).
- **Placeholder scan:** ogni step di codice contiene codice completo; i punti che richiedono adattamento alla firma reale (es. `createTipoAbbonamento`, `BrowserWindow.fromWebContents` nullable, risoluzione di `ClienteRow` in Vitest, posizione esatta del prop `tipo` nelle righe del catalogo) sono marcati con istruzione esplicita di **leggere** il codice installato e non inventare.
- **Type consistency:** `assegnati_count: number` aggiunto in entrambe le copie dei tipi; `IntestatarioCalcolato` con campi `nome/cognome/cf/assistitoCf/isTutore` usati coerentemente in helper, test e UI; `scalaPrimaria` ritorna `Record<number,string> | null` usato da `applyPrimaryColor` e dai test; `dialog.showOpenDialog` con la stessa firma in handler/preload/`ElectronAPI`.
