---
name: i18n
description: Convenzioni di internazionalizzazione (i18next) e formati italiani per GymManager 2.0 - esternalizzazione stringhe, naming chiavi, formattazione valuta/date, validazione codice fiscale, procedura per aggiungere una lingua. Usala lavorando su testi UI o formati.
---
# Internazionalizzazione e formati

## Regole
- **Nessuna stringa hardcoded** nella UI: tutto passa da i18next.
- Lingua di default: italiano (`it`). La struttura deve permettere di aggiungere lingue **fin da subito**.
- Naming chiavi gerarchico e stabile, es. `clienti.dettaglio.titolo`, `ricevuta.totale`.
- Le stringhe con variabili usano l'interpolazione di i18next, non concatenazione manuale.

## Aggiungere una lingua
1. Aggiungi un file di risorse `<lingua>.json` con le stesse chiavi di `it.json`.
2. Registra la lingua nella configurazione i18next e nel selettore lingua.
3. Verifica che non restino chiavi mancanti (fallback su `it`).

## Formati italiani
- Valuta: `€` con IVA inclusa, separatore decimale virgola, migliaia punto (`1.234,56 €`). Usa `Intl.NumberFormat('it-IT', { style:'currency', currency:'EUR' })`.
- Date: `gg/mm/aaaa` (`Intl.DateTimeFormat('it-IT')`).
- **Codice fiscale**: valida formato (16 caratteri alfanumerici, schema standard) e calcolo del carattere di controllo; normalizza in maiuscolo. Segnala input non valido senza bloccare il salvataggio se l'utente conferma.
