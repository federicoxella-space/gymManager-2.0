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
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
}
