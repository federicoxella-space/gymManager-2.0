import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TipoIscrizioneRow, TipoAbbonamentoRow } from '../../../types/shared'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import SearchInput from '../components/ui/SearchInput'
import TipoIscrizioneForm from '../components/catalog/TipoIscrizioneForm'
import TipoAbbonamentoForm from '../components/catalog/TipoAbbonamentoForm'

type Tab = 'iscrizioni' | 'abbonamenti'

/** Formatta un prezzo in valuta italiana */
function formatValuta(v: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v)
}

// ── Icone ─────────────────────────────────────────────────────────────────────

function PlusIcon(): React.JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

function PencilIcon(): React.JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
    </svg>
  )
}

function BanIcon(): React.JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  )
}

function TrashIcon(): React.JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  )
}

// ── Componente lista tipi iscrizione ─────────────────────────────────────────

interface TipiIscrizioneTabProps {
  showNonValidi: boolean
  searchTipo: string
}

function TipiIscrizioneTab({ showNonValidi, searchTipo }: TipiIscrizioneTabProps): React.JSX.Element {
  const { t } = useTranslation()
  const [tipi, setTipi] = useState<TipoIscrizioneRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Modal form crea/modifica
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<TipoIscrizioneRow | undefined>(undefined)

  // Dialog conferma invalida/elimina
  const [invalidaTarget, setInvalidaTarget] = useState<TipoIscrizioneRow | null>(null)
  const [eliminaTarget, setEliminaTarget] = useState<TipoIscrizioneRow | null>(null)
  const [isActioning, setIsActioning] = useState(false)
  const [eliminaError, setEliminaError] = useState<string | null>(null)

  const loadTipi = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setLoadError(false)
    try {
      const data = await window.api.catalogo.tipiIscrizione.list(showNonValidi)
      setTipi(data)
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }, [showNonValidi])

  useEffect(() => {
    void loadTipi()
  }, [loadTipi])

  function handleNuovo(): void {
    setEditTarget(undefined)
    setShowForm(true)
  }

  function handleModifica(tipo: TipoIscrizioneRow): void {
    setEditTarget(tipo)
    setShowForm(true)
  }

  function handleFormSuccess(tipo: TipoIscrizioneRow): void {
    setShowForm(false)
    setTipi((prev) => {
      const idx = prev.findIndex((t) => t.id === tipo.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = tipo
        return next
      }
      return [tipo, ...prev]
    })
  }

  async function handleInvalida(): Promise<void> {
    if (!invalidaTarget) return
    setIsActioning(true)
    try {
      await window.api.catalogo.tipiIscrizione.invalida(invalidaTarget.id)
      setTipi((prev) =>
        prev.map((t) => (t.id === invalidaTarget.id ? { ...t, stato: 'non_valido' } : t)),
      )
    } finally {
      setIsActioning(false)
      setInvalidaTarget(null)
    }
  }

  async function handleElimina(): Promise<void> {
    if (!eliminaTarget) return
    setIsActioning(true)
    setEliminaError(null)
    try {
      await window.api.catalogo.tipiIscrizione.delete(eliminaTarget.id)
      setTipi((prev) => prev.filter((t) => t.id !== eliminaTarget.id))
      setEliminaTarget(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setEliminaError(
        msg.includes('TIPO_ASSEGNATO') ? t('catalogo.elimina_errore') : t('common.error_generic'),
      )
    } finally {
      setIsActioning(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 gap-3 text-gray-600 dark:text-gray-400" role="status" aria-live="polite">
        <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-primary-600 animate-spin" aria-hidden="true" />
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{t('common.error_generic')}</p>
        <button
          type="button"
          onClick={() => void loadTipi()}
          className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          {t('common.riprova')}
        </button>
      </div>
    )
  }

  const filteredByStato = showNonValidi ? tipi : tipi.filter((t) => t.stato === 'attivo')
  const searchLower = searchTipo.trim().toLowerCase()
  const displayed = searchLower
    ? filteredByStato.filter((t) => t.nome.toLowerCase().includes(searchLower))
    : filteredByStato

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={handleNuovo}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
        >
          <PlusIcon />
          {t('catalogo.nuovo_tipo_iscrizione')}
        </button>
      </div>

      {displayed.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">
          {t('catalogo.nessun_tipo')}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('common.tabella_tipi_iscrizione')}</caption>
            <thead className="bg-gray-50 dark:bg-gray-800/60">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  {t('catalogo.colonne.nome')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  {t('catalogo.colonne.durata')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  {t('catalogo.colonne.prezzo')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  {t('catalogo.colonne.stato')}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {displayed.map((tipo) => (
                <TipoIscrizioneRow
                  key={tipo.id}
                  tipo={tipo}
                  onModifica={() => handleModifica(tipo)}
                  onInvalida={() => setInvalidaTarget(tipo)}
                  onElimina={() => setEliminaTarget(tipo)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal form */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={
          editTarget
            ? t('catalogo.form.titolo_modifica_iscrizione')
            : t('catalogo.form.titolo_nuovo_iscrizione')
        }
      >
        <TipoIscrizioneForm
          initialData={editTarget}
          onSuccess={handleFormSuccess}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

      {/* Dialog invalida */}
      <ConfirmDialog
        isOpen={invalidaTarget !== null}
        onClose={() => setInvalidaTarget(null)}
        onConfirm={() => void handleInvalida()}
        title={t('catalogo.invalida_conferma_titolo')}
        message={t('catalogo.invalida_conferma_msg')}
        confirmLabel={t('catalogo.azioni.invalida')}
        variant="danger"
        isLoading={isActioning}
      />

      {/* Dialog elimina */}
      <ConfirmDialog
        isOpen={eliminaTarget !== null}
        onClose={() => {
          setEliminaTarget(null)
          setEliminaError(null)
        }}
        onConfirm={() => void handleElimina()}
        title={t('catalogo.elimina_conferma_titolo')}
        message={t('catalogo.elimina_conferma_msg')}
        confirmLabel={t('catalogo.azioni.elimina')}
        variant="danger"
        isLoading={isActioning}
        errorMessage={eliminaError}
      />
    </>
  )
}

interface TipoIscrizioneRowProps {
  tipo: TipoIscrizioneRow
  onModifica: () => void
  onInvalida: () => void
  onElimina: () => void
}

function TipoIscrizioneRow({
  tipo,
  onModifica,
  onInvalida,
  onElimina,
}: TipoIscrizioneRowProps): React.JSX.Element {
  const { t } = useTranslation()
  const isAttivo = tipo.stato === 'attivo'

  return (
    <tr className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
      <td className="px-4 py-3">
        <p className="font-medium text-gray-900 dark:text-gray-100">{tipo.nome}</p>
        {tipo.descrizione && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tipo.descrizione}</p>
        )}
      </td>
      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
        {tipo.durata_mesi} {tipo.durata_mesi === 1 ? t('common.mese') : t('common.mesi')}
      </td>
      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
        {formatValuta(tipo.prezzo_default)}
      </td>
      <td className="px-4 py-3">
        <Badge variant={isAttivo ? 'success' : 'neutral'}>
          {isAttivo ? t('catalogo.stato.attivo') : t('catalogo.stato.non_valido')}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onModifica}
            title={t('catalogo.azioni.modifica')}
            className="p-1.5 rounded-md text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <PencilIcon />
            <span className="sr-only">{t('catalogo.azioni.modifica')}</span>
          </button>
          {isAttivo && (
            <button
              type="button"
              onClick={onInvalida}
              title={t('catalogo.azioni.invalida')}
              className="p-1.5 rounded-md text-gray-500 hover:text-yellow-600 dark:hover:text-yellow-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <BanIcon />
              <span className="sr-only">{t('catalogo.azioni.invalida')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onElimina}
            disabled={tipo.assegnati_count > 0}
            title={
              tipo.assegnati_count > 0
                ? t('catalogo.elimina_non_consentito', { count: tipo.assegnati_count })
                : t('catalogo.azioni.elimina')
            }
            className="p-1.5 rounded-md text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-500 disabled:hover:bg-transparent"
          >
            <TrashIcon />
            <span className="sr-only">{t('catalogo.azioni.elimina')}</span>
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Componente lista tipi abbonamento ─────────────────────────────────────────

interface TipiAbbonamentoTabProps {
  showNonValidi: boolean
  searchTipo: string
}

function TipiAbbonamentoTab({ showNonValidi, searchTipo }: TipiAbbonamentoTabProps): React.JSX.Element {
  const { t } = useTranslation()
  const [tipi, setTipi] = useState<TipoAbbonamentoRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<TipoAbbonamentoRow | undefined>(undefined)
  const [invalidaTarget, setInvalidaTarget] = useState<TipoAbbonamentoRow | null>(null)
  const [eliminaTarget, setEliminaTarget] = useState<TipoAbbonamentoRow | null>(null)
  const [isActioning, setIsActioning] = useState(false)
  const [eliminaError, setEliminaError] = useState<string | null>(null)

  const loadTipi = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setLoadError(false)
    try {
      const data = await window.api.catalogo.tipiAbbonamento.list(showNonValidi)
      setTipi(data)
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }, [showNonValidi])

  useEffect(() => {
    void loadTipi()
  }, [loadTipi])

  function handleNuovo(): void {
    setEditTarget(undefined)
    setShowForm(true)
  }

  function handleModifica(tipo: TipoAbbonamentoRow): void {
    setEditTarget(tipo)
    setShowForm(true)
  }

  function handleFormSuccess(tipo: TipoAbbonamentoRow): void {
    setShowForm(false)
    setTipi((prev) => {
      const idx = prev.findIndex((t) => t.id === tipo.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = tipo
        return next
      }
      return [tipo, ...prev]
    })
  }

  async function handleInvalida(): Promise<void> {
    if (!invalidaTarget) return
    setIsActioning(true)
    try {
      await window.api.catalogo.tipiAbbonamento.invalida(invalidaTarget.id)
      setTipi((prev) =>
        prev.map((t) => (t.id === invalidaTarget.id ? { ...t, stato: 'non_valido' } : t)),
      )
    } finally {
      setIsActioning(false)
      setInvalidaTarget(null)
    }
  }

  async function handleElimina(): Promise<void> {
    if (!eliminaTarget) return
    setIsActioning(true)
    setEliminaError(null)
    try {
      await window.api.catalogo.tipiAbbonamento.delete(eliminaTarget.id)
      setTipi((prev) => prev.filter((t) => t.id !== eliminaTarget.id))
      setEliminaTarget(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setEliminaError(
        msg.includes('TIPO_ASSEGNATO') ? t('catalogo.elimina_errore') : t('common.error_generic'),
      )
    } finally {
      setIsActioning(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 gap-3 text-gray-600 dark:text-gray-400" role="status" aria-live="polite">
        <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-primary-600 animate-spin" aria-hidden="true" />
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{t('common.error_generic')}</p>
      </div>
    )
  }

  const filteredByStato = showNonValidi ? tipi : tipi.filter((t) => t.stato === 'attivo')
  const searchLower = searchTipo.trim().toLowerCase()
  const displayed = searchLower
    ? filteredByStato.filter((t) => t.nome.toLowerCase().includes(searchLower))
    : filteredByStato

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={handleNuovo}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
        >
          <PlusIcon />
          {t('catalogo.nuovo_tipo_abbonamento')}
        </button>
      </div>

      {displayed.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">
          {t('catalogo.nessun_tipo')}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('common.tabella_tipi_abbonamento')}</caption>
            <thead className="bg-gray-50 dark:bg-gray-800/60">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  {t('catalogo.colonne.nome')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  {t('catalogo.colonne.categoria')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  {t('catalogo.colonne.durata')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  {t('catalogo.colonne.prezzo')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  {t('catalogo.colonne.stato')}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {displayed.map((tipo) => (
                <TipoAbbonamentoRow
                  key={tipo.id}
                  tipo={tipo}
                  onModifica={() => handleModifica(tipo)}
                  onInvalida={() => setInvalidaTarget(tipo)}
                  onElimina={() => setEliminaTarget(tipo)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={
          editTarget
            ? t('catalogo.form.titolo_modifica_abbonamento')
            : t('catalogo.form.titolo_nuovo_abbonamento')
        }
      >
        <TipoAbbonamentoForm
          initialData={editTarget}
          onSuccess={handleFormSuccess}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

      <ConfirmDialog
        isOpen={invalidaTarget !== null}
        onClose={() => setInvalidaTarget(null)}
        onConfirm={() => void handleInvalida()}
        title={t('catalogo.invalida_conferma_titolo')}
        message={t('catalogo.invalida_conferma_msg')}
        confirmLabel={t('catalogo.azioni.invalida')}
        variant="danger"
        isLoading={isActioning}
      />

      <ConfirmDialog
        isOpen={eliminaTarget !== null}
        onClose={() => {
          setEliminaTarget(null)
          setEliminaError(null)
        }}
        onConfirm={() => void handleElimina()}
        title={t('catalogo.elimina_conferma_titolo')}
        message={t('catalogo.elimina_conferma_msg')}
        confirmLabel={t('catalogo.azioni.elimina')}
        variant="danger"
        isLoading={isActioning}
        errorMessage={eliminaError}
      />
    </>
  )
}

interface TipoAbbonamentoRowProps {
  tipo: TipoAbbonamentoRow
  onModifica: () => void
  onInvalida: () => void
  onElimina: () => void
}

function TipoAbbonamentoRow({
  tipo,
  onModifica,
  onInvalida,
  onElimina,
}: TipoAbbonamentoRowProps): React.JSX.Element {
  const { t } = useTranslation()
  const isAttivo = tipo.stato === 'attivo'

  return (
    <tr className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: tipo.colore }}
            aria-hidden="true"
          />
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">{tipo.nome}</p>
            {tipo.descrizione && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tipo.descrizione}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
        {tipo.categoria ?? '—'}
      </td>
      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
        {tipo.durata_mesi} {tipo.durata_mesi === 1 ? t('common.mese') : t('common.mesi')}
      </td>
      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
        {formatValuta(tipo.prezzo_default)}
      </td>
      <td className="px-4 py-3">
        <Badge variant={isAttivo ? 'success' : 'neutral'}>
          {isAttivo ? t('catalogo.stato.attivo') : t('catalogo.stato.non_valido')}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onModifica}
            title={t('catalogo.azioni.modifica')}
            className="p-1.5 rounded-md text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <PencilIcon />
            <span className="sr-only">{t('catalogo.azioni.modifica')}</span>
          </button>
          {isAttivo && (
            <button
              type="button"
              onClick={onInvalida}
              title={t('catalogo.azioni.invalida')}
              className="p-1.5 rounded-md text-gray-500 hover:text-yellow-600 dark:hover:text-yellow-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <BanIcon />
              <span className="sr-only">{t('catalogo.azioni.invalida')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onElimina}
            disabled={tipo.assegnati_count > 0}
            title={
              tipo.assegnati_count > 0
                ? t('catalogo.elimina_non_consentito', { count: tipo.assegnati_count })
                : t('catalogo.azioni.elimina')
            }
            className="p-1.5 rounded-md text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-500 disabled:hover:bg-transparent"
          >
            <TrashIcon />
            <span className="sr-only">{t('catalogo.azioni.elimina')}</span>
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Pagina principale ─────────────────────────────────────────────────────────

export default function CatalogoPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<Tab>('iscrizioni')
  const [showNonValidi, setShowNonValidi] = useState(false)
  const [searchTipo, setSearchTipo] = useState('')

  const tabClass = (tab: Tab): string =>
    [
      'px-4 py-2.5 text-sm font-medium rounded-lg transition-colors',
      activeTab === tab
        ? 'bg-primary-600 text-white'
        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100',
    ].join(' ')

  return (
    <div className="space-y-6">
      {/* Barra tab + ricerca + toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('iscrizioni')}
            className={tabClass('iscrizioni')}
          >
            {t('catalogo.tab_iscrizioni')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('abbonamenti')}
            className={tabClass('abbonamenti')}
          >
            {t('catalogo.tab_abbonamenti')}
          </button>
        </div>

        <SearchInput
          value={searchTipo}
          onChange={setSearchTipo}
          placeholder={t('catalogo.cerca')}
          className="sm:w-64"
        />

        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer sm:ml-auto">
          <input
            type="checkbox"
            checked={showNonValidi}
            onChange={(e) => setShowNonValidi(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          {t('catalogo.mostra_non_validi')}
        </label>
      </div>

      {/* Contenuto tab */}
      {activeTab === 'iscrizioni' ? (
        <TipiIscrizioneTab showNonValidi={showNonValidi} searchTipo={searchTipo} />
      ) : (
        <TipiAbbonamentoTab showNonValidi={showNonValidi} searchTipo={searchTipo} />
      )}
    </div>
  )
}
