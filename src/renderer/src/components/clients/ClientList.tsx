import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ClienteRow } from '../../../../types/shared'
import { useSettings } from '../../context/SettingsContext'
import SearchInput from '../ui/SearchInput'
import Badge from '../ui/Badge'
import ClientBadge, { getStatoCert } from './ClientBadge'
import { formatNomeCliente } from '../../utils/dominio'

interface ClientListProps {
  clienti: ClienteRow[]
  isLoading: boolean
  onSelectCliente: (cliente: ClienteRow) => void
  onRefresh: (search: string) => void
}

interface IscrizioneBadgeProps {
  stato: 'attiva' | 'scaduta' | 'invalidata' | null
  scadenza: string | null
}

function IscrizioneBadge({ stato, scadenza }: IscrizioneBadgeProps): React.JSX.Element {
  const { t } = useTranslation()

  if (!stato) {
    return <Badge variant="neutral">{t('iscrizioni.stato.assente')}</Badge>
  }

  const formatted = scadenza
    ? new Intl.DateTimeFormat('it-IT').format(new Date(scadenza))
    : null

  if (stato === 'attiva') {
    return (
      <span className="flex flex-col gap-0.5">
        <Badge variant="success">{t('iscrizioni.stato.attiva')}</Badge>
        {formatted && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t('iscrizioni.scadenza_breve', { data: formatted })}
          </span>
        )}
      </span>
    )
  }

  if (stato === 'scaduta') {
    return <Badge variant="warning">{t('iscrizioni.stato.scaduta')}</Badge>
  }

  return <Badge variant="danger">{t('iscrizioni.stato.invalidata')}</Badge>
}

function ChevronRightIcon(): React.JSX.Element {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
}

export default function ClientList({
  clienti,
  isLoading,
  onSelectCliente,
  onRefresh,
}: ClientListProps): React.JSX.Element {
  const { t } = useTranslation()
  const { expiryWarningDaysCertificates } = useSettings()
  const [searchValue, setSearchValue] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce della ricerca: 300ms
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onRefresh(value)
      }, 300)
    },
    [onRefresh],
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div className="flex flex-col gap-4">
      {/* Barra ricerca */}
      <SearchInput
        value={searchValue}
        onChange={handleSearchChange}
        placeholder={t('clienti.cerca')}
        className="max-w-sm"
      />

      {/* Tabella */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table data-testid="client-list-table" className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap"
              >
                {t('clienti.colonne.tessera')}
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400"
              >
                {t('clienti.colonne.nome')}
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap"
              >
                {t('clienti.colonne.iscrizione')}
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap"
              >
                {t('clienti.colonne.certificato')}
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap"
              >
                {t('clienti.colonne.abbonamenti')}
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">{t('clienti.colonne.azioni')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400" role="status" aria-live="polite">
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-primary-600 animate-spin" aria-hidden="true" />
                    <span>{t('common.loading')}</span>
                  </div>
                </td>
              </tr>
            ) : clienti.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {searchValue.trim() ? t('clienti.nessun_risultato_filtro') : t('clienti.nessuno_trovato')}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {searchValue.trim() ? t('clienti.nessun_risultato_filtro_desc') : t('clienti.nessuno_trovato_desc')}
                  </p>
                </td>
              </tr>
            ) : (
              clienti.map((cliente) => {
                const statoCert = getStatoCert(cliente.cert_scadenza, expiryWarningDaysCertificates)
                return (
                  <tr
                    key={cliente.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs whitespace-nowrap">
                      {cliente.numero_tessera ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {formatNomeCliente(cliente)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <IscrizioneBadge
                        stato={cliente.iscrizione_stato ?? null}
                        scadenza={cliente.iscrizione_scadenza ?? null}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <ClientBadge statoCert={statoCert} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {cliente.abbonamenti_attivi_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectCliente(cliente)}
                        aria-label={t('clienti.dettaglio.vedi_dettaglio')}
                        className="inline-flex items-center justify-center p-1.5 rounded-md text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                      >
                        <ChevronRightIcon />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
