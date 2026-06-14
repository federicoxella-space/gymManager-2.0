# WP5 — Accessibilità (D1–D12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development per implementare task-by-task. Gli step usano checkbox (`- [ ]`).

**Goal:** Portare l'app a conformità WCAG 2.1 sui rilievi D1–D12 di `ANALYSYS.md` (focus-trap nei modali, errori di validazione collegati ai campi, label associate, navigazione da tastiera, live region, contrasti, dettagli minori).

**Architecture:** Solo modifiche al renderer React. Nessuna nuova dipendenza, nessuna nuova migrazione, nessun cambio di API/IPC. Si centralizza il più possibile (componenti `Modal`, `ConfirmDialog`, `Field`) e si replica un pattern ARIA già esistente e corretto in `SettingsPage.tsx`. Tutte le stringhe nuove sono esternalizzate in i18n (IT/EN).

**Tech Stack:** Electron + React + TypeScript (strict) + Tailwind + i18next. Test: Vitest (node-only, nessun harness DOM/componenti).

**Verifica (DoD «verde») — decisione utente:** `npm run verify` (typecheck + `eslint src --ext .ts,.tsx --max-warnings 0` + Vitest + `electron-vite build`) deve restare verde dopo ogni task. **Non** si introduce alcun harness di test sui componenti (jsdom/RTL) né `eslint-plugin-jsx-a11y` (coerente con WP1–4). Ogni task ha in coda uno step `npm run verify` + una checklist manuale WCAG di quel rilievo.

**Convenzioni di progetto da rispettare:**
- Stringhe **sempre** esternalizzate in `src/renderer/src/i18n/locales/it.json` ed `en.json` (mai hardcoded).
- Le due copie devono restare in pari (stesse chiavi in IT/EN).
- Commit conventional (`fix(a11y): …` / `feat(a11y): …`), trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Niente `any` non motivato; `strict` attivo.

---

## File coinvolti (mappa)

| File | Responsabilità nel WP5 | Rilievi |
|---|---|---|
| `src/renderer/src/components/ui/Modal.tsx` | focus-trap, focus restore, id titolo univoco, prop `describedById` | D1, D2 |
| `src/renderer/src/components/ui/ConfirmDialog.tsx` | associa il messaggio via `aria-describedby` | D2 |
| `src/renderer/src/components/clients/ClientForm.tsx` | `Field` accessibile (id/label, aria-required/invalid/describedby), nota "campi obbligatori" | D9, D10, D11 |
| `src/renderer/src/components/certificati/CertificatoForm.tsx` | label associate, errori collegati, aria-required | D9, D10, D11 |
| `src/renderer/src/components/memberships/AssegnaIscrizioneForm.tsx` | errori collegati ai campi | D10 |
| `src/renderer/src/components/memberships/AssegnaAbbonamentoForm.tsx` | errori collegati ai campi | D10 |
| `src/renderer/src/components/catalog/TipoAbbonamentoForm.tsx` · `TipoIscrizioneForm.tsx` | errori collegati ai campi | D10 |
| `src/renderer/src/components/clients/ClientList.tsx` | riga non più cliccabile (chevron resta), loading `role="status"` | D3, D7 |
| `src/renderer/src/components/dashboard/IncassiWidget.tsx` | `RigaValore` → `<button>`; barra `aria-hidden` | D4, D12 |
| `src/renderer/src/pages/ReceiptsPage.tsx` · `CatalogoPage.tsx` | loading `role="status"`, `scope="col"`/`<caption>`, `focus-visible` | D7, D12 |
| `src/renderer/src/components/clients/ClientDetail.tsx` | loading `role="status"`, `scope`/`caption`, motivo bottone disabilitato via `aria-describedby`, PDF "(apre in nuova finestra)" | D7, D8, D12 |
| `src/renderer/src/components/receipts/EmittiRicevutaForm.tsx` | loading `role="status"` | D7 |
| `src/renderer/src/components/dashboard/PeriodSelector.tsx` | `role="radiogroup"` + aria-label pertinente | D12 |
| `src/renderer/src/components/ui/Badge.tsx` | contrasto badge dark mode | D6 |
| vari (`ClientList`, `ScadenzeWidget`, `SettingsPage`, `SearchInput`, `ClientForm`) | contrasto testo/placeholder grigio | D5 |
| `src/renderer/src/i18n/locales/it.json` · `en.json` | nuove chiavi a11y | tutte |

---

## Cluster A — Modali e dialog

### Task 1: Modal — focus-trap, ripristino focus, id titolo univoco, `describedById` (D1, D2)

**Files:**
- Modify: `src/renderer/src/components/ui/Modal.tsx`

**Contesto:** oggi il `Modal` (`role="dialog" aria-modal`) non sposta il focus dentro al dialog all'apertura, non intrappola il Tab, non ripristina il focus al trigger alla chiusura, e usa un `id="modal-title"` **fisso** (collisione con più modali). WCAG 2.4.3 / 2.1.2 / 4.1.2.

- [ ] **Step 1: Sostituire l'intero corpo di `Modal.tsx`**

```tsx
import React, { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /** Larghezza massima del modale, default 'max-w-lg' */
  maxWidth?: string
  /** id dell'elemento che descrive il dialog (associato come aria-describedby) */
  describedById?: string
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
  describedById,
}: ModalProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // Escape per chiudere + focus-trap sul Tab
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (focusables.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Sposta il focus nel dialog all'apertura, lo ripristina alla chiusura
  useEffect(() => {
    if (!isOpen) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    if (panel) {
      const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(firstFocusable ?? panel).focus()
    }
    return () => {
      previouslyFocused.current?.focus?.()
    }
  }, [isOpen])

  // Blocca scroll quando il modale è aperto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={describedById}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Contenuto */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={[
          'relative w-full bg-white dark:bg-gray-900 rounded-xl shadow-xl',
          'flex flex-col max-h-[90vh] focus:outline-none',
          maxWidth,
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2
            id={titleId}
            className="text-base font-semibold text-gray-900 dark:text-gray-100"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Corpo scrollabile */}
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `npm run verify`** — Atteso: verde (typecheck + lint + test + build).

- [ ] **Step 3: Checklist manuale WCAG (D1)**
  - All'apertura di un qualsiasi modale, il focus entra nel pannello (primo elemento focusabile o il pannello stesso).
  - Tab e Shift+Tab ciclano restando dentro al dialog.
  - Alla chiusura (X / Esc / conferma) il focus torna all'elemento che ha aperto il modale.
  - Aprendo due modali in tempi diversi non si duplica l'`id` del titolo (ora `useId`).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ui/Modal.tsx
git commit -m "fix(a11y): focus-trap, ripristino focus e id titolo univoco nel Modal (D1)"
```

---

### Task 2: ConfirmDialog — `aria-describedby` sul messaggio (D2)

**Files:**
- Modify: `src/renderer/src/components/ui/ConfirmDialog.tsx`

**Contesto:** il dialog ha `aria-labelledby` (titolo) ma il corpo `<p>{message}</p>` non è associato: lo screen reader annuncia solo il titolo. Rilevante per le azioni distruttive (variante `danger`). Il `Modal` ora accetta `describedById` (Task 1).

- [ ] **Step 1: Generare un id per il messaggio e passarlo al Modal**

In `ConfirmDialog`, dopo `const { t } = useTranslation()`:

```tsx
  const messageId = useId()
```

Aggiungere l'import `useId`:

```tsx
import React, { useId } from 'react'
```

- [ ] **Step 2: Wirare l'id**

Passare `describedById` al Modal e dare l'`id` al paragrafo del messaggio:

```tsx
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-md" describedById={messageId}>
      <div className="space-y-5">
        <p id={messageId} className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
```

- [ ] **Step 3: `npm run verify`** — Atteso: verde.

- [ ] **Step 4: Checklist manuale (D2):** aprendo un `ConfirmDialog` (es. annulla ricevuta, elimina tipo), lo screen reader annuncia titolo **e** messaggio.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/ConfirmDialog.tsx
git commit -m "fix(a11y): associa il messaggio del ConfirmDialog via aria-describedby (D2)"
```

---

## Cluster B — Form: label, required, errori collegati

### Task 3: ClientForm — `Field` accessibile + nota campi obbligatori (D9, D10, D11)

**Files:**
- Modify: `src/renderer/src/components/clients/ClientForm.tsx`
- Modify: `src/renderer/src/i18n/locales/it.json`, `src/renderer/src/i18n/locales/en.json`

**Contesto:** il componente interno `Field` (righe 66–88) usa `<label>` **senza** `htmlFor` e l'input non ha `id`; `required` serve solo all'asterisco visivo; l'errore `<p role="alert">` non ha `id` e l'input non ha `aria-invalid`/`aria-describedby`. In tutte le `Field` il **primo** figlio è l'input/select primario (verificato: nome, cognome, CF, numero_tessera, data_nascita, sesso, tutore_*). Si centralizza qui.

- [ ] **Step 1: Aggiungere le chiavi i18n**

In `it.json`, dentro `"common"` (dopo `"actions"`), aggiungere:

```json
    "campi_obbligatori": "I campi contrassegnati con * sono obbligatori",
```

In `en.json`, stessa posizione:

```json
    "campi_obbligatori": "Fields marked with * are required",
```

- [ ] **Step 2: Riscrivere il componente `Field` (righe 66–88) per renderlo accessibile**

```tsx
interface FieldProps {
  label: string
  error?: string
  children: React.ReactNode
  required?: boolean
}

function Field({ label, error, children, required }: FieldProps): React.JSX.Element {
  const id = useId()
  const errorId = `${id}-error`
  const childArray = React.Children.toArray(children)
  const enhanced = childArray.map((child, i) =>
    i === 0 && React.isValidElement(child)
      ? React.cloneElement(child as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
          id,
          'aria-required': required ? true : undefined,
          'aria-invalid': error ? true : undefined,
          'aria-describedby': error ? errorId : undefined,
        })
      : child,
  )
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span aria-hidden="true" className="text-red-500 ml-0.5">*</span>}
      </label>
      {enhanced}
      {error && (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
```

Aggiungere `useId` all'import React in cima al file:

```tsx
import React, { useEffect, useId, useState } from 'react'
```

- [ ] **Step 3: Aggiungere la nota "campi obbligatori"** in testa al `<form>` (subito dopo l'apertura `<form …>` e prima/dopo il blocco errore generico, riga ~234):

```tsx
      <p className="text-xs text-gray-500 dark:text-gray-400">{t('common.campi_obbligatori')}</p>
```

- [ ] **Step 4: `npm run verify`** — Atteso: verde. Verificare in particolare che `cloneElement` non sollevi errori di tipo (il cast a `React.ReactElement<React.HTMLAttributes<HTMLElement>>` consente `id`/`aria-*`).

- [ ] **Step 5: Checklist manuale (D9/D10/D11):**
  - Cliccando la label di un campo, il focus va sull'input corrispondente (associazione `htmlFor`/`id`).
  - I campi obbligatori espongono `aria-required="true"`; l'asterisco è `aria-hidden`.
  - In errore l'input ha `aria-invalid="true"` e `aria-describedby` che punta al testo dell'errore.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/clients/ClientForm.tsx src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "fix(a11y): Field accessibile in ClientForm (label associate, aria-required/invalid/describedby) + nota campi obbligatori (D9/D10/D11)"
```

---

### Task 4: CertificatoForm — label associate, errori collegati, aria-required (D9, D10, D11)

**Files:**
- Modify: `src/renderer/src/components/certificati/CertificatoForm.tsx`

**Contesto:** i due campi (tipo `select`, data `input[type=date]`) hanno `<label>` senza `htmlFor`, input senza `id`, errori `<p role="alert">` senza `id`, nessun `aria-invalid`/`aria-describedby`/`aria-required`. Si replica il pattern accessibile inline (il form è piccolo, non importa `Field`).

- [ ] **Step 1: Generare gli id** — in cima al componente, dopo `const { t } = useTranslation()`:

```tsx
  const tipoId = useId()
  const dataId = useId()
```

Import: `import React, { useId, useState } from 'react'`.

- [ ] **Step 2: Campo "Tipo certificato"** — sostituire il blocco (righe ~83–103) con:

```tsx
      <div className="flex flex-col gap-1">
        <label htmlFor={tipoId} className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('clienti.certificato.tipo_label')}
          <span aria-hidden="true" className="text-red-500 ml-0.5">*</span>
        </label>
        <select
          id={tipoId}
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          disabled={isSubmitting}
          aria-required={true}
          aria-invalid={tipoError ? true : undefined}
          aria-describedby={tipoError ? `${tipoId}-error` : undefined}
          className={inputClass}
        >
          <option value="">{t('clienti.certificato.tipo_seleziona')}</option>
          <option value="non_agonistico">{t('clienti.certificato.tipo_non_agonistico')}</option>
          <option value="agonistico">{t('clienti.certificato.tipo_agonistico')}</option>
        </select>
        {tipoError && (
          <p id={`${tipoId}-error`} className="text-xs text-red-600 dark:text-red-400" role="alert">
            {tipoError}
          </p>
        )}
      </div>
```

- [ ] **Step 3: Campo "Data di scadenza"** — sostituire il blocco (righe ~106–123) con:

```tsx
      <div className="flex flex-col gap-1">
        <label htmlFor={dataId} className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('clienti.certificato.scadenza_label')}
          <span aria-hidden="true" className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id={dataId}
          type="date"
          value={dataScadenza}
          onChange={(e) => setDataScadenza(e.target.value)}
          disabled={isSubmitting}
          aria-required={true}
          aria-invalid={dataError ? true : undefined}
          aria-describedby={dataError ? `${dataId}-error` : undefined}
          className={inputClass}
        />
        {dataError && (
          <p id={`${dataId}-error`} className="text-xs text-red-600 dark:text-red-400" role="alert">
            {dataError}
          </p>
        )}
      </div>
```

- [ ] **Step 4: `npm run verify`** — Atteso: verde.

- [ ] **Step 5: Checklist manuale (D9/D10/D11):** label cliccabili associate; in errore input/select con `aria-invalid` + `aria-describedby`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/certificati/CertificatoForm.tsx
git commit -m "fix(a11y): label associate, aria-required ed errori collegati in CertificatoForm (D9/D10/D11)"
```

---

### Task 5: Assegna* e Tipo* form — errori collegati ai campi (D10)

**Files:**
- Modify: `src/renderer/src/components/memberships/AssegnaIscrizioneForm.tsx`
- Modify: `src/renderer/src/components/memberships/AssegnaAbbonamentoForm.tsx`
- Modify: `src/renderer/src/components/catalog/TipoAbbonamentoForm.tsx`
- Modify: `src/renderer/src/components/catalog/TipoIscrizioneForm.tsx`

**Contesto:** in questi form i `<p role="alert">` di errore non hanno `id` e i rispettivi input non hanno `aria-invalid`/`aria-describedby`. Pattern di riferimento corretto: `SettingsPage.tsx:744-772` (id sull'errore, `aria-invalid` + `aria-describedby` sull'input). Per **ogni** campo con errore presente nel form:

- [ ] **Step 1 (per ciascun file): leggere il file e individuare ogni coppia input↔errore.**
  Per ogni campo che ha un messaggio d'errore associato:
  1. generare un id stabile per l'errore. Se il file usa già `useId`, riusarlo; altrimenti usare un id derivato dal `name`/ruolo del campo, es. `const dataInizioErrId = useId()` (aggiungere `useId` all'import React).
  2. sull'input/select aggiungere: `aria-invalid={<conditionError> ? true : undefined}` e `aria-describedby={<conditionError> ? <errId> : undefined}`.
  3. sul `<p role="alert">` dell'errore aggiungere `id={<errId>}`.

  Esempio concreto (campo "data inizio" di `AssegnaIscrizioneForm`, errore intorno a riga 187):

```tsx
  // in cima al componente
  const dataInizioErrId = useId()
  // ... sull'input
  aria-invalid={dataInizioError ? true : undefined}
  aria-describedby={dataInizioError ? dataInizioErrId : undefined}
  // ... sull'errore
  <p id={dataInizioErrId} role="alert" className="...">{dataInizioError}</p>
```

  Applicare lo stesso schema a tutti i campi con errore di:
  - `AssegnaIscrizioneForm.tsx` (campi tipo iscrizione, data inizio)
  - `AssegnaAbbonamentoForm.tsx` (campi tipo abbonamento, data inizio)
  - `TipoAbbonamentoForm.tsx` (nome, durata/prezzo, … ovunque ci sia un `<p>` d'errore: righe ~150,188,208)
  - `TipoIscrizioneForm.tsx` (campi equivalenti)

- [ ] **Step 2: `npm run verify`** — Atteso: verde.

- [ ] **Step 3: Checklist manuale (D10):** forzare un errore di validazione in ciascun form e verificare che l'input esponga `aria-invalid` e `aria-describedby` puntando al testo d'errore.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/memberships/AssegnaIscrizioneForm.tsx src/renderer/src/components/memberships/AssegnaAbbonamentoForm.tsx src/renderer/src/components/catalog/TipoAbbonamentoForm.tsx src/renderer/src/components/catalog/TipoIscrizioneForm.tsx
git commit -m "fix(a11y): collega gli errori di validazione ai campi in Assegna*/Tipo* form (D10)"
```

---

## Cluster C — Navigazione da tastiera

### Task 6: ClientList — riga non più cliccabile, chevron come azione (D3)

**Files:**
- Modify: `src/renderer/src/components/clients/ClientList.tsx`

**Contesto:** il `<tr onClick=…>` (righe 171–175) è interattivo col mouse ma irraggiungibile da tastiera; esiste già un bottone chevron focusabile che fa la **stessa** azione (`onSelectCliente`). Soluzione KISS (da ANALYSYS D3): rimuovere `onClick` dal `<tr>`, lasciare il chevron come unica azione. Si mantiene l'hover sulla riga come affordance visiva.

- [ ] **Step 1: Rimuovere l'handler dal `<tr>`** (righe 171–175). Sostituire:

```tsx
                  <tr
                    key={cliente.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                    onClick={() => onSelectCliente(cliente)}
                  >
```

con:

```tsx
                  <tr
                    key={cliente.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
```

- [ ] **Step 2: Semplificare il bottone chevron** — non serve più `e.stopPropagation()` (riga 199–202). Sostituire l'`onClick` del bottone:

```tsx
                        onClick={() => onSelectCliente(cliente)}
```

- [ ] **Step 3: `npm run verify`** — Atteso: verde.

- [ ] **Step 4: Checklist manuale (D3):** con Tab si raggiunge il chevron di ogni riga e con Enter/Space si apre il dettaglio; il mouse continua a funzionare via chevron. Nessuna azione "fantasma" sulla riga.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/clients/ClientList.tsx
git commit -m "fix(a11y): riga lista clienti non più cliccabile, azione sul chevron accessibile (D3)"
```

---

### Task 7: IncassiWidget — `RigaValore` come vero `<button>` (D4) + barra `aria-hidden` (D12)

**Files:**
- Modify: `src/renderer/src/components/dashboard/IncassiWidget.tsx`

**Contesto:** `RigaValore` clickable è un `<div role="button">` che gestisce solo `Enter` (manca `Space` + `preventDefault`). Coerentemente con gli altri widget si usa un vero `<button>` quando cliccabile. Inoltre la barra proporzionale `role="img"` ha un `aria-label` generico (`dashboard.incassi.titolo`): i valori sono già esposti testualmente sotto, quindi va marcata `aria-hidden`.

- [ ] **Step 1: Riscrivere `RigaValore` (righe 24–51)** così che, quando cliccabile, renderizzi un `<button>`; quando non cliccabile, resti un `<div>`:

```tsx
function RigaValore({ label, value, dotColor, isLoading, onClick }: RigaValoreProps): React.JSX.Element {
  const isClickable = !!onClick && !isLoading

  const contenuto = (
    <>
      <div className="flex items-center gap-2">
        <span className={['w-3 h-3 rounded-full shrink-0', dotColor].join(' ')} aria-hidden="true" />
        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
        {isClickable && (
          <span className="text-xs text-gray-400 dark:text-gray-500" aria-hidden="true">→</span>
        )}
      </div>
      <span className={['text-sm font-semibold', isLoading ? 'text-gray-300 dark:text-gray-600' : 'text-gray-900 dark:text-gray-100'].join(' ')}>
        {isLoading ? '—' : value}
      </span>
    </>
  )

  if (isClickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="w-full flex items-center justify-between py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 -mx-5 px-5 rounded transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        {contenuto}
      </button>
    )
  }

  return (
    <div className="flex items-center justify-between py-2">
      {contenuto}
    </div>
  )
}
```

- [ ] **Step 2: Barra proporzionale `aria-hidden`** — sostituire (riga 84):

```tsx
              <div className="flex rounded-full overflow-hidden h-2 mb-4" role="img" aria-label={t('dashboard.incassi.titolo')}>
```

con:

```tsx
              <div className="flex rounded-full overflow-hidden h-2 mb-4" aria-hidden="true">
```

- [ ] **Step 3: `npm run verify`** — Atteso: verde. (Verificare che `t` resti usato altrove; sì — header/righe.)

- [ ] **Step 4: Checklist manuale (D4/D12):** la riga "da incassare" è un bottone raggiungibile da tastiera, attivabile con Enter **e** Spazio, con ring di focus; la barra non viene più annunciata in modo ridondante.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/dashboard/IncassiWidget.tsx
git commit -m "fix(a11y): RigaValore cliccabile come button (Enter+Spazio) e barra incassi aria-hidden (D4/D12)"
```

---

## Cluster D — Live region sugli stati di caricamento

### Task 8: Stati di loading con `role="status"`/`aria-live` (D7)

**Files:**
- Modify: `src/renderer/src/components/clients/ClientList.tsx`
- Modify: `src/renderer/src/pages/ReceiptsPage.tsx`
- Modify: `src/renderer/src/pages/CatalogoPage.tsx`
- Modify: `src/renderer/src/components/clients/ClientDetail.tsx`
- Modify: `src/renderer/src/components/receipts/EmittiRicevutaForm.tsx`

**Contesto:** vari blocchi di caricamento non hanno `role="status"`/`aria-live="polite"` (a differenza di `App.tsx`, corretto). Lo screen reader non annuncia che il contenuto sta caricando.

- [ ] **Step 1: ClientList** — il contenitore del loading (righe ~150–153) diventa:

```tsx
                  <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400" role="status" aria-live="polite">
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-primary-600 animate-spin" aria-hidden="true" />
                    <span>{t('common.loading')}</span>
                  </div>
```

- [ ] **Step 2: ReceiptsPage** — il blocco loading (righe ~245–248):

```tsx
        <div className="flex items-center justify-center py-20 gap-3 text-gray-600 dark:text-gray-400" role="status" aria-live="polite">
          <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-primary-600 animate-spin" aria-hidden="true" />
          <span className="text-sm">{t('common.loading')}</span>
        </div>
```

- [ ] **Step 3: CatalogoPage, ClientDetail, EmittiRicevutaForm** — leggere i rispettivi blocchi di loading (citati in ANALYSYS: `CatalogoPage.tsx:138-144`, `ClientDetail.tsx:352-358`, `EmittiRicevutaForm.tsx:195-201`) e, sul contenitore dello spinner, aggiungere `role="status" aria-live="polite"` e `aria-hidden="true"` sullo spinner decorativo. Mantenere le classi esistenti (eventualmente alzando `text-gray-400` → `text-gray-600 dark:text-gray-400`, vedi anche Task 10).

- [ ] **Step 4: `npm run verify`** — Atteso: verde.

- [ ] **Step 5: Checklist manuale (D7):** entrando in una pagina/sezione in caricamento, lo screen reader annuncia "Caricamento…" (polite).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/clients/ClientList.tsx src/renderer/src/pages/ReceiptsPage.tsx src/renderer/src/pages/CatalogoPage.tsx src/renderer/src/components/clients/ClientDetail.tsx src/renderer/src/components/receipts/EmittiRicevutaForm.tsx
git commit -m "fix(a11y): stati di caricamento con role=status/aria-live (D7)"
```

---

## Cluster E — Motivo del bottone disabilitato

### Task 9: ClientDetail — motivo "assegna abbonamento" disabilitato annunciabile (D8)

**Files:**
- Modify: `src/renderer/src/components/clients/ClientDetail.tsx`

**Contesto:** il bottone "assegna abbonamento" (righe ~898–908) è `disabled` quando manca un'iscrizione attiva, col motivo solo nel `title`; un elemento `disabled` non riceve focus, quindi il tooltip non è mai annunciato. Esiste già il messaggio visibile `data-testid="errore-no-iscrizione"` (righe ~782–787) con il testo `iscrizioni.assegna_prima`. Soluzione (da ANALYSYS D8): associare quel messaggio via `aria-describedby` usando `aria-disabled` (bottone focusabile) invece di `disabled`.

- [ ] **Step 1: dare un id al messaggio** — sul `<div data-testid="errore-no-iscrizione" …>` (riga ~782) aggiungere `id="errore-no-iscrizione-msg"`.

- [ ] **Step 2: rendere il bottone focusabile con `aria-disabled`** — sostituire il bottone (righe ~898–909) così:

```tsx
                <button
                  data-testid="btn-nuovo-abbonamento"
                  type="button"
                  onClick={() => { if (iscrizioneAttiva) setShowAssegnaAbbonamento(true) }}
                  aria-disabled={!iscrizioneAttiva}
                  aria-describedby={!iscrizioneAttiva ? 'errore-no-iscrizione-msg' : undefined}
                  className={[
                    'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                    iscrizioneAttiva
                      ? 'bg-primary-600 hover:bg-primary-700 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed',
                  ].join(' ')}
```

  Nota: si rimuove l'attributo `disabled` e l'attributo `title` (sostituito da `aria-describedby`); il click è no-op senza iscrizione attiva. Il messaggio visibile resta la guida primaria.

- [ ] **Step 3: `npm run verify`** — Atteso: verde.

- [ ] **Step 4: Checklist manuale (D8):** senza iscrizione attiva il bottone è raggiungibile da tastiera, espone `aria-disabled="true"` e `aria-describedby` verso il messaggio "Assegna prima un'iscrizione…"; il click non apre il form.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/clients/ClientDetail.tsx
git commit -m "fix(a11y): motivo del bottone 'assegna abbonamento' disabilitato annunciabile via aria-disabled/describedby (D8)"
```

---

## Cluster F — Contrasti

### Task 10: Contrasto testo grigio e placeholder (D5)

**Files:**
- Modify: `src/renderer/src/components/clients/ClientList.tsx`
- Modify: `src/renderer/src/components/dashboard/ScadenzeWidget.tsx`
- Modify: `src/renderer/src/pages/SettingsPage.tsx`
- Modify: `src/renderer/src/components/ui/SearchInput.tsx`
- Modify: `src/renderer/src/components/clients/ClientForm.tsx`

**Contesto:** `text-gray-400` (#9ca3af, ~2.85:1 su bianco) sotto la soglia WCAG 1.4.3 per il testo informativo; `placeholder-gray-400` idem. Portare il testo informativo ad almeno `text-gray-600` e i placeholder a `placeholder-gray-500`. **Non** toccare il testo puramente decorativo/disabilitato (es. spinner `—`, contatori) dove il colore comunica stato e non informazione essenziale; concentrarsi sui casi citati in ANALYSYS D5.

- [ ] **Step 1: leggere ogni file e individuare le occorrenze citate:**
  - `ClientList.tsx:37` (scadenza breve iscrizione) → `text-gray-400` → `text-gray-500 dark:text-gray-400` (testo secondario; alzare a 500 per il light, mantenere 400 in dark dove il fondo è scuro). In alternativa, dove il testo è informativo essenziale, `text-gray-600`.
  - `ScadenzeWidget.tsx:96` → testo informativo → `text-gray-600 dark:text-gray-400`.
  - `SettingsPage.tsx:694,1134` → testo informativo → `text-gray-600 dark:text-gray-400` (NON i contatori `xxx/200` decorativi se ridondanti; usare giudizio: se è informazione, alzare).
  - `SearchInput.tsx:47` → `placeholder-gray-400` → `placeholder-gray-500 dark:placeholder-gray-500`.
  - `ClientForm.tsx:95` (costante `inputClass`) → `placeholder-gray-400` → `placeholder-gray-500`.

  Regola pratica per ogni occorrenza: `text-gray-400` (informativo, su fondo chiaro) → `text-gray-600 dark:text-gray-400`; `placeholder-gray-400` → `placeholder-gray-500`.

- [ ] **Step 2: `npm run verify`** — Atteso: verde.

- [ ] **Step 3: Checklist manuale (D5):** in light mode il testo informativo grigio e i placeholder risultano leggibili (contrasto ≥ 4.5:1 per testo normale). Verificare anche in dark mode che non peggiori.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/clients/ClientList.tsx src/renderer/src/components/dashboard/ScadenzeWidget.tsx src/renderer/src/pages/SettingsPage.tsx src/renderer/src/components/ui/SearchInput.tsx src/renderer/src/components/clients/ClientForm.tsx
git commit -m "fix(a11y): contrasto testo grigio e placeholder (D5)"
```

---

### Task 11: Contrasto badge in dark mode (D6)

**Files:**
- Modify: `src/renderer/src/components/ui/Badge.tsx`

**Contesto:** in dark mode i badge usano testo `*-400` su fondo semi-trasparente `*-900/30`: la trasparenza `/30` riduce il contrasto del fondo, in particolare `warning`/`info`. Aumentare l'opacità del fondo a `/40` e schiarire il testo dove serve.

- [ ] **Step 1: aggiornare `variantClasses`** (righe 12–18):

```tsx
const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
}
```

- [ ] **Step 2: `npm run verify`** — Atteso: verde.

- [ ] **Step 3: Checklist manuale (D6):** in dark mode i badge (specie warning/info) hanno testo ben leggibile sul fondo.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ui/Badge.tsx
git commit -m "fix(a11y): migliora il contrasto dei badge in dark mode (D6)"
```

---

## Cluster G — Dettagli minori (D12)

### Task 12: Tabelle — `scope="col"` e `<caption className="sr-only">` (D12)

**Files:**
- Modify: `src/renderer/src/components/clients/ClientDetail.tsx`
- Modify: `src/renderer/src/pages/CatalogoPage.tsx`
- Modify: `src/renderer/src/pages/ReceiptsPage.tsx`
- Modify: `src/renderer/src/i18n/locales/it.json`, `src/renderer/src/i18n/locales/en.json`

**Contesto:** solo `ClientList` usa `scope="col"`. Mancano `scope` e `<caption>` nelle tabelle di `ClientDetail` (iscrizioni/abbonamenti/certificati), `CatalogoPage` (iscrizioni/abbonamenti), `ReceiptsPage` (ricevute).

- [ ] **Step 1: chiavi i18n per le caption** — in `it.json` aggiungere una sezione/voci, es. dentro le rispettive sezioni esistenti o in `common`:

```json
    "tabella_clienti": "Elenco clienti",
    "tabella_ricevute": "Elenco ricevute",
    "tabella_iscrizioni": "Elenco iscrizioni",
    "tabella_abbonamenti": "Elenco abbonamenti",
    "tabella_certificati": "Elenco certificati medici",
    "tabella_tipi_iscrizione": "Tipi di iscrizione",
    "tabella_tipi_abbonamento": "Tipi di abbonamento"
```

(in `common`). In `en.json` le traduzioni corrispondenti ("Clients list", "Receipts list", …).

- [ ] **Step 2: per ogni `<table>` citata:**
  - aggiungere come primo figlio: `<caption className="sr-only">{t('common.tabella_xxx')}</caption>`
  - aggiungere `scope="col"` a tutti i `<th>` di intestazione di colonna.

  Esempio (ReceiptsPage, intestazioni righe ~268–292): aggiungere `scope="col"` a ciascun `<th>` e, subito dopo `<table …>`, `<caption className="sr-only">{t('common.tabella_ricevute')}</caption>`.

- [ ] **Step 3: `npm run verify`** — Atteso: verde.

- [ ] **Step 4: Checklist manuale (D12):** ogni tabella ha una caption sr-only e header di colonna con `scope="col"`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/clients/ClientDetail.tsx src/renderer/src/pages/CatalogoPage.tsx src/renderer/src/pages/ReceiptsPage.tsx src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "fix(a11y): scope=col e caption sr-only sulle tabelle (D12)"
```

---

### Task 13: PeriodSelector `radiogroup` + bottoni-icona + PDF nuova finestra (D12)

**Files:**
- Modify: `src/renderer/src/components/dashboard/PeriodSelector.tsx`
- Modify: `src/renderer/src/pages/CatalogoPage.tsx`
- Modify: `src/renderer/src/components/clients/ClientDetail.tsx`
- Modify: `src/renderer/src/pages/ReceiptsPage.tsx`
- Modify: `src/renderer/src/i18n/locales/it.json`, `src/renderer/src/i18n/locales/en.json`

**Contesto (3 micro-fix raggruppati):**
1. `PeriodSelector` ha `role="group"` con `aria-label` non pertinente (`dashboard.titolo`) e usa `aria-pressed` per una selezione mutuamente esclusiva → usare `role="radiogroup"` con label dedicata e `role="radio"`/`aria-checked` sui bottoni.
2. Bottone-icona "elimina" del catalogo con nome accessibile e tooltip discordanti → allineare (nome accessibile = azione "elimina"; il motivo del blocco va nel messaggio, non come nome).
3. PDF aperto in nuova finestra (`ClientDetail.tsx:277`, `ReceiptsPage` apertura PDF) senza preavviso → aggiungere "(apre in nuova finestra)" al testo accessibile dell'azione.

- [ ] **Step 1: chiavi i18n** — in `it.json` `common`:

```json
    "seleziona_periodo": "Seleziona periodo",
    "apre_nuova_finestra": "(apre in una nuova finestra)"
```

In `en.json`: `"seleziona_periodo": "Select period"`, `"apre_nuova_finestra": "(opens in a new window)"`.

- [ ] **Step 2: PeriodSelector** — il contenitore (righe 70–74) diventa:

```tsx
      <div
        className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
        role="radiogroup"
        aria-label={t('common.seleziona_periodo')}
      >
```

  e ogni bottone (righe 78–91) usa `role="radio"` + `aria-checked` al posto di `aria-pressed`:

```tsx
            <button
              key={opzione}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => handleTipoChange(opzione)}
              className={[ /* invariato */ ].join(' ')}
            >
```

- [ ] **Step 3: bottone-icona "elimina" catalogo** (`CatalogoPage.tsx`, intorno a righe 303–331 e 588–616): assicurarsi che `aria-label`/`sr-only` del bottone sia sempre l'azione (`t('common.delete')` o equivalente "Elimina"), mentre l'eventuale motivo di blocco resti nel `title`/tooltip o, meglio, nel messaggio del dialog. Leggere il file e allineare nome accessibile e tooltip (non far divergere "elimina" vs "tipo assegnato"). Se il bottone è disabilitato quando assegnato (post-WP4), il nome accessibile resta "Elimina".

- [ ] **Step 4: PDF nuova finestra** — dove l'azione apre il PDF con `window.open(..., '_blank')` (`ClientDetail.tsx:277`, `ReceiptsPage.tsx`), aggiungere al testo accessibile del bottone/azione il suffisso `t('common.apre_nuova_finestra')`. Se l'azione è un bottone con testo visibile, aggiungere uno `<span className="sr-only">` con il suffisso; se è icona-only, includerlo nell'`aria-label`.

- [ ] **Step 5: `npm run verify`** — Atteso: verde.

- [ ] **Step 6: Checklist manuale (D12):** il selettore periodo è annunciato come gruppo radio con opzione selezionata; il bottone elimina ha nome coerente; le azioni che aprono PDF annunciano "(apre in una nuova finestra)".

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/dashboard/PeriodSelector.tsx src/renderer/src/pages/CatalogoPage.tsx src/renderer/src/components/clients/ClientDetail.tsx src/renderer/src/pages/ReceiptsPage.tsx src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json
git commit -m "fix(a11y): PeriodSelector radiogroup, nome bottone elimina coerente, preavviso PDF nuova finestra (D12)"
```

---

### Task 14: `focus:` → `focus-visible:` standardizzazione (D12)

**Files:**
- Modify: file con `focus:ring`/`focus:outline` su elementi interattivi non-input (citati: `CatalogoPage.tsx:664`, `ClientsPage.tsx:197`), e altri emersi via ricerca.

**Contesto:** uso disomogeneo di `focus:` invece di `focus-visible:` per il ring; standardizzare su `focus-visible:` per coerenza con la regola globale `:focus-visible`. **Attenzione:** non toccare i campi `input/select/textarea` dove `focus:ring` è desiderato anche da mouse (lì il ring serve sempre); intervenire su bottoni/elementi cliccabili dove il ring deve comparire solo da tastiera.

- [ ] **Step 1:** cercare le occorrenze: `Grep` per `focus:ring` e `focus:outline` in `src/renderer`. Per i **bottoni/link/card cliccabili** (non gli input testuali), sostituire `focus:outline-none focus:ring-2 focus:ring-…` con `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-…`. Applicare ai punti citati (`CatalogoPage.tsx:664`, `ClientsPage.tsx:197`) e analoghi.

- [ ] **Step 2: `npm run verify`** — Atteso: verde.

- [ ] **Step 3: Checklist manuale (D12):** il ring di focus sui bottoni/card compare con Tab ma non al click del mouse; gli input mantengono il ring al focus.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix(a11y): standardizza focus-visible sui controlli cliccabili (D12)"
```

---

## Task finale: review olistica + chiusura documentale

- [ ] **Step 1:** dispatch di un reviewer (sola lettura) sull'intero diff di branch vs `main`: verificare copertura D1–D12, assenza di stringhe hardcoded, parità chiavi IT/EN, nessuna regressione di tipi.

- [ ] **Step 2: aggiornare `ANALYSYS.md`** — nella tabella di verifica marcare D1–D12 come ✅ RISOLTO (WP5, 2026-06-14) con breve evidenza; aggiornare la riga "⬜ APERTO" rimuovendo D1–D12; aggiungere la nota di chiusura WP5 nel paragrafo "Verifica «verde»".

- [ ] **Step 3:** se durante l'implementazione emergono assunzioni/limiti (es. casi di contrasto lasciati invariati di proposito), registrarli in `OPEN-QUESTIONS.md`.

- [ ] **Step 4: `npm run verify` finale** — Atteso: verde (numero test invariato rispetto a main, build OK; nessun nuovo test perché WP UI-only senza harness componenti).

- [ ] **Step 5: commit documentale**

```bash
git add ANALYSYS.md OPEN-QUESTIONS.md
git commit -m "docs: chiusura WP5 accessibilità (D1–D12)"
```

- [ ] **Step 6:** usare la skill **superpowers:finishing-a-development-branch** per chiudere il branch (merge/push secondo scelta dell'utente).

---

## Self-Review (eseguita in fase di stesura)

**Copertura spec (D1–D12):**
- D1 → Task 1 · D2 → Task 1+2 · D3 → Task 6 · D4 → Task 7 · D5 → Task 10 · D6 → Task 11 · D7 → Task 8 · D8 → Task 9 · D9 → Task 3+4 · D10 → Task 3+4+5 · D11 → Task 3+4 · D12 → Task 7+12+13+14. **Tutti coperti.**

**Placeholder scan:** i Task 5, 10, 12, 13, 14 richiedono al subagent di "leggere il file e individuare le occorrenze" perché spaziano su molte righe/file omogenei: in quei casi è fornito lo **schema esatto** (codice di esempio concreto + regola di trasformazione + file:riga da ANALYSYS), non un TODO generico. I Task 1–4, 6–9, 11 contengono codice completo.

**Coerenza tipi/nomi:** `describedById` (prop introdotta in Task 1) è usata in Task 2. `titleId`/`messageId`/`errorId` generati con `useId`. `aria-required`/`aria-invalid` passati come `true | undefined` (compatibili coi tipi React). Nessun nuovo tipo condiviso introdotto.

**Note:** nessuna nuova dipendenza, nessuna migrazione, nessun cambio IPC. Gate = `npm run verify` verde per ogni task (scelta utente: verify-green).
