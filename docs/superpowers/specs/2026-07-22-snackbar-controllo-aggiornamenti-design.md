# Snackbar di feedback controllo aggiornamenti — Design

**Data:** 2026-07-22
**Stato:** approvato (brainstorming)
**Ambito:** feedback UI dell'auto-update (renderer) + un evento IPC aggiuntivo (main)

## Obiettivo

Rendere **evidente** il controllo degli aggiornamenti — sia quello automatico
all'apertura dell'app sia quello manuale in Impostazioni — mostrando un
**snackbar effimero** con l'esito: controllo in corso, aggiornamento trovato,
nessun aggiornamento, o errore. Oggi, se l'utente è già alla versione più
recente, all'avvio non vede alcun feedback (`update:not-available` viene
ignorato dal renderer) e non c'è indicazione di "controllo in corso".

## Decisioni (dal brainstorming)

1. **Stati mostrati**: controllo in corso → esito (trovato / nessuno / errore).
2. **Convivenza col banner esistente**: lo snackbar dà solo il feedback
   transitorio e sparisce da solo; il **banner esistente** (`UpdateNotification`)
   continua a gestire download e "Riavvia e installa". Nessuna duplicazione di
   funzioni.
3. **Ambito**: avvio **e** controllo manuale in Impostazioni (stesso snackbar
   globale, event-driven).
4. **Posizionamento**: snackbar in **basso-destra**; il banner resta in
   basso-centro (nessuna sovrapposizione).
5. **Impostazioni**: si **rimuove** il messaggio inline "nessun aggiornamento"
   (ora ridondante); il feedback di **errore** inline in Impostazioni **resta**.
6. **Test**: nessun unit test UI (coerente col resto della UI del progetto);
   verifica via `typecheck` + `lint` + `build` e prova manuale.

## Comportamento (UX)

Stati dello snackbar, tutti con `role="status"`, `aria-live="polite"` e pulsante
di chiusura (✕):

| Stato | Trigger evento | Testo (i18n) | Auto-dismiss |
|---|---|---|---|
| Controllo in corso | `update:checking` | `aggiornamento.controllo_in_corso` | no (resta finché non arriva un esito) |
| Trovato | `update:available` | `aggiornamento.disponibile` (con `version`) | sì, ~6s |
| Nessuno | `update:not-available` | `aggiornamento.nessuno` | sì, ~6s |
| Errore | `update:error` | `aggiornamento.errore_verifica` | sì, ~8s |

- Un nuovo evento sostituisce lo snackbar precedente (una sola istanza visibile).
- Lo stato "trovato" è **informativo**: le azioni (download/installa) restano sul
  banner esistente, che compare come oggi in risposta a `update:available`.
- Non bloccante: lo snackbar non copre contenuti interattivi e si chiude da sé.

## Architettura

Rispetta il flusso main → IPC → renderer. Nessun accesso a risorse di sistema
dal renderer; comunicazione solo via eventi IPC già esposti da `window.api.on`.

### Main (`src/main/updater/auto-updater.ts`)

- L'handler `autoUpdater.on('checking-for-update', …)` oggi fa solo `log.info`.
  Aggiungere l'inoltro al renderer: `mainWindow.webContents.send('update:checking')`.
- Gli altri eventi già inviati (`update:available`, `update:not-available`,
  `update:error`) restano invariati.
- Nessuna modifica al preload né a `ElectronAPI`: il canale `update:checking` è
  consumato tramite il metodo generico `window.api.on(channel, cb)`.

### Renderer

- **Nuovo primitivo UI** `src/renderer/src/components/ui/Snackbar.tsx`
  (presentazionale, riutilizzabile): props per variante visiva
  (`info` | `success` | `neutral` | `error`), messaggio, `onClose`, e
  auto-dismiss opzionale (ms). Fixed in basso-destra, `z-50`, stile coerente con
  la skill `design-system` (colori token, ombra, dark mode, spaziature).
- **Nuovo container** `src/renderer/src/components/updater/UpdateCheckSnackbar.tsx`:
  sottoscrive `update:checking` / `update:available` / `update:not-available` /
  `update:error` via `window.api.on`, mantiene lo stato corrente e rende lo
  `Snackbar` con il messaggio i18n e la variante adeguati. Gestisce timer di
  auto-dismiss e cleanup delle sottoscrizioni allo smontaggio.
- **Montaggio**: accanto a `UpdateNotification` nel guscio dell'app (stesso punto
  in cui è già montato `UpdateNotification`).
- `UpdateNotification.tsx` resta **invariato**.

### Impostazioni (`src/renderer/src/pages/SettingsPage.tsx`)

- Nel listener `update:not-available` (righe ~191-194): rimuovere
  `setUpdateCheckResult('aggiornato')`, mantenere `setIsCheckingUpdate(false)`.
- Rimuovere il blocco JSX `updateCheckResult === 'aggiornato'` (righe ~1561-1566,
  il messaggio verde "nessun aggiornamento").
- Ridurre il tipo di stato `updateCheckResult` a `'idle' | 'errore'`.
- **Mantenere** il blocco errore inline (righe ~1568-1589) e lo stato
  `isCheckingUpdate` del pulsante (spinner/disabilitazione), che non sono
  duplicati di messaggi ma feedback locali del pulsante.

### i18n (`src/renderer/src/i18n/locales/it.json`, `en.json`)

- Aggiungere `aggiornamento.controllo_in_corso`
  (IT: "Controllo aggiornamenti in corso…"; EN: "Checking for updates…").
- Riusare le chiavi esistenti `aggiornamento.disponibile` (con `{{version}}`),
  `aggiornamento.nessuno`, `aggiornamento.errore_verifica`.

## Invarianti / rischi

- Nessun impatto su dominio, DB, ricevute, backup.
- Cambiamento limitato a feedback UI + un evento IPC informativo aggiuntivo.
- L'auto-update (download/installa, macOS reveal-in-Finder) resta invariato.
- Dev mode: all'avvio il controllo è disabilitato (nessun `update:checking`); il
  controllo manuale in dev invia direttamente `update:not-available` → lo
  snackbar mostra "nessuno" senza fase di controllo (comportamento accettabile).

## Fuori scope (YAGNI)

- Unificazione del banner nello snackbar (esplicitamente scartata).
- Coda multi-snackbar / stacking (una sola istanza basta).
- Unit test UI (coerente col resto del progetto).
- Modifiche al meccanismo di auto-update o al controllo manuale in sé.
