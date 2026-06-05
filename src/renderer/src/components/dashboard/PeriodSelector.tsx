import React from 'react'
import { useTranslation } from 'react-i18next'
import type { DashboardPeriodo, TipoPeriodo } from './types'

interface PeriodSelectorProps {
  periodo: DashboardPeriodo
  onPeriodoChange: (periodo: DashboardPeriodo) => void
}

const OPZIONI: TipoPeriodo[] = ['mese_corrente', 'ultimi_30', 'anno_corrente', 'personalizzato']

/** Calcola le date di inizio e fine per un dato tipo di periodo (escluso "personalizzato"). */
function calcolaDate(tipo: Exclude<TipoPeriodo, 'personalizzato'>): { dal: string; al: string } {
  const oggi = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const toIso = (d: Date): string =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  const al = toIso(oggi)

  if (tipo === 'mese_corrente') {
    const dal = toIso(new Date(oggi.getFullYear(), oggi.getMonth(), 1))
    return { dal, al }
  }

  if (tipo === 'ultimi_30') {
    const d = new Date(oggi)
    d.setDate(d.getDate() - 30)
    return { dal: toIso(d), al }
  }

  // anno_corrente
  const dal = `${oggi.getFullYear()}-01-01`
  return { dal, al }
}

export default function PeriodSelector({
  periodo,
  onPeriodoChange,
}: PeriodSelectorProps): React.JSX.Element {
  const { t } = useTranslation()

  function handleTipoChange(tipo: TipoPeriodo): void {
    if (tipo === 'personalizzato') {
      onPeriodoChange({ tipo, dal: periodo.dal, al: periodo.al })
    } else {
      const { dal, al } = calcolaDate(tipo)
      onPeriodoChange({ tipo, dal, al })
    }
  }

  function handleDalChange(e: React.ChangeEvent<HTMLInputElement>): void {
    onPeriodoChange({ ...periodo, tipo: 'personalizzato', dal: e.target.value })
  }

  function handleAlChange(e: React.ChangeEvent<HTMLInputElement>): void {
    onPeriodoChange({ ...periodo, tipo: 'personalizzato', al: e.target.value })
  }

  const labelMap: Record<TipoPeriodo, string> = {
    mese_corrente: t('dashboard.periodo.questo_mese'),
    ultimi_30: t('dashboard.periodo.ultimi_30'),
    anno_corrente: t('dashboard.periodo.quest_anno'),
    personalizzato: t('dashboard.periodo.personalizzato'),
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Button group per il tipo di periodo */}
      <div
        className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
        role="group"
        aria-label={t('dashboard.titolo')}
      >
        {OPZIONI.map((opzione) => {
          const isActive = periodo.tipo === opzione
          return (
            <button
              key={opzione}
              type="button"
              onClick={() => handleTipoChange(opzione)}
              aria-pressed={isActive}
              className={[
                'px-3 py-1.5 text-sm font-medium transition-colors border-r border-gray-200 dark:border-gray-700 last:border-r-0',
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800',
              ].join(' ')}
            >
              {labelMap[opzione]}
            </button>
          )
        })}
      </div>

      {/* Input date per periodo personalizzato */}
      {periodo.tipo === 'personalizzato' && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500 dark:text-gray-400" htmlFor="periodo-dal">
            {t('dashboard.periodo.dal')}
          </label>
          <input
            id="periodo-dal"
            type="date"
            value={periodo.dal}
            onChange={handleDalChange}
            max={periodo.al}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <label className="text-sm text-gray-500 dark:text-gray-400" htmlFor="periodo-al">
            {t('dashboard.periodo.al')}
          </label>
          <input
            id="periodo-al"
            type="date"
            value={periodo.al}
            onChange={handleAlChange}
            min={periodo.dal}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      )}
    </div>
  )
}
