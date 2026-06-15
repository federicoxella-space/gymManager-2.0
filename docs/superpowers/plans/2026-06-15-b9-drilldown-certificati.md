# Drill-down certificati dalla dashboard (B9) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cliccando la card "Certificati" della dashboard, la lista clienti mostra i certificati in scadenza **e** scaduti (filtro combinato `da_gestire`), e la card conta/etichetta coerentemente.

**Architecture:** Nuovo valore di filtro `da_gestire` in `listClienti` (`data_scadenza − oggi ≤ giorniPreavviso`); il drill-down (`Shell.tsx`) e la card (`IndicatoriWidget`, somma dei due conteggi già esistenti) puntano a quel set; opzione esposta anche nel dropdown di `ClientsPage`. Nessuna modifica al backend degli indicatori.

**Tech Stack:** Electron (main), React + Tailwind, TypeScript strict, i18next (IT/EN), better-sqlite3, Vitest.

**Riferimenti:** spec `docs/superpowers/specs/2026-06-15-b9-drilldown-certificati-design.md`; invarianti in `CLAUDE.md` (stringhe esternalizzate, no `any`, IT/EN parità, `npm run verify` verde).

---

## File Structure

- `src/main/db/clients-repository.ts` — nuovo ramo filtro `da_gestire` (~riga 183-197).
- `src/types/shared.ts` — `ClientiFilters['stato_certificato']` (+ `'da_gestire'`, riga 132).
- `src/renderer/src/types/api.d.ts` — mirror dello stesso tipo.
- `src/renderer/src/pages/ClientsPage.tsx` — tipo locale `StatoCertificatoFilter` (riga 12) + `<option>` nel dropdown (~riga 225).
- `src/renderer/src/pages/Shell.tsx` — drill-down `'certificato'` → `da_gestire` (riga 131-132).
- `src/renderer/src/components/dashboard/IndicatoriWidget.tsx` — value = somma, label nuova (righe 110-116).
- `src/renderer/src/i18n/locales/it.json` + `en.json` — relabel card + nuova chiave dropdown.
- `tests/unit/clients-repository.test.ts` — test del filtro `da_gestire`.
- `ANALYSYS.md` — chiusura B9.

---

### Task 1: Backend — filtro `da_gestire` in `listClienti`

**Files:**
- Modify: `src/types/shared.ts:132`; `src/renderer/src/types/api.d.ts` (mirror)
- Modify: `src/main/db/clients-repository.ts:183-197`
- Test: `tests/unit/clients-repository.test.ts`

- [ ] **Step 1: Scrivi il test**

In `tests/unit/clients-repository.test.ts`, dopo il blocco `describe('listClienti — filtro certificato in scadenza oggi (WP2: A11)', ...)` (termina ~riga 178), aggiungi:

```typescript
describe('listClienti — filtro certificato "da_gestire" (B9)', () => {
  it('include in scadenza E scaduti, esclude validi e senza certificato', () => {
    const db = _testDb!
    const inScad = creaCliente(db, 'AAAIN S80A01H501A'.replace(/\s/g, ''))
    const scaduto = creaCliente(db, 'AAASCA80A01H501B')
    const valido = creaCliente(db, 'AAAVAL80A01H501C')
    const senza = creaCliente(db, 'AAANES80A01H501D')

    // in scadenza: scade tra 10 giorni (entro finestra 30)
    db.prepare(
      `INSERT INTO certificati_medici (cliente_id, tipo, data_scadenza)
       VALUES (?, 'agonistico', date('now','+10 day'))`
    ).run(inScad)
    // scaduto: scaduto ieri
    db.prepare(
      `INSERT INTO certificati_medici (cliente_id, tipo, data_scadenza)
       VALUES (?, 'agonistico', date('now','-1 day'))`
    ).run(scaduto)
    // valido: scade tra 100 giorni (oltre finestra 30)
    db.prepare(
      `INSERT INTO certificati_medici (cliente_id, tipo, data_scadenza)
       VALUES (?, 'agonistico', date('now','+100 day'))`
    ).run(valido)
    // `senza` non ha certificati

    const daGestire = listClienti({ stato_certificato: 'da_gestire' }, 30).map((r) => r.id)

    expect(daGestire).toContain(inScad)
    expect(daGestire).toContain(scaduto)
    expect(daGestire).not.toContain(valido)
    expect(daGestire).not.toContain(senza)
  })

  it('rispetta la finestra di preavviso passata', () => {
    const db = _testDb!
    const c = creaCliente(db, 'AAAWIN80A01H501E')
    // scade tra 20 giorni
    db.prepare(
      `INSERT INTO certificati_medici (cliente_id, tipo, data_scadenza)
       VALUES (?, 'agonistico', date('now','+20 day'))`
    ).run(c)

    // finestra 10 → fuori (non ancora "da gestire")
    expect(listClienti({ stato_certificato: 'da_gestire' }, 10).map((r) => r.id)).not.toContain(c)
    // finestra 30 → dentro
    expect(listClienti({ stato_certificato: 'da_gestire' }, 30).map((r) => r.id)).toContain(c)
  })
})
```

> Nota: `creaCliente(db, cf)` e `_testDb` sono già definiti nel file; il CF deve essere una stringa di 16 caratteri valida per lo schema (nessun CHECK sul CF in questi test, ma mantieni 16 char alfanumerici). Correggi i CF di esempio se il primo (`AAAINS80A01H501A`) non è di 16 caratteri — usa CF a 16 caratteri coerenti.

- [ ] **Step 2: Esegui il test, verifica FAIL**

Run: `npx vitest run tests/unit/clients-repository.test.ts -t "da_gestire"`
Expected: i test falliscono — TypeScript rifiuta `stato_certificato: 'da_gestire'` (non nel tipo) e/o il filtro non restituisce gli scaduti.

- [ ] **Step 3: Estendi il tipo `ClientiFilters`**

In `src/types/shared.ts` riga 132:
```typescript
  stato_certificato?: 'valido' | 'in_scadenza' | 'scaduto' | 'da_gestire'
```
In `src/renderer/src/types/api.d.ts`, applica lo stesso cambio nel mirror di `ClientiFilters` (cerca `stato_certificato?:`).

- [ ] **Step 4: Aggiungi il ramo nel filtro**

In `src/main/db/clients-repository.ts`, nel blocco delle condizioni `stato_certificato` (dopo il ramo `'valido'`, ~riga 196), aggiungi un nuovo `else if`:
```typescript
  } else if (filters?.stato_certificato === 'da_gestire') {
    // In scadenza (0..giorni) + già scaduti (<0): tutto ciò che richiede rinnovo.
    extraWhere.push(
      `cm.data_scadenza IS NOT NULL AND julianday(cm.data_scadenza) - julianday(date('now')) <= ?`
    )
    extraParams.push(giorniPreavvisoCert)
  }
```
(Mantieni invariati i rami `'scaduto'`, `'in_scadenza'`, `'valido'`.)

- [ ] **Step 5: Esegui il test, verifica PASS**

Run: `npx vitest run tests/unit/clients-repository.test.ts -t "da_gestire"`
Expected: PASS (entrambi i test). Poi l'intera suite del file:
Run: `npx vitest run tests/unit/clients-repository.test.ts`
Expected: tutti verdi.

- [ ] **Step 6: typecheck + commit**

Run: `npm run typecheck` → nessun errore.
```bash
git add src/types/shared.ts src/renderer/src/types/api.d.ts src/main/db/clients-repository.ts tests/unit/clients-repository.test.ts
git commit -m "feat(clienti): filtro certificato combinato da_gestire (in scadenza + scaduti) (B9)"
```

---

### Task 2: i18n — relabel card + nuova chiave dropdown

**Files:**
- Modify: `src/renderer/src/i18n/locales/it.json`
- Modify: `src/renderer/src/i18n/locales/en.json`

- [ ] **Step 1: Relabel della card (IT)**

In `it.json`, cambia il valore della chiave `dashboard.indicatori.certificati` da "Certificati in scadenza" (o simile) a:
```json
    "certificati": "Certificati da gestire",
```
> Verifica il valore attuale prima di sostituirlo; cambia solo il testo, non il nome della chiave (usata da `IndicatoriWidget`).

- [ ] **Step 2: Nuova chiave dropdown (IT)**

In `it.json`, dentro l'oggetto `clienti.filtri` (dove ci sono `cert_valido`, `cert_in_scadenza`, `cert_scaduto`), aggiungi:
```json
    "cert_da_gestire": "Da gestire (in scadenza o scaduti)",
```

- [ ] **Step 3: Stesse modifiche in EN**

In `en.json`:
- `dashboard.indicatori.certificati`: `"Certificates to handle"`.
- `clienti.filtri.cert_da_gestire`: `"To handle (expiring or expired)"`.

- [ ] **Step 4: Verifica parità chiavi e JSON valido**

Run (Git Bash):
```
node -e "const it=require('./src/renderer/src/i18n/locales/it.json');const en=require('./src/renderer/src/i18n/locales/en.json');const f=o=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?f(v).map(s=>k+'.'+s):[k]);const a=new Set(f(it)),b=new Set(f(en));const only=(x,y)=>[...x].filter(k=>!y.has(k));console.log('solo IT:',only(a,b));console.log('solo EN:',only(b,a));"
```
Expected: `solo IT: []` e `solo EN: []`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(i18n): relabel card certificati + opzione filtro da_gestire (B9)"
```

---

### Task 3: Renderer — drill-down, card, dropdown

**Files:**
- Modify: `src/renderer/src/pages/Shell.tsx:131-132`
- Modify: `src/renderer/src/components/dashboard/IndicatoriWidget.tsx:110-116`
- Modify: `src/renderer/src/pages/ClientsPage.tsx:12` e `~225`

- [ ] **Step 1: Drill-down in Shell.tsx**

In `src/renderer/src/pages/Shell.tsx`, nel ramo `filtro === 'certificato'` (righe 131-132), cambia:
```typescript
      } else if (filtro === 'certificato') {
        setClientFilter({ stato_certificato: 'da_gestire' })
        setActiveNav('clients')
```
(era `{ stato_certificato: 'scaduto' }`).

- [ ] **Step 2: Card della dashboard**

In `src/renderer/src/components/dashboard/IndicatoriWidget.tsx`, la `StatCard` dei certificati (righe 110-116): cambia il `value` per sommare i due conteggi:
```tsx
      <StatCard
        label={t('dashboard.indicatori.certificati')}
        value={(data?.certificati_in_scadenza ?? 0) + (data?.certificati_scaduti ?? 0)}
        colorClasses="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-900 dark:text-red-100"
        isLoading={isLoading}
        onClick={onNavigateClientiCertificati}
        ariaLabel={t('dashboard.indicatori.certificati')}
      />
```
(`certificati_in_scadenza` e `certificati_scaduti` sono entrambi già presenti nel tipo `WidgetIndicatori` e in `data`.)

- [ ] **Step 3: Tipo locale + opzione dropdown in ClientsPage**

In `src/renderer/src/pages/ClientsPage.tsx` riga 12:
```typescript
type StatoCertificatoFilter = '' | 'valido' | 'in_scadenza' | 'scaduto' | 'da_gestire'
```
Nel `<select>` del filtro certificato (dopo `<option value="scaduto">…`, ~riga 225), aggiungi:
```tsx
            <option value="da_gestire">{t('clienti.filtri.cert_da_gestire')}</option>
```

- [ ] **Step 4: Verifica**

Run: `npm run typecheck` → nessun errore (il `as ClientiFilters['stato_certificato']` in `loadClienti` ora accetta `da_gestire`).
Run: `npm run lint` → 0 warning.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/Shell.tsx src/renderer/src/components/dashboard/IndicatoriWidget.tsx src/renderer/src/pages/ClientsPage.tsx
git commit -m "feat(dashboard): drill-down certificati -> da_gestire, card e dropdown allineati (B9)"
```

---

### Task 4: Docs + verify finale

**Files:**
- Modify: `ANALYSYS.md` (voce B9)

- [ ] **Step 1: Chiudi B9 in ANALYSYS.md**

Nella voce `### B9` (~riga 277), aggiungi in coda:
```markdown
- **Stato (2026-06-16):** **Chiuso.** Introdotto il filtro combinato `stato_certificato: 'da_gestire'` (in scadenza + scaduti = `data_scadenza − oggi ≤ giorniPreavviso`). Il drill-down dalla card "Certificati" e la card stessa (somma `certificati_in_scadenza + certificati_scaduti`, etichetta "Certificati da gestire") puntano a quel set; opzione esposta anche nel dropdown filtro di ClientsPage. Vedi `docs/superpowers/specs/2026-06-15-b9-drilldown-certificati-design.md`.
```

- [ ] **Step 2: `npm run verify` finale**

Run: `npm run verify`
Expected: typecheck OK · lint 0 warning · test verdi (con i nuovi test `da_gestire`) · build OK. Se fallisce, NON committare: riporta l'output.

- [ ] **Step 3: Commit**

```bash
git add ANALYSYS.md
git commit -m "docs(b9): chiusura drill-down certificati da_gestire"
```

---

## Self-Review

- **Spec coverage:** filtro combinato `da_gestire` (Task 1) ✓; drill-down → da_gestire (Task 3) ✓; card somma + relabel (Task 2+3) ✓; opzione dropdown (Task 2+3) ✓; nessuna modifica a `getIndicatori` ✓; test del filtro (Task 1) ✓; docs (Task 4) ✓.
- **Placeholder scan:** nessun TBD; ogni step ha codice o comando. (Unico promemoria di verifica: il valore i18n attuale di `dashboard.indicatori.certificati` va letto prima di sostituirlo, e i CF di esempio nel test devono essere 16 caratteri.)
- **Type consistency:** `'da_gestire'` aggiunto in modo coerente in `ClientiFilters` (`shared.ts` + `api.d.ts`), nel tipo locale `StatoCertificatoFilter` (ClientsPage), nel ramo SQL di `listClienti`, nel valore del filtro impostato da `Shell.tsx`, e nell'`<option>`. La card usa `certificati_in_scadenza`/`certificati_scaduti`, campi già esistenti in `WidgetIndicatori`.
