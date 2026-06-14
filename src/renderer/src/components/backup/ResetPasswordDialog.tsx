import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'

interface ResetPasswordDialogProps {
  isOpen: boolean
  onClose: () => void
}

type Step = 1 | 2

export default function ResetPasswordDialog({
  isOpen,
  onClose,
}: ResetPasswordDialogProps): React.JSX.Element | null {
  const { t } = useTranslation()

  const [step, setStep] = useState<Step>(1)
  const [checkboxConfirmed, setCheckboxConfirmed] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function handleClose(): void {
    if (isLoading) return
    // Resetta tutto allo stato iniziale
    setStep(1)
    setCheckboxConfirmed(false)
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
    setSuccess(false)
    onClose()
  }

  function handleContinua(): void {
    if (!checkboxConfirmed) return
    setError(null)
    setStep(2)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError(t('backup.reset_errore_password_corta'))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('backup.reset_errore_password_mismatch'))
      return
    }

    setIsLoading(true)
    try {
      await window.api.backup.reset({ nuovaPassword: newPassword })
      setSuccess(true)
      setTimeout(() => {
        if ('restart' in window.api.app) {
          void (window.api.app as { restart?: () => void }).restart?.()
        } else {
          window.location.reload()
        }
      }, 2000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message || t('common.error_generic'))
    } finally {
      setIsLoading(false)
    }
  }

  const effectsList = t('backup.reset_step1_effetti', { returnObjects: true }) as string[]

  const title =
    step === 1
      ? t('backup.reset_step1_titolo')
      : t('backup.reset_step2_titolo')

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} maxWidth="max-w-lg">
      {success ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400"
        >
          {t('backup.reset_completato')}
        </div>
      ) : step === 1 ? (
        /* ── Step 1: Avvisi ─────────────────────────────────────────────── */
        <div className="space-y-5">
          {/* Box avviso rosso */}
          <div
            role="alert"
            className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3"
          >
            <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">
              {t('backup.reset_step1_avviso')}
            </p>
            <ul className="list-disc list-inside space-y-1">
              {effectsList.map((effect, idx) => (
                <li key={idx} className="text-sm text-red-700 dark:text-red-400">
                  {effect}
                </li>
              ))}
            </ul>
          </div>

          {/* Checkbox conferma */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checkboxConfirmed}
              onChange={(e) => setCheckboxConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500 focus:ring-2 cursor-pointer shrink-0"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300 select-none">
              {t('backup.reset_step1_checkbox')}
            </span>
          </label>

          {/* Azioni */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleContinua}
              disabled={!checkboxConfirmed}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
            >
              {t('backup.reset_step1_continua')}
            </button>
          </div>
        </div>
      ) : (
        /* ── Step 2: Nuova password ─────────────────────────────────────── */
        <form onSubmit={(e) => { void handleSubmit(e) }} noValidate>
          <div className="space-y-5">
            {/* Avviso warning */}
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              {t('backup.reset_step2_avviso')}
            </div>

            {/* Nuova password */}
            <div>
              <label
                htmlFor="reset-new-password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                {t('backup.reset_step2_nuova')}
              </label>
              <input
                id="reset-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(null) }}
                disabled={isLoading}
                autoComplete="new-password"
                minLength={8}
                className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('backup.cambia_password_hint')}
              </p>
            </div>

            {/* Conferma password */}
            <div>
              <label
                htmlFor="reset-confirm-password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                {t('backup.reset_step2_conferma')}
              </label>
              <input
                id="reset-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(null) }}
                disabled={isLoading}
                autoComplete="new-password"
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
                {isLoading ? t('common.loading') : t('backup.reset_step2_conferma_btn')}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  )
}
