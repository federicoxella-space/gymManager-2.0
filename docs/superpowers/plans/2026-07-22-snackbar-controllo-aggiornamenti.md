# Snackbar feedback controllo aggiornamenti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere evidente il controllo aggiornamenti (all'avvio e manuale) con uno snackbar effimero in basso-destra: controllo in corso → trovato / nessuno / errore.

**Architecture:** Il main inoltra al renderer un nuovo evento `update:checking`; un primitivo UI `Snackbar` (presentazionale) e un container `UpdateCheckSnackbar` (event-driven) mostrano il feedback transitorio, mentre il banner `UpdateNotification` esistente continua a gestire download/installazione. In Impostazioni si rimuove il messaggio inline "nessun aggiornamento" ormai ridondante.

**Tech Stack:** Electron + React + TypeScript + Tailwind, i18next, electron-updater.

## Global Constraints

- KISS: soluzione più semplice; niente astrazioni premature.
- TypeScript strict; niente `any` senza motivazione.
- Stringhe UI **sempre** esternalizzate in i18n (namespace `aggiornamento.*`, `common.*`); mai hardcoded.
- Sicurezza Electron: nessun accesso a risorse di sistema dal renderer; comunicazione solo via eventi IPC (`window.api.on`).
- Snackbar in **basso-destra**, `z-50`; il banner `UpdateNotification` resta in basso-centro (nessuna sovrapposizione).
- Accessibilità: `role="status"`, `aria-live="polite"`, pulsante di chiusura con `aria-label` da i18n.
- Nessun unit test UI (coerente col resto del progetto); verifica via `npm run verify` e prova manuale.
- `npm run verify` (typecheck + lint + test + build:electron) deve restare verde.
- Convenzioni Tailwind/dark-mode e token della skill `design-system`.

---

### Task 1: Main — inoltro evento `update:checking`

**Files:**
- Modify: `src/main/updater/auto-updater.ts` (handler `checking-for-update`)

**Interfaces:**
- Produces: evento IPC `update:checking` (nessun payload) inviato al renderer quando l'updater inizia la verifica.

- [ ] **Step 1: Inoltrare l'evento al renderer**

In `src/main/updater/auto-updater.ts`, nel handler esistente:

```ts
  autoUpdater.on('checking-for-update', () => {
    log.info('[updater] Verifica aggiornamenti in corso...')
  })
```

sostituire il corpo con:

```ts
  autoUpdater.on('checking-for-update', () => {
    log.info('[updater] Verifica aggiornamenti in corso...')
    mainWindow.webContents.send('update:checking')
  })
```

- [ ] **Step 2: Verificare typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/updater/auto-updater.ts
git commit -m "feat(updater): inoltra l'evento update:checking al renderer"
```

---

### Task 2: Primitivo UI `Snackbar`

**Files:**
- Create: `src/renderer/src/components/ui/Snackbar.tsx`

**Interfaces:**
- Produces:
  - `type SnackbarVariant = 'info' | 'success' | 'neutral' | 'error'`
  - `export default function Snackbar(props: { message: string; variant?: SnackbarVariant; onClose: () => void; closeLabel: string; autoDismissMs?: number }): React.JSX.Element`

- [ ] **Step 1: Creare il componente**

Create `src/renderer/src/components/ui/Snackbar.tsx`:

```tsx
import React, { useEffect } from 'react'

export type SnackbarVariant = 'info' | 'success' | 'neutral' | 'error'

interface SnackbarProps {
  /** Testo già localizzato da mostrare. */
  message: string
  /** Variante visiva; default 'neutral'. */
  variant?: SnackbarVariant
  /** Chiamata alla chiusura (manuale o auto-dismiss). */
  onClose: () => void
  /** aria-label del pulsante di chiusura (localizzato). */
  closeLabel: string
  /** Se > 0, lo snackbar si chiude da solo dopo N ms. */
  autoDismissMs?: number
}

const VARIANT_CLASSES: Record<SnackbarVariant, string> = {
  info: 'bg-primary-600 text-white',
  success: 'bg-green-600 text-white',
  neutral: 'bg-gray-900 text-white dark:bg-gray-700',
  error:
    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700',
}

/**
 * Snackbar effimero non invasivo, ancorato in basso-destra.
 * Presentazionale: non conosce l'i18n né la logica di dominio; riceve testo,
 * variante ed eventuale auto-dismiss dal chiamante.
 */
export default function Snackbar({
  message,
  variant = 'neutral',
  onClose,
  closeLabel,
  autoDismissMs,
}: SnackbarProps): React.JSX.Element {
  useEffect(() => {
    if (!autoDismissMs || autoDismissMs <= 0) return
    const id = setTimeout(onClose, autoDismissMs)
    return () => clearTimeout(id)
  }, [autoDismissMs, onClose])

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-0 right-0 z-50 pointer-events-none"
    >
      <div
        className={[
          'pointer-events-auto m-4 max-w-sm w-max flex items-center gap-3',
          'text-sm px-4 py-3 rounded-lg shadow-lg',
          VARIANT_CLASSES[variant],
        ].join(' ')}
      >
        <span className="min-w-0 flex-1">{message}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="shrink-0 opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificare typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ui/Snackbar.tsx
git commit -m "feat(ui): componente Snackbar effimero riutilizzabile"
```

---

### Task 3: Container `UpdateCheckSnackbar` + i18n + montaggio

**Files:**
- Create: `src/renderer/src/components/updater/UpdateCheckSnackbar.tsx`
- Modify: `src/renderer/src/i18n/locales/it.json`
- Modify: `src/renderer/src/i18n/locales/en.json`
- Modify: `src/renderer/src/pages/Shell.tsx`

**Interfaces:**
- Consumes: `Snackbar` (Task 2); eventi `update:checking` / `update:available` / `update:not-available` / `update:error` via `window.api.on`; chiavi i18n `aggiornamento.controllo_in_corso`, `aggiornamento.disponibile`, `aggiornamento.nessuno`, `aggiornamento.errore_verifica`, `common.close`.
- Produces: `export default function UpdateCheckSnackbar(): React.JSX.Element | null`.

- [ ] **Step 1: Aggiungere la chiave i18n `controllo_in_corso` (it.json)**

In `src/renderer/src/i18n/locales/it.json`, dentro l'oggetto `"aggiornamento"`, aggiungere la chiave (dopo `"controllo"`):

```json
    "controllo_in_corso": "Controllo aggiornamenti in corso…",
```

- [ ] **Step 2: Aggiungere la chiave i18n `controllo_in_corso` (en.json)**

In `src/renderer/src/i18n/locales/en.json`, dentro `"aggiornamento"`, aggiungere:

```json
    "controllo_in_corso": "Checking for updates…",
```

- [ ] **Step 3: Validare i JSON**

Run: `node -e "require('./src/renderer/src/i18n/locales/it.json'); require('./src/renderer/src/i18n/locales/en.json'); console.log('JSON validi')"`
Expected: stampa `JSON validi`.

- [ ] **Step 4: Creare il container**

Create `src/renderer/src/components/updater/UpdateCheckSnackbar.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Snackbar from '../ui/Snackbar'

/** Stato del feedback di controllo aggiornamenti mostrato dallo snackbar. */
type Stato =
  | { fase: 'nascosto' }
  | { fase: 'controllo' }
  | { fase: 'trovato'; version: string }
  | { fase: 'nessuno' }
  | { fase: 'errore' }

/**
 * Snackbar effimero che rende evidente il controllo aggiornamenti (all'avvio e
 * manuale). Mostra "controllo in corso" e poi l'esito. Le azioni di
 * download/installazione restano gestite da UpdateNotification.
 * Comunica col main solo tramite window.api (eventi IPC).
 */
export default function UpdateCheckSnackbar(): React.JSX.Element | null {
  const { t } = useTranslation()
  const [stato, setStato] = useState<Stato>({ fase: 'nascosto' })

  useEffect(() => {
    const unsubChecking = window.api.on('update:checking', () => {
      setStato({ fase: 'controllo' })
    })
    const unsubAvailable = window.api.on('update:available', (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined
      setStato({ fase: 'trovato', version: info?.version ?? '' })
    })
    const unsubNotAvailable = window.api.on('update:not-available', () => {
      setStato({ fase: 'nessuno' })
    })
    const unsubError = window.api.on('update:error', () => {
      setStato({ fase: 'errore' })
    })
    return () => {
      unsubChecking()
      unsubAvailable()
      unsubNotAvailable()
      unsubError()
    }
  }, [])

  if (stato.fase === 'nascosto') return null

  const close = (): void => setStato({ fase: 'nascosto' })
  const closeLabel = t('common.close')

  switch (stato.fase) {
    case 'controllo':
      return (
        <Snackbar
          message={t('aggiornamento.controllo_in_corso')}
          variant="info"
          onClose={close}
          closeLabel={closeLabel}
        />
      )
    case 'trovato':
      return (
        <Snackbar
          message={t('aggiornamento.disponibile', { version: stato.version })}
          variant="success"
          onClose={close}
          closeLabel={closeLabel}
          autoDismissMs={6000}
        />
      )
    case 'nessuno':
      return (
        <Snackbar
          message={t('aggiornamento.nessuno')}
          variant="neutral"
          onClose={close}
          closeLabel={closeLabel}
          autoDismissMs={6000}
        />
      )
    case 'errore':
      return (
        <Snackbar
          message={t('aggiornamento.errore_verifica')}
          variant="error"
          onClose={close}
          closeLabel={closeLabel}
          autoDismissMs={8000}
        />
      )
  }
}
```

- [ ] **Step 5: Montare il container in Shell**

In `src/renderer/src/pages/Shell.tsx`:

Aggiungere l'import dopo quello di `UpdateNotification` (riga 9):

```tsx
import UpdateCheckSnackbar from '../components/updater/UpdateCheckSnackbar'
```

Montare il componente subito dopo `<UpdateNotification />` (riga ~237):

```tsx
      <UpdateNotification />
      <UpdateCheckSnackbar />
```

- [ ] **Step 6: Verificare typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/updater/UpdateCheckSnackbar.tsx src/renderer/src/i18n/locales/it.json src/renderer/src/i18n/locales/en.json src/renderer/src/pages/Shell.tsx
git commit -m "feat(updater): snackbar di feedback controllo aggiornamenti (avvio + manuale)"
```

---

### Task 4: Impostazioni — rimozione messaggio inline ridondante

**Files:**
- Modify: `src/renderer/src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: nulla di nuovo. Rimuove il feedback inline "nessun aggiornamento" (ora coperto dallo snackbar globale). Mantiene il feedback di errore inline e lo stato del pulsante.

- [ ] **Step 1: Non impostare più lo stato "aggiornato" nel listener not-available**

In `src/renderer/src/pages/SettingsPage.tsx`, nel `useEffect` dei listener (righe ~191-194), il blocco:

```tsx
    const unsubNotAvailable = window.api.on('update:not-available', () => {
      setIsCheckingUpdate(false)
      setUpdateCheckResult('aggiornato')
    })
```

diventa:

```tsx
    const unsubNotAvailable = window.api.on('update:not-available', () => {
      setIsCheckingUpdate(false)
    })
```

- [ ] **Step 2: Ridurre il tipo dello stato `updateCheckResult`**

Alla riga ~147, il tipo:

```tsx
  const [updateCheckResult, setUpdateCheckResult] = useState<'idle' | 'aggiornato' | 'errore'>('idle')
```

diventa:

```tsx
  const [updateCheckResult, setUpdateCheckResult] = useState<'idle' | 'errore'>('idle')
```

- [ ] **Step 3: Rimuovere il blocco JSX "aggiornato"**

Rimuovere interamente il blocco (righe ~1561-1566):

```tsx
        {updateCheckResult === 'aggiornato' && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <CheckIcon />
            {t('aggiornamento.nessuno')}
          </p>
        )}
```

Lasciare invariato il blocco `updateCheckResult === 'errore'` che segue.

- [ ] **Step 4: Verificare che `CheckIcon` non resti inutilizzato**

Dopo la rimozione, `CheckIcon` potrebbe non essere più referenziato in `SettingsPage.tsx`. Eseguire:

Run: `npm run lint`
Expected: PASS. Se ESLint segnala `CheckIcon` (o un import ora inutilizzato) come non usato, rimuovere la definizione/lo import di `CheckIcon` non più referenziato e rieseguire `npm run lint` finché è verde. Se invece `CheckIcon` è ancora usato altrove nel file, lasciarlo com'è.

- [ ] **Step 5: Verificare typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/pages/SettingsPage.tsx
git commit -m "refactor(settings): rimuove il messaggio inline 'nessun aggiornamento' (coperto dallo snackbar)"
```

---

### Task 5: Verifica finale

**Files:** nessuno (solo verifica).

- [ ] **Step 1: Gate di qualità completo**

Run: `npm run verify`
Expected: PASS su typecheck, lint, test, build:electron.

- [ ] **Step 2: Verifica manuale (consigliata)**

Run: `npm run dev`
- All'avvio (in produzione l'updater parte da solo; in dev il controllo automatico è disabilitato) verificare il flusso col controllo manuale: Impostazioni → "Controlla aggiornamenti" → compare lo snackbar in basso-destra con "Controllo aggiornamenti in corso…" e poi l'esito ("App aggiornata" in dev, che invia `update:not-available`).
- Verificare che in Impostazioni non compaia più il messaggio verde inline "App aggiornata" (ora è nello snackbar) e che il messaggio di errore inline resti presente in caso di errore.
- Verificare l'auto-dismiss (~6s) e la chiusura manuale (✕).

- [ ] **Step 3: Commit di formattazione se necessario**

Se `npm run format` modifica file:
```bash
npm run format
git add -A
git commit -m "chore(updater): formattazione"
```

---

## Note di self-review

- **Copertura spec:** evento `update:checking` (Task 1); snackbar basso-destra con varianti/auto-dismiss/accessibilità (Task 2); container event-driven per controllo/trovato/nessuno/errore + i18n + montaggio accanto al banner (Task 3); rimozione messaggio inline ridondante in Impostazioni mantenendo l'errore (Task 4); verify (Task 5).
- **Riuso i18n:** `aggiornamento.disponibile` ("…disponibile. Download in corso…") è accurato perché `checkForUpdatesAndNotify` avvia il download; `aggiornamento.nessuno` = "App aggiornata"; `aggiornamento.errore_verifica`. Unica nuova chiave: `controllo_in_corso` (it/en).
- **Convivenza col banner:** `UpdateNotification` invariato; lo snackbar è solo feedback transitorio. Entrambi reagiscono a `update:available` senza conflitti (banner in basso-centro, snackbar in basso-destra).
- **Rischio lint:** la rimozione del blocco in Impostazioni può rendere `CheckIcon` inutilizzato → gestito esplicitamente nel Task 4, Step 4.
- **Fuori scope (YAGNI):** unificazione banner/snackbar, coda multi-snackbar, unit test UI.
```
