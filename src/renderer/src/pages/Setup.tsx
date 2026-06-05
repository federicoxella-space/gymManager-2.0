import React, { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

type SetupState = 'idle' | 'submitting' | 'error'

interface SetupPageProps {
  onReady: () => void
}

export default function SetupPage({ onReady }: SetupPageProps): React.JSX.Element {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<SetupState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  function validate(): string | null {
    if (password.length < 8) {
      return t('setup.too_short')
    }
    if (password !== confirm) {
      return t('setup.mismatch')
    }
    return null
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setErrorMessage('')

    const validationError = validate()
    if (validationError !== null) {
      setErrorMessage(validationError)
      return
    }

    setStatus('submitting')
    try {
      await window.api.db.setup(password)
      onReady()
    } catch {
      setStatus('error')
      setErrorMessage(t('setup.error'))
    }
  }

  const isSubmitting = status === 'submitting'

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        {/* Header / Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 mb-4">
            <svg
              className="w-9 h-9 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('setup.title')}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('setup.subtitle')}</p>
        </div>

        {/* Card */}
        <div className="bg-surface-raised dark:bg-surface-raised rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <form data-testid="setup-form" onSubmit={handleSubmit} noValidate>
            {/* Campo password */}
            <div className="mb-5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                {t('setup.password_label')}
              </label>
              <input
                id="password"
                data-testid="password-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3.5 py-2.5 text-sm placeholder-gray-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                required
              />
            </div>

            {/* Campo conferma */}
            <div className="mb-5">
              <label
                htmlFor="confirm"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                {t('setup.confirm_label')}
              </label>
              <input
                id="confirm"
                data-testid="password-confirm-input"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3.5 py-2.5 text-sm placeholder-gray-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                required
              />
            </div>

            {/* Messaggio di errore */}
            {errorMessage && (
              <div
                role="alert"
                className="mb-5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
              >
                {errorMessage}
              </div>
            )}

            {/* Hint password */}
            <p className="mb-6 text-xs text-gray-500 dark:text-gray-400">{t('setup.password_hint')}</p>

            {/* Bottone submit */}
            <button
              type="submit"
              data-testid="setup-submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white font-medium py-2.5 px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
            >
              {isSubmitting ? t('common.loading') : t('setup.submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
