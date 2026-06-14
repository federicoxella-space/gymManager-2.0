# B7 — Tutore come cliente collegato (FK) — Design

**Data:** 2026-06-14 · **Stato:** approvato in brainstorming, in attesa di review della spec scritta · **Rilievo:** B7 (`ANALYSYS.md`), follow-up di B6.

## Contesto e problema

Oggi i dati del tutore di un minore sono colonne **free-text denormalizzate** su `clienti` (`tutore_nome/cognome/cf` + indirizzo `tutore_via/civico/citta/provincia/cap`). `ClientForm` espone solo `tutore_nome/cognome/cf`, **non** i campi indirizzo. Conseguenza: per un minore con tutore l'indirizzo intestatario della ricevuta è sempre `null`, e la verifica `indirizzoIntestatarioCompleto` (WP4) **blocca l'emissione**. In pratica un minore con tutore non può ricevere una ricevuta.

Fonti autorevoli:
- `FUNZIONALITA.md:13` — sezione Tutore «nome, cognome, codice fiscale, indirizzo se diverso»; «Per i minori la ricevuta è intestata al tutore con la dicitura "Tutore di [CF del minore]"».
- `FUNZIONALITA.md:65` — «Intestatario: cliente, o tutore se minorenne».
- `FUNZIONALITA.md:10` — «Indirizzo … richiesto **al momento di emettere la ricevuta** (un cliente può essere salvato senza, ma la ricevuta lo pretende)».
- `DOMAIN-MODEL.md:11` — Ricevuta = «destinatario (snapshot dati cliente, o tutore se minore)».

## Decisione di dominio (presa in brainstorming)

Il tutore **non** è più testo denormalizzato: è un **Cliente registrato** referenziato dal minore tramite **chiave esterna `tutore_id → clienti.id`**. Decisioni dell'utente:
1. **Tutore = cliente registrato**, relazione via `tutore_id` (FK).
2. **Clean slate**: la migrazione **rimuove** le vecchie colonne `tutore_*` e **aggiunge** `tutore_id`. I minori esistenti perdono il collegamento → ri-collegamento manuale. Le ricevute già emesse (snapshot) restano intatte.
3. **UX**: nel form del minore si **cerca e seleziona** un cliente esistente come tutore (no creazione "al volo").
4. **Vincoli**: self-reference **bloccata**; **avviso non bloccante** se il tutore selezionato è minorenne.
5. **Minore senza tutore**: si **blocca l'emissione della ricevuta** finché un tutore non è collegato (coerente con `FUNZIONALITA.md:10` e con il blocco indirizzo-incompleto di WP4). Il minore può comunque essere salvato senza tutore.

Indirizzo sulla ricevuta = indirizzo del **cliente-tutore** (niente più "se diverso": il tutore ha il proprio record).

## Approccio architetturale (scelto: A)

**FK in scrittura, campi `tutore_*` derivati via JOIN in lettura.** Si scrive solo `tutore_id`; le query di lettura espongono `tutore_nome/cognome/cf/via/civico/citta/provincia/cap` come campi **read-only derivati** dal record del tutore. Gli helper renderer esistenti (`calcolaIntestatario`, `indirizzoIntestatarioCompleto`, header `EmittiRicevutaForm`) continuano a leggere quegli stessi nomi di campo → modifiche minime. (Alternativa scartata: far caricare al renderer il tutore con `clienti.get(tutore_id)` — più round-trip e più logica nel renderer.)

## Progettazione per componente

### 1. Schema / migrazione — `007_tutore_fk`
- **AGGIUNGE** `tutore_id INTEGER REFERENCES clienti(id)` su `clienti`.
- **RIMUOVE** (DROP COLUMN, supportato dalla versione SQLite in uso): `tutore_nome, tutore_cognome, tutore_cf, tutore_via, tutore_civico, tutore_citta, tutore_provincia, tutore_cap`.
- La tabella `ricevute` (colonne snapshot `intestatario_*`, `tutore_nome/cognome/cf`, `assistito_cf`) **non cambia**.
- Nota: l'enforcement FK dipende da `PRAGMA foreign_keys`. Indipendentemente da questo, esistenza e self-reference sono validate in applicazione. Da verificare in fase di piano se la pragma è attiva; non è bloccante.

### 2. Repository — `clients-repository.ts`
- `createCliente`/`updateCliente`: accettano `tutore_id` (nullable). Validazioni:
  - `tutore_id === id` → `TUTORE_SE_STESSO` (solo in update, dove `id` esiste).
  - tutore inesistente → `TUTORE_NON_TROVATO`.
  - (l'avviso "tutore minorenne" è non bloccante, gestito lato UI.)
- `getCliente`/`listClienti`: `LEFT JOIN clienti AS tut ON clienti.tutore_id = tut.id`, esponendo: `tut.nome AS tutore_nome`, `tut.cognome AS tutore_cognome`, `tut.codice_fiscale AS tutore_cf`, `tut.via AS tutore_via`, `tut.civico AS tutore_civico`, `tut.citta AS tutore_citta`, `tut.provincia AS tutore_provincia`, `tut.cap AS tutore_cap`, oltre a `tutore_id`.

### 3. Tipi — `shared.ts` + `renderer/src/types/api.d.ts`
- `ClienteRow`: rimuove i campi tutore *stored*; aggiunge `tutore_id: number | null` e mantiene `tutore_nome/cognome/cf/via/civico/citta/provincia/cap: string | null` come campi **derivati** (read-only, popolati dal JOIN).
- `CreateClienteInput`: sostituisce `tutore_nome/cognome/cf` (e gli ex-campi indirizzo tutore, se presenti) con `tutore_id?: number | null`.

### 4. UI — `ClientForm.tsx`
- La sezione Tutore (visibile per i minorenni) diventa un **campo di ricerca cliente** (nome/cognome/CF) con autocompletamento sui clienti esistenti (riusa l'IPC di ricerca/lista clienti), che imposta `tutore_id`. Mostra il tutore selezionato (nome + CF) con azione "rimuovi". In modalità *edit* esclude il cliente corrente dai risultati (no self-reference).
- **Avviso non bloccante** se il tutore selezionato risulta minorenne (`isMinorenne`).
- Nessuna creazione di cliente "al volo" (fuori scope): se il tutore non esiste, l'utente lo crea prima come cliente.

### 5. Logica ricevuta — `creaRicevuta` (main) + helper renderer
- `creaRicevuta`: la query del cliente seleziona `tutore_id` (invece delle vecchie colonne). `haTutore = cliente.tutore_id != null && isMinorenne(cliente.data_nascita)`. Se `haTutore`, risolve il cliente-tutore (seconda query o JOIN) e fa **snapshot** di nome/cognome/CF **e indirizzo** del tutore nei campi `intestatario_*`; `assistito_cf` = CF del minore; `tutore_nome/cognome/cf` = dati del tutore. Dicitura "Tutore di [CF minore]" invariata.
- **Blocco emissione minore senza tutore**: se `isMinorenne(cliente)` e `cliente.tutore_id == null` → errore dedicato (es. `TUTORE_RICHIESTO`), accanto al blocco indirizzo-incompleto. (Validato sia lato `creaRicevuta`/handler sia anticipato nel renderer `EmittiRicevutaForm`.)
- `calcolaIntestatario`/`indirizzoIntestatarioCompleto` (renderer, `utils/dominio.ts`): invariati nella sostanza, leggono i `tutore_*` derivati dal JOIN. Il blocco indirizzo verifica ora l'indirizzo del **cliente-tutore**.
- `EmittiRicevutaForm`: oltre al blocco indirizzo già presente, mostra il blocco/avviso "collega un tutore" per un minore senza `tutore_id`.

### 6. Edge case (gestiti/documentati)
- **Tutore anonimizzato**: `tutore_id` resta valido ma i dati del tutore sono azzerati → il blocco "indirizzo incompleto" impedisce l'emissione (comportamento sicuro). Documentato.
- **Minore diventato maggiorenne**: `tutore_id` resta ma è ignorato (`haTutore` falso) → ricevuta intestata al cliente stesso (coerente con oggi).
- **Minore senza tutore collegato**: salvataggio consentito; **emissione bloccata** finché non si collega un tutore.
- **Cliente che è tutore di qualcuno**: i clienti non si eliminano (solo anonimizzazione), quindi l'integrità del riferimento è preservata.

### 7. Test (Vitest)
- **Migrazione `007`**: dopo l'applicazione, `tutore_id` esiste e le 8 colonne `tutore_*` non esistono più.
- **Repository**: create/update con `tutore_id`; il JOIN espone i campi `tutore_*`; self-reference rifiutata (`TUTORE_SE_STESSO`); tutore inesistente rifiutato (`TUTORE_NON_TROVATO`).
- **Ricevute** (`receipts-invariants`): minore con `tutore_id` → snapshot dati+indirizzo tutore, `assistito_cf` = CF minore, dicitura corretta; maggiorenne con `tutore_id` → `haTutore` falso (intestatario = cliente); minore **senza** `tutore_id` → emissione bloccata (`TUTORE_RICHIESTO`).
- **Refactor test esistenti A4/A5**: oggi passano `tutore_nome/cf` in input → andranno riscritti per creare un cliente-tutore e collegarlo via `tutore_id`.

## Fuori scope (confermato)
- Creazione del tutore "al volo" dal form del minore.
- Vincolo bloccante sull'età del tutore (resta avviso non bloccante).
- Backfill/migrazione dei vecchi dati tutore (clean slate: ri-collegamento manuale).

## Impatti trasversali
- `ANALYSYS.md` B7 → risolto; aggiornare l'eventuale nota in `OPEN-QUESTIONS.md` (B6/B7).
- DoD: `npm run verify` verde; test sopra inclusi (è una modifica con backend + migrazione, testabile).
- Stringhe nuove (UI ricerca tutore, avvisi/blocchi) esternalizzate in i18n IT/EN.
