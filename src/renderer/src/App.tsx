import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SetupPage from './pages/Setup'
import UnlockPage from './pages/Unlock'
import ShellPage from './pages/Shell'

type AppState = 'loading' | 'firstRun' | 'locked' | 'ready'

function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    // system: segue la preferenza del sistema operativo
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }
}

function applyPrimaryColor(primaryColor: string): void {
  // primaryColor è una stringa tipo "59,130,246" (r,g,b separati da virgola)
  // Viene usata per sovrascrivere la variabile --color-primary-500 come colore custom
  // Per ora usiamo il valore come base per lo shade 500; le altre sfumature
  // restano quelle del default Tailwind Blue definite in globals.css
  document.documentElement.style.setProperty('--color-primary-500', primaryColor)
}

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
