import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ClienteInScadenza } from '../../../../types/shared'
import Badge from '../ui/Badge'
import { formatNomeCliente } from '../../utils/dominio'

interface ScadenzeWidgetProps {
  voci: ClienteInScadenza[]
  isLoading: boolean
  hasError: boolean
  onNavigateCliente: (clienteId: number) => void
}

const MAX_VISIBILI = 10

function formatData(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

export default function ScadenzeWidget({
  voci,
  isLoading,
  hasError,
  onNavigateCliente,
}: ScadenzeWidgetProps): React.JSX.Element {
  const { t } = useTranslation()
  const [mostraTutti, setMostraTutti] = useState(false)

  const vociVisibili = mostraTutti ? voci : voci.slice(0, MAX_VISIBILI)
  const haOltreLimite = voci.length > MAX_VISIBILI

  function etichettaGiorni(giorni: number): string {
    if (giorni < 0) return t('dashboard.scadenze.scaduto')
    if (giorni === 0) return t('dashboard.scadenze.oggi')
    return `${giorni} ${t('dashboard.scadenze.giorni')}`
  }

  function varianteTipo(tipo: ClienteInScadenza['tipo']): 'danger' | 'warning' | 'info' {
    if (tipo === 'certificato') return 'danger'
    if (tipo === 'iscrizione') return 'warning'
    return 'info'
  }

  function etichettaTipo(tipo: ClienteInScadenza['tipo']): string {
    if (tipo === 'certificato') return t('clienti.dettaglio.sezione_certificato')
    if (tipo === 'iscrizione') return t('clienti.dettaglio.sezione_iscrizione')
    return t('clienti.dettaglio.sezione_abbonamenti')
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('dashboard.scadenze.titolo')}
        </h3>
      </div>

      {isLoading && (
        <div className="px-5 py-6 text-sm text-gray-400 dark:text-gray-500 text-center">
          {t('common.loading')}
        </div>
      )}

      {hasError && !isLoading && (
        <div
          className="px-5 py-4 text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          {t('common.error_generic')}
        </div>
      )}

      {!isLoading && !hasError && voci.length === 0 && (
        <div className="px-5 py-6 text-sm text-gray-400 dark:text-gray-500 text-center">
          {t('dashboard.scadenze.vuoto')}
        </div>
      )}

      {!isLoading && !hasError && voci.length > 0 && (
        <>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {vociVisibili.map((voce, idx) => (
              <li key={`${voce.tipo}-${voce.cliente_id}-${idx}`}>
                <button
                  type="button"
                  onClick={() => onNavigateCliente(voce.cliente_id)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant={varianteTipo(voce.tipo)}>
                      {etichettaTipo(voce.tipo)}
                    </Badge>
                    <span className="text-sm text-gray-900 dark:text-gray-100 truncate">
                      {formatNomeCliente(voce)}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-400 truncate hidden sm:inline">
                      {voce.nome_tipo}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatData(voce.data_scadenza)}
                    </span>
                    <span
                      className={[
                        'text-xs font-medium',
                        voce.giorni_alla_scadenza < 0
                          ? 'text-red-600 dark:text-red-400'
                          : voce.giorni_alla_scadenza === 0
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-yellow-600 dark:text-yellow-400',
                      ].join(' ')}
                    >
                      {etichettaGiorni(voce.giorni_alla_scadenza)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {haOltreLimite && !mostraTutti && (
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setMostraTutti(true)}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
              >
                {t('dashboard.scadenze.vedi_tutti')} ({voci.length})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
