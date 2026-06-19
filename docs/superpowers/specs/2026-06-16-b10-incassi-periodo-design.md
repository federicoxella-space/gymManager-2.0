# Card incassi degli Indicatori "del periodo" (B10) — Design

**Data:** 2026-06-16 · **Stato:** approvato in brainstorming, in attesa di review della spec scritta · **Origine:** rilievo B10 in `ANALYSYS.md` (la card "Incassi" degli Indicatori ignora il selettore di periodo).

## Contesto e problema

La dashboard ha un **selettore di periodo globale** (default "questo mese") che alimenta i widget "di periodo". La card "Incassi" nel widget **Indicatori** (`IndicatoriWidget.tsx:130-135`) mostra `data.incassi_pagati`, calcolato da `getIndicatori` (`dashboard-repository.ts`) su **tutte** le ricevute pagate **senza filtro data** → ignora il selettore. Il widget **Incassi** dedicato (`IncassiWidget` via `getIncassiPeriodo`) è invece corretto: filtra `data_emissione BETWEEN :dal AND :al AND stato='emessa'`.

La dashboard (`DashboardPage.tsx`) calcola già il range del periodo `{ dal, al }` e lo passa a `getIncassiPeriodo`, ma **non** alla chiamata `dashboard:indicatori`.

`FUNZIONALITA.md:91` elenca esplicitamente «**incassi del periodo**» tra gli indicatori sintetici; `FUNZIONALITA.md:98`: i widget "di periodo" seguono il selettore globale. La card è quindi un widget di periodo che oggi non rispetta la regola.

## Decisione (presa in brainstorming)

**Rendere la card "del periodo"**, non rimuoverla: si passa il range `{ dal, al }` a `getIndicatori` e si filtra `incassi_pagati` per `data_emissione` nel periodo, con **la stessa definizione** di `getIncassiPeriodo.totale_pagato`. Così la card segue il selettore e combacia col widget Incassi. (Scartata l'alternativa "rimuovere la card": la spec elenca l'incasso del periodo tra gli indicatori sintetici, e chi mostra solo gli Indicatori perderebbe il dato.)

## Progettazione per componente

### 1. Backend — `src/main/db/dashboard-repository.ts`
- `getIndicatori` cambia firma aggiungendo il range del periodo:
  `getIndicatori(oggi, giorniPreavvisoCert, giorniPreavvisoIsc, giorniPreavvisoAbb, dal, al)`.
- La query `incassi_pagati` passa da "tutte le ricevute pagate" a filtrata sul periodo, identica a `getIncassiPeriodo`:
  ```
  SELECT COALESCE(SUM(totale), 0) AS totale
  FROM ricevute
  WHERE stato = 'emessa' AND stato_pagamento = 'pagato'
    AND data_emissione BETWEEN :dal AND :al
  ```
- **`incassi_da_incassare` resta invariato** (non è mostrato nella card; è calcolato sulle associazioni attive `da_incassare`, non sulle ricevute). Documentare che solo `incassi_pagati` diventa "del periodo".

### 2. IPC — `src/main/ipc/handlers.ts` (`dashboard:indicatori`, ~riga 785)
Il handler accetta anche `dal`/`al` nei params e li inoltra:
```typescript
{ oggi, giorniCert, giorniIsc, giorniAbb, dal, al }: { oggi: string; giorniCert: number; giorniIsc: number; giorniAbb: number; dal: string; al: string }
...
return getIndicatori(oggi, giorniCert, giorniIsc, giorniAbb, dal, al)
```

### 3. Preload + tipi (allineati)
- `src/preload/index.ts` (`dashboard.indicatori`): aggiungere `dal: string; al: string` al tipo dei params.
- `src/types/shared.ts:515` e `src/renderer/src/types/api.d.ts:422` (`ElectronAPI.dashboard.indicatori`): stessa aggiunta di `dal`/`al`.

### 4. Renderer — `src/renderer/src/pages/DashboardPage.tsx`
La chiamata (`~riga 74`) `window.api.dashboard.indicatori({ oggi, giorniCert, giorniIsc, giorniAbb })` passa anche il range già disponibile (`apiPeriodo = { dal, al }`, riga 70):
```typescript
window.api.dashboard.indicatori({ oggi, giorniCert, giorniIsc, giorniAbb, dal: apiPeriodo.dal, al: apiPeriodo.al })
```
Nessuna modifica a `IndicatoriWidget.tsx` (continua a leggere `data.incassi_pagati`, ora "del periodo"). La label resta `dashboard.indicatori.incassi`.

## Test (Vitest)
- Aggiornare le chiamate esistenti a `getIndicatori(...)` in `tests/unit/dashboard.test.ts` (~9 punti) per passare il nuovo range. Per i test non legati agli incassi, passare un intervallo ampio che copra le date usate.
- Il test esistente "incassi_pagati somma le ricevute emesse e pagate" va reso esplicito: creare ricevute con `data_emissione` note e passare un `dal/al` che le copra; asserire la somma del periodo.
- Nuovo test: due ricevute pagate, una **dentro** il periodo e una **fuori** → `incassi_pagati` conta solo quella dentro (stessa semantica di `getIncassiPeriodo.totale_pagato`).

## Fuori scope (confermato)
- Rimozione della card incassi (scartata).
- Modifica di `incassi_da_incassare` o della sua base di calcolo (resta sulle associazioni attive; non mostrato nella card).
- Modifiche a `IncassiWidget` / `getIncassiPeriodo` (già corretti).

## Impatti trasversali
- Chiude B10; aggiorna `ANALYSYS.md`.
- Nessuna stringa nuova (label invariata); nessun impatto i18n.
- DoD: `npm run verify` verde; test unit per il filtro periodo su `incassi_pagati`.
- Nessun nuovo canale IPC; sicurezza Electron invariata.
