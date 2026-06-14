import React from 'react'
import { useTranslation } from 'react-i18next'
import type { IncassiPeriodo } from '../../../../types/shared'

interface IncassiWidgetProps {
  data: IncassiPeriodo | null
  isLoading: boolean
  hasError: boolean
  onNavigateDaIncassare?: () => void
}

function formatEuro(importo: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(importo)
}

interface RigaValoreProps {
  label: string
  value: string
  dotColor: string
  isLoading: boolean
  onClick?: () => void
}

function RigaValore({ label, value, dotColor, isLoading, onClick }: RigaValoreProps): React.JSX.Element {
  const isClickable = !!onClick && !isLoading

  const contenuto = (
    <>
      <div className="flex items-center gap-2">
        <span className={['w-3 h-3 rounded-full shrink-0', dotColor].join(' ')} aria-hidden="true" />
        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
        {isClickable && (
          <span className="text-xs text-gray-400 dark:text-gray-500" aria-hidden="true">→</span>
        )}
      </div>
      <span className={['text-sm font-semibold', isLoading ? 'text-gray-300 dark:text-gray-600' : 'text-gray-900 dark:text-gray-100'].join(' ')}>
        {isLoading ? '—' : value}
      </span>
    </>
  )

  if (isClickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="w-full flex items-center justify-between py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 -mx-5 px-5 rounded transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        {contenuto}
      </button>
    )
  }

  return (
    <div className="flex items-center justify-between py-2">
      {contenuto}
    </div>
  )
}

export default function IncassiWidget({
  data,
  isLoading,
  hasError,
  onNavigateDaIncassare,
}: IncassiWidgetProps): React.JSX.Element {
  const { t } = useTranslation()

  const totale = data ? data.totale_pagato + data.totale_da_incassare : 0
  const percPagato = totale > 0 && data ? Math.round((data.totale_pagato / totale) * 100) : 0
  const percDaIncassare = 100 - percPagato

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('dashboard.incassi.titolo')}
        </h3>
      </div>

      <div className="px-5 py-4">
        {hasError && !isLoading && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {t('common.error_generic')}
          </p>
        )}

        {!hasError && (
          <>
            {/* Barra proporzionale */}
            {!isLoading && totale > 0 && (
              <div className="flex rounded-full overflow-hidden h-2 mb-4" aria-hidden="true">
                <div className="bg-green-500 transition-all" style={{ width: `${percPagato}%` }} />
                <div className="bg-orange-400 transition-all" style={{ width: `${percDaIncassare}%` }} />
              </div>
            )}
            {!isLoading && totale === 0 && (
              <div className="flex rounded-full overflow-hidden h-2 mb-4 bg-gray-100 dark:bg-gray-800" />
            )}
            {isLoading && (
              <div className="h-2 mb-4 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
            )}

            {/* Righe valori */}
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              <RigaValore
                label={t('dashboard.incassi.pagato')}
                value={data ? formatEuro(data.totale_pagato) : '—'}
                dotColor="bg-green-500"
                isLoading={isLoading}
              />
              {/* Riga "da incassare" con drill-down verso voci non saldate */}
              <RigaValore
                label={t('dashboard.incassi.da_incassare')}
                value={data ? formatEuro(data.totale_da_incassare) : '—'}
                dotColor="bg-orange-400"
                isLoading={isLoading}
                onClick={onNavigateDaIncassare}
              />
            </div>

            {/* Conteggio ricevute */}
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('dashboard.incassi.ricevute')}
              </span>
              <span className={['text-xs font-medium', isLoading ? 'text-gray-300 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'].join(' ')}>
                {isLoading ? '—' : (data?.ricevute_emesse ?? 0)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('dashboard.incassi.totale')}
              </span>
              <span className={['text-xs font-medium', isLoading ? 'text-gray-300 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'].join(' ')}>
                {isLoading ? '—' : (data ? formatEuro(data.totale_ricevute) : '—')}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
