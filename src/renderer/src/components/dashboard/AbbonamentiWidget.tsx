import React from 'react'
import { useTranslation } from 'react-i18next'
import type { AbbonamentoPerTipo } from '../../../../types/shared'

interface AbbonamentiWidgetProps {
  data: AbbonamentoPerTipo[] | null
  isLoading: boolean
  hasError: boolean
  onNavigatePerTipo: (tipoId: number) => void
}

export default function AbbonamentiWidget({
  data,
  isLoading,
  hasError,
  onNavigatePerTipo,
}: AbbonamentiWidgetProps): React.JSX.Element {
  const { t } = useTranslation()

  const max = data && data.length > 0
    ? Math.max(...data.map((d) => d.totale))
    : 1

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('dashboard.abbonamenti.titolo')}
        </h3>
      </div>

      <div className="px-5 py-4">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-6 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        )}

        {hasError && !isLoading && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {t('common.error_generic')}
          </p>
        )}

        {!isLoading && !hasError && (!data || data.length === 0) && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
            {t('dashboard.abbonamenti.vuoto')}
          </p>
        )}

        {!isLoading && !hasError && data && data.length > 0 && (
          <ul className="space-y-3">
            {data.map((riga) => {
              const percentuale = max > 0 ? Math.round((riga.totale / max) * 100) : 0
              return (
                <li key={riga.tipo_abbonamento_id}>
                  <button
                    type="button"
                    onClick={() => onNavigatePerTipo(riga.tipo_abbonamento_id)}
                    className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-md group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: riga.colore || '#6b7280' }}
                        aria-hidden="true"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors truncate flex-1">
                        {riga.nome}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 shrink-0">
                        {riga.totale}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${percentuale}%`,
                          backgroundColor: riga.colore || '#6b7280',
                        }}
                      />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
