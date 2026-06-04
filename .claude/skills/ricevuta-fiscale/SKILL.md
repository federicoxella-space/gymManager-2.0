---
name: ricevuta-fiscale
description: Regole per generare, numerare, annullare e impaginare le ricevute di GymManager 2.0, e per formattare importi e date in stile italiano. Usala ogni volta che si crea, numera, annulla o stampa una ricevuta in PDF.
---
# Ricevute fiscali

L'app emette **ricevute** (non fatture, niente SDI). I pagamenti elettronici sono gestiti altrove dall'utente; questa app copre le ricevute (tipicamente per pagamenti in contanti).

## Numerazione
- Serie **progressiva per anno solare** della data di emissione; riparte da 1 a inizio anno.
- L'utente può impostare il **numero iniziale** per l'anno (caso: ricevute già emesse prima di adottare l'app).
- Il numero è assegnato **al momento del salvataggio**, non alla sola generazione/anteprima.
- Una volta assegnato è **immutabile**: ri-scaricare lo stesso documento NON cambia il numero.
- Una ricevuta non si modifica né si cancella. L'**annullamento** crea uno stato "annullata" mantenendo il numero: niente buchi nella serie.

## Contenuto / layout
Riferimento: la ricevuta esistente dell'attività. Campi:
- Intestazione attività (ragione sociale, indirizzo, Cod.Fis./P.IVA, logo) dalle impostazioni.
- Destinatario: cliente (nome, cod. fiscale, indirizzo); se minore, eventuale tutore.
- Righe: attività/voce, durata (periodo `gg/mm/aaaa - gg/mm/aaaa`), prezzo.
- Totale.
- Numero ricevuta e data di emissione; eventuale codice univoco.

## Formati
- Importi in **euro con IVA inclusa**, simbolo **€** (es. `20,00 €`). Separatore decimale virgola, migliaia punto.
- Date sempre `gg/mm/aaaa`.

## Generazione PDF
- Renderizza un template HTML e produci il PDF con `webContents.printToPDF` di Electron.
- Il PDF deve essere **rigenerabile in modo deterministico** dallo stesso record salvato (stesso numero, stessi dati).
