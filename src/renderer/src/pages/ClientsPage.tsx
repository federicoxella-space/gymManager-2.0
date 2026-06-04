import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ClienteRow } from '../../../types/shared'
import ClientList from '../components/clients/ClientList'
import ClientDetail from '../components/clients/ClientDetail'
import ClientForm from '../components/clients/ClientForm'
import Modal from '../components/ui/Modal'

type View = 'list' | 'detail'

export default function ClientsPage(): React.JSX.Element {
  const { t } = useTranslation()

  const [view, setView] = useState<View>('list')
  const [clienti, setClienti] = useState<ClienteRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selectedClienteId, setSelectedClienteId] = useState<number | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [currentSearch, setCurrentSearch] = useState('')

  const loadClienti = useCallback(async (search: string): Promise<void> => {
    setIsLoading(true)
    setLoadError(false)
    try {
      const data = await window.api.clienti.list(
        search.trim() ? { search: search.trim() } : undefined,
      )
      setClienti(data)
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Caricamento iniziale
  useEffect(() => {
    void loadClienti('')
  }, [loadClienti])

  function handleRefresh(search: string): void {
    setCurrentSearch(search)
    void loadClienti(search)
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
    void loadClienti(currentSearch)
  }

  function handleNewSuccess(cliente: ClienteRow): void {
    setShowNewModal(false)
    void loadClienti(currentSearch)
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
        <button
          type="button"
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
    </div>
  )
}
