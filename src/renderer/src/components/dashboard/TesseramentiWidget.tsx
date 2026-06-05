import React from 'react'
import { useTranslation } from 'react-i18next'
import type { NuoviTesseramenti } from '../../../../types/shared'

interface TesseramentiWidgetProps {
  data: NuoviTesseramenti | null
  isLoading: boolean
  hasError: boolean
}

export default function TesseramentiWidget({
  data,
  isLoading,
  hasError,
}: TesseramentiWidgetProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('dashboard.tesseramenti.titolo')}
        </h3>
      </div>

      <div className="px-5 py-5">
        {isLoading && (
          <div className="h-10 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
        )}

        {hasError && !isLoading && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {t('common.error_generic')}
          </p>
        )}

        {!isLoading && !hasError && (!data || data.totale === 0) && (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {t('dashboard.tesseramenti.nessuno')}
          </p>
        )}

        {!isLoading && !hasError && data && data.totale > 0 && (
          <div className="flex items-end gap-3">
            <span className="text-4xl font-bold text-gray-900 dark:text-gray-100">
              {data.totale}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
