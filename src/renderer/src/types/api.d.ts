interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  language: string
  primaryColor: string
  /** Giorni di anticipo per la segnalazione "in scadenza" dei certificati medici. */
  expiry_warning_days_certificates: number
  /** Giorni di anticipo per la segnalazione "in scadenza" delle iscrizioni. */
  expiry_warning_days_memberships: number
  /** Giorni di anticipo per la segnalazione "in scadenza" degli abbonamenti. */
  expiry_warning_days_subscriptions: number
  /** Testo default a piè di ricevuta. */
  dicitura_pie: string
  /** Numero di partenza ricevute per anno (configurabile dall'utente). */
  receipt_start_number: number
  /** Widget visibili nella dashboard. */
  dashboard_widgets: string[]
  /** Ragione sociale dell'attività (usata nelle ricevute). */
  ragione_sociale: string
  /** Indirizzo dell'attività (usato nelle ricevute). */
  indirizzo_attivita: string
  /** Codice fiscale o Partita IVA dell'attività (usato nelle ricevute). */
  codice_fiscale_piva: string
  /** Logo dell'attività in formato data URL base64 (es. '' se non impostato). */
  logo_base64: string
  /** Esegui backup automatico alla chiusura dell'app. */
  backup_on_close: boolean
}

type DbState = 'firstRun' | 'locked' | 'ready'

interface ClienteRow {
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
  cert_scadenza?: string | null
  cert_tipo?: string | null
  /** Stato dell'iscrizione attiva (null se assente) */
  iscrizione_stato?: 'attiva' | 'scaduta' | 'invalidata' | null
  /** Data di scadenza dell'iscrizione attiva (null se assente) */
  iscrizione_scadenza?: string | null
  /** Numero di abbonamenti attivi */
  abbonamenti_attivi_count?: number | null
}

interface CreateClienteInput {
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

type UpdateClienteInput = Partial<CreateClienteInput>

interface ClientiFilters {
  search?: string
  stato?: 'attivo' | 'anonimizzato'
  stato_iscrizione?: 'attiva' | 'scaduta' | 'assente'
  stato_certificato?: 'valido' | 'in_scadenza' | 'scaduto'
  tipo_abbonamento_id?: number
  limit?: number
  offset?: number
}

interface CertificatoRow {
  id: number
  cliente_id: number
  tipo: string
  data_scadenza: string
  data_inserimento: string
}

interface CreateCertificatoInput {
  cliente_id: number
  tipo: string
  data_scadenza: string
}

// ── Catalogo ──────────────────────────────────────────────────────────────────

interface TipoIscrizioneRow {
  id: number
  nome: string
  descrizione: string | null
  durata_mesi: number
  prezzo_default: number
  stato: 'attivo' | 'non_valido'
  data_inserimento: string
  data_modifica: string
}

interface TipoAbbonamentoRow {
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

interface CreateTipoIscrizioneInput {
  nome: string
  descrizione?: string
  durata_mesi: number
  prezzo_default: number
}

type UpdateTipoIscrizioneInput = Partial<CreateTipoIscrizioneInput> & {
  stato?: 'attivo' | 'non_valido'
}

interface CreateTipoAbbonamentoInput {
  nome: string
  descrizione?: string
  durata_mesi: number
  prezzo_default: number
  categoria?: string
  colore?: string
}

type UpdateTipoAbbonamentoInput = Partial<CreateTipoAbbonamentoInput> & {
  stato?: 'attivo' | 'non_valido'
}

// ── Associazioni cliente ──────────────────────────────────────────────────────

interface IscrizioneClienteRow {
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

interface AbbonamentoClienteRow {
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

interface AssegnaIscrizioneInput {
  cliente_id: number
  tipo_iscrizione_id: number
  data_inizio: string
  data_scadenza: string
  prezzo: number
  stato_pagamento: 'pagato' | 'da_incassare'
  metodo_pagamento?: string
  note?: string
}

interface AssegnaAbbonamentoInput {
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

interface RicevutaRow {
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

interface RigaRicevutaRow {
  id: number
  ricevuta_id: number
  tipo: string
  riferimento_id: number | null
  descrizione: string
  data_inizio: string | null
  data_fine: string | null
  prezzo: number
  ordine: number
}

interface RicevutaConRighe extends RicevutaRow {
  righe: RigaRicevutaRow[]
}

interface VocePagabile {
  tipo: 'iscrizione' | 'abbonamento'
  riferimentoId: number
  descrizione: string
  dataInizio: string
  dataFine: string
  prezzo: number
  stato_pagamento: 'pagato' | 'da_incassare'
}

interface RicevutaFilters {
  anno?: number
  stato?: string
  clienteId?: number
  search?: string
}

interface CreaRigaInput {
  tipo: 'iscrizione' | 'abbonamento' | 'libera'
  riferimentoId?: number
  descrizione: string
  dataInizio?: string
  dataFine?: string
  prezzo: number
}

interface CreaRicevutaInput {
  clienteId: number
  dataEmissione: string
  metodo_pagamento: 'contanti' | 'pos' | 'bonifico'
  stato_pagamento: 'pagato' | 'da_incassare'
  dictPie?: string
  righe: CreaRigaInput[]
}

// ── Backup ────────────────────────────────────────────────────────────────────

interface BackupManifest {
  version: number
  createdAt: string
  appVersion: string
  dbPath: string
}

interface DriveBackupItem {
  id: string
  nome: string
  createdAt: string
  size: number
}

// ── ElectronAPI ───────────────────────────────────────────────────────────────

interface ElectronAPI {
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
    anni: () => Promise<number[]>
  }
  pdf: {
    genera: (args: { ricevutaId: number }) => Promise<string>
  }
  dashboard: {
    indicatori: (params: { oggi: string; giorniCert: number; giorniIsc: number; giorniAbb: number }) => Promise<WidgetIndicatori>
    scadenze: (params: { oggi: string; giorniCert: number; giorniIsc: number; giorniAbb: number }) => Promise<ClienteInScadenza[]>
    abbonamenti: (params: { soloAttivi?: boolean }) => Promise<AbbonamentoPerTipo[]>
    incassi: (params: { periodo: DashboardPeriodo }) => Promise<IncassiPeriodo>
    tesseramenti: (params: { periodo: DashboardPeriodo }) => Promise<NuoviTesseramenti>
    compleanni: (params: { dalGiorno: string; alGiorno: string }) => Promise<CompleannoDellaSett[]>
  }
  backup: {
    locale: (args: { destinazionePath: string }) => Promise<BackupManifest>
    automatico: () => Promise<string>
    verifica: (args: { backupPath: string }) => Promise<BackupManifest>
    ripristina: (args: { backupPath: string; password: string }) => Promise<void>
    reset: (args: { nuovaPassword: string }) => Promise<void>
    drive: {
      isConnected: () => Promise<boolean>
      connect: () => Promise<void>
      disconnect: () => Promise<void>
      backup: (args: { backupPath: string }) => Promise<string>
      list: () => Promise<DriveBackupItem[]>
    }
  }
  updater: {
    check: () => Promise<void>
    install: () => Promise<void>
  }
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
}

// ── Auto-update ───────────────────────────────────────────────────────────────

interface UpdateInfo {
  version: string
  releaseNotes?: string
}

interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  total: number
  transferred: number
}

// ── Dashboard types ───────────────────────────────────────────────────────────

interface DashboardPeriodo {
  dal: string
  al: string
}

interface WidgetIndicatori {
  soci_attivi: number
  da_rinnovare: number
  certificati_in_scadenza: number
  certificati_scaduti: number
  incassi_pagati: number
  incassi_da_incassare: number
}

interface ClienteInScadenza {
  cliente_id: number
  nome: string
  cognome: string
  tipo: 'certificato' | 'iscrizione' | 'abbonamento'
  nome_tipo: string
  data_scadenza: string
  giorni_alla_scadenza: number
}

interface AbbonamentoPerTipo {
  tipo_abbonamento_id: number
  nome: string
  colore: string
  totale: number
}

interface IncassiPeriodo {
  totale_pagato: number
  totale_da_incassare: number
  ricevute_emesse: number
  totale_ricevute: number
}

interface NuoviTesseramenti {
  totale: number
}

interface CompleannoDellaSett {
  cliente_id: number
  nome: string
  cognome: string
  data_nascita: string
  giorno_mese: string
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
