# GymManager 2.0 — Scaffold di progetto per Claude Code

Specifica e configurazione di agenti/skill per far sviluppare a Claude Code il gestionale
desktop **GymManager 2.0** (Electron + React + SQLite/SQLCipher).

## Struttura
- `CLAUDE.md` — regole sempre valide (stack, invarianti, flusso di lavoro).
- `docs/` — **fonte di verità**: specifica, modello di dominio, fasi+DoD, testing, decisioni.
- `.claude/agents/` — subagent specializzati: `ux-frontend`, `domain-logic`, `data-persistence`, `test-engineer`, `critic-reviewer`.
- `.claude/skills/` — competenze procedurali caricate su richiesta.
- `.claude/commands/gate.md` — comando `/gate <fase>` per i gate di fine fase.

## Come si usa
1. Clona il repo e copia questi file nella radice del progetto.
2. Avvia Claude Code nella cartella.
3. Se necessario, affina permessi e agenti con `/permissions` e `/agents`.
4. Sviluppa fase per fase (vedi `docs/PHASES.md`); a fine fase lancia `/gate F0`, `/gate F1`, ...

## Note
- I subagent sono impostati su `claude-sonnet-4-6`. Puoi alzare il modello (es. del `critic-reviewer`) modificando il campo `model` nel rispettivo file.
- `.claude/settings.json` parte volutamente minimale: regola i permessi secondo il tuo flusso.
