import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Snackbar from '../ui/Snackbar'

/** Stato del feedback di controllo aggiornamenti mostrato dallo snackbar. */
type Stato =
  | { fase: 'nascosto' }
  | { fase: 'controllo' }
  | { fase: 'trovato'; version: string }
  | { fase: 'nessuno' }
  | { fase: 'errore' }

/**
 * Snackbar effimero che rende evidente il controllo aggiornamenti (all'avvio e
 * manuale). Mostra "controllo in corso" e poi l'esito. Le azioni di
 * download/installazione restano gestite da UpdateNotification.
 * Comunica col main solo tramite window.api (eventi IPC).
 */
export default function UpdateCheckSnackbar(): React.JSX.Element | null {
  const { t } = useTranslation()
  const [stato, setStato] = useState<Stato>({ fase: 'nascosto' })

  useEffect(() => {
    const unsubChecking = window.api.on('update:checking', () => {
      setStato({ fase: 'controllo' })
    })
    const unsubAvailable = window.api.on('update:available', (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined
      setStato({ fase: 'trovato', version: info?.version ?? '' })
    })
    const unsubNotAvailable = window.api.on('update:not-available', () => {
      setStato({ fase: 'nessuno' })
    })
    const unsubError = window.api.on('update:error', () => {
      setStato({ fase: 'errore' })
    })
    return () => {
      unsubChecking()
      unsubAvailable()
      unsubNotAvailable()
      unsubError()
    }
  }, [])

  if (stato.fase === 'nascosto') return null

  const close = (): void => setStato({ fase: 'nascosto' })
  const closeLabel = t('common.close')

  switch (stato.fase) {
    case 'controllo':
      return (
        <Snackbar
          message={t('aggiornamento.controllo_in_corso')}
          variant="info"
          onClose={close}
          closeLabel={closeLabel}
        />
      )
    case 'trovato':
      return (
        <Snackbar
          message={t('aggiornamento.disponibile', { version: stato.version })}
          variant="success"
          onClose={close}
          closeLabel={closeLabel}
          autoDismissMs={6000}
        />
      )
    case 'nessuno':
      return (
        <Snackbar
          message={t('aggiornamento.nessuno')}
          variant="neutral"
          onClose={close}
          closeLabel={closeLabel}
          autoDismissMs={6000}
        />
      )
    case 'errore':
      return (
        <Snackbar
          message={t('aggiornamento.errore_verifica')}
          variant="error"
          onClose={close}
          closeLabel={closeLabel}
          autoDismissMs={8000}
        />
      )
  }
}
