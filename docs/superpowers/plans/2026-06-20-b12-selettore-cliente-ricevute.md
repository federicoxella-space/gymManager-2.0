# Selettore cliente nella pagina Ricevute (B12 #3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere un selettore cliente con ricerca alla pagina Ricevute; selezionando un cliente la lista mostra solo le sue ricevute (filtro `clienteId`, già supportato dal backend).

**Architecture:** Solo UI + i18n. `ReceiptsPage` ottiene un autocomplete cliente (pattern della ricerca tutore in `ClientForm`) che imposta `filtroClienteId`, passato a `ricevute.list({ clienteId })`. Backend invariato (`listRicevute` filtra già per `clienteId`); aggiunto un test di regressione.

**Tech Stack:** React + Tailwind, TypeScript strict, i18next (IT/EN), Vitest.

**Riferimenti:** spec `docs/superpowers/specs/2026-06-20-b12-selettore-cliente-ricevute-design.md`; pattern in `ClientForm.tsx:182-199` (ricerca) e `:484-545` (render); invarianti `CLAUDE.md`.

---

## File Structure

- `tests/unit/receipts-invariants.test.ts` — test di regressione `listRicevute({ clienteId })`.
- `src/renderer/src/i18n/locales/it.json` + `en.json` — stringhe filtro cliente.
- `src/renderer/src/pages/ReceiptsPage.tsx` — selettore cliente.
- `ANALYSYS.md` / `OPEN-QUESTIONS.md` — chiusura B12.

---

### Task 1: Test di regressione `listRicevute({ clienteId })`

**Files:** `tests/unit/receipts-invariants.test.ts`

- [ ] **Step 1: Aggiungi il test**

Nel file `tests/unit/receipts-invariants.test.ts` esistono già: il setup DB (`beforeEach`, accessibile via la stessa variabile usata dagli altri test — verifica come gli altri test ottengono `db`, es. `const db = _testDb!`), e gli helper `creaCliente(db, cf, opts)` (ritorna id) e `buildInput(clienteId, opts)` + `creaRicevuta(input)` + `listRicevute(filters)`. Aggiungi un nuovo `describe` in fondo:

```typescript
describe('listRicevute — filtro clienteId (B12)', () => {
  it('ritorna solo le ricevute del cliente indicato', () => {
    const db = _testDb!
    const c1 = creaCliente(db, 'AAAAAA80A01H501A')
    const c2 = creaCliente(db, 'BBBBBB80A01H501B')
    creaRicevuta(buildInput(c1, { dataEmissione: '2026-03-01' }))
    creaRicevuta(buildInput(c1, { dataEmissione: '2026-04-01' }))
    creaRicevuta(buildInput(c2, { dataEmissione: '2026-03-15' }))

    const soloC1 = listRicevute({ clienteId: c1 })
    expect(soloC1.length).toBe(2)
    expect(soloC1.every((r) => r.cliente_id === c1)).toBe(true)

    const soloC2 = listRicevute({ clienteId: c2 })
    expect(soloC2.length).toBe(1)
    expect(soloC2[0].cliente_id).toBe(c2)
  })

  it('combina clienteId e anno', () => {
    const db = _testDb!
    const c1 = creaCliente(db, 'AAAAAA80A01H501A')
    creaRicevuta(buildInput(c1, { dataEmissione: '2025-12-01' }))
    creaRicevuta(buildInput(c1, { dataEmissione: '2026-01-01' }))

    const r2026 = listRicevute({ clienteId: c1, anno: 2026 })
    expect(r2026.length).toBe(1)
    expect(r2026[0].anno).toBe(2026)
  })
})
```
> Adatta i nomi/parametri degli helper a quelli realmente presenti nel file (leggi `creaCliente`, `buildInput`, `listRicevute` e come gli altri test ottengono `db`). Usa CF a 16 caratteri univoci. `RicevutaRow` espone `cliente_id` e `anno`.

- [ ] **Step 2: Esegui i test**

Run: `npx vitest run tests/unit/receipts-invariants.test.ts -t "filtro clienteId"`
Expected: PASS (il backend supporta già `clienteId`). Se fallisse, NON modificare il backend senza verificare: leggi `listRicevute` (`receipts-repository.ts:289-292`) e correggi il test per allinearlo al comportamento reale.

- [ ] **Step 3: Esegui l'intera suite del file**

Run: `npx vitest run tests/unit/receipts-invariants.test.ts` → tutti verdi.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/receipts-invariants.test.ts
git commit -m "test(ricevute): regressione filtro listRicevute clienteId (B12)"
```

---

### Task 2: i18n stringhe filtro cliente

**Files:** `src/renderer/src/i18n/locales/it.json`, `en.json`

- [ ] **Step 1: Aggiungi le chiavi IT**

In `it.json`, dentro l'oggetto `ricevute.filtri` (dove ci sono `anno`, `stato`, `cerca`, ecc.), aggiungi:
```json
    "cliente": "Cliente",
    "cliente_cerca": "Cerca cliente…",
    "cliente_rimuovi": "Rimuovi filtro cliente"
```

- [ ] **Step 2: Aggiungi le chiavi EN**

In `en.json`, dentro `ricevute.filtri`:
```json
    "cliente": "Client",
    "cliente_cerca": "Search client…",
    "cliente_rimuovi": "Clear client filter"
```

- [ ] **Step 3: Verifica parità chiavi**

Run:
```
node -e "const it=require('./src/renderer/src/i18n/locales/it.json');const en=require('./src/renderer/src/i18n/locales/en.json');const f=o=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?f(v).map(s=>k+'.'+s):[k]);const a=new Set(f(it)),b=new Set(f(en));const only=(x,y)=>[...x].filter(k=>!y.has(k));console.log('solo IT:',only(a,b));console.log('solo EN:',only(b,a));"
```
Expected: `solo IT: []` e `solo EN: []`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(i18n): stringhe filtro cliente Ricevute (B12)"
```

---

### Task 3: UI — selettore cliente in ReceiptsPage

**Files:** `src/renderer/src/pages/ReceiptsPage.tsx`

- [ ] **Step 1: Import del tipo `ClienteRow`**

Verifica che `ClienteRow` sia importato dai tipi in `ReceiptsPage.tsx` (insieme a `RicevutaRow`/`RicevutaFilters`). Se manca, aggiungilo all'import esistente dei tipi.

- [ ] **Step 2: Stato del selettore**

Dopo `const [filtroSearch, setFiltroSearch] = useState('')` (~riga 58), aggiungi:
```typescript
  const [filtroClienteId, setFiltroClienteId] = useState<number | null>(null)
  const [clienteSelezionato, setClienteSelezionato] = useState<ClienteRow | null>(null)
  const [clienteQuery, setClienteQuery] = useState('')
  const [clienteRisultati, setClienteRisultati] = useState<ClienteRow[]>([])
```

- [ ] **Step 3: Ricerca clienti (autocomplete)**

Aggiungi un `useEffect` (vicino agli altri, dopo il blocco di caricamento anni):
```typescript
  useEffect(() => {
    if (clienteQuery.trim().length < 2) {
      setClienteRisultati([])
      return
    }
    void window.api.clienti
      .list({ search: clienteQuery.trim(), stato: 'attivo' })
      .then((risultati) => setClienteRisultati(risultati))
      .catch(() => setClienteRisultati([]))
  }, [clienteQuery])
```

- [ ] **Step 4: Passa `clienteId` al caricamento ricevute**

In `loadRicevute` (~riga 85), aggiungi `clienteId` al filtro e alle dipendenze del `useCallback`:
```typescript
  const loadRicevute = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setLoadError(false)
    try {
      const data = await window.api.ricevute.list({
        anno: filtroAnno,
        stato: filtroStato || undefined,
        clienteId: filtroClienteId ?? undefined,
      })
      setRicevute(data)
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }, [filtroAnno, filtroStato, filtroClienteId])
```

- [ ] **Step 5: Handler selezione/rimozione**

Aggiungi (vicino agli altri handler del componente):
```typescript
  function selezionaCliente(c: ClienteRow): void {
    setFiltroClienteId(c.id)
    setClienteSelezionato(c)
    setClienteQuery('')
    setClienteRisultati([])
  }

  function rimuoviCliente(): void {
    setFiltroClienteId(null)
    setClienteSelezionato(null)
    setClienteQuery('')
    setClienteRisultati([])
  }
```

- [ ] **Step 6: Render del selettore nella barra filtri**

Nella barra filtri, dopo il blocco "Filtro stato pagamento" (`</div>` che chiude il blocco con id `ricevute-filtro-pagamento`, ~riga 222) e prima del blocco "Ricerca", inserisci:
```tsx
        {/* Filtro cliente */}
        <div className="relative min-w-[200px]">
          <label
            htmlFor="ricevute-filtro-cliente"
            className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
          >
            {t('ricevute.filtri.cliente')}
          </label>
          {clienteSelezionato ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
              <span className="truncate">
                {clienteSelezionato.cognome} {clienteSelezionato.nome}
              </span>
              <button
                type="button"
                onClick={rimuoviCliente}
                aria-label={t('ricevute.filtri.cliente_rimuovi')}
                className="shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
              >
                ✕
              </button>
            </div>
          ) : (
            <>
              <input
                id="ricevute-filtro-cliente"
                type="search"
                value={clienteQuery}
                onChange={(e) => setClienteQuery(e.target.value)}
                placeholder={t('ricevute.filtri.cliente_cerca')}
                className="px-3 py-2 text-sm rounded-lg border w-full border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {clienteRisultati.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                  {clienteRisultati.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => selezionaCliente(c)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-gray-700"
                      >
                        {c.cognome} {c.nome}
                        {c.codice_fiscale ? ` · ${c.codice_fiscale}` : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
```

- [ ] **Step 7: Verifica**

Run: `npm run typecheck` → nessun errore (verifica che `ClienteRow`, `window.api.clienti.list`, e `clienteId` su `RicevutaFilters` siano tipizzati).
Run: `npm run lint` → 0 warning.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/pages/ReceiptsPage.tsx
git commit -m "feat(ricevute): selettore cliente con ricerca nella barra filtri (B12)"
```

---

### Task 4: Docs + verify finale

**Files:** `ANALYSYS.md`, `OPEN-QUESTIONS.md`

- [ ] **Step 1: Chiudi B12 in ANALYSYS.md**

Nella voce `### B12` (~riga 302), aggiungi in coda:
```markdown
- **Stato (2026-06-20):** **Chiuso.** #1 ricerca catalogo, #2 modifica date abbonamento (WP4b), #4 stringhe `'mese'/'mesi'` (WP5), #5 euristica CF (documentata) già chiusi; #3 selettore cliente Ricevute implementato (autocomplete che imposta il filtro `clienteId`, già supportato da `listRicevute`). Vedi `docs/superpowers/specs/2026-06-20-b12-selettore-cliente-ricevute-design.md`.
```

- [ ] **Step 2: Aggiorna la voce in OPEN-QUESTIONS.md**

Trova la voce `**[Aperta]** WP4b/B12 — Filtro cliente dedicato nella pagina Ricevute: ...` e cambiala in **[Chiusa]**, aggiungendo in coda:
```markdown
 — **Chiusa (B12, 2026-06-20):** implementato un selettore cliente con ricerca (autocomplete) nella barra filtri di `ReceiptsPage`, che imposta il filtro `clienteId` di `listRicevute`. La ricerca testuale resta come filtro complementare.
```

- [ ] **Step 3: `npm run verify` finale**

Run: `npm run verify`
Expected: typecheck OK · lint 0 warning · test verdi (inclusi i nuovi test clienteId) · build OK. Se fallisce, NON committare: riporta l'output.

- [ ] **Step 4: Commit**

```bash
git add ANALYSYS.md OPEN-QUESTIONS.md
git commit -m "docs(b12): chiusura selettore cliente Ricevute"
```

---

## Self-Review

- **Spec coverage:** selettore cliente con ricerca → imposta `clienteId` (Task 3) ✓; backend già pronto + test di regressione (Task 1) ✓; i18n IT/EN (Task 2) ✓; rimozione filtro (Task 3 Step 5/6) ✓; coesistenza con ricerca testuale (loadRicevute backend + filtro client-side invariato) ✓; docs/chiusura B12 (Task 4) ✓.
- **Placeholder scan:** nessun TBD; ogni step ha codice o comando. Promemoria di verifica: nomi esatti degli helper nel test ricevute (Task 1) e presenza dell'import `ClienteRow` (Task 3 Step 1) vanno confermati leggendo i file.
- **Type consistency:** `filtroClienteId: number | null` → passato come `clienteId: filtroClienteId ?? undefined` a `RicevutaFilters` (campo `clienteId?: number` già esistente); `clienteSelezionato: ClienteRow | null` e `clienteRisultati: ClienteRow[]` usano `ClienteRow`; `window.api.clienti.list({ search, stato })` come nel pattern tutore; `listRicevute({ clienteId, anno })` usato nei test coerente con `RicevutaFilters`.
