# Filtro età e conteggi nella pagina Clienti — Design

**Data:** 2026-07-22
**Stato:** approvato (brainstorming)
**Ambito:** pagina Clienti (renderer) + query lista/conteggio (main)

## Obiettivo

Nella pagina Clienti aggiungere:
1. Un **filtro età**: mostrare solo i minorenni o solo i maggiorenni.
2. Il **numero totale** di clienti (attivi).
3. Il numero di clienti che **soddisfano i filtri** rispetto al totale, in
   **formato compatto** (es. `250/1333`).

## Decisioni (dal brainstorming)

1. **Età sconosciuta**: i clienti **senza `data_nascita`** sono **esclusi da
   entrambe** le categorie (compaiono solo con filtro "Tutti").
2. **Denominatore** del rapporto = **totale clienti attivi** (la popolazione
   base della pagina), indipendente da ricerca e filtri.
3. **Formato compatto** `filtrati/totale`. Per evitare `1333/1333` quando nessun
   filtro restringe i risultati, si mostra **solo il totale** (`1333`) quando
   `filtrati === totale`, e il rapporto (`250/1333`) quando i filtri riducono
   l'insieme. Numeri interi senza separatore (come da esempio dell'utente).

## Comportamento (UX)

- Nuovo `select` **"Età"** tra i filtri esistenti: **Tutti** / **Minorenni** /
  **Maggiorenni**. Si combina con gli altri filtri (ricerca, iscrizione,
  certificato, tipo abbonamento).
- Riga di conteggio in cima alla lista (sotto l'intestazione/filtri):
  - nessun filtro che restringe → `1333` clienti (etichetta i18n, es.
    "1333 clienti");
  - filtri attivi che restringono → `250/1333`.
- Il totale viene caricato una volta e **non** cambia al variare dei filtri; il
  numeratore riflette i clienti attualmente mostrati.

## Calcolo dell'età (coerenza col dominio)

Coerente con `isMinorenne` (`src/main/domain/cliente.ts`): minorenne = età < 18
rispetto a oggi.

- Minorenne: `data_nascita IS NOT NULL AND data_nascita > date('now','-18 years')`
- Maggiorenne: `data_nascita IS NOT NULL AND data_nascita <= date('now','-18 years')`

`date('now')` di SQLite è in UTC, coerente con il parsing UTC di `isMinorenne`.
Al 18° compleanno esatto il cliente è **maggiorenne** (uguaglianza → ramo `<=`),
come in `isMinorenne` (`oggi < eta18` è falso quel giorno).

## Architettura (main → IPC → renderer)

### Main — dominio/repository (`src/main/db/clients-repository.ts`)

- `ClientiFilters` (in `src/types/shared.ts`) acquisisce il campo opzionale
  `eta?: 'minorenne' | 'maggiorenne'`.
- `listClienti`: aggiungere alla costruzione dinamica del WHERE la clausola età
  quando `filters.eta` è valorizzato (usando le espressioni SQL sopra).
- Nuova funzione `contaClientiAttivi(): number` — `SELECT COUNT(*) FROM clienti
  WHERE stato = 'attivo'`.

### Main — IPC (`src/main/ipc/handlers.ts`)

- Nuovo handler `clienti:count` → ritorna `contaClientiAttivi()`.
- `clienti:list` invariato nella firma (usa il nuovo filtro tramite
  `ClientiFilters`).

### Preload e tipi

- `src/preload/index.ts`: aggiungere `clienti.count()` che invoca `clienti:count`.
- `src/types/shared.ts`: aggiungere `eta` a `ClientiFilters` e
  `count: () => Promise<number>` all'interfaccia `ElectronAPI.clienti`.
- `src/renderer/src/types/api.d.ts`: **nessuna modifica manuale** — dopo il
  consolidamento importa `ElectronAPI` da `shared.ts`.

### Renderer (`src/renderer/src/pages/ClientsPage.tsx`)

- Nuovo stato per il filtro età (`'' | 'minorenne' | 'maggiorenne'`), passato in
  `ClientiFilters.eta` quando valorizzato; nuovo `<select>` "Età" tra i filtri.
- Nuovo stato `totaleClienti` caricato al mount via `window.api.clienti.count()`.
- Numeratore = `clienti.length` (la lista **non** è paginata: assunzione valida
  oggi; annotata). Rendering della riga di conteggio compatta secondo la regola
  sopra.
- Formattazione numeri: interi semplici (nessun separatore), coerenti con
  l'esempio `250/1333`.

### i18n (`it.json`, `en.json`)

Nuove chiavi sotto `clienti.*`:
- `filtri.eta` (label del select), `filtri.eta_minorenni`, `filtri.eta_maggiorenni`
  (riuso di `filtri.tutti` per l'opzione "Tutti");
- `conteggio_totale` (es. "{{totale}} clienti") e `conteggio_filtrati`
  (es. "{{filtrati}}/{{totale}}").

## Test

Vitest unit (pattern `tests/unit/clients-repository.test.ts`, DB in-memory):
- `listClienti` con `eta: 'minorenne'` e `eta: 'maggiorenne'`: inclusione/
  esclusione corretta, e clienti con `data_nascita` nulla esclusi da entrambi;
  combinazione con un altro filtro (es. `search`).
- `contaClientiAttivi`: conta solo i clienti `attivo` (esclude anonimizzati).

`npm run verify` verde.

## Invarianti / rischi

- Solo lettura + UI. Nessun impatto su dominio scritturale, ricevute, backup,
  migrazioni.

## Fuori scope (YAGNI)

- Terza voce "data mancante" nel filtro età.
- Conteggio filtrato calcolato lato server (il numeratore resta `clienti.length`
  finché la lista non è paginata).
- Formattazione con separatore delle migliaia per i conteggi.
