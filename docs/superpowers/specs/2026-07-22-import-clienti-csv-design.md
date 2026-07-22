# Import clienti da CSV — Design

**Data:** 2026-07-22
**Stato:** approvato (brainstorming)
**Fase di riferimento:** funzionalità additiva sul dominio Clienti

## Obiettivo

Consentire l'importazione di un elenco di clienti da file CSV. L'import è
**puramente additivo**: inserisce solo clienti nuovi, non modifica né cancella
clienti esistenti. Il controllo dei duplicati avviene tramite **codice fiscale**
(già `UNIQUE` sulla tabella `clienti`).

## Decisioni

Raccolte in fase di brainstorming con l'utente:

1. **Colonne**: template fisso documentato (non mappatura dinamica in UI).
2. **Duplicati (CF già presente in anagrafica)**: saltati e segnalati; nessuna
   modifica al cliente esistente.
3. **Flusso**: anteprima con riepilogo → conferma → scrittura. Nessuna scrittura
   prima della conferma esplicita dell'utente.
4. **Righe con errori**: alla conferma vengono importate le righe valide; le
   righe con errori sono escluse e restano elencate nel report.
5. **Parser CSV**: libreria `papaparse` (robusta, gestisce virgolette,
   delimitatori annidati e newline nei campi). Versione pinnata nel lockfile.

## Formato file

CSV con **riga di intestazione** obbligatoria.

| Colonna | Obbligatoria | Note |
|---|---|---|
| `codice_fiscale` | sì | validato formalmente (carattere di controllo) |
| `nome` | sì | non vuoto |
| `cognome` | sì | non vuoto |
| `numero_tessera` | no | se vuota → assegnata automaticamente |
| `data_nascita` | no | formato italiano `gg/mm/aaaa`, convertito in ISO `aaaa-mm-gg` |
| `sesso` | no | `M` o `F` |
| `comune_nascita` | no | testo |
| `via` | no | testo |
| `civico` | no | testo |
| `citta` | no | testo |
| `provincia` | no | testo |
| `cap` | no | testo |
| `email` | no | testo |
| `telefono` | no | testo |
| `note` | no | testo |

Regole di parsing:

- **Intestazioni**: match case-insensitive, con `trim`. Colonne sconosciute
  ignorate; colonne opzionali mancanti trattate come `null`.
- **Delimitatore**: auto-rilevamento `;` vs `,` (Excel italiano usa `;`).
  Delegato a `papaparse` (`delimiter: ''` → autodetect).
- **Encoding**: UTF-8, con rimozione del BOM iniziale se presente.
- **Righe vuote**: ignorate (nessun errore).

## Classificazione delle righe (anteprima)

Ogni riga di dati riceve un esito:

- **nuovo**: dati validi e CF non presente in anagrafica né ripetuto prima nel
  file → sarà importato.
- **duplicato**: CF formalmente valido ma già presente in `clienti` → saltato.
- **errore**: escluso, con motivo. Casi di errore:
  - `codice_fiscale` assente o formalmente non valido;
  - `nome` o `cognome` vuoto;
  - CF ripetuto **nello stesso file** (la prima occorrenza valida è
    classificata normalmente, le successive sono errore "duplicato nel file");
  - `data_nascita` presente ma non in formato `gg/mm/aaaa` valido;
  - `sesso` presente ma diverso da `M`/`F`;
  - `numero_tessera` presente ma già in uso (in anagrafica o ripetuta nel file).

Il numero di riga riportato è **1-based rispetto al file** (utile all'utente per
correggere la sorgente).

## Architettura

Rispetta il flusso esistente: **main (repository + IPC) → preload → renderer React**.
Nessuna logica di dominio nel renderer; nessun accesso a `fs` dal renderer.

### Main — logica pura

Nuovo modulo `src/main/domain/import-clienti.ts` (nessuna dipendenza da Node/Electron
salvo `papaparse`, che è puro JS):

```ts
interface ImportRowResult {
  riga: number                       // 1-based nel file
  esito: 'nuovo' | 'duplicato' | 'errore'
  cf: string | null
  cliente?: CreateClienteInput       // presente se esito === 'nuovo'
  messaggio?: string                 // motivo per 'duplicato'/'errore'
}

interface ImportPreview {
  totali: number
  nuovi: number
  duplicati: number
  errori: number
  righe: ImportRowResult[]
}

function parseCsvClienti(content: string): RigaGrezza[]
function analizzaImport(righe: RigaGrezza[], cfEsistenti: Set<string>, tessereEsistenti: Set<string>): ImportPreview
```

`analizzaImport` riusa `isCodiceFiscaleValid` e la logica di `validaCliente`.
È pura e interamente testabile.

### Main — repository (`src/main/db/clients-repository.ts`)

- `getTuttiCodiciFiscali(): Set<string>` — CF dei clienti attivi/esistenti.
- `getTutteTessere(): Set<string>` — numeri tessera già in uso.
- `importClienti(nuovi: CreateClienteInput[]): number` — inserimento in **una
  sola transazione**; `numero_tessera` auto-incrementale coerente nel batch
  (parte da `getNextNumeroTessera` e prosegue senza collisioni per le righe che
  non specificano la tessera). Ritorna il numero di clienti inseriti.

### Main — IPC (`src/main/ipc/handlers.ts`)

- `clienti:import:analizza` → riceve il path del file, lo legge con `fs`,
  esegue `parseCsvClienti` + `analizzaImport` contro gli insiemi correnti,
  **non scrive nulla**, ritorna `ImportPreview`.
- `clienti:import:esegui` → riceve il path, **rilegge e rianalizza lo stesso
  file** (non si fida di payload rimandati dal renderer), inserisce solo le
  righe con esito `nuovo` via `importClienti`, ritorna un report
  `{ importati: number, saltati: number, errori: number }`.
- `dialog:showSaveDialog` → nuovo handler per salvare il modello CSV (oggi è
  esposto solo `showOpenDialog`).
- `clienti:import:template` → genera il contenuto del modello CSV di esempio e
  lo scrive nel path scelto dall'utente.

### Preload (`src/preload/index.ts`) e tipi (`src/types/shared.ts`)

Estendere `ElectronAPI.clienti` con:

```ts
import: {
  analizza: (path: string) => Promise<ImportPreview>
  esegui: (path: string) => Promise<ImportReport>
  template: (destPath: string) => Promise<void>
}
```

Aggiungere in `shared.ts` i tipi `ImportRowResult`, `ImportPreview`, `ImportReport`.

### Renderer

- Nuovo componente `src/renderer/src/components/clients/ImportClientiDialog.tsx`,
  modale a 3 step:
  1. **Seleziona file**: usa `dialog.showOpenDialog` con filtro `*.csv`; pulsante
     secondario "Scarica modello CSV".
  2. **Anteprima**: riepilogo conteggi (nuovi / già presenti / errori) e tabella
     delle righe scartate con numero riga e motivo. Pulsanti "Importa N clienti"
     e "Annulla".
  3. **Esito**: report finale (importati N).
- In `src/renderer/src/pages/ClientsPage.tsx`: pulsante **"Importa CSV"** accanto
  a "Nuovo cliente"; al termine dell'import con successo, ricarica la lista.

### i18n

Tutte le stringhe esternalizzate nel namespace `clienti.import.*`
(`src/renderer/src/i18n/`). Nessuna stringa hardcoded.

## Invarianti di dominio

- Import **additivo**: nessuna modifica/cancellazione di clienti esistenti.
- CF unico garantito dal vincolo DB (`clienti.codice_fiscale UNIQUE`) e dal
  controllo applicativo in anteprima.
- L'import **non** crea iscrizioni, abbonamenti né ricevute: nessuna invariante
  su iscrizioni/abbonamenti/ricevute è coinvolta.
- Il tutore non è richiesto al salvataggio del cliente (invariante B7): l'import
  non tenta di collegare tutori.

## Test

Vitest unit (logica pura):

- `parseCsvClienti`: delimitatore `,` e `;`, virgolette con delimitatore/newline
  interni, BOM, intestazioni con maiuscole/spazi, righe vuote, colonne opzionali
  mancanti/extra.
- `analizzaImport`: CF non valido, CF duplicato in anagrafica, CF ripetuto nel
  file, `data_nascita`/`sesso` non validi, `numero_tessera` in conflitto,
  conteggi corretti, mappatura corretta su `CreateClienteInput`.
- `importClienti` (repository, con DB in-memory): inserimento batch,
  assegnazione tessere senza collisioni, transazione atomica.

E2e Playwright: opzionale, in una fase successiva.

## Dipendenze

- Aggiungere `papaparse` (+ `@types/papaparse` dev) al `package.json`, versione
  pinnata, lockfile committato.

## Fuori scope (YAGNI)

- Mappatura dinamica delle colonne in UI.
- Aggiornamento dei clienti esistenti dall'import.
- Import di iscrizioni/abbonamenti/certificati/ricevute.
- Export del report errori su file (valutabile in seguito se richiesto).
