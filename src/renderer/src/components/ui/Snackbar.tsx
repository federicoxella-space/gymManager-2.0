import React, { useEffect } from 'react'

export type SnackbarVariant = 'info' | 'success' | 'neutral' | 'error'

interface SnackbarProps {
  /** Testo già localizzato da mostrare. */
  message: string
  /** Variante visiva; default 'neutral'. */
  variant?: SnackbarVariant
  /** Chiamata alla chiusura (manuale o auto-dismiss). */
  onClose: () => void
  /** aria-label del pulsante di chiusura (localizzato). */
  closeLabel: string
  /** Se > 0, lo snackbar si chiude da solo dopo N ms. */
  autoDismissMs?: number
}

const VARIANT_CLASSES: Record<SnackbarVariant, string> = {
  info: 'bg-primary-600 text-white',
  success: 'bg-green-600 text-white',
  neutral: 'bg-gray-900 text-white dark:bg-gray-700',
  error:
    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700',
}

/**
 * Snackbar effimero non invasivo, ancorato in basso-destra.
 * Presentazionale: non conosce l'i18n né la logica di dominio; riceve testo,
 * variante ed eventuale auto-dismiss dal chiamante.
 */
export default function Snackbar({
  message,
  variant = 'neutral',
  onClose,
  closeLabel,
  autoDismissMs,
}: SnackbarProps): React.JSX.Element {
  useEffect(() => {
    if (!autoDismissMs || autoDismissMs <= 0) return
    const id = setTimeout(onClose, autoDismissMs)
    return () => clearTimeout(id)
  }, [autoDismissMs, onClose])

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-0 right-0 z-50 pointer-events-none"
    >
      <div
        className={[
          'pointer-events-auto m-4 max-w-sm w-max flex items-center gap-3',
          'text-sm px-4 py-3 rounded-lg shadow-lg',
          VARIANT_CLASSES[variant],
        ].join(' ')}
      >
        <span className="min-w-0 flex-1">{message}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="shrink-0 opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
