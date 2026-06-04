import React from 'react'
import { useTranslation } from 'react-i18next'
import Badge from '../ui/Badge'
import type { StatoCertificato } from '../../../../types/shared'

interface ClientBadgeProps {
  /** Stato del certificato medico; undefined/null = assente */
  statoCert?: StatoCertificato | null
}

/**
 * Calcola lo stato di un certificato medico nel renderer.
 * Replica la logica di calcolaStatoCertificato del main process
 * senza importare da main/domain.
 */
export function getStatoCert(
  dataScadenza: string | null | undefined,
  warningDays: number = 30,
): StatoCertificato | null {
  if (!dataScadenza) return null

  const [y, m, d] = dataScadenza.split('-').map(Number)
  const scadenza = new Date(Date.UTC(y, m - 1, d))
  const oggi = new Date()
  const oggiNorm = new Date(Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()))

  const diffMs = scadenza.getTime() - oggiNorm.getTime()
  const diffGiorni = Math.floor(diffMs / (24 * 60 * 60 * 1000))

  if (diffGiorni < 0) return 'scaduto'
  if (diffGiorni <= warningDays) return 'in_scadenza'
  return 'valido'
}

export default function ClientBadge({ statoCert }: ClientBadgeProps): React.JSX.Element {
  const { t } = useTranslation()

  if (!statoCert) {
    return <Badge variant="neutral">{t('clienti.certificato.stato_assente')}</Badge>
  }

  switch (statoCert) {
    case 'valido':
      return <Badge variant="success">{t('clienti.certificato.stato_valido')}</Badge>
    case 'in_scadenza':
      return <Badge variant="warning">{t('clienti.certificato.stato_in_scadenza')}</Badge>
    case 'scaduto':
      return <Badge variant="danger">{t('clienti.certificato.stato_scaduto')}</Badge>
  }
}
