# Disaccoppiamento Ricevuta ↔ Pagamento — Design

**Data:** 2026-06-24 · **Stato:** approvato in brainstorming · **Origine:** feedback utente in fase di test 0.1.5 (impossibile combinare voci pagate e non in una ricevuta; possibili ricevute duplicate).

## Problema
Oggi l'eleggibilità di una voce (iscrizione/abbonamento) all'emissione di ricevuta è legata allo **stato di pagamento** (`getVociPagabili` = `stato_pagamento='da_incassare' AND attivo`), e l'emissione/annullamento **modificano** il pagamento. Conseguenze: non si possono fatturare insieme voci pagate e non; si possono ri-fatturare voci già su una ricevuta (duplicati); pagamento e documento sono conflati.

## Modello deciso (disaccoppiamento totale)
Due assi **indipendenti**:
1. **Ricevuta** — una voce è fatturabile finché **non è già coperta da una ricevuta emessa** (`stato='emessa'`, quindi non annullata). Discriminante = "senza ricevuta", non il pagamento.
2. **Pagamento** — `pagato`/`da_incassare` è proprietà a sé della voce, modificabile con un controllo dedicato, **indipendente** dalle ricevute.

Regole:
- **Eleggibilità** (`getVociPagabili`): voci **non invalidate** (`stato != 'invalidato'/'invalidata'`) e **non presenti** in alcuna riga di ricevuta con `stato='emessa'`. (Si rimuovono sia il filtro pagamento sia il filtro "solo attivo".)
- **Emettere** una ricevuta **non cambia** il pagamento delle voci.
- **Annullare** una ricevuta libera le voci (tornano fatturabili perché la ricevuta non è più `emessa`), **senza** toccare il pagamento.
- Il campo `stato_pagamento` della **ricevuta** resta (è la sua metadata: emessa pagata o da incassare); non viene propagato alle voci.

## Modifiche

### Backend — `src/main/db/receipts-repository.ts`
- `getVociPagabili(clienteId)`: per iscrizioni e abbonamenti, `WHERE cliente_id=? AND stato NOT IN ('invalidato'/'invalidata') AND NOT EXISTS (SELECT 1 FROM righe_ricevuta rr JOIN ricevute r ON r.id=rr.ricevuta_id WHERE rr.tipo=<tipo> AND rr.riferimento_id=<voce>.id AND r.stato='emessa')`.
- `creaRicevuta`: **rimuovere** il blocco che imposta `stato_pagamento='pagato'` sulle voci collegate (righe ~234-249).
- `annullaRicevuta`: **rimuovere** il blocco che riporta le voci a `da_incassare` (righe ~23-35). L'annullamento resta (ricevuta → `annullata`), le voci tornano eleggibili automaticamente.
- Nuove funzioni: `setStatoPagamentoIscrizione(id, stato)` e `setStatoPagamentoAbbonamento(id, stato)` (`stato`: `'pagato'|'da_incassare'`) → `UPDATE ... SET stato_pagamento=?, data_modifica=datetime('now') WHERE id=?`.

### IPC + preload + tipi
- `iscrizioni:setPagamento` e `abbonamenti:setPagamento` (`{ id, stato }`). Preload + `ElectronAPI` (shared.ts + api.d.ts).

### Renderer — `src/renderer/src/components/clients/ClientDetail.tsx`
- **Rimuovere** il pulsante "Emetti ricevuta" per riga e lo stato/wiring `ricevutaVoceExtra` (revert dell'aggiunta precedente). Resta il solo CTA "Emetti ricevuta" della sezione Ricevute.
- Aggiungere un **toggle pagamento** per riga (iscrizione attiva + ogni abbonamento): mostra "pagato/da incassare" e consente di cambiarlo (chiama `setPagamento`, poi ricarica). Mantenere la visualizzazione dello stato pagamento (già aggiunta per gli abbonamenti).

### Renderer — `src/renderer/src/components/receipts/EmittiRicevutaForm.tsx`
- **Rimuovere** il prop `voceExtra` (non più necessario). La lista ora arriva già corretta da `getVociPagabili` (voci senza ricevuta). Preselezione: selezionare di default tutte le voci elencate (sono tutte non fatturate). Il selettore `stato_pagamento` del form resta come metadata della ricevuta (non propagato alle voci).

### Test (Vitest)
- `getVociPagabili`: include voci `da_incassare` **e** `pagato` se senza ricevuta; **esclude** voci già su ricevuta `emessa`; **re-include** dopo annullamento; esclude invalidati. (Aggiorna i test esistenti che assumevano il filtro pagamento.)
- `creaRicevuta`: **non** cambia `stato_pagamento` delle voci. `annullaRicevuta`: **non** cambia `stato_pagamento`; la voce torna in `getVociPagabili`.
- `setStatoPagamento*`: aggiorna il pagamento.

### Docs
- **CLAUDE.md invariante 5** e `docs/DECISIONS.md`: aggiornare — l'annullamento mantiene il numero e libera le voci per la ri-fatturazione, **senza** modificare lo stato di pagamento (pagamento e ricevuta disaccoppiati). Annotare il cambiamento.

## Fuori scope
- Storicizzazione/UX avanzata dei pagamenti; resta un semplice toggle.
- Modifiche alla numerazione/immutabilità delle ricevute (invariate).
