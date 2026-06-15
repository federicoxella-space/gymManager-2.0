# Drill-down certificati dalla dashboard (B9) — Design

**Data:** 2026-06-15 · **Stato:** approvato in brainstorming, in attesa di review della spec scritta · **Origine:** rilievo B9 in `ANALYSYS.md` (il drill-down certificati dalla dashboard non filtra coerentemente la lista clienti).

## Contesto e problema

La card "Certificati" della dashboard (`IndicatoriWidget.tsx:111-115`) mostra il conteggio `certificati_in_scadenza` = certificati che scadono entro la finestra di preavviso (`data_scadenza − oggi BETWEEN 0 AND giorni`, **non** ancora scaduti). Cliccandola, però, la lista clienti viene filtrata per `stato_certificato: 'scaduto'` (`Shell.tsx:131-132`), cioè i certificati **già scaduti** — un bucket diverso. Risultato: il numero sulla card e la lista non combaciano. Inoltre i certificati già scaduti non hanno oggi alcuna card propria sulla dashboard, quindi restano poco visibili.

`FUNZIONALITA.md:99` richiede: «certificati in scadenza → lista clienti filtrata».

## Decisioni di dominio (prese in brainstorming)

1. **Cosa mostra il click:** la lista deve mostrare i certificati **in scadenza E quelli già scaduti** insieme — tutto ciò che richiede rinnovo (non solo "in scadenza", non solo "scaduti"). Si introduce un valore di filtro **combinato** `da_gestire`.
2. **Coerenza card↔lista:** la card della dashboard viene allineata: conta `in scadenza + scaduti` e cambia etichetta in «Certificati da gestire». Così il numero della card combacia con le righe della lista e gli scaduti diventano visibili sulla dashboard.
3. **Nome del valore di filtro:** `da_gestire`.
4. **Filtro manuale:** il dropdown del filtro certificato in `ClientsPage` espone anche l'opzione `da_gestire`, così il set è raggiungibile manualmente (coerente col tipo).

## Fondamento tecnico (verificato)

- Il filtro lista `stato_certificato: 'in_scadenza'` (`clients-repository.ts:187-191`) usa **la stessa finestra** dell'indicatore: `julianday(data_scadenza) − julianday(now) BETWEEN 0 AND giorniPreavvisoCert`. Il filtro `'scaduto'` usa `< now`. La loro unione è esattamente `data_scadenza − now <= giorniPreavvisoCert` (con `data_scadenza NOT NULL`) → questa è la definizione di `da_gestire`.
- Le due metriche `certificati_in_scadenza` (= `[0, giorni]`) e `certificati_scaduti` (= `< 0`) sono **entrambe già calcolate e restituite** da `getIndicatori` ed esposte nel tipo `WidgetIndicatori` (`shared.ts:363-364`). Sono disgiunte; la loro somma = conteggio di `da_gestire`. Quindi la card può sommarle lato renderer **senza modifiche a `getIndicatori`**.
- Sia la lista (`clienti:list` → `listClienti(filters, settings.expiry_warning_days_certificates)`, `handlers.ts:291`) sia l'indicatore usano `expiry_warning_days_certificates`. Invariante da preservare: la dashboard passa lo stesso valore configurato a `dashboard:indicatori`, così card e lista restano allineate.

## Progettazione per componente

### 1. Backend — `src/main/db/clients-repository.ts`
Aggiungere un ramo nel costruttore del filtro (accanto a `'scaduto'`/`'in_scadenza'`/`'valido'`, righe ~183-196):
```
else if (filters?.stato_certificato === 'da_gestire') {
  // in scadenza (0..giorni) + già scaduti (<0) = entro la finestra di preavviso
  condition: cm.data_scadenza IS NOT NULL AND julianday(cm.data_scadenza) - julianday(date('now')) <= ?
  param: giorniPreavvisoCert
}
```

### 2. Tipi (3 punti, da tenere allineati)
- `src/types/shared.ts:132`: `stato_certificato?: 'valido' | 'in_scadenza' | 'scaduto' | 'da_gestire'`.
- `src/renderer/src/types/api.d.ts`: stesso cambio nel mirror di `ClientiFilters`.
- `src/renderer/src/pages/ClientsPage.tsx:12`: `type StatoCertificatoFilter = '' | 'valido' | 'in_scadenza' | 'scaduto' | 'da_gestire'`.

### 3. Drill-down — `src/renderer/src/pages/Shell.tsx:131-132`
```
} else if (filtro === 'certificato') {
  setClientFilter({ stato_certificato: 'da_gestire' })   // era 'scaduto'
  setActiveNav('clients')
}
```

### 4. Card dashboard — `src/renderer/src/components/dashboard/IndicatoriWidget.tsx:111-116`
- `value={(data?.certificati_in_scadenza ?? 0) + (data?.certificati_scaduti ?? 0)}`.
- `label`/`ariaLabel` → nuova chiave i18n "Certificati da gestire".
- Nessuna modifica a `getIndicatori` o al tipo `WidgetIndicatori`.

### 5. Filtro manuale — `src/renderer/src/pages/ClientsPage.tsx`
Aggiungere nel `<select>` del filtro certificato (dopo `scaduto`, righe ~222-225):
```
<option value="da_gestire">{t('clienti.filtri.cert_da_gestire')}</option>
```

### 6. i18n — `it.json` / `en.json`
- `dashboard.indicatori.certificati`: "Certificati in scadenza" → **"Certificati da gestire"** (IT) / "Certificates to handle" (EN). (Verificare la chiave esatta usata da `IndicatoriWidget`.)
- Nuova `clienti.filtri.cert_da_gestire`: "Da gestire (in scadenza o scaduti)" / "To handle (expiring or expired)".
- Parità chiavi IT/EN.

## Test (Vitest)
- Estendere il test del clients-repository: `listClienti({ stato_certificato: 'da_gestire' })` su un set con (a) cert in scadenza entro finestra, (b) cert già scaduto, (c) cert valido oltre finestra, (d) cliente senza certificato → ritorna solo (a) e (b). Usare un `giorniPreavvisoCert` esplicito per determinismo.
- La somma della card è banale (i due conteggi sono già testati separatamente in `dashboard.test.ts`); nessun nuovo test backend per gli indicatori.

## Fuori scope (confermato)
- I dropdown del filtro in `ClientsPage` **non riflettono** il filtro proveniente dalla dashboard (mostrano "Tutti"): comportamento **preesistente** comune a tutti i drill-down; non modificato in B9.
- Rimozione/rinominazione delle metriche `certificati_in_scadenza` / `certificati_scaduti` nel tipo: restano invariate (potrebbero servire altrove).
- Modifiche a `getIndicatori` o a `getClientiInScadenza` (la ScadenzeWidget già include gli scaduti per uniformità).

## Impatti trasversali
- Chiude B9; aggiorna `ANALYSYS.md`.
- Stringhe nuove esternalizzate (IT/EN allineate).
- DoD: `npm run verify` verde; test unit per il nuovo filtro `da_gestire`.
- Nessun impatto su sicurezza Electron / IPC (nessun nuovo canale).
