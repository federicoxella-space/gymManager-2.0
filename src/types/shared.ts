/**
 * Tipi condivisi tra main process, preload e renderer.
 * Nessuna dipendenza da Node o da Electron deve essere presente qui.
 */

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  language: string
  primaryColor: string
  /** Giorni di anticipo per la segnalazione "in scadenza" dei certificati medici. */
  expiry_warning_days_certificates: number
  /** Testo default a piè di ricevuta (modificabile per singola ricevuta). */
  dicitura_pie: string
  /** Numero da cui parte la numerazione ricevute per l'anno corrente (configurabile dall'utente). */
  receipt_start_number: number
}

export type DbState = 'firstRun' | 'locked' | 'ready'

// ── Tipi di dominio ───────────────────────────────────────────────────────────

export type StatoCertificato = 'valido' | 'in_scadenza' | 'scaduto'

export type { ValidationResult, ValidationError } from '../main/domain/cliente'
export type { CertificatoConStato } from '../main/domain/certificato-medico'

// ── Clienti ──────────────────────────────────────────────────────────────────

/** Riflette la riga della tabella `clienti`. */
export interface ClienteRow {
  id: number
  numero_tessera: string | null
  nome: string
  cognome: string
  codice_fiscale: string
  data_nascita: string | null
  sesso: string | null
  comune_nascita: string | null
  via: string | null
  civico: string | null
  citta: string | null
  provincia: string | null
  cap: string | null
  email: string | null
  telefono: string | null
  note: string | null
  tutore_nome: string | null
  tutore_cognome: string | null
  tutore_cf: string | null
  tutore_via: string | null
  tutore_civico: string | null
  tutore_citta: string | null
  tutore_provincia: string | null
  tutore_cap: string | null
  stato: 'attivo' | 'anonimizzato'
  data_inserimento: string
  data_modifica: string
  /** Campi aggiuntivi dalla JOIN con certificati_medici in listClienti */
  cert_scadenza?: string | null
  cert_tipo?: string | null
}

/** Dati in ingresso per la creazione di un cliente. */
export interface CreateClienteInput {
  numero_tessera?: string
  nome: string
  cognome: string
  codice_fiscale: string
  data_nascita?: string | null
  sesso?: string | null
  comune_nascita?: string | null
  via?: string | null
  civico?: string | null
  citta?: string | null
  provincia?: string | null
  cap?: string | null
  email?: string | null
  telefono?: string | null
  note?: string | null
  tutore_nome?: string | null
  tutore_cognome?: string | null
  tutore_cf?: string | null
  tutore_via?: string | null
  tutore_civico?: string | null
  tutore_citta?: string | null
  tutore_provincia?: string | null
  tutore_cap?: string | null
}

/** Dati aggiornabili di un cliente (tutti i campi opzionali). */
export type UpdateClienteInput = Partial<CreateClienteInput>

/** Filtri per la lista clienti. */
export interface ClientiFilters {
  search?: string
  stato?: 'attivo' | 'anonimizzato'
  limit?: number
  offset?: number
}

// ── Certificati medici ────────────────────────────────────────────────────────

/** Riflette la riga della tabella `certificati_medici`. */
export interface CertificatoRow {
  id: number
  cliente_id: number
  tipo: string
  data_scadenza: string
  data_inserimento: string
}

/** Dati in ingresso per l'aggiunta di un certificato. */
export interface CreateCertificatoInput {
  cliente_id: number
  tipo: string
  data_scadenza: string
}

// ── Catalogo tipi ─────────────────────────────────────────────────────────────

export interface TipoIscrizioneRow {
  id: number
  nome: string
  descrizione: string | null
  durata_mesi: number
  prezzo_default: number
  stato: 'attivo' | 'non_valido'
  data_inserimento: string
  data_modifica: string
}

export interface TipoAbbonamentoRow {
  id: number
  nome: string
  descrizione: string | null
  durata_mesi: number
  prezzo_default: number
  categoria: string | null
  colore: string
  stato: 'attivo' | 'non_valido'
  data_inserimento: string
  data_modifica: string
}

export interface CreateTipoIscrizioneInput {
  nome: string
  descrizione?: string
  durata_mesi: number
  prezzo_default: number
}

export type UpdateTipoIscrizioneInput = Partial<CreateTipoIscrizioneInput> & {
  stato?: 'attivo' | 'non_valido'
}

export interface CreateTipoAbbonamentoInput {
  nome: string
  descrizione?: string
  durata_mesi: number
  prezzo_default: number
  categoria?: string
  colore?: string
}

export type UpdateTipoAbbonamentoInput = Partial<CreateTipoAbbonamentoInput> & {
  stato?: 'attivo' | 'non_valido'
}

// ── Associazioni cliente ──────────────────────────────────────────────────────

export interface IscrizioneClienteRow {
  id: number
  cliente_id: number
  tipo_iscrizione_id: number
  data_inizio: string
  data_scadenza: string
  prezzo: number
  stato_pagamento: 'pagato' | 'da_incassare'
  metodo_pagamento: string | null
  stato: 'attiva' | 'scaduta' | 'invalidata'
  note: string | null
  data_inserimento: string
  data_modifica: string
}

export interface AbbonamentoClienteRow {
  id: number
  cliente_id: number
  tipo_abbonamento_id: number
  data_inizio: string
  data_scadenza: string
  prezzo: number
  stato_pagamento: 'pagato' | 'da_incassare'
  metodo_pagamento: string | null
  stato: 'attivo' | 'scaduto' | 'invalidato'
  note: string | null
  data_inserimento: string
  data_modifica: string
}

export interface AssegnaIscrizioneInput {
  cliente_id: number
  tipo_iscrizione_id: number
  data_inizio: string
  data_scadenza: string
  prezzo: number
  stato_pagamento: 'pagato' | 'da_incassare'
  metodo_pagamento?: string
  note?: string
}

export interface AssegnaAbbonamentoInput {
  cliente_id: number
  tipo_abbonamento_id: number
  data_inizio: string
  data_scadenza: string
  prezzo: number
  stato_pagamento: 'pagato' | 'da_incassare'
  metodo_pagamento?: string
  note?: string
}

// ── Ricevute ──────────────────────────────────────────────────────────────────

/** Riflette la riga della tabella `ricevute`. */
export interface RicevutaRow {
  id: number
  numero: number
  anno: number
  data_emissione: string
  cliente_id: number
  intestatario_nome: string
  intestatario_cognome: string
  intestatario_cf: string
  intestatario_via: string | null
  intestatario_civico: string | null
  intestatario_citta: string | null
  intestatario_provincia: string | null
  intestatario_cap: string | null
  tutore_nome: string | null
  tutore_cognome: string | null
  tutore_cf: string | null
  totale: number
  metodo_pagamento: string
  stato_pagamento: 'pagato' | 'da_incassare'
  dicitura_pie: string | null
  stato: 'emessa' | 'annullata'
  data_annullamento: string | null
  data_emissione_sistema: string
}

/** Riflette la riga della tabella `righe_ricevuta`. */
export interface RigaRicevutaRow {
  id: number
  ricevuta_id: number
  /** 'iscrizione' | 'abbonamento' | 'libera' */
  tipo: string
  riferimento_id: number | null
  descrizione: string
  data_inizio: string | null
  data_fine: string | null
  prezzo: number
  ordine: number
}

/** Ricevuta con le proprie righe, usata per la generazione PDF. */
export interface RicevutaConRighe extends RicevutaRow {
  righe: RigaRicevutaRow[]
}

/** Voce pagabile (iscrizione o abbonamento da incassare) esposta nella schermata di emissione. */
export interface VocePagabile {
  tipo: 'iscrizione' | 'abbonamento'
  riferimentoId: number
  descrizione: string
  dataInizio: string
  dataFine: string
  prezzo: number
  stato_pagamento: 'pagato' | 'da_incassare'
}

/** Filtri per la lista ricevute. */
export interface RicevutaFilters {
  anno?: number
  stato?: string
  clienteId?: number
  search?: string
}

/** Singola riga nella creazione di una ricevuta. */
export interface CreaRigaInput {
  tipo: 'iscrizione' | 'abbonamento' | 'libera'
  riferimentoId?: number
  descrizione: string
  dataInizio?: string
  dataFine?: string
  prezzo: number
}

/** Dati in ingresso per la creazione di una ricevuta. */
export interface CreaRicevutaInput {
  clienteId: number
  dataEmissione: string
  metodo_pagamento: 'contanti' | 'pos' | 'bonifico'
  stato_pagamento: 'pagato' | 'da_incassare'
  dictPie?: string
  righe: CreaRigaInput[]
}

// ── ElectronAPI ───────────────────────────────────────────────────────────────

export interface ElectronAPI {
  db: {
    getState: () => Promise<{ state: DbState }>
    setup: (password: string) => Promise<void>
    unlock: (password: string) => Promise<void>
    isOpen: () => Promise<boolean>
  }
  settings: {
    get: () => Promise<AppSettings>
    set: (settings: Partial<AppSettings>) => Promise<void>
  }
  app: {
    getVersion: () => Promise<string>
  }
  clienti: {
    list: (filters?: ClientiFilters) => Promise<ClienteRow[]>
    get: (id: number) => Promise<ClienteRow | null>
    create: (data: CreateClienteInput) => Promise<ClienteRow>
    update: (id: number, data: UpdateClienteInput) => Promise<ClienteRow>
    anonimizza: (id: number) => Promise<void>
  }
  certificati: {
    list: (clienteId: number) => Promise<CertificatoRow[]>
    add: (data: CreateCertificatoInput) => Promise<CertificatoRow>
  }
  catalogo: {
    tipiIscrizione: {
      list: (includeNonValidi?: boolean) => Promise<TipoIscrizioneRow[]>
      create: (data: CreateTipoIscrizioneInput) => Promise<TipoIscrizioneRow>
      update: (id: number, data: UpdateTipoIscrizioneInput) => Promise<TipoIscrizioneRow>
      delete: (id: number) => Promise<void>
      invalida: (id: number) => Promise<void>
    }
    tipiAbbonamento: {
      list: (includeNonValidi?: boolean) => Promise<TipoAbbonamentoRow[]>
      create: (data: CreateTipoAbbonamentoInput) => Promise<TipoAbbonamentoRow>
      update: (id: number, data: UpdateTipoAbbonamentoInput) => Promise<TipoAbbonamentoRow>
      delete: (id: number) => Promise<void>
      invalida: (id: number) => Promise<void>
    }
  }
  iscrizioni: {
    assegna: (data: AssegnaIscrizioneInput) => Promise<IscrizioneClienteRow>
    getAttiva: (clienteId: number) => Promise<IscrizioneClienteRow | null>
    list: (clienteId: number) => Promise<IscrizioneClienteRow[]>
    updateDate: (id: number, dataInizio: string, dataScadenza: string) => Promise<IscrizioneClienteRow>
    invalida: (id: number) => Promise<IscrizioneClienteRow>
  }
  abbonamenti: {
    assegna: (data: AssegnaAbbonamentoInput) => Promise<AbbonamentoClienteRow>
    list: (clienteId: number, soloAttivi?: boolean) => Promise<AbbonamentoClienteRow[]>
    updateDate: (id: number, dataInizio: string, dataScadenza: string) => Promise<AbbonamentoClienteRow>
    invalida: (id: number) => Promise<AbbonamentoClienteRow>
  }
  ricevute: {
    crea: (data: CreaRicevutaInput) => Promise<RicevutaConRighe>
    get: (id: number) => Promise<RicevutaConRighe | null>
    list: (filters?: RicevutaFilters) => Promise<RicevutaRow[]>
    annulla: (id: number) => Promise<RicevutaRow>
    vociPagabili: (clienteId: number) => Promise<VocePagabile[]>
  }
  pdf: {
    genera: (args: { ricevutaId: number }) => Promise<string>
  }
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
}
