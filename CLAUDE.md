# GymManager 2.0 — Istruzioni di progetto

Gestionale desktop per palestre (remake): gestione clienti, iscrizioni, abbonamenti e ricevute.
La conoscenza autorevole vive in `docs/`. Questo file riassume le regole **sempre valide**.

## Stack
- Electron + React + TypeScript + Tailwind CSS
- Persistenza: SQLite (better-sqlite3) cifrato con SQLCipher
- Auto-update: electron-updater su GitHub Releases
- PDF ricevute: template HTML + `webContents.printToPDF`
- i18n: i18next (IT di default, predisposto multilingua)
- Test: Vitest (unit), Playwright (e2e su Electron)
- Backup cloud: googleapis, scope `drive.file`

## Principi
- **KISS**: la soluzione più semplice che soddisfa la specifica. Niente astrazioni premature.
- Best practice del linguaggio/framework; codice tipizzato, niente `any` salvo motivazione esplicita.
- Lingua UI italiana; le stringhe sono **sempre** esternalizzate (mai hardcoded).
- Sicurezza Electron: `contextIsolation: true`, `nodeIntegration: false`, IPC solo via preload.

## Invarianti di dominio (NON violare mai)
1. Un cliente ha al massimo **una iscrizione attiva** in un dato momento.
2. Non si può assegnare alcun abbonamento a un cliente **privo di iscrizione attiva**.
3. Assegnare un abbonamento con scadenza **oltre** quella dell'iscrizione è permesso ma DEVE generare una **segnalazione non bloccante**; la scelta finale è dell'utente.
4. I tipi di catalogo (iscrizione/abbonamento) **non sono eliminabili** se hanno almeno un cliente assegnato (si preserva storico e ricevute). Sono invece modificabili.
5. Le ricevute emesse sono **immutabili**: non si modificano né si cancellano. Si **annullano** mantenendo il numero (stato "annullata"), senza buchi nella serie.
6. Numerazione ricevute: **progressiva per anno solare di emissione**, riparte ogni anno; numero iniziale configurabile dall'utente; il numero è assegnato **al salvataggio** e resta invariato sui re-download dello stesso documento.
7. "Cancellazione dati cliente" = **anonimizzazione** dei dati personali nell'anagrafica attiva; relazioni e ricevute già emesse restano integre.
8. Importi in **€ con IVA inclusa**; formato valuta italiano (`1.234,56 €`), date `gg/mm/aaaa`.

## Flusso di lavoro
- Sviluppo a fasi **F0–F7** (vedi `docs/PHASES.md`). Una fase si chiude solo con la Definition of Done soddisfatta e i test verdi.
- A fine fase eseguire il gate con il comando `/gate <fase>` (es. `/gate F3`).
- Eseguire sempre i test prima di considerare conclusa una fase.

## Riferimenti
`docs/SPEC.md` · `docs/DOMAIN-MODEL.md` · `docs/PHASES.md` · `docs/TESTING.md` · `docs/DECISIONS.md`

## Git
- Commit piccoli e descrittivi (conventional commits: `feat`/`fix`/`test`/`docs`/`chore`).
- Una fase corrisponde a un insieme coerente di commit; le release avvengono via tag su GitHub.
