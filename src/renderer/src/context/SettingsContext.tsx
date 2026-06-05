import React, { createContext, useContext, useEffect, useState } from 'react'

const DEFAULT_WIDGETS = ['indicatori', 'scadenze', 'incassi', 'abbonamenti', 'tesseramenti']

interface SettingsContextValue {
  /** Giorni di anticipo per la segnalazione "in scadenza" dei certificati medici. */
  expiryWarningDaysCertificates: number
  /** Giorni di anticipo per la segnalazione "in scadenza" delle iscrizioni. */
  expiryWarningDaysMemberships: number
  /** Giorni di anticipo per la segnalazione "in scadenza" degli abbonamenti. */
  expiryWarningDaysSubscriptions: number
  /** Widget visibili nella dashboard. */
  dashboardWidgets: string[]
}

const DEFAULT_VALUE: SettingsContextValue = {
  expiryWarningDaysCertificates: 30,
  expiryWarningDaysMemberships: 30,
  expiryWarningDaysSubscriptions: 30,
  dashboardWidgets: DEFAULT_WIDGETS,
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
          expiryWarningDaysMemberships: Number(s.expiry_warning_days_memberships) || 30,
          expiryWarningDaysSubscriptions: Number(s.expiry_warning_days_subscriptions) || 30,
          dashboardWidgets: Array.isArray(s.dashboard_widgets) ? s.dashboard_widgets : DEFAULT_WIDGETS,
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
