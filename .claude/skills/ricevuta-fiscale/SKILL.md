---
name: ricevuta-fiscale
description: Regole per generare, numerare, annullare e impaginare le ricevute di GymManager 2.0, e per formattare importi e date in stile italiano. Usala ogni volta che si crea, numera, annulla o stampa una ricevuta in PDF.
---
# Ricevute fiscali

L'app emette **ricevute** (non fatture, niente SDI). I pagamenti elettronici sono gestiti altrove dall'utente; questa app copre le ricevute (tipicamente per pagamenti in contanti).

## Numerazione
- Serie **progressiva per anno della data di emissione** (la data è scelta dall'utente alla generazione): emessa nel 2025 → `2025-N`, nel 2026 → `2026-N`. Riparte ogni anno.
- L'utente può impostare il **numero iniziale** per l'anno (caso: ricevute già emesse prima di adottare l'app).
- Il numero è assegnato **al salvataggio**, non in anteprima.
- Una volta assegnato è **immutabile**: ri-scaricare lo stesso documento NON cambia il numero.
- Una ricevuta non si modifica né si cancella. L'**annullamento** crea lo stato "annullata" mantenendo il numero (niente buchi nella serie); le voci coperte tornano "da incassare".

## Contenuto / righe
- Righe dalle voci pagabili selezionate del cliente; è ammessa anche una **riga libera** (addebito una tantum: descrizione + prezzo).
- Intestazione attività (ragione sociale, indirizzo, Cod.Fis./P.IVA, logo) dalle impostazioni.
- Destinatario: cliente (nome, cod. fiscale, indirizzo); se minore, ricevuta intestata al tutore con dicitura "Tutore di [CF del minore]".
- Per riga: attività/voce, durata (periodo `gg/mm/aaaa - gg/mm/aaaa`), prezzo. Totale.
- Data di emissione; eventuale dicitura a piè configurabile. Nessun "codice univoco" stampato.

## Formati
- Importi in **euro con IVA inclusa**, simbolo **€** (es. `20,00 €`). Separatore decimale virgola, migliaia punto.
- Date sempre `gg/mm/aaaa`.

## Generazione PDF
- Renderizza un template HTML e produci il PDF con `webContents.printToPDF` di Electron.
- **Due copie per pagina**: copia cliente + copia matrice.
- Il PDF deve essere **rigenerabile in modo deterministico** dallo stesso record salvato (stesso numero, stessi dati).
