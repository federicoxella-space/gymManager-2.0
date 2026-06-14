import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'

interface ChangePasswordDialogProps {
  isOpen: boolean
  onClose: () => void
}

export default function ChangePasswordDialog({
  isOpen,
  onClose,
}: ChangePasswordDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function handleClose(): void {
    if (isLoading) return
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
    setSuccess(false)
    onClose()
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)
    if (newPassword.length < 8) {
      setError(t('backup.cambia_password_errore_lunghezza'))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('backup.cambia_password_errore_conferma'))
      return
    }
    setIsLoading(true)
    try {
      await window.api.db.changePassword(oldPassword, newPassword)
      setSuccess(true)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('PASSWORD_WRONG')) {
        setError(t('backup.cambia_password_errore_vecchia'))
      } else {
        setError(t('backup.cambia_password_errore_generico'))
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('backup.cambia_password_titolo')} maxWidth="max-w-lg">
      {success ? (
        <div className="space-y-5">
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400"
          >
            {t('backup.cambia_password_completato')}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t('backup.cambia_password_descrizione')}
          </p>
          <div>
            <label htmlFor="cpw-old" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('backup.cambia_password_vecchia')}
            </label>
            <input
              id="cpw-old"
              type="password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => { setOldPassword(e.target.value); setError(null) }}
              disabled={isLoading}
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
            />
          </div>
          <div>
            <label htmlFor="cpw-new" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('backup.cambia_password_nuova')}
            </label>
            <input
              id="cpw-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setError(null) }}
              disabled={isLoading}
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('backup.cambia_password_hint')}</p>
          </div>
          <div>
            <label htmlFor="cpw-confirm" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('backup.cambia_password_conferma')}
            </label>
            <input
              id="cpw-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(null) }}
              disabled={isLoading}
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
            />
          </div>
          {error !== null && (
            <div role="alert" className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-50"
            >
              {isLoading ? t('common.loading') : t('backup.cambia_password_pulsante')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
