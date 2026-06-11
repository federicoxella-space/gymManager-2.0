/**
 * DashboardPage — pagina principale dell'applicazione.
 * Usa le IPC dedicate window.api.dashboard.* per recuperare i dati aggregati.
 * I widget visibili sono configurabili dall'utente tramite settings.dashboard_widgets.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../context/SettingsContext'
import PeriodSelector from '../components/dashboard/PeriodSelector'
import IndicatoriWidget from '../components/dashboard/IndicatoriWidget'
import ScadenzeWidget from '../components/dashboard/ScadenzeWidget'
import IncassiWidget from '../components/dashboard/IncassiWidget'
import AbbonamentiWidget from '../components/dashboard/AbbonamentiWidget'
import TesseramentiWidget from '../components/dashboard/TesseramentiWidget'
import CompleanniBadge from '../components/dashboard/CompleanniBadge'
import type {
  WidgetIndicatori,
  ClienteInScadenza,
  AbbonamentoPerTipo,
  IncassiPeriodo,
  NuoviTesseramenti,
  CompleannoDellaSett,
  DashboardPeriodo,
} from '../../../types/shared'
import type { DashboardPeriodo as LocalDashboardPeriodo } from '../components/dashboard/types'

// ── Utilità date ──────────────────────────────────────────────────────────────

function oggiIso(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function inizioMeseCorrente(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}

function aggiungGiorni(isoDate: string, giorni: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + giorni)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ── Tipi dati dashboard ───────────────────────────────────────────────────────

interface DashboardData {
  indicatori: WidgetIndicatori
  scadenze: ClienteInScadenza[]
  abbonamenti: AbbonamentoPerTipo[]
  incassi: IncassiPeriodo
  tesseramenti: NuoviTesseramenti
  compleanni: CompleannoDellaSett[]
}

// ── Caricamento dati via IPC dedicate ─────────────────────────────────────────

async function fetchDashboardData(
  periodo: LocalDashboardPeriodo,
  giorniCert: number,
  giorniIsc: number,
  giorniAbb: number,
): Promise<DashboardData> {
  const oggi = oggiIso()
  const dataFine7gg = aggiungGiorni(oggi, 6)

  const apiPeriodo: DashboardPeriodo = { dal: periodo.dal, al: periodo.al }

  const [indicatori, scadenze, abbonamenti, incassi, tesseramenti, compleanni] =
    await Promise.all([
      window.api.dashboard.indicatori({ oggi, giorniCert, giorniIsc, giorniAbb }),
      window.api.dashboard.scadenze({ oggi, giorniCert, giorniIsc, giorniAbb }),
      window.api.dashboard.abbonamenti({ soloAttivi: true }),
      window.api.dashboard.incassi({ periodo: apiPeriodo }),
      window.api.dashboard.tesseramenti({ periodo: apiPeriodo }),
      window.api.dashboard.compleanni({ dalGiorno: oggi, alGiorno: dataFine7gg }),
    ])

  return { indicatori, scadenze, abbonamenti, incassi, tesseramenti, compleanni }
}

// ── Componente principale ─────────────────────────────────────────────────────

interface DashboardPageProps {
  onNavigate: (section: string, params?: Record<string, unknown>) => void
}

export default function DashboardPage({ onNavigate }: DashboardPageProps): React.JSX.Element {
  const { t } = useTranslation()
  const settings = useSettings()

  // Periodo selezionato — default: mese corrente
  const [periodo, setPeriodo] = useState<LocalDashboardPeriodo>({
    tipo: 'mese_corrente',
    dal: inizioMeseCorrente(),
    al: oggiIso(),
  })

  // Dati
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Widget visibili dalla configurazione utente
  const widgetVisibili = settings.dashboardWidgets
  const mostraCompleanni = widgetVisibili.includes('compleanni')

  const caricaDati = useCallback(
    async (p: LocalDashboardPeriodo): Promise<void> => {
      setIsLoading(true)
      setHasError(false)
      try {
        const result = await fetchDashboardData(
          p,
          settings.expiryWarningDaysCertificates,
          settings.expiryWarningDaysMemberships,
          settings.expiryWarningDaysSubscriptions,
        )
        setData(result)
      } catch {
        setHasError(true)
      } finally {
        setIsLoading(false)
      }
    },
    [
      settings.expiryWarningDaysCertificates,
      settings.expiryWarningDaysMemberships,
      settings.expiryWarningDaysSubscriptions,
    ],
  )

  useEffect(() => {
    void caricaDati(periodo)
  }, [caricaDati, periodo])

  function handlePeriodoChange(nuovoPeriodo: LocalDashboardPeriodo): void {
    setPeriodo(nuovoPeriodo)
  }

  // ── Drill-down navigazione ────────────────────────────────────────────────

  function handleNavigateClientiAttivi(): void {
    onNavigate('clients', { filtro: 'iscrizione_attiva' })
  }

  function handleNavigateClientiDaRinnovare(): void {
    onNavigate('clients', { filtro: 'iscrizione_scaduta' })
  }

  function handleNavigateClientiCertificati(): void {
    onNavigate('clients', { filtro: 'certificato' })
  }

  function handleNavigateCliente(clienteId: number): void {
    onNavigate('clients', { clienteId })
  }

  function handleNavigatePerTipo(tipoId: number): void {
    onNavigate('clients', { filtro: 'abbonamento', tipoAbbonamentoId: tipoId })
  }

  function handleNavigateDaIncassare(): void {
    // Naviga alla pagina ricevute filtrata per voci da incassare
    onNavigate('receipts', { filtro: 'da_incassare' })
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  return (
    <div data-testid="dashboard" className="space-y-6">
      {/* Header con selettore periodo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('dashboard.titolo')}
        </h2>
        <PeriodSelector periodo={periodo} onPeriodoChange={handlePeriodoChange} />
      </div>

      {/* Indicatori sintetici — 4 card in riga */}
      {widgetVisibili.includes('indicatori') && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <IndicatoriWidget
            data={data?.indicatori ?? null}
            isLoading={isLoading}
            hasError={hasError && data === null}
            onNavigateClientiAttivi={handleNavigateClientiAttivi}
            onNavigateClientiDaRinnovare={handleNavigateClientiDaRinnovare}
            onNavigateClientiCertificati={handleNavigateClientiCertificati}
          />
        </div>
      )}

      {/* Griglia widget principali — 2 colonne */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Colonna sinistra */}
        <div className="space-y-6">
          {widgetVisibili.includes('scadenze') && (
            <ScadenzeWidget
              voci={data?.scadenze ?? []}
              isLoading={isLoading}
              hasError={hasError && data === null}
              onNavigateCliente={handleNavigateCliente}
            />
          )}

          {widgetVisibili.includes('incassi') && (
            <IncassiWidget
              data={data?.incassi ?? null}
              isLoading={isLoading}
              hasError={hasError && data === null}
              onNavigateDaIncassare={handleNavigateDaIncassare}
            />
          )}
        </div>

        {/* Colonna destra */}
        <div className="space-y-6">
          {widgetVisibili.includes('abbonamenti') && (
            <AbbonamentiWidget
              data={data?.abbonamenti ?? null}
              isLoading={isLoading}
              hasError={hasError && data === null}
              onNavigatePerTipo={handleNavigatePerTipo}
            />
          )}

          {widgetVisibili.includes('tesseramenti') && (
            <TesseramentiWidget
              data={data?.tesseramenti ?? null}
              isLoading={isLoading}
              hasError={hasError && data === null}
            />
          )}

          {mostraCompleanni && (
            <CompleanniBadge
              clienti={data?.compleanni ?? []}
              isLoading={isLoading}
              hasError={hasError && data === null}
              onNavigateCliente={handleNavigateCliente}
            />
          )}
        </div>
      </div>
    </div>
  )
}
