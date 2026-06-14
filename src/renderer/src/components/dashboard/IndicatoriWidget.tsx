import React from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetIndicatori } from '../../../../types/shared'

interface IndicatoriWidgetProps {
  data: WidgetIndicatori | null
  isLoading: boolean
  hasError: boolean
  onNavigateClientiAttivi: () => void
  onNavigateClientiDaRinnovare: () => void
  onNavigateClientiCertificati: () => void
}

interface CardProps {
  label: string
  value: string | number
  colorClasses: string
  isLoading: boolean
  onClick?: () => void
  ariaLabel?: string
}

function StatCard({
  label,
  value,
  colorClasses,
  isLoading,
  onClick,
  ariaLabel,
}: CardProps): React.JSX.Element {
  const baseClasses = [
    'rounded-xl p-5 flex flex-col gap-1 border',
    colorClasses,
  ].join(' ')

  const interactiveClasses = onClick
    ? 'cursor-pointer hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500'
    : ''

  const content = (
    <>
      <span className="text-sm font-medium opacity-80">{label}</span>
      {isLoading ? (
        <span className="text-2xl font-bold opacity-50">—</span>
      ) : (
        <span className="text-2xl font-bold">{value}</span>
      )}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? label}
        className={[baseClasses, interactiveClasses].join(' ')}
      >
        {content}
      </button>
    )
  }

  return <div className={baseClasses}>{content}</div>
}

function formatEuro(importo: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(importo)
}

export default function IndicatoriWidget({
  data,
  isLoading,
  hasError,
  onNavigateClientiAttivi,
  onNavigateClientiDaRinnovare,
  onNavigateClientiCertificati,
}: IndicatoriWidgetProps): React.JSX.Element {
  const { t } = useTranslation()

  if (hasError) {
    return (
      <div
        className="col-span-2 lg:col-span-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        role="alert"
      >
        {t('common.error_generic')}
      </div>
    )
  }

  return (
    <>
      <StatCard
        label={t('dashboard.indicatori.soci_attivi')}
        value={data?.soci_attivi ?? 0}
        colorClasses="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-900 dark:text-blue-100"
        isLoading={isLoading}
        onClick={onNavigateClientiAttivi}
        ariaLabel={t('dashboard.indicatori.soci_attivi')}
      />
      <StatCard
        label={t('dashboard.indicatori.da_rinnovare')}
        value={data?.da_rinnovare ?? 0}
        colorClasses="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700 text-orange-900 dark:text-orange-100"
        isLoading={isLoading}
        onClick={onNavigateClientiDaRinnovare}
        ariaLabel={t('dashboard.indicatori.da_rinnovare')}
      />
      <StatCard
        label={t('dashboard.indicatori.certificati')}
        value={data?.certificati_in_scadenza ?? 0}
        colorClasses="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-900 dark:text-red-100"
        isLoading={isLoading}
        onClick={onNavigateClientiCertificati}
        ariaLabel={t('dashboard.indicatori.certificati')}
      />
      <StatCard
        label={t('dashboard.indicatori.iscrizioni_in_scadenza')}
        value={data?.iscrizioni_in_scadenza ?? 0}
        colorClasses="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-900 dark:text-amber-100"
        isLoading={isLoading}
      />
      <StatCard
        label={t('dashboard.indicatori.abbonamenti_in_scadenza')}
        value={data?.abbonamenti_in_scadenza ?? 0}
        colorClasses="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700 text-purple-900 dark:text-purple-100"
        isLoading={isLoading}
      />
      <StatCard
        label={t('dashboard.indicatori.incassi')}
        value={data ? formatEuro(data.incassi_pagati) : '—'}
        colorClasses="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-900 dark:text-green-100"
        isLoading={isLoading}
      />
    </>
  )
}
