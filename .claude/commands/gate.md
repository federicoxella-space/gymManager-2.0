---
description: Esegue il gate di verifica di fine fase (critico vs implementatore) contro la Definition of Done.
argument-hint: <fase, es. F3>
---
Esegui il **gate** per la fase **$ARGUMENTS** di GymManager 2.0.

Procedura:
1. Leggi in `docs/PHASES.md` la sezione della fase **$ARGUMENTS**: obiettivo, Definition of Done e criteri del gate.
2. Esegui `npm run verify` (typecheck + lint + test + build). Se fallisce, **fermati** e riporta gli errori senza proseguire.
3. Invoca il subagent `critic-reviewer`: confronti l'implementazione con la Definition of Done e con le invarianti di `CLAUDE.md`, basando ogni rilievo su evidenze (file/percorsi, esito di `verify`), e produca un elenco di scostamenti per gravità (**bloccante** / **da correggere** / **suggerimento**).
4. Per ogni scostamento bloccante o da correggere, delega la fix all'implementatore di layer competente (`ux-frontend`, `domain-logic`, `data-persistence`).
5. Ripeti dal punto 2 finché `npm run verify` è verde e non restano scostamenti bloccanti.
6. Riporta un esito sintetico: **PASSATO / NON PASSATO**, con la lista delle verifiche e degli scostamenti residui. Salva il report in `docs/gate-reports/F<numero>.md`.

Non passare alla fase successiva se il gate non è PASSATO.
