# Card incassi degli Indicatori "del periodo" (B10) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La card "Incassi" degli Indicatori segue il selettore di periodo della dashboard (mostra il pagato `data_emissione` nel periodo), coerente col widget Incassi.

**Architecture:** `getIndicatori` riceve il range `{dal, al}` e filtra `incassi_pagati` per periodo (stessa definizione di `getIncassiPeriodo.totale_pagato`); il range viaggia via IPC `dashboard:indicatori` → preload → tipi → `DashboardPage` (che già lo calcola). Nessuna modifica a `IncassiWidget`/`getIncassiPeriodo` né alla UI di `IndicatoriWidget`.

**Tech Stack:** Electron (main/preload/renderer), TypeScript strict, React, better-sqlite3, Vitest.

**Riferimenti:** spec `docs/superpowers/specs/2026-06-16-b10-incassi-periodo-design.md`; invarianti in `CLAUDE.md` (no `any`, IPC via preload, `npm run verify` verde).

---

## File Structure

- `src/main/db/dashboard-repository.ts` — firma `getIndicatori` (+ `dal`, `al`) e query `incassi_pagati` filtrata per periodo.
- `src/main/ipc/handlers.ts` — handler `dashboard:indicatori` accetta/inoltra `dal`/`al` (~riga 785).
- `src/preload/index.ts` — tipo params `dashboard.indicatori` (+ `dal`/`al`, ~riga 209).
- `src/types/shared.ts:515` + `src/renderer/src/types/api.d.ts:422` — tipo `ElectronAPI.dashboard.indicatori` (+ `dal`/`al`).
- `src/renderer/src/pages/DashboardPage.tsx` — la chiamata passa `dal`/`al` (~riga 74).
- `tests/unit/dashboard.test.ts` — aggiornamento chiamate + nuovo test periodo.
- `ANALYSYS.md` — chiusura B10.

---

### Task 1: `incassi_pagati` del periodo (backend + plumbing + test)

Questo è un cambio di firma trasversale: si fa in un'unica task per non lasciare stati intermedi rotti. Alla fine `npm run verify` deve essere verde.

**Files:** tutti quelli sopra tranne `ANALYSYS.md`.

- [ ] **Step 1: Scrivi il test di periodo (TDD)**

In `tests/unit/dashboard.test.ts`, dentro il `describe` che contiene "incassi_pagati somma le ricevute emesse e pagate" (subito dopo quel test, ~riga 303), aggiungi:

```typescript
  it('incassi_pagati conta solo le ricevute pagate nel periodo selezionato', () => {
    const db = _testDb!
    const c1 = creaCliente(db, 'AAABBB80A01H501Z')
    // dentro il periodo marzo 2026
    creaRicevuta(db, c1, { totale: 100, stato: 'emessa', statoPagamento: 'pagato', dataEmissione: '2026-03-10' })
    // fuori dal periodo (febbraio)
    creaRicevuta(db, c1, { totale: 999, stato: 'emessa', statoPagamento: 'pagato', dataEmissione: '2026-02-10' })

    const result = getIndicatori('2026-03-15', 30, 30, 30, '2026-03-01', '2026-03-31')
    expect(result.incassi_pagati).toBe(100)
  })
```

- [ ] **Step 2: Esegui, verifica FAIL**

Run: `npx vitest run tests/unit/dashboard.test.ts -t "nel periodo selezionato"`
Expected: FAIL — l'implementazione attuale ignora `dal`/`al` (i parametri extra sono scartati a runtime) e somma anche la ricevuta di febbraio → `incassi_pagati` = 1099, non 100.

- [ ] **Step 3: Estendi la firma e la query di `getIndicatori`**

In `src/main/db/dashboard-repository.ts`:
- Firma:
```typescript
export function getIndicatori(
  oggi: string,
  giorniPreavvisoCert: number,
  giorniPreavvisoIsc: number,
  giorniPreavvisoAbb: number,
  dal: string,
  al: string,
): WidgetIndicatori {
```
- Sostituisci la query `incassi_pagati` (attualmente somma tutte le ricevute pagate, ~righe 134-142) con la versione filtrata per periodo (stessa semantica di `getIncassiPeriodo.totale_pagato`):
```typescript
  // incassi_pagati: ricevute emesse e pagate con data_emissione nel periodo selezionato
  const incassiPagatiRow = db
    .prepare(
      `SELECT COALESCE(SUM(totale), 0) AS totale
       FROM ricevute
       WHERE stato = 'emessa'
         AND stato_pagamento = 'pagato'
         AND data_emissione BETWEEN :dal AND :al`
    )
    .get({ dal, al }) as { totale: number }
```
- Lascia **invariato** `incassi_da_incassare` (resta calcolato sulle associazioni attive `da_incassare`; non è mostrato nella card). Aggiorna il commento JSDoc di `getIndicatori` per indicare che `incassi_pagati` è "del periodo [dal, al]".

- [ ] **Step 4: Aggiorna le chiamate esistenti a `getIndicatori` nei test**

In `tests/unit/dashboard.test.ts` ci sono chiamate `getIndicatori('2026-06-05', 30, 30, 30)` (e una con `oggi` variabile ~riga 614). Aggiungi a OGNI chiamata il range:
- Per i test **non** legati agli incassi: passa un range ampio che copra qualsiasi data usata, es. `, '2000-01-01', '2100-12-31'`.
- Per il test esistente "incassi_pagati somma le ricevute emesse e pagate" (~riga 301): le due ricevute pagate usano la `dataEmissione` di default `'2026-01-01'`; passa un range che le copra, es. `getIndicatori('2026-06-05', 30, 30, 30, '2026-01-01', '2026-12-31')`. L'asserzione resta `toBe(150)`.
- Per il test "incassi_da_incassare ..." (~riga 289): il range non influisce su `incassi_da_incassare`; passa comunque `, '2000-01-01', '2100-12-31'` per soddisfare la firma.

Verifica di aver coperto tutte le occorrenze:
Run: `grep -n "getIndicatori(" tests/unit/dashboard.test.ts` → ogni riga di chiamata deve avere 6 argomenti.

- [ ] **Step 5: Aggiorna IPC handler, preload e tipi**

`src/main/ipc/handlers.ts` (handler `dashboard:indicatori`, ~riga 785):
```typescript
      {
        oggi,
        giorniCert,
        giorniIsc,
        giorniAbb,
        dal,
        al
      }: { oggi: string; giorniCert: number; giorniIsc: number; giorniAbb: number; dal: string; al: string }
    ): WidgetIndicatori => {
      try {
        return getIndicatori(oggi, giorniCert, giorniIsc, giorniAbb, dal, al)
```

`src/preload/index.ts` (`dashboard.indicatori`, ~riga 209): aggiungi `dal: string; al: string` al tipo dei `params` (mantieni `return ipcRenderer.invoke('dashboard:indicatori', params)`).

`src/types/shared.ts:515` e `src/renderer/src/types/api.d.ts:422` — `ElectronAPI.dashboard.indicatori`: estendi il tipo dei params con `dal: string; al: string`. Esempio (api.d.ts):
```typescript
    indicatori: (params: { oggi: string; giorniCert: number; giorniIsc: number; giorniAbb: number; dal: string; al: string }) => Promise<WidgetIndicatori>
```
(applica lo stesso in shared.ts, rispettando la formattazione multilinea già presente lì).

- [ ] **Step 6: Aggiorna la chiamata in DashboardPage**

`src/renderer/src/pages/DashboardPage.tsx` (~riga 74): il range è già disponibile come `apiPeriodo = { dal, al }` (riga 70). Cambia:
```typescript
      window.api.dashboard.indicatori({ oggi, giorniCert, giorniIsc, giorniAbb, dal: apiPeriodo.dal, al: apiPeriodo.al }),
```
Nessuna modifica a `IndicatoriWidget.tsx`.

- [ ] **Step 7: Verifica completa**

Run: `npx vitest run tests/unit/dashboard.test.ts` → tutti verdi (nuovo test + esistenti aggiornati).
Run: `npm run typecheck` → nessun errore.
Run: `npm run lint` → 0 warning.

- [ ] **Step 8: Commit**

```bash
git add src/main/db/dashboard-repository.ts src/main/ipc/handlers.ts src/preload/index.ts src/types/shared.ts src/renderer/src/types/api.d.ts src/renderer/src/pages/DashboardPage.tsx tests/unit/dashboard.test.ts
git commit -m "feat(dashboard): card incassi indicatori segue il periodo selezionato (B10)"
```

---

### Task 2: Docs + verify finale

**Files:** `ANALYSYS.md`

- [ ] **Step 1: Chiudi B10 in ANALYSYS.md**

Nella voce `### B10` (~riga 286), aggiungi in coda:
```markdown
- **Stato (2026-06-16):** **Chiuso.** `getIndicatori` riceve il range `{dal, al}` e calcola `incassi_pagati` sulle ricevute emesse e pagate con `data_emissione` nel periodo (stessa definizione di `getIncassiPeriodo.totale_pagato`); il range viaggia via IPC/preload/tipi e `DashboardPage` lo passa. La card "Incassi" ora segue il selettore e combacia col widget Incassi. `incassi_da_incassare` invariato. Vedi `docs/superpowers/specs/2026-06-16-b10-incassi-periodo-design.md`.
```

- [ ] **Step 2: `npm run verify` finale**

Run: `npm run verify`
Expected: typecheck OK · lint 0 warning · test verdi (incluso il nuovo test periodo) · build OK. Se fallisce, NON committare: riporta l'output.

- [ ] **Step 3: Commit**

```bash
git add ANALYSYS.md
git commit -m "docs(b10): chiusura card incassi del periodo"
```

---

## Self-Review

- **Spec coverage:** card period-aware via `getIndicatori(dal, al)` + query filtrata (Task 1, Step 3) ✓; plumbing IPC/preload/tipi/DashboardPage (Task 1, Step 5-6) ✓; `incassi_da_incassare` invariato ✓; nessuna modifica a IncassiWidget/getIncassiPeriodo ✓; test periodo (Task 1, Step 1) + aggiornamento chiamate (Step 4) ✓; docs (Task 2) ✓.
- **Placeholder scan:** nessun TBD; ogni step ha codice o comando concreto.
- **Type consistency:** `getIndicatori(..., dal: string, al: string)` con la stessa firma in repo, handler, e nelle chiamate di test; il tipo params `dashboard.indicatori` esteso con `dal`/`al` coerentemente in preload, `shared.ts` e `api.d.ts`; `DashboardPage` passa `apiPeriodo.dal/al`. La query `incassi_pagati` replica esattamente la semantica di `getIncassiPeriodo.totale_pagato` (`stato='emessa' AND stato_pagamento='pagato' AND data_emissione BETWEEN dal AND al`).
