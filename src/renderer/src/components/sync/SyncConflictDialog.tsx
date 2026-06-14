import React, { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'

type Scelta = 'remoto' | 'locale' | 'copia'

/**
 * Modale che si apre su evento `sync:conflict` e chiede all'utente
 * come risolvere il conflitto tra il DB locale e quello remoto.
 * Si chiude su `sync:reloaded` o a risoluzione riuscita.
 */
export default function SyncConflictDialog(): React.JSX.Element | null {
  const { t } = useTranslation()
  const messageId = useId()
  const [open, setOpen] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const unsubConflict = window.api.on('sync:conflict', () => {
      setOpen(true)
      setIsResolving(false)
      setErrorMsg(null)
    })
    const unsubReloaded = window.api.on('sync:reloaded', () => {
      setOpen(false)
      setIsResolving(false)
      setErrorMsg(null)
    })
    return () => {
      unsubConflict()
      unsubReloaded()
    }
  }, [])

  async function handleResolve(scelta: Scelta): Promise<void> {
    setIsResolving(true)
    setErrorMsg(null)
    try {
      await window.api.sync.resolve(scelta)
      // La chiusura avviene via sync:reloaded in caso di successo
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('SYNC_PASSWORD_MISMATCH')) {
        setErrorMsg(t('sync.errore_password_diversa'))
      } else {
        setErrorMsg(t('sync.sincronizza_errore'))
      }
      setIsResolving(false)
    }
  }

  if (!open) return null

  return (
    <Modal
      isOpen={open}
      onClose={() => { /* dialog non chiudibile via X — deve essere risolta */ }}
      title={t('sync.conflitto_titolo')}
      maxWidth="max-w-lg"
      describedById={messageId}
    >
      <div className="space-y-5">
        <p
          id={messageId}
          className="text-sm text-gray-600 dark:text-gray-300"
        >
          {t('sync.conflitto_msg')}
        </p>

        {errorMsg !== null && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400"
          >
            {errorMsg}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => { void handleResolve('remoto') }}
            disabled={isResolving}
            className="w-full px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 text-left"
          >
            {t('sync.conflitto_ricarica')}
          </button>
          <button
            type="button"
            onClick={() => { void handleResolve('locale') }}
            disabled={isResolving}
            className="w-full px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 text-left"
          >
            {t('sync.conflitto_sovrascrivi')}
          </button>
          <button
            type="button"
            onClick={() => { void handleResolve('copia') }}
            disabled={isResolving}
            className="w-full px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 text-left"
          >
            {t('sync.conflitto_copia')}
          </button>
        </div>

        {isResolving && (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            {t('sync.sincronizzazione_in_corso')}
          </p>
        )}
      </div>
    </Modal>
  )
}
