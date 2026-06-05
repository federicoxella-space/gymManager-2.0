import React from 'react'
import { useTranslation } from 'react-i18next'
import type { CompleannoDellaSett } from '../../../../types/shared'

interface CompleanniBadgeProps {
  clienti: CompleannoDellaSett[]
  isLoading: boolean
  hasError: boolean
  onNavigateCliente: (clienteId: number) => void
}

export default function CompleanniBadge({
  clienti,
  isLoading,
  hasError,
  onNavigateCliente,
}: CompleanniBadgeProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('dashboard.compleanni.titolo')}
        </h3>
      </div>

      <div className="px-5 py-4">
        {isLoading && (
          <div className="space-y-2">
            {[1, 2].map((n) => (
              <div key={n} className="h-5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        )}

        {hasError && !isLoading && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {t('common.error_generic')}
          </p>
        )}

        {!isLoading && !hasError && clienti.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {t('dashboard.compleanni.vuoto')}
          </p>
        )}

        {!isLoading && !hasError && clienti.length > 0 && (
          <ul className="space-y-1">
            {clienti.map((cliente) => (
              <li key={cliente.cliente_id}>
                <button
                  type="button"
                  onClick={() => onNavigateCliente(cliente.cliente_id)}
                  className="w-full flex items-center justify-between py-1 text-sm hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 rounded text-left"
                >
                  <span className="text-gray-900 dark:text-gray-100">
                    {cliente.nome} {cliente.cognome}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 text-xs">
                    {cliente.giorno_mese}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
