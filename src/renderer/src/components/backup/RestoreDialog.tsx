import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'

interface RestoreDialogProps {
  isOpen: boolean
  onClose: () => void
}

export default function RestoreDialog({ isOpen, onClose }: RestoreDialogProps): React.JSX.Element | null {
  const { t } = useTranslation()

  const [backupPath, setBackupPath] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleClose(): void {
    if (isLoading) return
    setBackupPath('')
    setPassword('')
    setError(null)
    onClose()
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)

    if (!backupPath.trim()) {
      setError(t('backup.ripristina_percorso_obbligatorio'))
      return
    }
    if (!password) {
      setError(t('backup.ripristina_password_obbligatoria'))
      return
    }

    setIsLoading(true)
    try {
      await window.api.backup.ripristina({ backupPath: backupPath.trim(), password })
      handleClose()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('DRIVE_NOT_CONFIGURED')) {
        setError(t('backup.drive_non_configurato'))
      } else {
        setError(t('backup.ripristina_errore'))
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('backup.ripristina_titolo')} maxWidth="max-w-lg">
      <form onSubmit={(e) => { void handleSubmit(e) }} noValidate>
        <div className="space-y-5">

          {/* Avviso distruttivo */}
          <div
            role="alert"
            className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
          >
            {t('backup.ripristina_avviso')}
          </div>

          {/* Percorso file backup */}
          <div>
            <label
              htmlFor="restore-path"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('backup.ripristina_percorso')}
            </label>
            <input
              id="restore-path"
              type="text"
              value={backupPath}
              onChange={(e) => { setBackupPath(e.target.value); setError(null) }}
              placeholder="C:\backup\gymmanager-backup-2026.db"
              disabled={isLoading}
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          {/* Master password del backup */}
          <div>
            <label
              htmlFor="restore-password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('backup.ripristina_password')}
            </label>
            <input
              id="restore-password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null) }}
              disabled={isLoading}
              autoComplete="current-password"
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          {/* Errore */}
          {error !== null && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
            >
              {error}
            </div>
          )}

          {/* Azioni */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
            >
              {isLoading ? t('common.loading') : t('backup.ripristina_conferma')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
