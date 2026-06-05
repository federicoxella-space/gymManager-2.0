import React, { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

type UnlockState = 'idle' | 'submitting' | 'error'

interface UnlockPageProps {
  onReady: () => void
}

export default function UnlockPage({ onReady }: UnlockPageProps): React.JSX.Element {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<UnlockState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setErrorMessage('')
    setStatus('submitting')

    try {
      await window.api.db.unlock(password)
      onReady()
    } catch (err) {
      setStatus('error')
      const message = err instanceof Error ? err.message : ''
      if (message.toLowerCase().includes('errata') || message.toLowerCase().includes('wrong')) {
        setErrorMessage(t('unlock.wrong_password'))
      } else if (message.includes('MIGRATION_FAILED')) {
        setErrorMessage(t('unlock.migration_failed'))
      } else {
        setErrorMessage(t('unlock.error'))
      }
    }
  }

  const isSubmitting = status === 'submitting'

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm">
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
            {t('unlock.title')}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('unlock.subtitle')}</p>
        </div>

        {/* Card */}
        <div className="bg-surface-raised dark:bg-surface-raised rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <form onSubmit={handleSubmit} noValidate>
            {/* Campo password */}
            <div className="mb-5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                {t('unlock.password_label')}
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                autoFocus
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

            {/* Bottone submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white font-medium py-2.5 px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
            >
              {isSubmitting ? t('common.loading') : t('unlock.submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
