import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'
import { applyTheme, applyPrimaryColor } from './theme'
import SetupPage from './pages/Setup'
import UnlockPage from './pages/Unlock'
import ShellPage from './pages/Shell'

type AppState = 'loading' | 'firstRun' | 'locked' | 'ready'

export default function App(): React.JSX.Element {
  const { t } = useTranslation()
  const [appState, setAppState] = useState<AppState>('loading')

  useEffect(() => {
    async function init(): Promise<void> {
      try {
        // Carica le impostazioni e applica il tema prima di mostrare l'UI
        const settings = await window.api.settings.get()
        applyTheme(settings.theme)
        if (settings.primaryColor) {
          applyPrimaryColor(settings.primaryColor)
        }
        // Sincronizza la lingua con le impostazioni salvate
        if (settings.language && settings.language !== i18n.language) {
          await i18n.changeLanguage(settings.language)
        }

        // Determina lo stato iniziale del DB
        const { state } = await window.api.db.getState()
        setAppState(state)
      } catch {
        // In caso di errore mostra comunque lo schermo di sblocco (stato più sicuro)
        setAppState('locked')
      }
    }

    // Ascolta i cambi di preferenza sistema per il tema system
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = (): void => {
      window.api.settings.get().then((s) => {
        if (s.theme === 'system') applyTheme('system')
      })
    }
    mediaQuery.addEventListener('change', handleSystemThemeChange)

    void init()

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
    }
  }, [])

  if (appState === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface gap-4">
        <div
          className="w-10 h-10 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin"
          role="status"
          aria-label={t('app.loading')}
        />
        <span className="text-sm text-gray-500 dark:text-gray-400">{t('app.loading')}</span>
      </div>
    )
  }

  if (appState === 'firstRun') {
    return <SetupPage onReady={() => setAppState('ready')} />
  }

  if (appState === 'locked') {
    return <UnlockPage onReady={() => setAppState('ready')} />
  }

  return <ShellPage />
}
