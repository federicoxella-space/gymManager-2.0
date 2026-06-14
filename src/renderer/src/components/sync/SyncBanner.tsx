import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Banner non bloccante per notificare che sono disponibili aggiornamenti remoti.
 * Si mostra su evento `sync:remote-changed`, si nasconde su `sync:reloaded`.
 */
export default function SyncBanner(): React.JSX.Element | null {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    const unsubChanged = window.api.on('sync:remote-changed', () => {
      setVisible(true)
    })
    const unsubReloaded = window.api.on('sync:reloaded', () => {
      setVisible(false)
      setIsSyncing(false)
    })
    return () => {
      unsubChanged()
      unsubReloaded()
    }
  }, [])

  function handleReload(): void {
    setIsSyncing(true)
    window.api.sync.now().catch(() => {
      setIsSyncing(false)
    })
  }

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-0 inset-x-0 z-40 flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto mb-4 mx-4 max-w-xl w-full">
        <div className="flex items-center justify-between gap-4 bg-blue-600 text-white text-sm px-4 py-3 rounded-lg shadow-lg">
          <div className="flex items-center gap-3 min-w-0">
            <SyncIcon />
            <span className="truncate">{t('sync.banner_aggiornato')}</span>
          </div>
          <button
            type="button"
            onClick={handleReload}
            disabled={isSyncing}
            className="shrink-0 bg-white text-blue-700 font-semibold text-xs px-3 py-1.5 rounded-md hover:bg-blue-50 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white transition-colors"
          >
            {isSyncing ? t('sync.sincronizzazione_in_corso') : t('sync.banner_ricarica')}
          </button>
        </div>
      </div>
    </div>
  )
}

function SyncIcon(): React.JSX.Element {
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
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  )
}
