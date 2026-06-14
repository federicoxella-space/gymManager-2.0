# WP4b — Rifiniture UX (C7, C8, C10, C11, C12, C13 residui, B12 residui, N4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development per implementare task-by-task. Gli step usano checkbox (`- [ ]`).

**Goal:** Chiudere le rifiniture UX residue di `ANALYSYS.md`: messaggi di validazione specifici (C7), validazione client-side di ClientForm (C8), conferma alla chiusura di modali con dati non salvati (C10), scroll orizzontale tabelle (C11), rinnovo iscrizione atomico (C12), e i residui C13/B12 + nota N4.

**Architecture:** Prevalentemente renderer React. **Una sola eccezione backend**: C12 aggiunge una IPC atomica `iscrizioni:rinnova` (repository + handler + preload + tipi + test Vitest). Nessuna migrazione DB. Nuove stringhe sempre esternalizzate in i18n (IT/EN, copie allineate).

**Tech Stack:** Electron + React + TypeScript (strict) + Tailwind + i18next. Test: Vitest (node-only, nessun harness DOM).

**Verifica (DoD «verde»):** `npm run verify` (typecheck + `eslint src --ext .ts,.tsx --max-warnings 0` + Vitest + `electron-vite build`) verde dopo ogni task. C12 aggiunge **test Vitest** (è backend, testabile). Gli altri task sono UI-only → gate = verify-green + checklist manuale (coerente con WP4/WP5).

**Decisioni utente (prese in fase di pianificazione):**
- **C12** → *backend atomico*: nuova IPC `iscrizioni:rinnova` (invalida+assegna in `db.transaction().immediate()`), con test.
- **C10** → *conferma se modificato*: su ESC/backdrop/X, se il form ha modifiche pendenti, chiedere conferma di scarto.

**Convenzioni:** commit conventional (`fix`/`feat`/`test`/`docs`), trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Niente `any` non motivato. Parità chiavi i18n IT/EN.

---

## File coinvolti (mappa)

| File | Responsabilità | Voce |
|---|---|---|
| `i18n/locales/it.json` · `en.json` | nuove chiavi `validazione.*`, `common.*` (scarto modifiche), `clienti.form.cf_formato_invalido`, label "modifica date abbonamento" | C7,C8,C10,C13,B12 |
| `components/memberships/AssegnaIscrizioneForm.tsx` | C7 (errori specifici), C12 (usa `rinnova`), C10 (dirty) | C7,C10,C12 |
| `components/memberships/AssegnaAbbonamentoForm.tsx` | C7, C10 | C7,C10 |
| `components/catalog/TipoIscrizioneForm.tsx` · `TipoAbbonamentoForm.tsx` | C7 | C7 |
| `components/certificati/CertificatoForm.tsx` | C7, C10 | C7,C10 |
| `components/clients/ClientForm.tsx` | C8 (validazione client-side), C10 (dirty), C13 (cf_formato_invalido) | C8,C10,C13 |
| `components/ui/Modal.tsx` | C10 (conferma scarto via context + overlay interno) | C10 |
| `components/receipts/EmittiRicevutaForm.tsx` | C10 (dirty) | C10 |
| `main/db/memberships-repository.ts` | C12 `rinnovaIscrizione` | C12 |
| `main/ipc/handlers.ts` · `preload/index.ts` · `types/shared.ts` · `renderer/src/types/api.d.ts` | C12 IPC `iscrizioni:rinnova` | C12 |
| `tests/unit/memberships-invariants.test.ts` (o nuovo) | C12 test | C12 |
| `components/clients/ClientList.tsx` · `pages/ReceiptsPage.tsx` · `components/clients/ClientDetail.tsx` | C11 scroll, C13 empty-state, C13 nomi | C11,C13 |
| `components/dashboard/ScadenzeWidget.tsx` | C13 (helper nome coerente) | C13 |
| `utils/dominio.ts` | C13 `formatNomeCliente` | C13 |
| `components/updater/UpdateNotification.tsx` | C13 (messaggio errore reale) | C13 |
| `components/backup/ResetPasswordDialog.tsx` | C13 (hint requisiti pw) | C13 |
| `pages/CatalogoPage.tsx` | B12 (ricerca tipi) | B12 |
| `OPEN-QUESTIONS.md` · `docs/DECISIONS.md` · `ANALYSYS.md` | doc-only (B12 residui, N4, chiusura) | B12,N4 |

---

## Cluster A — Validazione

### Task 1: Messaggi di validazione specifici (C7)

**Files:**
- Modify: `src/renderer/src/i18n/locales/it.json`, `en.json`
- Modify: `AssegnaIscrizioneForm.tsx`, `AssegnaAbbonamentoForm.tsx`, `TipoIscrizioneForm.tsx`, `TipoAbbonamentoForm.tsx`, `CertificatoForm.tsx`

**Contesto:** in questi form gli errori di validazione usano `t('common.error_generic')` ("Si è verificato un errore. Riprova.") per OGNI campo. In `CertificatoForm` si concatena label + generico → "Tipo Si è verificato un errore…". Servono chiavi dedicate.

- [ ] **Step 1: aggiungere la sezione `validazione` in i18n.** In `it.json` (oggetto top-level, dopo `common`):

```json
  "validazione": {
    "obbligatorio": "Campo obbligatorio",
    "prezzo_non_valido": "Inserire un prezzo valido (≥ 0)",
    "data_obbligatoria": "Data obbligatoria",
    "durata_non_valida": "Inserire una durata valida (≥ 1 mese)",
    "selezione_obbligatoria": "Selezione obbligatoria"
  },
```

In `en.json` stessa posizione:

```json
  "validazione": {
    "obbligatorio": "Required field",
    "prezzo_non_valido": "Enter a valid price (≥ 0)",
    "data_obbligatoria": "Date required",
    "durata_non_valida": "Enter a valid duration (≥ 1 month)",
    "selezione_obbligatoria": "Selection required"
  },
```

- [ ] **Step 2: AssegnaIscrizioneForm — sostituire i messaggi in `validate()`** (righe 96–124). Usare:
  - tipo mancante → `t('validazione.selezione_obbligatoria')`
  - dataInizio mancante → `t('validazione.data_obbligatoria')`
  - dataScadenza mancante → `t('validazione.data_obbligatoria')`
  - prezzo non valido → `t('validazione.prezzo_non_valido')`

```tsx
  function validate(): boolean {
    let ok = true
    if (!tipoId) { setTipoError(t('validazione.selezione_obbligatoria')); ok = false } else setTipoError('')
    if (!dataInizio) { setDataIniziError(t('validazione.data_obbligatoria')); ok = false } else setDataIniziError('')
    if (!dataScadenza) { setDataScadenzaError(t('validazione.data_obbligatoria')); ok = false } else setDataScadenzaError('')
    const pr = Number(prezzo)
    if (prezzo === '' || isNaN(pr) || pr < 0) { setPrezzoError(t('validazione.prezzo_non_valido')); ok = false } else setPrezzoError('')
    return ok
  }
```

- [ ] **Step 3: AssegnaAbbonamentoForm** — LEGGI il file, individua la funzione di validazione analoga e sostituisci i `t('common.error_generic')` con le chiavi `validazione.*` corrispondenti (tipo→selezione_obbligatoria, date→data_obbligatoria, prezzo→prezzo_non_valido).

- [ ] **Step 4: TipoIscrizioneForm e TipoAbbonamentoForm** — LEGGI i file; per i campi (nome obbligatorio, durata, prezzo) sostituisci i messaggi generici con: nome vuoto → `t('validazione.obbligatorio')`, durata non valida → `t('validazione.durata_non_valida')`, prezzo non valido → `t('validazione.prezzo_non_valido')`.

- [ ] **Step 5: CertificatoForm** — sostituire (righe 43, 49) la concatenazione label+generico con messaggi puliti:
  - tipo mancante → `setTipoError(t('validazione.selezione_obbligatoria'))`
  - data mancante → `setDataError(t('validazione.data_obbligatoria'))`

- [ ] **Step 6: `npm run verify`** → VERDE. Verifica che `common.error_generic` non resti usato come messaggio di validazione di campo in questi 5 file (resta legittimo solo come messaggio d'errore di sistema/retry).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json src/renderer/src/components/memberships/AssegnaIscrizioneForm.tsx src/renderer/src/components/memberships/AssegnaAbbonamentoForm.tsx src/renderer/src/components/catalog/TipoIscrizioneForm.tsx src/renderer/src/components/catalog/TipoAbbonamentoForm.tsx src/renderer/src/components/certificati/CertificatoForm.tsx
git commit -m "fix(ux): messaggi di validazione specifici per campo (C7)"
```

---

### Task 2: Validazione client-side in ClientForm (C8 + C13 cf_formato_invalido)

**Files:**
- Modify: `src/renderer/src/components/clients/ClientForm.tsx`
- Modify: `src/renderer/src/i18n/locales/it.json`, `en.json`

**Contesto:** `ClientForm.handleSubmit` (righe ~185–231) invia anche con nome/cognome/CF vuoti: l'errore arriva dal backend in cima al form, senza evidenziare i campi. Manca validazione di formato CF al submit. Inoltre (C13) il warning di formato CF riusa la chiave placeholder `clienti.form.cf_hint`: serve `clienti.form.cf_formato_invalido`. Il componente `Field` è già accessibile (WP5: `aria-invalid`/`aria-describedby`), quindi popolare `apiErrors` per-campo evidenzia automaticamente i campi.

- [ ] **Step 1: i18n** — aggiungere `clienti.form.cf_formato_invalido` in `it.json` ("Codice fiscale in formato non valido") ed `en.json` ("Invalid tax code format"). (Mettere la chiave dentro `clienti.form`.)

- [ ] **Step 2: validazione locale prima del submit.** In `handleSubmit`, dopo `e.preventDefault()` e prima di `setSubmitState('submitting')`, validare nome/cognome/CF e bloccare con errori per-campo:

```tsx
    e.preventDefault()
    const erroriLocali: ValidationError[] = []
    if (!formData.nome.trim()) erroriLocali.push({ field: 'nome', message: t('validazione.obbligatorio') })
    if (!formData.cognome.trim()) erroriLocali.push({ field: 'cognome', message: t('validazione.obbligatorio') })
    const cf = formData.codice_fiscale.toUpperCase().trim()
    if (!cf) {
      erroriLocali.push({ field: 'codice_fiscale', message: t('validazione.obbligatorio') })
    } else if (!isFormatoCFValido(cf)) {
      erroriLocali.push({ field: 'codice_fiscale', message: t('clienti.form.cf_formato_invalido') })
    }
    if (erroriLocali.length > 0) {
      setApiErrors(erroriLocali)
      return
    }
    setSubmitState('submitting')
    setApiErrors([])
```

  (`ValidationError` è già importato da `../../../../types/shared`; `isFormatoCFValido` è già definito nel file.)

- [ ] **Step 3: warning di formato CF** — sostituire l'uso di `t('clienti.form.cf_hint')` come testo del *warning* (intorno a riga ~299) con `t('clienti.form.cf_formato_invalido')` (il `placeholder` del campo resta `cf_hint`).

- [ ] **Step 4: `npm run verify`** → VERDE.

- [ ] **Step 5: Checklist manuale (C8):** submit con nome/cognome/CF vuoti → i tre campi mostrano errore inline (e `aria-invalid` via Field), nessuna chiamata IPC; CF con formato errato → errore di formato sul campo CF.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/clients/ClientForm.tsx src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "fix(ux): validazione client-side dei campi obbligatori e formato CF in ClientForm (C8/C13)"
```

---

## Cluster B — Modale & rinnovo

### Task 3: Conferma chiusura modale con dati non salvati (C10)

**Files:**
- Modify: `src/renderer/src/components/ui/Modal.tsx`
- Modify: `src/renderer/src/components/clients/ClientForm.tsx`, `certificati/CertificatoForm.tsx`, `memberships/AssegnaIscrizioneForm.tsx`, `memberships/AssegnaAbbonamentoForm.tsx`, `receipts/EmittiRicevutaForm.tsx`
- Modify: `src/renderer/src/i18n/locales/it.json`, `en.json`

**Contesto:** il `Modal` si chiude con ESC/backdrop/X senza conferma → perdita dati nei form lunghi. Decisione utente: **conferma se modificato**. Approccio KISS senza prop-drilling: il `Modal` espone un **context** con `setDirty`; un hook `useModalDirty(dirty)` permette al form figlio di comunicare lo stato "modificato"; il `Modal` intercetta la chiusura e, se dirty, mostra un overlay di conferma interno (niente Modal annidato, così il focus-trap non va in conflitto).

- [ ] **Step 1: i18n** — in `it.json` `common`: `"scarta": "Scarta"`, `"modifiche_non_salvate": "Modifiche non salvate"`, `"scarta_modifiche_msg": "Ci sono modifiche non salvate. Vuoi scartarle?"`, `"continua_modifica": "Continua modifica"`. In `en.json`: `"scarta": "Discard"`, `"modifiche_non_salvate": "Unsaved changes"`, `"scarta_modifiche_msg": "You have unsaved changes. Discard them?"`, `"continua_modifica": "Keep editing"`.

- [ ] **Step 2: riscrivere `Modal.tsx`** aggiungendo context dirty + overlay di conferma. Partire dal file attuale (post-WP5) e applicare queste modifiche:

  (a) import e context in testa:

```tsx
import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface ModalDirtyContextValue {
  setDirty: (dirty: boolean) => void
}
const ModalDirtyContext = createContext<ModalDirtyContextValue | null>(null)

/** Da chiamare dentro un form renderizzato in un Modal per abilitare la conferma di scarto su chiusura. */
export function useModalDirty(dirty: boolean): void {
  const ctx = useContext(ModalDirtyContext)
  useEffect(() => {
    ctx?.setDirty(dirty)
    return () => ctx?.setDirty(false)
  }, [ctx, dirty])
}
```

  (b) dentro `Modal`, aggiungere stato dirty + conferma e una funzione `requestClose`:

```tsx
  const [isDirty, setIsDirty] = useState(false)
  const [showDiscard, setShowDiscard] = useState(false)

  const requestClose = useRef<() => void>(() => {})
  requestClose.current = () => {
    if (isDirty) setShowDiscard(true)
    else onClose()
  }
```

  (c) il listener Escape e l'`onClick` del backdrop e dell'X devono chiamare `requestClose.current()` invece di `onClose` direttamente. (Nel listener keydown: `if (e.key === 'Escape') { requestClose.current(); return }`.)

  (d) avvolgere i `children` nel provider e renderizzare l'overlay di conferma quando `showDiscard`:

```tsx
        {/* Corpo scrollabile */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          <ModalDirtyContext.Provider value={{ setDirty: setIsDirty }}>
            {children}
          </ModalDirtyContext.Provider>
        </div>

        {showDiscard && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-xl p-4">
            <div role="alertdialog" aria-modal="true" className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-sm w-full p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('common.modifiche_non_salvate')}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">{t('common.scarta_modifiche_msg')}</p>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowDiscard(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
                  {t('common.continua_modifica')}
                </button>
                <button type="button" onClick={() => { setShowDiscard(false); onClose() }} className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                  {t('common.scarta')}
                </button>
              </div>
            </div>
          </div>
        )}
```

  (e) quando il modale si chiude (`isOpen` false), resettare `showDiscard`/`isDirty` (in un `useEffect` su `isOpen`, o azzerare in `onClose`). Aggiungere nel `useEffect` esistente che resetta lo scroll: `if (!isOpen) { setShowDiscard(false); setIsDirty(false) }`.

  Mantieni il focus-trap e tutto il resto invariati.

- [ ] **Step 3: ClientForm** — chiamare il hook con la dirtiness calcolata. Subito dopo gli stati, aggiungere:

```tsx
  const isDirty = JSON.stringify(formData) !== JSON.stringify(buildInitialData(initialData))
  useModalDirty(isDirty)
```

  e importare: `import Modal, { useModalDirty } from '../ui/Modal'`? — NO: ClientForm non importa Modal. Importare solo il hook: `import { useModalDirty } from '../ui/Modal'`.

- [ ] **Step 4: CertificatoForm** — `const isDirty = tipo !== '' || dataScadenza !== ''; useModalDirty(isDirty)` + import del hook.

- [ ] **Step 5: AssegnaIscrizioneForm, AssegnaAbbonamentoForm, EmittiRicevutaForm** — questi form hanno default precompilati: usare un flag `touched`. Aggiungere `const [touched, setTouched] = useState(false)`, impostarlo a `true` nei principali handler di change (o `onChange` dei campi), e `useModalDirty(touched)`. LEGGI ciascun form e aggancia `setTouched(true)` ai change handler dei campi editabili. Import del hook.

- [ ] **Step 6: `npm run verify`** → VERDE.

- [ ] **Step 7: Checklist manuale (C10):** aprire ClientForm, modificare un campo, premere ESC o cliccare fuori → compare "Modifiche non salvate / Scarta / Continua modifica"; "Continua modifica" tiene aperto, "Scarta" chiude. Senza modifiche, ESC/backdrop chiudono direttamente. I dialog di conferma (ConfirmDialog) e i modali informativi restano invariati (non chiamano il hook).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/ui/Modal.tsx src/renderer/src/components/clients/ClientForm.tsx src/renderer/src/components/certificati/CertificatoForm.tsx src/renderer/src/components/memberships/AssegnaIscrizioneForm.tsx src/renderer/src/components/memberships/AssegnaAbbonamentoForm.tsx src/renderer/src/components/receipts/EmittiRicevutaForm.tsx src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(ux): conferma di scarto alla chiusura dei modali con modifiche non salvate (C10)"
```

---

### Task 4: Rinnovo iscrizione atomico — backend `iscrizioni:rinnova` (C12)

**Files:**
- Modify: `src/main/db/memberships-repository.ts`
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/types/shared.ts`, `src/renderer/src/types/api.d.ts`
- Modify: `src/renderer/src/components/memberships/AssegnaIscrizioneForm.tsx`
- Create/Modify test: `tests/unit/memberships-invariants.test.ts`

**Contesto:** oggi `AssegnaIscrizioneForm.handleSubmit` (righe ~131–143) fa `iscrizioni.invalida(vecchia)` poi `iscrizioni.assegna(nuova)` come due chiamate separate: se la seconda fallisce, il cliente resta senza iscrizione attiva. Si introduce una IPC atomica.

- [ ] **Step 1: repository `rinnovaIscrizione`** — in `memberships-repository.ts`, aggiungere (riusa `assertClienteAttivo`, lo schema di `assegnaIscrizione`, e il pattern `db.transaction().immediate()` già usato in `updateIscrizioneDate`):

```ts
/**
 * Rinnova un'iscrizione in modo atomico: invalida l'iscrizione attiva corrente (se presente)
 * e crea la nuova, in un'unica transazione immediate. Invariante 1 garantita: se al momento
 * dell'inserimento esiste ancora un'altra iscrizione attiva, l'intera operazione fallisce.
 */
export function rinnovaIscrizione(
  vecchiaId: number | null,
  data: AssegnaIscrizioneInput,
): IscrizioneClienteRow {
  const db = getDatabase()
  assertClienteAttivo(db, data.cliente_id)

  const esegui = db.transaction((): IscrizioneClienteRow => {
    if (vecchiaId !== null) {
      const upd = db
        .prepare("UPDATE iscrizioni_cliente SET stato = 'invalidata' WHERE id = ? AND cliente_id = ? AND stato = 'attiva'")
        .run(vecchiaId, data.cliente_id)
      if (upd.changes === 0) {
        throw new Error('ISCRIZIONE_NON_ATTIVA')
      }
    }
    const altraAttiva = db
      .prepare("SELECT id FROM iscrizioni_cliente WHERE cliente_id = ? AND stato = 'attiva'")
      .get(data.cliente_id)
    if (altraAttiva) {
      throw new Error('ISCRIZIONE_GIA_ATTIVA')
    }
    const info = db
      .prepare(`
        INSERT INTO iscrizioni_cliente (
          cliente_id, tipo_iscrizione_id, data_inizio, data_scadenza,
          prezzo, stato_pagamento, metodo_pagamento, note
        ) VALUES (
          @cliente_id, @tipo_iscrizione_id, @data_inizio, @data_scadenza,
          @prezzo, @stato_pagamento, @metodo_pagamento, @note
        )
      `)
      .run({
        cliente_id: data.cliente_id,
        tipo_iscrizione_id: data.tipo_iscrizione_id,
        data_inizio: data.data_inizio,
        data_scadenza: data.data_scadenza,
        prezzo: data.prezzo,
        stato_pagamento: data.stato_pagamento,
        metodo_pagamento: data.metodo_pagamento ?? null,
        note: data.note ?? null,
      })
    const created = db
      .prepare('SELECT * FROM iscrizioni_cliente WHERE id = ?')
      .get(info.lastInsertRowid) as IscrizioneClienteRow | undefined
    if (!created) throw new Error('Errore durante il rinnovo: record non trovato dopo INSERT')
    return created
  })

  return esegui.immediate()
}
```

- [ ] **Step 2: handler IPC** — in `handlers.ts`, accanto a `iscrizioni:assegna`, aggiungere (LEGGI il blocco esistente per replicarne lo stile try/catch + log):

```ts
  ipcMain.handle('iscrizioni:rinnova', (_event, args: { vecchiaId: number | null; data: AssegnaIscrizioneInput }) => {
    try {
      return rinnovaIscrizione(args.vecchiaId, args.data)
    } catch (err) {
      log.error('[ipc] iscrizioni:rinnova errore:', err)
      throw err instanceof Error ? err : new Error('Errore durante il rinnovo iscrizione')
    }
  })
```

  Aggiungere `rinnovaIscrizione` all'import da `../db/memberships-repository` e verificare che `AssegnaIscrizioneInput` sia importato nel file handlers (lo è già per `iscrizioni:assegna`).

- [ ] **Step 3: preload** — in `preload/index.ts`, nel namespace `iscrizioni`, aggiungere:

```ts
    rinnova(vecchiaId: number | null, data: AssegnaIscrizioneInput) {
      return ipcRenderer.invoke('iscrizioni:rinnova', { vecchiaId, data })
    },
```

  (verificare che il tipo `AssegnaIscrizioneInput` sia importato nel preload; se non lo è, importarlo da `../types/shared`.)

- [ ] **Step 4: tipi** — in `src/types/shared.ts` (interfaccia `ElectronAPI.iscrizioni`, riga ~466) e in `src/renderer/src/types/api.d.ts` (mirror) aggiungere:

```ts
    rinnova: (vecchiaId: number | null, data: AssegnaIscrizioneInput) => Promise<IscrizioneClienteRow>
```

- [ ] **Step 5: AssegnaIscrizioneForm usa la IPC atomica** — sostituire il blocco try di `handleSubmit` (righe ~130–145):

```tsx
    setSubmitState('submitting')
    try {
      const payload = {
        cliente_id: clienteId,
        tipo_iscrizione_id: Number(tipoId),
        data_inizio: dataInizio,
        data_scadenza: dataScadenza,
        prezzo: Number(prezzo),
        stato_pagamento: statoPagamento,
        metodo_pagamento: statoPagamento === 'pagato' ? metodoPagamento : undefined,
      }
      const result = iscrizioneAttiva
        ? await window.api.iscrizioni.rinnova(iscrizioneAttiva.id, payload)
        : await window.api.iscrizioni.assegna(payload)
      setSubmitState('idle')
      onSuccess(result, emettiRicevuta)
    } catch {
      setSubmitState('error')
    }
```

- [ ] **Step 6: test Vitest** — in `tests/unit/memberships-invariants.test.ts` (LEGGILO per riusare setup DB/electron-mock e helper esistenti) aggiungere casi:
  1. `rinnovaIscrizione(vecchiaId, nuova)` con un'iscrizione attiva → la vecchia diventa `invalidata`, la nuova è `attiva`, e `getIscrizioneAttiva` ritorna la nuova.
  2. `rinnovaIscrizione(null, nuova)` su cliente senza iscrizione attiva → crea la nuova `attiva`.
  3. atomicità: se `vecchiaId` non è attiva (es. id inesistente/già invalidata) → lancia `ISCRIZIONE_NON_ATTIVA` e **nessuna** nuova iscrizione viene creata (il conteggio resta invariato).

```ts
  it('rinnovaIscrizione invalida la vecchia e crea la nuova atomicamente', () => {
    const cliente = creaClienteTest() // usa l'helper presente nel file
    const t1 = creaTipoIscrizioneTest(12)
    const vecchia = assegnaIscrizione({ cliente_id: cliente.id, tipo_iscrizione_id: t1.id, data_inizio: '2025-01-01', data_scadenza: '2025-12-31', prezzo: 100, stato_pagamento: 'pagato' })
    const nuova = rinnovaIscrizione(vecchia.id, { cliente_id: cliente.id, tipo_iscrizione_id: t1.id, data_inizio: '2026-01-01', data_scadenza: '2026-12-31', prezzo: 120, stato_pagamento: 'da_incassare' })
    expect(nuova.stato).toBe('attiva')
    expect(getIscrizioneAttiva(cliente.id)?.id).toBe(nuova.id)
    const tutte = listIscrizioni(cliente.id)
    expect(tutte.find((i) => i.id === vecchia.id)?.stato).toBe('invalidata')
  })

  it('rinnovaIscrizione fallisce e non crea nulla se la vecchia non è attiva', () => {
    const cliente = creaClienteTest()
    const t1 = creaTipoIscrizioneTest(12)
    const prima = listIscrizioni(cliente.id).length
    expect(() => rinnovaIscrizione(99999, { cliente_id: cliente.id, tipo_iscrizione_id: t1.id, data_inizio: '2026-01-01', data_scadenza: '2026-12-31', prezzo: 120, stato_pagamento: 'da_incassare' })).toThrow('ISCRIZIONE_NON_ATTIVA')
    expect(listIscrizioni(cliente.id).length).toBe(prima)
  })
```

  (Adatta i nomi degli helper a quelli realmente presenti nel file di test; importa `rinnovaIscrizione`, `listIscrizioni`, `getIscrizioneAttiva` dal repository.)

- [ ] **Step 7: `npm run verify`** → VERDE (i nuovi test devono passare). Atteso: conteggio test aumentato di ~2-3 rispetto a main.

- [ ] **Step 8: Commit**

```bash
git add src/main/db/memberships-repository.ts src/main/ipc/handlers.ts src/preload/index.ts src/types/shared.ts src/renderer/src/types/api.d.ts src/renderer/src/components/memberships/AssegnaIscrizioneForm.tsx tests/unit/memberships-invariants.test.ts
git commit -m "feat(iscrizioni): rinnovo atomico via IPC iscrizioni:rinnova (C12) + test"
```

---

## Cluster C — Tabelle

### Task 5: Scroll orizzontale tabelle (C11)

**Files:**
- Modify: `src/renderer/src/components/clients/ClientList.tsx`
- Modify: `src/renderer/src/pages/ReceiptsPage.tsx`
- Modify: `src/renderer/src/components/clients/ClientDetail.tsx`

**Contesto:** le tabelle sono dentro contenitori `… overflow-hidden` senza `overflow-x-auto`: su finestre strette le colonne escono/troncano. Aggiungere scroll orizzontale e una larghezza minima.

- [ ] **Step 1: per ciascuna tabella citata**, modificare il wrapper della `<table>`:
  - sul `div` contenitore che ha `rounded-… border … overflow-hidden`, aggiungere `overflow-x-auto` (può convivere: `overflow-hidden` toglie lo scroll; sostituire con `overflow-x-auto`). In pratica: dove c'è `overflow-hidden` sul wrapper diretto della tabella, cambiarlo in `overflow-x-auto`.
  - sulla `<table>` aggiungere una `min-w` adeguata al numero di colonne: `min-w-[640px]` per le tabelle a 5-6 colonne (ClientList, ClientDetail iscrizioni/abbonamenti/certificati) e `min-w-[820px]` per la tabella ricevute (8 colonne, ReceiptsPage).

  Esempio ClientList (riga ~107):

```tsx
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table data-testid="client-list-table" className="w-full min-w-[640px] text-sm">
```

  LEGGI gli altri wrapper (ReceiptsPage ~265, ClientDetail tabelle iscrizioni/abbonamenti/certificati) e applica lo stesso schema, scegliendo la `min-w` in base alle colonne.

- [ ] **Step 2: `npm run verify`** → VERDE.

- [ ] **Step 3: Checklist manuale (C11):** restringendo la finestra, le tabelle scorrono orizzontalmente invece di troncare/rompere il layout.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/clients/ClientList.tsx src/renderer/src/pages/ReceiptsPage.tsx src/renderer/src/components/clients/ClientDetail.tsx
git commit -m "fix(ux): scroll orizzontale e min-width sulle tabelle (C11)"
```

---

## Cluster D — Residui C13

### Task 6: Helper `formatNomeCliente` + coerenza Cognome Nome (C13)

**Files:**
- Modify: `src/renderer/src/utils/dominio.ts`
- Modify: `src/renderer/src/components/dashboard/ScadenzeWidget.tsx`
- (eventuale) `ClientList.tsx`, `ClientDetail.tsx` per usare l'helper

**Contesto:** i widget dashboard mostrano "Nome Cognome" (`ScadenzeWidget`) mentre le liste mostrano "Cognome Nome" (`ClientList`, `ClientDetail`). Unificare su **Cognome Nome** con un helper condiviso.

- [ ] **Step 1: aggiungere l'helper** in `utils/dominio.ts`:

```ts
/** Nome cliente formattato in modo coerente: "Cognome Nome". */
export function formatNomeCliente(c: { nome: string; cognome: string }): string {
  return `${c.cognome} ${c.nome}`.trim()
}
```

- [ ] **Step 2: ScadenzeWidget** — LEGGI il punto in cui costruisce "Nome Cognome" (intorno a riga 94) e sostituiscilo con `formatNomeCliente(...)` importato da `../../utils/dominio` (adatta al tipo dell'item: deve avere `nome` e `cognome`).

- [ ] **Step 3 (opzionale, coerenza):** in `ClientList` (riga ~181) e `ClientDetail` (riga ~413) sostituire l'interpolazione `{cognome} {nome}` con `formatNomeCliente(...)` per centralizzare. Solo se il tipo locale espone `nome`/`cognome`.

- [ ] **Step 4: `npm run verify`** → VERDE.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/utils/dominio.ts src/renderer/src/components/dashboard/ScadenzeWidget.tsx src/renderer/src/components/clients/ClientList.tsx src/renderer/src/components/clients/ClientDetail.tsx
git commit -m "fix(ux): helper formatNomeCliente per ordine Cognome Nome coerente (C13)"
```

---

### Task 7: Empty-state differenziato lista clienti + messaggio errore aggiornamento + hint reset password (C13)

**Files:**
- Modify: `src/renderer/src/components/clients/ClientList.tsx`
- Modify: `src/renderer/src/components/updater/UpdateNotification.tsx`
- Modify: `src/renderer/src/components/backup/ResetPasswordDialog.tsx`
- Modify: `src/renderer/src/i18n/locales/it.json`, `en.json`

**Contesto (3 micro-fix):**
1. `ClientList` empty-state (righe ~156–166) non distingue "DB vuoto" da "nessun risultato del filtro".
2. `UpdateNotification` fase errore (righe ~134–139) mostra sempre `t('aggiornamento.errore')` ignorando `stato.messaggio` (che invece esiste).
3. `ResetPasswordDialog` step 2 non mostra l'hint "min 8 caratteri" come fa Setup.

- [ ] **Step 1: i18n** — aggiungere in `clienti` (it.json): `"nessun_risultato_filtro": "Nessun cliente corrisponde ai filtri"`, `"nessun_risultato_filtro_desc": "Prova a modificare o azzerare la ricerca."` (e mantieni `nessuno_trovato`/`nessuno_trovato_desc` per il DB vuoto). EN: "No clients match the filters" / "Try changing or clearing the search.". (Verifica se esiste già una chiave per "min 8 caratteri" in Setup, es. `setup.password_hint` o simile; se sì riusala nel punto 4, altrimenti aggiungi `backup.reset_password_hint`.)

- [ ] **Step 2: ClientList empty-state** — distinguere in base a `searchValue` (stato già presente). Quando `clienti.length === 0`:

```tsx
              clienti.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {searchValue.trim() ? t('clienti.nessun_risultato_filtro') : t('clienti.nessuno_trovato')}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {searchValue.trim() ? t('clienti.nessun_risultato_filtro_desc') : t('clienti.nessuno_trovato_desc')}
                    </p>
                  </td>
                </tr>
              ) : (
```

- [ ] **Step 3: UpdateNotification fase errore** (righe ~134–139) — mostrare il messaggio reale:

```tsx
        {stato.fase === 'errore' && (
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs px-3 py-2 rounded-md shadow-sm">
            <ExclamationIcon />
            <span>{stato.messaggio ?? t('aggiornamento.errore')}</span>
          </div>
        )}
```

  (Verifica che il tipo dello stato in fase `errore` includa `messaggio`; lo include — viene impostato nel listener `update:error`.)

- [ ] **Step 4: ResetPasswordDialog** — LEGGI il file, individua lo step 2 (campo nuova password) e aggiungi sotto al campo un hint testuale "min 8 caratteri" usando la chiave i18n riusata/aggiunta allo Step 1 (stesso stile dell'hint in Setup).

- [ ] **Step 5: `npm run verify`** → VERDE.

- [ ] **Step 6: Checklist manuale (C13):** lista clienti con ricerca attiva e 0 risultati → messaggio "nessun risultato filtri"; con DB vuoto → "crea il primo cliente"; banner errore aggiornamento mostra il dettaglio reale; reset password step 2 mostra l'hint.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/clients/ClientList.tsx src/renderer/src/components/updater/UpdateNotification.tsx src/renderer/src/components/backup/ResetPasswordDialog.tsx src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "fix(ux): empty-state lista clienti, messaggio errore aggiornamento reale, hint reset password (C13)"
```

---

## Cluster E — Residui B12

### Task 8: Ricerca tipi nel Catalogo (B12)

**Files:**
- Modify: `src/renderer/src/pages/CatalogoPage.tsx`

**Contesto:** `CatalogoPage` ha solo il toggle "mostra non validi", manca un campo di ricerca per filtrare i tipi (`FUNZIONALITA.md:42`).

- [ ] **Step 1:** LEGGI `CatalogoPage.tsx` per capire la struttura (tab iscrizioni/abbonamenti, stato lista, toggle "mostra non validi"). Aggiungere uno stato `searchTipo` e un `<SearchInput>` (componente esistente `../components/ui/SearchInput`) sopra la tabella della tab attiva; filtrare client-side i tipi visualizzati per `nome` (case-insensitive, `includes`). Riusare la chiave i18n di ricerca esistente se presente (es. `common`/`catalogo`), altrimenti aggiungere `catalogo.cerca` ("Cerca per nome") in it/en.

- [ ] **Step 2: `npm run verify`** → VERDE.

- [ ] **Step 3: Checklist manuale (B12):** digitando nel campo ricerca, la lista dei tipi (della tab attiva) si filtra per nome; il toggle "mostra non validi" continua a funzionare in combinazione.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/pages/CatalogoPage.tsx src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(catalogo): ricerca tipi per nome nelle tab (B12)"
```

---

### Task 9: "Modifica date" abbonamento in UI (B12)

**Files:**
- Modify: `src/renderer/src/components/clients/ClientDetail.tsx`

**Contesto:** la tabella abbonamenti ha solo "Invalida", benché esista la IPC `abbonamenti.updateDate`. La tabella iscrizioni ha invece già un flusso "Modifica date" (`handleSalvaDateIscrizione` + modale `showModificaDateIscrizione` + stati `editDataInizio/editDataScadenza`). Replicarlo per gli abbonamenti.

- [ ] **Step 1:** LEGGI in `ClientDetail.tsx` il flusso completo di modifica date dell'iscrizione (handler `handleSalvaDateIscrizione`, stato `showModificaDateIscrizione`, il modale relativo e come si pre-popolano `editDataInizio/editDataScadenza`). Replicare per gli abbonamenti:
  - stati: `modificaDateAbbTarget: AbbonamentoClienteRow | null`, e riusare/duplicare `editDataInizio/editDataScadenza` (o aggiungere `editAbbDataInizio/editAbbDataScadenza`).
  - handler `handleSalvaDateAbbonamento` che chiama `window.api.abbonamenti.updateDate(target.id, dataInizio, dataScadenza)`, aggiorna lo stato locale (`loadAbbonamenti()` o map), chiude il modale.
  - nella riga abbonamento (dove c'è il bottone "Invalida", riga ~877), aggiungere un bottone "Modifica date" (solo per `stato === 'attivo' && !anonimizzato`) che apre il modale.
  - un `<Modal>` per la modifica date abbonamento (riusa il markup del modale iscrizione: due input date + salva/annulla). Riusa le chiavi i18n già esistenti per "Modifica date" (cerca `iscrizioni.modifica_date*` e riusa l'equivalente, o aggiungi `abbonamenti.modifica_date*` in it/en se assenti).

- [ ] **Step 2: `npm run verify`** → VERDE.

- [ ] **Step 3: Checklist manuale (B12):** per un abbonamento attivo compare "Modifica date"; aprendo il modale e salvando, le date si aggiornano (via `abbonamenti.updateDate`).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/clients/ClientDetail.tsx src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(abbonamenti): modifica date abbonamento dalla UI (B12)"
```

---

## Task 10: Doc-only (B12 residui, N4) + chiusura WP4b

**Files:**
- Modify: `OPEN-QUESTIONS.md`, `docs/DECISIONS.md`, `ANALYSYS.md`

- [ ] **Step 1: OPEN-QUESTIONS.md** — registrare le scelte deliberate:
  - **B12 filtro cliente nella pagina Ricevute**: si lascia la sola ricerca testuale (decisione: il selettore cliente dedicato è opzionale; documentato). 
  - **B12 euristica anno CF** (`utils/dominio.ts:47`, `annoRaw < 30 ? 2000 : 1900`): assunzione documentata (il pivot a 30 può sbagliare per ultracentenari o date >2029; accettabile, override CF manuale sempre possibile).

- [ ] **Step 2: DECISIONS.md** — **N4**: le ricevute di minori emesse prima della migrazione `006` hanno `assistito_cf = NULL` e continueranno a stampare "Tutore di [CF tutore]"; nessuna azione sui dati per l'invariante 5 (immutabilità). Il fix A4 vale dalle nuove emissioni.

- [ ] **Step 3: ANALYSYS.md** — nella tabella di verifica marcare C7, C8, C10, C11, C12, C13(residui), B12(ricerca catalogo + modifica date abbonamento) come ✅ RISOLTO (WP4b, 2026-06-14) con evidenza; aggiornare la riga "⬜ APERTO" (restano: B12 filtro ricevute [documentato], euristica anno CF [documentata], N4 [documentata in DECISIONS]); aggiungere la nota di chiusura WP4b nel paragrafo "Verifica «verde»".

- [ ] **Step 4: review olistica** — dispatch reviewer di sola lettura sull'intero diff vs `main`: copertura C7/C8/C10/C11/C12/C13/B12, niente stringhe hardcoded, parità chiavi IT/EN, correttezza del rinnovo atomico, niente `any`.

- [ ] **Step 5: `npm run verify` finale** → VERDE.

- [ ] **Step 6: commit docs**

```bash
git add OPEN-QUESTIONS.md docs/DECISIONS.md ANALYSYS.md
git commit -m "docs: chiusura WP4b (rifiniture UX C7/C8/C10/C11/C12, residui C13/B12, N4)"
```

- [ ] **Step 7:** usare la skill **superpowers:finishing-a-development-branch** per chiudere il branch.

---

## Self-Review (eseguita in fase di stesura)

**Copertura:**
- C7 → Task 1 · C8 → Task 2 · C10 → Task 3 · C12 → Task 4 · C11 → Task 5 · C13 residui → Task 2 (cf_formato_invalido), 6 (nomi), 7 (empty-state, update msg, reset hint) · B12 residui → Task 8 (ricerca catalogo), 9 (modifica date abbonamento), 10 (filtro ricevute + euristica CF documentati) · N4 → Task 10. **Tutti coperti.**

**Placeholder scan:** i task con "LEGGI il file e adatta" (1.3-1.5, 3.5, 5, 6.2, 7.4, 8, 9) forniscono schema esatto + chiavi i18n + file:riga di ANALYSYS, non TODO generici. I task con codice completo: 2, 3 (Modal), 4 (repo+IPC+test). 

**Coerenza tipi/nomi:** `rinnovaIscrizione(vecchiaId: number | null, data: AssegnaIscrizioneInput): IscrizioneClienteRow` usato identico in repo, handler (`{vecchiaId,data}`), preload, tipi (`rinnova`), e form. `useModalDirty(dirty: boolean)` esportato da `Modal.tsx` e importato nei 5 form. `formatNomeCliente({nome,cognome})` definito in Task 6 e usato lì.

**Note:** una sola modifica backend (C12, con test). Nessuna migrazione. Gate `npm run verify` verde per ogni task.
