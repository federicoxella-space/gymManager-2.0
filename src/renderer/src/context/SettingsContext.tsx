import React, { createContext, useContext, useEffect, useState } from 'react'

interface SettingsContextValue {
  /** Giorni di anticipo per la segnalazione "in scadenza" dei certificati medici. */
  expiryWarningDaysCertificates: number
}

const DEFAULT_VALUE: SettingsContextValue = {
  expiryWarningDaysCertificates: 30,
}

const SettingsContext = createContext<SettingsContextValue>(DEFAULT_VALUE)

/** Carica le impostazioni dal main process e le rende disponibili ai componenti figli. */
export function SettingsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [value, setValue] = useState<SettingsContextValue>(DEFAULT_VALUE)

  useEffect(() => {
    window.api.settings
      .get()
      .then((s) => {
        setValue({
          expiryWarningDaysCertificates: Number(s.expiry_warning_days_certificates) || 30,
        })
      })
      .catch(() => {
        // Mantiene il default se la chiamata fallisce
      })
  }, [])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

/** Hook per leggere le impostazioni correnti dal context. */
export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext)
}
