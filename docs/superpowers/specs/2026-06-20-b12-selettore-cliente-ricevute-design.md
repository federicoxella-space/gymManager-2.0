# Selettore cliente nella pagina Ricevute (B12 #3) — Design

**Data:** 2026-06-20 · **Stato:** approvato in brainstorming, in attesa di review della spec scritta · **Origine:** ultimo punto aperto del rilievo B12 in `ANALYSYS.md`; `FUNZIONALITA.md:75`; nota WP4b/B12 in `OPEN-QUESTIONS.md`.

## Contesto e problema

B12 raccoglie gap minori. Quattro su cinque sono già chiusi:
- #1 ricerca tipi catalogo → fatto in WP4b (`SearchInput` per tab in `CatalogoPage`).
- #2 modifica date abbonamento in UI → fatto in WP4b (`ClientDetail`).
- #4 stringhe `'mese'/'mesi'` hardcoded → fatto in WP5 (esternalizzate).
- #5 euristica anno CF → documentata in `OPEN-QUESTIONS.md`.

Resta **#3**: la pagina Ricevute (`ReceiptsPage.tsx`) offre solo una ricerca testuale (che filtra per nome intestatario) e i filtri anno/stato/pagamento, ma non un **selettore cliente** dedicato come citato in `FUNZIONALITA.md:75`. In WP4b era stato rimandato come "opzionale". Decisione in brainstorming: **implementarlo**.

Fatto verificato: il backend è **già pronto** — `RicevutaFilters` include `clienteId?: number` e `listRicevute` applica `WHERE cliente_id = ?` (`receipts-repository.ts:289-292`). L'intervento è quindi **solo UI** (più stringhe i18n). Esiste già un pattern di ricerca cliente riusabile: la ricerca tutore in `ClientForm.tsx` (query ≥2 caratteri → `clienti.list({ search, stato: 'attivo' })` → dropdown risultati → selezione).

## Decisione (presa in brainstorming)

Aggiungere alla barra filtri di Ricevute un **selettore cliente con ricerca** (autocomplete): digitando ≥2 caratteri si cerca tra i clienti; selezionandone uno, la lista mostra solo le sue ricevute (filtro `clienteId` passato al backend). Un controllo per **azzerare** la selezione torna a "tutti i clienti".

## Progettazione per componente

### 1. UI — `src/renderer/src/pages/ReceiptsPage.tsx`
- **Stato nuovo:**
  - `filtroClienteId: number | null` (default `null`);
  - `clienteSelezionato: ClienteRow | null` (per mostrare nome/etichetta del cliente scelto);
  - `clienteQuery: string` e `clienteRisultati: ClienteRow[]` (autocomplete).
- **Ricerca:** `useEffect` su `clienteQuery`: se `trim().length < 2` → `clienteRisultati = []`; altrimenti `window.api.clienti.list({ search: clienteQuery.trim(), stato: 'attivo' })` → set risultati (catch → []). (Stesso pattern del tutore.)
- **Caricamento ricevute:** in `loadRicevute`, aggiungere al filtro passato al backend `clienteId: filtroClienteId ?? undefined`, e aggiungere `filtroClienteId` alle dipendenze del `useCallback`. Così il cambio cliente ri-carica dal backend (coerente con anno/stato già lato backend).
- **Render (barra filtri):** un nuovo controllo "Cliente":
  - se `clienteSelezionato === null`: input di ricerca (`type="search"`) con dropdown dei risultati; al click su un risultato → `setFiltroClienteId(c.id)`, `setClienteSelezionato(c)`, pulisce query e risultati;
  - se selezionato: mostra il nome (`cognome nome`) con un pulsante **×** "Rimuovi" che azzera `filtroClienteId`/`clienteSelezionato`/query.
- **Coesistenza filtri:** il selettore cliente (backend, `clienteId`) e la ricerca testuale esistente (client-side su intestatario) restano entrambi attivi e si combinano (AND). Anno/stato (backend) e pagamento (client-side) invariati.
- Tutte le stringhe nuove esternalizzate.

### 2. i18n — `src/renderer/src/i18n/locales/it.json` + `en.json`
Nuove chiavi sotto `ricevute` (es.): `filtro_cliente` ("Cliente"), `filtro_cliente_cerca` (placeholder "Cerca cliente…"), `filtro_cliente_rimuovi` ("Rimuovi filtro cliente"), `filtro_cliente_nessuno` ("Nessun cliente trovato") se serve. Parità IT/EN.

### 3. Backend
Nessuna modifica: `clienteId` è già supportato. Si aggiunge un **test di regressione** unit per fissare il comportamento di `listRicevute({ clienteId })` (filtra le ricevute del solo cliente), nel file di test ricevute esistente.

## Test (Vitest)
- Regressione backend: `listRicevute({ clienteId })` ritorna solo le ricevute del cliente indicato (e, combinato con `anno`, le filtra entrambe). Estende il test ricevute esistente, riusando gli helper del file.
- La UI di `ReceiptsPage` non è unit-testabile (niente DOM/component harness, coerente con WP1–WP5): copertura via `npm run verify` verde + **verifica manuale** documentata.

## Fuori scope (confermato)
- Modifiche al backend dei filtri ricevute (già completi).
- Selettore con elenco completo non filtrato (si usa la ricerca, coerente col tutore e adatto a molti clienti).
- Riordino/refactor della barra filtri esistente.

## Impatti trasversali
- Chiude **B12** integralmente; aggiorna `ANALYSYS.md` e la voce "Filtro cliente dedicato" in `OPEN-QUESTIONS.md` (da Aperta a Chiusa).
- Stringhe nuove esternalizzate (IT/EN allineate).
- DoD: `npm run verify` verde; test di regressione `listRicevute({ clienteId })`. UI = verifica manuale documentata.
- Nessun nuovo canale IPC; sicurezza Electron invariata.
