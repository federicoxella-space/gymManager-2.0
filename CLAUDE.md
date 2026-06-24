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
5. Le ricevute emesse sono **immutabili**: non si modificano né si cancellano. Si **annullano** mantenendo il numero (stato "annullata"), senza buchi nella serie; annullare **libera** le voci coperte (tornano fatturabili), **senza** modificarne lo stato di pagamento. **Ricevuta e pagamento sono disaccoppiati**: una voce è fatturabile finché non è su una ricevuta *emessa* (a prescindere dal pagamento); lo stato pagato/da incassare è una proprietà a sé, modificabile indipendentemente. Vedi `docs/superpowers/specs/2026-06-24-disaccoppiamento-ricevuta-pagamento-design.md`.
6. Numerazione ricevute: **progressiva per anno della data di emissione** (scelta dall'utente alla generazione), riparte ogni anno; numero iniziale configurabile dall'utente; il numero è assegnato **al salvataggio** e resta invariato sui re-download dello stesso documento.
7. "Cancellazione dati cliente" = **anonimizzazione** dei dati personali nell'anagrafica attiva; relazioni e ricevute già emesse restano integre.
8. Importi in **€ con IVA inclusa**; formato valuta italiano (`1.234,56 €`), date `gg/mm/aaaa`.

## Qualità e anti-allucinazione
- **Definizione di «verde»**: `npm run verify` (typecheck + lint + test + build) deve passare. Nessuna fase è "fatta" senza `verify` verde; il gate lo esegue, non si fida della sola lettura del codice.
- **Niente requisiti inventati**: se qualcosa non è in `docs/`, registralo in `OPEN-QUESTIONS.md` e prosegui con un'assunzione chiaramente marcata.
- **API verificate, non ricordate**: controlla firme e versioni delle librerie sui tipi installati; non dichiarare esistente un file o una funzione senza averli letti.
- **Evidenza nei report**: i report dei gate citano file/percorsi a supporto; nessuna affermazione senza riscontro.
- **Tooling**: TypeScript in modalità strict, ESLint + Prettier, lockfile committato e versioni pinnate.

## Flusso di lavoro
- Sviluppo a fasi **F0–F7** (vedi `docs/PHASES.md`). Una fase si chiude solo con la Definition of Done soddisfatta e `verify` verde.
- A fine fase eseguire il gate con il comando `/gate <fase>` (es. `/gate F3`).
- Eseguire sempre `npm run verify` prima di considerare conclusa una fase.

## Riferimenti
`docs/SPEC.md` · `docs/DOMAIN-MODEL.md` · `docs/FUNZIONALITA.md` · `docs/PHASES.md` · `docs/TESTING.md` · `docs/DECISIONS.md` · `OPEN-QUESTIONS.md`

## Git
- Commit piccoli e descrittivi (conventional commits: `feat`/`fix`/`test`/`docs`/`chore`).
- Una fase corrisponde a un insieme coerente di commit; le release avvengono via tag su GitHub.
