import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** Stato interno del componente — rispecchia il ciclo di vita dell'aggiornamento. */
type UpdateState =
  | { fase: 'nessuno' }
  | { fase: 'disponibile'; version: string }
  | { fase: 'scaricamento'; version: string; percent: number }
  | { fase: 'pronto'; version: string }
  | { fase: 'errore'; messaggio: string }

/**
 * Componente non invasivo che mostra lo stato dell'auto-aggiornamento.
 *
 * - Nessun aggiornamento → non renderizzato.
 * - Aggiornamento disponibile → banner informativo in basso.
 * - Download in corso → barra di progresso.
 * - Aggiornamento pronto → banner con pulsante "Riavvia e installa".
 * - Errore → testo grigio piccolo, non bloccante.
 *
 * Comunica col main process esclusivamente tramite window.api (preload).
 */
export default function UpdateNotification(): React.JSX.Element | null {
  const { t } = useTranslation()
  const [stato, setStato] = useState<UpdateState>({ fase: 'nessuno' })

  // Su macOS la build non è firmata: l'app non può auto-installare l'aggiornamento.
  // Lo scarica e poi lo rivela in Finder per l'installazione manuale.
  const isMac = window.api.platform === 'darwin'

  useEffect(() => {
    // Ascolta update:available
    const unsubAvailable = window.api.on('update:available', (...args: unknown[]) => {
      const info = args[0] as { version: string } | undefined
      if (info?.version) {
        setStato({ fase: 'disponibile', version: info.version })
      }
    })

    // Ascolta update:progress
    const unsubProgress = window.api.on('update:progress', (...args: unknown[]) => {
      const progress = args[0] as { percent: number; version?: string } | undefined
      if (progress !== undefined) {
        setStato((prev) => {
          const version =
            prev.fase === 'disponibile' || prev.fase === 'scaricamento' || prev.fase === 'pronto'
              ? prev.version
              : ''
          return { fase: 'scaricamento', version, percent: Math.round(progress.percent) }
        })
      }
    })

    // Ascolta update:downloaded
    const unsubDownloaded = window.api.on('update:downloaded', (...args: unknown[]) => {
      const info = args[0] as { version: string } | undefined
      if (info?.version) {
        setStato({ fase: 'pronto', version: info.version })
      }
    })

    // Ascolta update:error
    const unsubError = window.api.on('update:error', (...args: unknown[]) => {
      const msg = args[0] as string | undefined
      setStato({ fase: 'errore', messaggio: msg ?? t('aggiornamento.errore') })
    })

    return () => {
      unsubAvailable()
      unsubProgress()
      unsubDownloaded()
      unsubError()
    }
  }, [t])

  function handleInstall(): void {
    window.api.updater.install().catch(() => {
      // Errore di installazione: viene comunicato via 'update:error'
    })
  }

  function handleRevealInFinder(): void {
    window.api.updater.revealDownload().catch(() => {
      // Errore: viene comunicato via 'update:error'
    })
  }

  if (stato.fase === 'nessuno') {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-0 inset-x-0 z-50 flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto mb-4 mx-4 max-w-xl w-full">
        {stato.fase === 'disponibile' && (
          <div className="flex items-center gap-3 bg-primary-600 text-white text-sm px-4 py-3 rounded-lg shadow-lg">
            <InformationIcon />
            <span>{t('aggiornamento.disponibile', { version: stato.version })}</span>
          </div>
        )}

        {stato.fase === 'scaricamento' && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-4 py-3">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              {t('aggiornamento.scaricamento', { percent: stato.percent })}
            </p>
            <div
              role="progressbar"
              aria-valuenow={stato.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
            >
              <div
                className="h-full bg-primary-600 transition-all duration-300 ease-linear"
                style={{ width: `${stato.percent}%` }}
              />
            </div>
          </div>
        )}

        {stato.fase === 'pronto' && (
          <div className="flex items-center justify-between gap-4 bg-green-600 text-white text-sm px-4 py-3 rounded-lg shadow-lg">
            <div className="flex items-center gap-3 min-w-0">
              <CheckCircleIcon />
              <span className="truncate">
                {isMac
                  ? t('aggiornamento.pronto_mac', { version: stato.version })
                  : t('aggiornamento.pronto', { version: stato.version })}
              </span>
            </div>
            <button
              type="button"
              onClick={isMac ? handleRevealInFinder : handleInstall}
              className="shrink-0 bg-white text-green-700 font-semibold text-xs px-3 py-1.5 rounded-md hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white transition-colors"
            >
              {isMac ? t('aggiornamento.apri_finder') : t('aggiornamento.installa')}
            </button>
          </div>
        )}

        {stato.fase === 'errore' && (
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs px-3 py-2 rounded-md shadow-sm">
            <ExclamationIcon />
            <span className="min-w-0 flex-1">{stato.messaggio ?? t('aggiornamento.errore')}</span>
            <button
              type="button"
              onClick={() => setStato({ fase: 'nessuno' })}
              aria-label={t('common.close')}
              className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Icone inline (24×24, heroicons outline) ──────────────────────────────────

function InformationIcon(): React.JSX.Element {
  return (
    <svg
      className="w-5 h-5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      />
    </svg>
  )
}

function CheckCircleIcon(): React.JSX.Element {
  return (
    <svg
      className="w-5 h-5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

function ExclamationIcon(): React.JSX.Element {
  return (
    <svg
      className="w-4 h-4 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  )
}
