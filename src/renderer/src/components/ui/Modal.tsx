import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface ModalDirtyContextValue {
  setDirty: (dirty: boolean) => void
}
const ModalDirtyContext = createContext<ModalDirtyContextValue | null>(null)

/** Da chiamare dentro un form renderizzato in un Modal per abilitare la conferma di scarto su chiusura. */
export function useModalDirty(dirty: boolean): void {
  const ctx = useContext(ModalDirtyContext)
  useEffect(() => {
    ctx?.setDirty(dirty)
    return () => ctx?.setDirty(false)
  }, [ctx, dirty])
}

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /** Larghezza massima del modale, default 'max-w-lg' */
  maxWidth?: string
  /** id dell'elemento che descrive il dialog (associato come aria-describedby) */
  describedById?: string
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
  describedById,
}: ModalProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  const [isDirty, setIsDirty] = useState(false)
  const [showDiscard, setShowDiscard] = useState(false)

  const requestClose = useRef<() => void>(() => {})
  requestClose.current = () => {
    if (isDirty) setShowDiscard(true)
    else onClose()
  }

  // Escape per chiudere + focus-trap sul Tab
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        requestClose.current()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (focusables.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Sposta il focus nel dialog all'apertura, lo ripristina alla chiusura
  useEffect(() => {
    if (!isOpen) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    if (panel) {
      const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(firstFocusable ?? panel).focus()
    }
    return () => {
      previouslyFocused.current?.focus?.()
    }
  }, [isOpen])

  // Blocca scroll quando il modale è aperto; resetta dirty/discard alla chiusura
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      setShowDiscard(false)
      setIsDirty(false)
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={describedById}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={() => requestClose.current()}
        aria-hidden="true"
      />

      {/* Contenuto */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={[
          'relative w-full bg-white dark:bg-gray-900 rounded-xl shadow-xl',
          'flex flex-col max-h-[90vh] focus:outline-none',
          maxWidth,
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2
            id={titleId}
            className="text-base font-semibold text-gray-900 dark:text-gray-100"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={() => requestClose.current()}
            aria-label={t('common.close')}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Corpo scrollabile */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          <ModalDirtyContext.Provider value={{ setDirty: setIsDirty }}>
            {children}
          </ModalDirtyContext.Provider>
        </div>

        {showDiscard && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-xl p-4">
            <div role="alertdialog" aria-modal="true" className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-sm w-full p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('common.modifiche_non_salvate')}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">{t('common.scarta_modifiche_msg')}</p>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowDiscard(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
                  {t('common.continua_modifica')}
                </button>
                <button type="button" onClick={() => { setShowDiscard(false); onClose() }} className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                  {t('common.scarta')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
