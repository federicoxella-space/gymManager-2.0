---
name: design-system
description: Linguaggio visivo e convenzioni UI di GymManager 2.0 (token Tailwind, componenti, stati, spaziature, tema, personalizzazione logo/colori, accessibilità di base). Usala per creare o modificare interfacce.
---
# Design system

Obiettivo: interfaccia **moderna, pulita e professionale**, facile per un utente non tecnico.

## Principi
- Gerarchia chiara, spaziatura generosa, poche tipografie, contrasto adeguato.
- Componenti coerenti e riutilizzabili; evita varianti improvvisate.
- Stati sempre gestiti: vuoto, caricamento, errore, successo.
- Feedback immediato sulle azioni (salvataggi, segnalazioni di scadenza, conferme distruttive).

## Token (Tailwind)
- Definisci una palette tematica (primario, superfici, testo, stati success/warning/danger) come variabili CSS / config Tailwind.
- Personalizzazione utente: **logo** e **colore primario** sovrascrivibili dalle impostazioni; le segnalazioni di scadenza usano intervalli configurabili.
- Predisponi tema chiaro/scuro tramite variabili, senza duplicare i componenti.

## Componenti chiave
- Tabelle clienti con ricerca/filtri; schede di dettaglio.
- Form con validazione inline e messaggi in italiano (via i18n).
- Widget dashboard con drill-down al click.
- Badge di stato per scadenze (valido / in scadenza / scaduto).

## Accessibilità (di base)
- Elementi interattivi raggiungibili da tastiera; label associate ai campi; contrasto sufficiente.
