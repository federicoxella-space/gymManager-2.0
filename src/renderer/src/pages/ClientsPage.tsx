import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ClienteRow, ClientiFilters, TipoAbbonamentoRow } from '../../../types/shared'
import ClientList from '../components/clients/ClientList'
import ClientDetail from '../components/clients/ClientDetail'
import ClientForm from '../components/clients/ClientForm'
import ImportClientiDialog from '../components/clients/ImportClientiDialog'
import Modal from '../components/ui/Modal'

type View = 'list' | 'detail'

type StatoIscrizioneFilter = '' | 'attiva' | 'scaduta' | 'assente'
type StatoCertificatoFilter = '' | 'valido' | 'in_scadenza' | 'scaduto' | 'da_gestire'

interface ClientsPageProps {
  initialFilter?: ClientiFilters
  onFilterConsumed?: () => void
}

export default function ClientsPage({ initialFilter, onFilterConsumed }: ClientsPageProps): React.JSX.Element {
  const { t } = useTranslation()

  const [view, setView] = useState<View>('list')
  const [clienti, setClienti] = useState<ClienteRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selectedClienteId, setSelectedClienteId] = useState<number | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [currentSearch, setCurrentSearch] = useState('')
  const [filtroIscrizione, setFiltroIscrizione] = useState<StatoIscrizioneFilter>('')
  const [filtroCertificato, setFiltroCertificato] = useState<StatoCertificatoFilter>('')
  const [filtroTipoAbbonamento, setFiltroTipoAbbonamento] = useState<TipoAbbonamentoRow | null>(null)
  const [tipiAbbonamento, setTipiAbbonamento] = useState<TipoAbbonamentoRow[]>([])
  const [activeFilter, setActiveFilter] = useState<ClientiFilters | undefined>(initialFilter)
  const prevInitialFilterRef = useRef<ClientiFilters | undefined>(initialFilter)

  const loadClienti = useCallback(
    async (
      search: string,
      extraFilter?: ClientiFilters,
      isc?: StatoIscrizioneFilter,
      cert?: StatoCertificatoFilter,
      tipoAbb?: TipoAbbonamentoRow | null,
    ): Promise<void> => {
      setIsLoading(true)
      setLoadError(false)
      try {
        const filters: ClientiFilters = {
          ...(extraFilter ?? {}),
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(isc ? { stato_iscrizione: isc as ClientiFilters['stato_iscrizione'] } : {}),
          ...(cert ? { stato_certificato: cert as ClientiFilters['stato_certificato'] } : {}),
          ...(tipoAbb ? { tipo_abbonamento_id: tipoAbb.id } : {}),
        }
        const hasFilters = Object.keys(filters).length > 0
        const data = await window.api.clienti.list(hasFilters ? filters : undefined)
        setClienti(data)
      } catch {
        setLoadError(true)
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  // Carica i tipi abbonamento al mount per il filtro
  useEffect(() => {
    window.api.catalogo.tipiAbbonamento
      .list(false)
      .then((tipi) => setTipiAbbonamento(tipi))
      .catch(() => {
        // Silenzioso: il filtro non mostrerà le opzioni
      })
  }, [])

  // Caricamento iniziale o quando arriva un nuovo filtro dalla dashboard
  useEffect(() => {
    if (initialFilter !== prevInitialFilterRef.current) {
      prevInitialFilterRef.current = initialFilter
      setActiveFilter(initialFilter)
      setCurrentSearch('')
      setFiltroIscrizione('')
      setFiltroCertificato('')
      setFiltroTipoAbbonamento(null)
      void loadClienti('', initialFilter, '', '', null)
      onFilterConsumed?.()
    }
  }, [initialFilter, loadClienti, onFilterConsumed])

  // Caricamento al mount
  useEffect(() => {
    void loadClienti('', activeFilter, filtroIscrizione, filtroCertificato, filtroTipoAbbonamento)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleRefresh(search: string): void {
    setCurrentSearch(search)
    void loadClienti(search, activeFilter, filtroIscrizione, filtroCertificato, filtroTipoAbbonamento)
  }

  function handleFiltroIscrizioneChange(value: StatoIscrizioneFilter): void {
    setFiltroIscrizione(value)
    void loadClienti(currentSearch, activeFilter, value, filtroCertificato, filtroTipoAbbonamento)
  }

  function handleFiltroCertificatoChange(value: StatoCertificatoFilter): void {
    setFiltroCertificato(value)
    void loadClienti(currentSearch, activeFilter, filtroIscrizione, value, filtroTipoAbbonamento)
  }

  function handleFiltroTipoAbbonamentoChange(value: string): void {
    const tipo = tipiAbbonamento.find((t) => String(t.id) === value) ?? null
    setFiltroTipoAbbonamento(tipo)
    void loadClienti(currentSearch, activeFilter, filtroIscrizione, filtroCertificato, tipo)
  }

  function handleSelectCliente(cliente: ClienteRow): void {
    setSelectedClienteId(cliente.id)
    setView('detail')
  }

  function handleBack(): void {
    setSelectedClienteId(null)
    setView('list')
  }

  function handleClienteUpdated(): void {
    void loadClienti(currentSearch, activeFilter, filtroIscrizione, filtroCertificato, filtroTipoAbbonamento)
  }

  function handleNewSuccess(cliente: ClienteRow): void {
    setShowNewModal(false)
    void loadClienti(currentSearch, activeFilter, filtroIscrizione, filtroCertificato, filtroTipoAbbonamento)
    // Naviga subito al dettaglio del cliente appena creato
    setSelectedClienteId(cliente.id)
    setView('detail')
  }

  // ── Vista dettaglio ───────────────────────────────────────────────────────

  if (view === 'detail' && selectedClienteId !== null) {
    return (
      <ClientDetail
        clienteId={selectedClienteId}
        onBack={handleBack}
        onClienteUpdated={handleClienteUpdated}
      />
    )
  }

  // ── Vista lista ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Intestazione con CTA */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('clienti.titolo')}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="btn-importa-csv"
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {t('clienti.import.pulsante')}
          </button>
          <button
            type="button"
            data-testid="btn-nuovo-cliente"
            onClick={() => setShowNewModal(true)}
            className={[
              'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg',
              'bg-primary-600 hover:bg-primary-700 text-white transition-colors',
            ].join(' ')}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('clienti.nuovo')}
          </button>
        </div>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Stato iscrizione */}
        <div>
          <label
            htmlFor="filtro-stato-iscrizione"
            className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
          >
            {t('clienti.filtri.stato_iscrizione')}
          </label>
          <select
            id="filtro-stato-iscrizione"
            value={filtroIscrizione}
            onChange={(e) => handleFiltroIscrizioneChange(e.target.value as StatoIscrizioneFilter)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('clienti.filtri.tutti')}</option>
            <option value="attiva">{t('clienti.filtri.iscrizione_attiva')}</option>
            <option value="scaduta">{t('clienti.filtri.iscrizione_scaduta')}</option>
            <option value="assente">{t('clienti.filtri.iscrizione_assente')}</option>
          </select>
        </div>

        {/* Stato certificato */}
        <div>
          <label
            htmlFor="filtro-stato-certificato"
            className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
          >
            {t('clienti.filtri.certificato')}
          </label>
          <select
            id="filtro-stato-certificato"
            value={filtroCertificato}
            onChange={(e) =>
              handleFiltroCertificatoChange(e.target.value as StatoCertificatoFilter)
            }
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('clienti.filtri.tutti')}</option>
            <option value="valido">{t('clienti.filtri.cert_valido')}</option>
            <option value="in_scadenza">{t('clienti.filtri.cert_in_scadenza')}</option>
            <option value="scaduto">{t('clienti.filtri.cert_scaduto')}</option>
            <option value="da_gestire">{t('clienti.filtri.cert_da_gestire')}</option>
          </select>
        </div>

        {/* Tipo abbonamento */}
        <div>
          <label
            htmlFor="filtro-tipo-abbonamento"
            className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
          >
            {t('clienti.filtri.tipo_abbonamento')}
          </label>
          <select
            id="filtro-tipo-abbonamento"
            value={filtroTipoAbbonamento ? String(filtroTipoAbbonamento.id) : ''}
            onChange={(e) => handleFiltroTipoAbbonamentoChange(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('clienti.filtri.tutti')}</option>
            {tipiAbbonamento.map((tipo) => (
              <option key={tipo.id} value={String(tipo.id)}>
                {tipo.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stato errore */}
      {loadError && !isLoading && (
        <div
          className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700"
          role="alert"
        >
          {t('clienti.errore_caricamento')}
        </div>
      )}

      {/* Lista clienti */}
      <ClientList
        clienti={clienti}
        isLoading={isLoading}
        onSelectCliente={handleSelectCliente}
        onRefresh={handleRefresh}
      />

      {/* Modal nuovo cliente */}
      <Modal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        title={t('clienti.form.titolo_crea')}
        maxWidth="max-w-2xl"
      >
        <ClientForm
          mode="create"
          onSuccess={handleNewSuccess}
          onCancel={() => setShowNewModal(false)}
        />
      </Modal>

      {/* Modal import CSV */}
      <ImportClientiDialog
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={() =>
          loadClienti(currentSearch, activeFilter, filtroIscrizione, filtroCertificato, filtroTipoAbbonamento)
        }
      />
    </div>
  )
}
