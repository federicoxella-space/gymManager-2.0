import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AbbonamentoClienteRow,
  CertificatoRow,
  ClienteRow,
  IscrizioneClienteRow,
  RicevutaConRighe,
  RicevutaRow,
  TipoAbbonamentoRow,
  TipoIscrizioneRow,
} from '../../../../types/shared'
import { useSettings } from '../../context/SettingsContext'
import { isMinorenne } from '../../utils/dominio'
import Badge from '../ui/Badge'
import Modal from '../ui/Modal'
import ConfirmDialog from '../ui/ConfirmDialog'
import ClientBadge, { getStatoCert } from './ClientBadge'
import ClientForm from './ClientForm'
import CertificatoForm from '../certificati/CertificatoForm'
import AssegnaIscrizioneForm from '../memberships/AssegnaIscrizioneForm'
import AssegnaAbbonamentoForm from '../memberships/AssegnaAbbonamentoForm'
import EmittiRicevutaForm from '../receipts/EmittiRicevutaForm'

interface ClientDetailProps {
  clienteId: number
  onBack: () => void
  onClienteUpdated: () => void
}

function BackIcon(): React.JSX.Element {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  )
}

/** Formatta una data YYYY-MM-DD in formato italiano gg/mm/aaaa */
function formatData(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

/** Formatta un numero come valuta italiana */
function formatValuta(n: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)
}

interface SectionProps {
  title: string
  children: React.ReactNode
  'data-testid'?: string
}

function Section({ title, children, 'data-testid': dataTestId }: SectionProps): React.JSX.Element {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden" data-testid={dataTestId}>
      <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

interface InfoRowProps {
  label: string
  value: string | null | undefined
}

function InfoRow({ label, value }: InfoRowProps): React.JSX.Element {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36 shrink-0">
        {label}
      </dt>
      <dd className="text-sm text-gray-900 dark:text-gray-100 mt-0.5 sm:mt-0">
        {value || '—'}
      </dd>
    </div>
  )
}

export default function ClientDetail({
  clienteId,
  onBack,
  onClienteUpdated,
}: ClientDetailProps): React.JSX.Element {
  const { t } = useTranslation()
  const { expiryWarningDaysCertificates } = useSettings()

  const [cliente, setCliente] = useState<ClienteRow | null>(null)
  const [certificati, setCertificati] = useState<CertificatoRow[]>([])
  const [isLoadingCliente, setIsLoadingCliente] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [showEditModal, setShowEditModal] = useState(false)
  const [showCertModal, setShowCertModal] = useState(false)
  const [showAnonDialog, setShowAnonDialog] = useState(false)
  const [isAnonimizzando, setIsAnonimizzando] = useState(false)

  // ── Stato iscrizione ───────────────────────────────────────────────────────
  const [iscrizioneAttiva, setIscrizioneAttiva] = useState<IscrizioneClienteRow | null>(null)
  const [storicoIscrizioni, setStoricoIscrizioni] = useState<IscrizioneClienteRow[]>([])
  const [tipiIscrizione, setTipiIscrizione] = useState<TipoIscrizioneRow[]>([])
  const [isLoadingIscrizione, setIsLoadingIscrizione] = useState(true)
  const [showAssegnaIscrizione, setShowAssegnaIscrizione] = useState(false)
  const [showStoricoIscrizioni, setShowStoricoIscrizioni] = useState(false)
  const [showModificaDateIscrizione, setShowModificaDateIscrizione] = useState(false)
  const [invalidaIscrizioneTarget, setInvalidaIscrizioneTarget] =
    useState<IscrizioneClienteRow | null>(null)
  const [isInvalidandoIscrizione, setIsInvalidandoIscrizione] = useState(false)

  // Date inline per modifica
  const [editDataInizio, setEditDataInizio] = useState('')
  const [editDataScadenza, setEditDataScadenza] = useState('')
  const [isSavingDate, setIsSavingDate] = useState(false)

  // ── Stato abbonamenti ──────────────────────────────────────────────────────
  const [abbonamenti, setAbbonamenti] = useState<AbbonamentoClienteRow[]>([])
  const [tipiAbbonamento, setTipiAbbonamento] = useState<TipoAbbonamentoRow[]>([])
  const [isLoadingAbbonamenti, setIsLoadingAbbonamenti] = useState(true)
  const [showAssegnaAbbonamento, setShowAssegnaAbbonamento] = useState(false)
  const [invalidaAbbonamentoTarget, setInvalidaAbbonamentoTarget] =
    useState<AbbonamentoClienteRow | null>(null)
  const [isInvalidandoAbbonamento, setIsInvalidandoAbbonamento] = useState(false)

  // ── Stato ricevute ─────────────────────────────────────────────────────────
  const [ricevute, setRicevute] = useState<RicevutaRow[]>([])
  const [isLoadingRicevute, setIsLoadingRicevute] = useState(true)
  const [showEmittiRicevuta, setShowEmittiRicevuta] = useState(false)
  const [ricevutaPreselect, setRicevutaPreselect] = useState<
    { tipo: 'iscrizione' | 'abbonamento'; riferimentoId: number } | undefined
  >(undefined)
  const [annullaRicevutaTarget, setAnnullaRicevutaTarget] = useState<RicevutaRow | null>(null)
  const [isAnnullandoRicevuta, setIsAnnullandoRicevuta] = useState(false)
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null)
  const [pdfErrorId, setPdfErrorId] = useState<number | null>(null)

  const loadCliente = useCallback(async (): Promise<void> => {
    setIsLoadingCliente(true)
    setLoadError(false)
    try {
      const [clienteData, certData] = await Promise.all([
        window.api.clienti.get(clienteId),
        window.api.certificati.list(clienteId),
      ])
      if (!clienteData) {
        setLoadError(true)
        return
      }
      setCliente(clienteData)
      setCertificati(certData)
    } catch {
      setLoadError(true)
    } finally {
      setIsLoadingCliente(false)
    }
  }, [clienteId])

  const loadIscrizione = useCallback(async (): Promise<void> => {
    setIsLoadingIscrizione(true)
    try {
      const [attiva, storico, tipi] = await Promise.all([
        window.api.iscrizioni.getAttiva(clienteId),
        window.api.iscrizioni.list(clienteId),
        window.api.catalogo.tipiIscrizione.list(true),
      ])
      setIscrizioneAttiva(attiva)
      setStoricoIscrizioni(storico)
      setTipiIscrizione(tipi)
    } catch {
      // Silenzioso: la sezione mostrerà uno stato vuoto
    } finally {
      setIsLoadingIscrizione(false)
    }
  }, [clienteId])

  const loadAbbonamenti = useCallback(async (): Promise<void> => {
    setIsLoadingAbbonamenti(true)
    try {
      const [abbs, tipi] = await Promise.all([
        window.api.abbonamenti.list(clienteId),
        window.api.catalogo.tipiAbbonamento.list(true),
      ])
      setAbbonamenti(abbs)
      setTipiAbbonamento(tipi)
    } catch {
      // Silenzioso
    } finally {
      setIsLoadingAbbonamenti(false)
    }
  }, [clienteId])

  const loadRicevute = useCallback(async (): Promise<void> => {
    setIsLoadingRicevute(true)
    try {
      const data = await window.api.ricevute.list({ clienteId })
      setRicevute(data)
    } catch {
      // Silenzioso: la sezione mostrerà uno stato vuoto
    } finally {
      setIsLoadingRicevute(false)
    }
  }, [clienteId])

  useEffect(() => {
    void loadCliente()
  }, [loadCliente])

  useEffect(() => {
    void loadIscrizione()
  }, [loadIscrizione])

  useEffect(() => {
    void loadAbbonamenti()
  }, [loadAbbonamenti])

  useEffect(() => {
    void loadRicevute()
  }, [loadRicevute])

  async function handleInvalidaIscrizione(): Promise<void> {
    if (!invalidaIscrizioneTarget) return
    setIsInvalidandoIscrizione(true)
    try {
      await window.api.iscrizioni.invalida(invalidaIscrizioneTarget.id)
      setInvalidaIscrizioneTarget(null)
      await loadIscrizione()
    } finally {
      setIsInvalidandoIscrizione(false)
    }
  }

  async function handleSalvaDateIscrizione(): Promise<void> {
    if (!iscrizioneAttiva) return
    setIsSavingDate(true)
    try {
      const updated = await window.api.iscrizioni.updateDate(
        iscrizioneAttiva.id,
        editDataInizio,
        editDataScadenza,
      )
      setIscrizioneAttiva(updated)
      setStoricoIscrizioni((prev) =>
        prev.map((i) => (i.id === updated.id ? updated : i)),
      )
      setShowModificaDateIscrizione(false)
    } finally {
      setIsSavingDate(false)
    }
  }

  async function handleInvalidaAbbonamento(): Promise<void> {
    if (!invalidaAbbonamentoTarget) return
    setIsInvalidandoAbbonamento(true)
    try {
      await window.api.abbonamenti.invalida(invalidaAbbonamentoTarget.id)
      setInvalidaAbbonamentoTarget(null)
      await loadAbbonamenti()
    } finally {
      setIsInvalidandoAbbonamento(false)
    }
  }

  /** Apre un PDF (stringa base64) in una nuova finestra */
  function apriPdf(base64: string): void {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  async function handleVisualizzaPdf(ricevuta: RicevutaRow): Promise<void> {
    setPdfLoadingId(ricevuta.id)
    setPdfErrorId(null)
    try {
      const base64 = await window.api.pdf.genera({ ricevutaId: ricevuta.id })
      apriPdf(base64)
    } catch {
      setPdfErrorId(ricevuta.id)
    } finally {
      setPdfLoadingId(null)
    }
  }

  async function handleAnnullaRicevuta(): Promise<void> {
    if (!annullaRicevutaTarget) return
    setIsAnnullandoRicevuta(true)
    try {
      const aggiornata = await window.api.ricevute.annulla(annullaRicevutaTarget.id)
      setRicevute((prev) => prev.map((r) => (r.id === aggiornata.id ? aggiornata : r)))
      setAnnullaRicevutaTarget(null)
    } finally {
      setIsAnnullandoRicevuta(false)
    }
  }

  function handleRicevutaCreata(ricevuta: RicevutaConRighe): void {
    setShowEmittiRicevuta(false)
    setRicevutaPreselect(undefined)
    // Aggiunge la nuova ricevuta in cima alla lista
    setRicevute((prev) => [ricevuta, ...prev])
  }

  async function handleAnonimizza(): Promise<void> {
    if (!cliente) return
    setIsAnonimizzando(true)
    try {
      await window.api.clienti.anonimizza(cliente.id)
      setShowAnonDialog(false)
      onClienteUpdated()
      onBack()
    } catch {
      setIsAnonimizzando(false)
      setShowAnonDialog(false)
    }
  }

  function handleEditSuccess(updated: ClienteRow): void {
    setCliente(updated)
    setShowEditModal(false)
    onClienteUpdated()
  }

  function handleCertSuccess(cert: CertificatoRow): void {
    setCertificati((prev) => {
      // Usa `id` (univoco per certificato) come chiave di deduplicazione,
      // non `cliente_id` che è uguale per tutti i certificati dello stesso cliente.
      const idx = prev.findIndex((c) => c.id === cert.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = cert
        return updated
      }
      return [cert, ...prev] // certificato nuovo: aggiungi in testa (più recente prima)
    })
    // Aggiorna anche il campo cert_scadenza sul cliente locale
    setCliente((prev) =>
      prev ? { ...prev, cert_scadenza: cert.data_scadenza, cert_tipo: cert.tipo } : prev,
    )
    setShowCertModal(false)
  }

  // ── Stati loading / error ─────────────────────────────────────────────────

  if (isLoadingCliente) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-gray-600 dark:text-gray-400" role="status" aria-live="polite">
        <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-primary-600 animate-spin" aria-hidden="true" />
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    )
  }

  if (loadError || !cliente) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm text-red-600 dark:text-red-400">
          {t('clienti.dettaglio.errore_caricamento')}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          {t('clienti.titolo')}
        </button>
      </div>
    )
  }

  const minorenne = isMinorenne(cliente.data_nascita)
  const anonimizzato = cliente.stato === 'anonimizzato'

  // Certificato corrente = quello con data_scadenza più recente
  const certCorrente =
    certificati.length > 0
      ? certificati.reduce((a, b) => (a.data_scadenza > b.data_scadenza ? a : b))
      : null

  const statoCert = getStatoCert(
    certCorrente?.data_scadenza ?? cliente.cert_scadenza,
    expiryWarningDaysCertificates,
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Breadcrumb / torna indietro */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          <BackIcon />
          {t('clienti.titolo')}
        </button>
      </div>

      {/* Intestazione */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {anonimizzato ? '*** ***' : `${cliente.cognome} ${cliente.nome}`}
            </h2>
            {minorenne && !anonimizzato && (
              <Badge variant="info">{t('clienti.dettaglio.minorenne')}</Badge>
            )}
            {anonimizzato && (
              <Badge variant="neutral">{t('clienti.dettaglio.stato_anonimizzato')}</Badge>
            )}
          </div>
          {cliente.numero_tessera && (
            <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
              # {cliente.numero_tessera}
            </p>
          )}
        </div>

        {!anonimizzato && (
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              className={[
                'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg',
                'border border-gray-300 dark:border-gray-600',
                'text-gray-700 dark:text-gray-200',
                'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors',
              ].join(' ')}
            >
              {t('clienti.dettaglio.modifica')}
            </button>
            <button
              type="button"
              onClick={() => setShowAnonDialog(true)}
              className={[
                'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg',
                'border border-red-300 dark:border-red-700',
                'text-red-700 dark:text-red-400',
                'bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors',
              ].join(' ')}
            >
              {t('clienti.dettaglio.anonimizza')}
            </button>
          </div>
        )}
      </div>

      {/* Sezione Anagrafica */}
      <Section title={t('clienti.dettaglio.sezione_anagrafica')}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InfoRow label={t('clienti.form.nome')} value={anonimizzato ? '***' : cliente.nome} />
          <InfoRow label={t('clienti.form.cognome')} value={anonimizzato ? '***' : cliente.cognome} />
          <InfoRow label={t('clienti.form.cf')} value={anonimizzato ? '***' : cliente.codice_fiscale} />
          <InfoRow label={t('clienti.form.data_nascita')} value={formatData(cliente.data_nascita)} />
          <InfoRow
            label={t('clienti.form.sesso')}
            value={
              cliente.sesso === 'M'
                ? t('clienti.form.sesso_m')
                : cliente.sesso === 'F'
                  ? t('clienti.form.sesso_f')
                  : null
            }
          />
          <InfoRow label={t('clienti.form.email')} value={anonimizzato ? '***' : cliente.email} />
          <InfoRow label={t('clienti.form.telefono')} value={anonimizzato ? '***' : cliente.telefono} />
          <div className="sm:col-span-2">
            <InfoRow
              label={t('clienti.form.via')}
              value={
                anonimizzato
                  ? '***'
                  : [cliente.via, cliente.civico].filter(Boolean).join(' ') || null
              }
            />
          </div>
          <InfoRow label={t('clienti.form.citta')} value={anonimizzato ? '***' : cliente.citta} />
          <InfoRow label={t('clienti.form.provincia')} value={anonimizzato ? '***' : cliente.provincia} />
          <InfoRow label={t('clienti.form.cap')} value={anonimizzato ? '***' : cliente.cap} />
          {cliente.note && (
            <div className="sm:col-span-2">
              <InfoRow label={t('clienti.form.note')} value={cliente.note} />
            </div>
          )}
          <InfoRow
            label={t('clienti.dettaglio.data_inserimento')}
            value={formatData(cliente.data_inserimento.split('T')[0])}
          />
        </dl>
      </Section>

      {/* Sezione Tutore (se minorenne e dati presenti) */}
      {minorenne && (cliente.tutore_nome || cliente.tutore_cognome) && (
        <Section title={t('clienti.dettaglio.sezione_tutore')}>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoRow label={t('clienti.form.tutore_nome')} value={anonimizzato ? '***' : cliente.tutore_nome} />
            <InfoRow label={t('clienti.form.tutore_cognome')} value={anonimizzato ? '***' : cliente.tutore_cognome} />
            <InfoRow label={t('clienti.form.tutore_cf')} value={anonimizzato ? '***' : cliente.tutore_cf} />
          </dl>
        </Section>
      )}

      {/* Sezione Certificato medico */}
      <Section title={t('clienti.dettaglio.sezione_certificato')}>
        {certCorrente ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 space-y-1">
              <p className="text-sm text-gray-900 dark:text-gray-100">
                {certCorrente.tipo === 'agonistico'
                  ? t('clienti.certificato.tipo_agonistico')
                  : t('clienti.certificato.tipo_non_agonistico')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('clienti.certificato.scadenza')}: {formatData(certCorrente.data_scadenza)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ClientBadge statoCert={statoCert} />
              {!anonimizzato && (
                <button
                  type="button"
                  onClick={() => setShowCertModal(true)}
                  className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                  {t('clienti.dettaglio.aggiorna_certificato')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('clienti.dettaglio.nessun_certificato')}
            </p>
            {!anonimizzato && (
              <button
                type="button"
                onClick={() => setShowCertModal(true)}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
              >
                {t('clienti.dettaglio.aggiorna_certificato')}
              </button>
            )}
          </div>
        )}
      </Section>

      {/* Sezione Iscrizione attiva */}
      <Section title={t('clienti.dettaglio.sezione_iscrizione')} data-testid="tab-iscrizioni">

        {isLoadingIscrizione ? (
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-sm" role="status" aria-live="polite">
            <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-primary-600 animate-spin" aria-hidden="true" />
            {t('common.loading')}
          </div>
        ) : iscrizioneAttiva ? (
          <div className="space-y-4">
            {/* Card iscrizione attiva */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {tipiIscrizione.find((ti) => ti.id === iscrizioneAttiva.tipo_iscrizione_id)?.nome ??
                      `#${iscrizioneAttiva.tipo_iscrizione_id}`}
                  </p>
                  <Badge
                    data-testid={iscrizioneAttiva.stato === 'attiva' ? 'badge-iscrizione-attiva' : undefined}
                    variant={
                      iscrizioneAttiva.stato === 'attiva'
                        ? 'success'
                        : iscrizioneAttiva.stato === 'scaduta'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {t(`iscrizioni.stato.${iscrizioneAttiva.stato}`)}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('iscrizioni.periodo')}: {formatData(iscrizioneAttiva.data_inizio)} →{' '}
                  {formatData(iscrizioneAttiva.data_scadenza)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('iscrizioni.prezzo')}:{' '}
                  {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(
                    iscrizioneAttiva.prezzo,
                  )}{' '}
                  &mdash; {t(`iscrizioni.pagamento.${iscrizioneAttiva.stato_pagamento}`)}
                </p>
              </div>
              {!anonimizzato && (
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    data-testid="btn-nuova-iscrizione"
                    type="button"
                    onClick={() => {
                      setShowAssegnaIscrizione(true)
                    }}
                    className="text-sm px-3 py-1.5 rounded-lg border border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                  >
                    {t('iscrizioni.rinnova')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditDataInizio(iscrizioneAttiva.data_inizio)
                      setEditDataScadenza(iscrizioneAttiva.data_scadenza)
                      setShowModificaDateIscrizione(true)
                    }}
                    className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    {t('iscrizioni.modifica_date')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvalidaIscrizioneTarget(iscrizioneAttiva)}
                    className="text-sm px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    {t('iscrizioni.invalida')}
                  </button>
                </div>
              )}
            </div>

            {/* Modifica date inline */}
            {showModificaDateIscrizione && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3 bg-gray-50 dark:bg-gray-800/40">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('iscrizioni.form.data_inizio')}
                    </label>
                    <input
                      type="date"
                      value={editDataInizio}
                      onChange={(e) => setEditDataInizio(e.target.value)}
                      disabled={isSavingDate}
                      className="px-3 py-2 text-sm rounded-lg border w-full border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('iscrizioni.form.data_scadenza')}
                    </label>
                    <input
                      type="date"
                      value={editDataScadenza}
                      onChange={(e) => setEditDataScadenza(e.target.value)}
                      disabled={isSavingDate}
                      className="px-3 py-2 text-sm rounded-lg border w-full border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModificaDateIscrizione(false)}
                    disabled={isSavingDate}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSalvaDateIscrizione()}
                    disabled={isSavingDate}
                    className="px-3 py-1.5 text-sm rounded-lg bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50"
                  >
                    {isSavingDate ? t('common.loading') : t('common.save')}
                  </button>
                </div>
              </div>
            )}

            {/* Storico espandibile */}
            <div>
              <button
                type="button"
                onClick={() => setShowStoricoIscrizioni((v) => !v)}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
              >
                {showStoricoIscrizioni
                  ? t('iscrizioni.nascondi_storico')
                  : t('iscrizioni.mostra_storico')}{' '}
                ({storicoIscrizioni.length})
              </button>
              {showStoricoIscrizioni && (
                <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <table className="w-full text-xs">
                    <caption className="sr-only">{t('common.tabella_iscrizioni')}</caption>
                    <thead className="bg-gray-50 dark:bg-gray-800/60">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                          {t('iscrizioni.tipo')}
                        </th>
                        <th scope="col" className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                          {t('iscrizioni.periodo')}
                        </th>
                        <th scope="col" className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                          {t('catalogo.colonne.stato')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {storicoIscrizioni.map((iscr) => (
                        <tr
                          key={iscr.id}
                          className="bg-white dark:bg-gray-900"
                        >
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                            {tipiIscrizione.find((ti) => ti.id === iscr.tipo_iscrizione_id)?.nome ??
                              `#${iscr.tipo_iscrizione_id}`}
                          </td>
                          <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                            {formatData(iscr.data_inizio)} → {formatData(iscr.data_scadenza)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={
                                iscr.stato === 'attiva'
                                  ? 'success'
                                  : iscr.stato === 'scaduta'
                                    ? 'warning'
                                    : 'neutral'
                              }
                            >
                              {t(`iscrizioni.stato.${iscr.stato}`)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 flex-1">
              {t('iscrizioni.nessuna')}
            </p>
            {!anonimizzato && (
              <button
                data-testid="btn-nuova-iscrizione"
                type="button"
                onClick={() => setShowAssegnaIscrizione(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
              >
                {t('iscrizioni.assegna')}
              </button>
            )}
          </div>
        )}
      </Section>

      {/* Sezione Abbonamenti */}
      <Section title={t('clienti.dettaglio.sezione_abbonamenti')} data-testid="tab-abbonamenti">
        {isLoadingAbbonamenti ? (
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-sm" role="status" aria-live="polite">
            <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-primary-600 animate-spin" aria-hidden="true" />
            {t('common.loading')}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Messaggio se nessuna iscrizione attiva */}
            {!iscrizioneAttiva && !isLoadingIscrizione && (
              <div
                data-testid="errore-no-iscrizione"
                id="errore-no-iscrizione-msg"
                className="px-4 py-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 text-sm text-yellow-800 dark:text-yellow-300"
              >
                {t('iscrizioni.assegna_prima')}
              </div>
            )}

            {abbonamenti.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('abbonamenti.nessuno')}
              </p>
            ) : (
              <div data-testid="lista-abbonamenti" className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('common.tabella_abbonamenti')}</caption>
                  <thead className="bg-gray-50 dark:bg-gray-800/60">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                        {t('abbonamenti.colonne.tipo')}
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                        {t('abbonamenti.colonne.periodo')}
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                        {t('abbonamenti.colonne.stato')}
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                        {t('abbonamenti.colonne.prezzo')}
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">
                        {t('common.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {abbonamenti.map((abb) => {
                      const superaIscrizione =
                        iscrizioneAttiva !== null && abb.data_scadenza > iscrizioneAttiva.data_scadenza
                      const tipoNome =
                        tipiAbbonamento.find((ta) => ta.id === abb.tipo_abbonamento_id)?.nome ??
                        `#${abb.tipo_abbonamento_id}`
                      const tipoColore =
                        tipiAbbonamento.find((ta) => ta.id === abb.tipo_abbonamento_id)?.colore

                      return (
                        <tr
                          key={abb.id}
                          className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {tipoColore && (
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: tipoColore }}
                                  aria-hidden="true"
                                />
                              )}
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {tipoNome}
                              </span>
                              {superaIscrizione && (
                                <span
                                  title={t('abbonamenti.warning_scadenza')}
                                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-bold"
                                  aria-label={t('abbonamenti.warning_scadenza')}
                                >
                                  !
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                            {formatData(abb.data_inizio)} → {formatData(abb.data_scadenza)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                abb.stato === 'attivo'
                                  ? 'success'
                                  : abb.stato === 'scaduto'
                                    ? 'warning'
                                    : 'neutral'
                              }
                            >
                              {t(`abbonamenti.stato.${abb.stato}`)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                            {new Intl.NumberFormat('it-IT', {
                              style: 'currency',
                              currency: 'EUR',
                            }).format(abb.prezzo)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {abb.stato === 'attivo' && !anonimizzato && (
                              <button
                                type="button"
                                onClick={() => setInvalidaAbbonamentoTarget(abb)}
                                className="text-xs px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              >
                                {t('abbonamenti.invalida')}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* CTA assegna abbonamento */}
            {!anonimizzato && (
              <div className="flex justify-end">
                <button
                  data-testid="btn-nuovo-abbonamento"
                  type="button"
                  onClick={() => { if (iscrizioneAttiva) setShowAssegnaAbbonamento(true) }}
                  aria-disabled={!iscrizioneAttiva}
                  aria-describedby={!iscrizioneAttiva ? 'errore-no-iscrizione-msg' : undefined}
                  className={[
                    'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                    iscrizioneAttiva
                      ? 'bg-primary-600 hover:bg-primary-700 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed',
                  ].join(' ')}
                >
                  {t('abbonamenti.assegna')}
                </button>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Sezione Ricevute */}
      <Section title={t('clienti.dettaglio.sezione_ricevute')} data-testid="tab-ricevute">
        {isLoadingRicevute ? (
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-sm" role="status" aria-live="polite">
            <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-primary-600 animate-spin" aria-hidden="true" />
            {t('common.loading')}
          </div>
        ) : (
          <div className="space-y-4">
            {ricevute.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('ricevute.nessuna')}</p>
            ) : (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('common.tabella_ricevute')}</caption>
                  <thead className="bg-gray-50 dark:bg-gray-800/60">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                        {t('ricevute.colonne.numero')}
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                        {t('ricevute.colonne.data')}
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">
                        {t('ricevute.colonne.importo')}
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                        {t('ricevute.colonne.metodo')}
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                        {t('ricevute.colonne.stato')}
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">
                        {t('common.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {ricevute.map((r) => (
                      <tr
                        key={r.id}
                        data-testid="ricevuta-id"
                        data-id={r.id}
                        className={[
                          'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors',
                          r.stato === 'annullata' ? 'opacity-60' : '',
                        ].join(' ')}
                      >
                        <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-300">
                          <span data-testid="numero-ricevuta">{r.anno}-{r.numero}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {formatData(r.data_emissione)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                          {formatValuta(r.totale)}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 capitalize">
                          {r.metodo_pagamento}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={r.stato === 'emessa' ? 'neutral' : 'danger'}>
                            {t(`ricevute.stato.${r.stato}`)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {pdfErrorId === r.id && (
                              <span className="text-xs text-red-500 dark:text-red-400 mr-1">
                                {t('ricevute.errore_pdf')}
                              </span>
                            )}
                            {/* Visualizza PDF */}
                            <button
                              data-testid="btn-scarica-pdf"
                              type="button"
                              onClick={() => void handleVisualizzaPdf(r)}
                              disabled={pdfLoadingId === r.id}
                              title={t('ricevute.azioni.visualizza')}
                              aria-label={`${t('ricevute.azioni.visualizza')} ${t('common.apre_nuova_finestra')}`}
                              className="p-1.5 rounded-md text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors disabled:opacity-50"
                            >
                              {pdfLoadingId === r.id ? (
                                <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-primary-600 animate-spin" />
                              ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              )}
                            </button>
                            {/* Annulla — solo se emessa */}
                            {r.stato === 'emessa' && !anonimizzato && (
                              <button
                                type="button"
                                onClick={() => setAnnullaRicevutaTarget(r)}
                                title={t('ricevute.azioni.annulla')}
                                aria-label={t('ricevute.azioni.annulla')}
                                className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* CTA emetti ricevuta */}
            {!anonimizzato && (
              <div className="flex justify-end">
                <button
                  data-testid="btn-nuova-ricevuta"
                  type="button"
                  onClick={() => setShowEmittiRicevuta(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
                >
                  {t('ricevute.nuova')}
                </button>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Modal modifica cliente */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={t('clienti.form.titolo_modifica')}
        maxWidth="max-w-2xl"
      >
        <ClientForm
          mode="edit"
          initialData={cliente}
          onSuccess={handleEditSuccess}
          onCancel={() => setShowEditModal(false)}
        />
      </Modal>

      {/* Modal aggiorna certificato */}
      <Modal
        isOpen={showCertModal}
        onClose={() => setShowCertModal(false)}
        title={t('clienti.certificato.form_titolo')}
      >
        <CertificatoForm
          clienteId={cliente.id}
          onSuccess={handleCertSuccess}
          onCancel={() => setShowCertModal(false)}
        />
      </Modal>

      {/* Dialog anonimizzazione */}
      <ConfirmDialog
        isOpen={showAnonDialog}
        onClose={() => setShowAnonDialog(false)}
        onConfirm={() => void handleAnonimizza()}
        title={t('clienti.anonimizza.titolo')}
        message={t('clienti.anonimizza.messaggio')}
        confirmLabel={t('clienti.anonimizza.conferma')}
        cancelLabel={t('clienti.anonimizza.annulla')}
        variant="danger"
        isLoading={isAnonimizzando}
      />

      {/* Modal assegna / rinnova iscrizione */}
      <Modal
        isOpen={showAssegnaIscrizione}
        onClose={() => setShowAssegnaIscrizione(false)}
        title={iscrizioneAttiva ? t('iscrizioni.rinnova') : t('iscrizioni.assegna')}
      >
        <AssegnaIscrizioneForm
          clienteId={clienteId}
          tipiDisponibili={tipiIscrizione}
          iscrizioneAttiva={iscrizioneAttiva}
          onSuccess={(iscrizione, emettiRicevuta) => {
            setShowAssegnaIscrizione(false)
            setIscrizioneAttiva(iscrizione)
            void loadIscrizione()
            if (emettiRicevuta) {
              setRicevutaPreselect({ tipo: 'iscrizione', riferimentoId: iscrizione.id })
              setShowEmittiRicevuta(true)
            }
          }}
          onCancel={() => setShowAssegnaIscrizione(false)}
        />
      </Modal>

      {/* Modal assegna abbonamento */}
      <Modal
        isOpen={showAssegnaAbbonamento}
        onClose={() => setShowAssegnaAbbonamento(false)}
        title={t('abbonamenti.assegna')}
      >
        <AssegnaAbbonamentoForm
          clienteId={clienteId}
          tipiDisponibili={tipiAbbonamento}
          iscrizioneAttiva={iscrizioneAttiva}
          onSuccess={(abbonamento, emettiRicevuta) => {
            setShowAssegnaAbbonamento(false)
            void loadAbbonamenti()
            if (emettiRicevuta) {
              setRicevutaPreselect({ tipo: 'abbonamento', riferimentoId: abbonamento.id })
              setShowEmittiRicevuta(true)
            }
          }}
          onCancel={() => setShowAssegnaAbbonamento(false)}
        />
      </Modal>

      {/* Dialog invalida iscrizione */}
      <ConfirmDialog
        isOpen={invalidaIscrizioneTarget !== null}
        onClose={() => setInvalidaIscrizioneTarget(null)}
        onConfirm={() => void handleInvalidaIscrizione()}
        title={t('iscrizioni.invalida_conferma_titolo')}
        message={t('iscrizioni.invalida_conferma_msg')}
        confirmLabel={t('iscrizioni.invalida')}
        variant="danger"
        isLoading={isInvalidandoIscrizione}
      />

      {/* Dialog invalida abbonamento */}
      <ConfirmDialog
        isOpen={invalidaAbbonamentoTarget !== null}
        onClose={() => setInvalidaAbbonamentoTarget(null)}
        onConfirm={() => void handleInvalidaAbbonamento()}
        title={t('abbonamenti.invalida_conferma_titolo')}
        message={t('abbonamenti.invalida_conferma_msg')}
        confirmLabel={t('abbonamenti.invalida')}
        variant="danger"
        isLoading={isInvalidandoAbbonamento}
      />

      {/* Modal emetti ricevuta */}
      {cliente && (
        <Modal
          isOpen={showEmittiRicevuta}
          onClose={() => { setShowEmittiRicevuta(false); setRicevutaPreselect(undefined) }}
          title={t('ricevute.form.titolo')}
          maxWidth="max-w-2xl"
        >
          <EmittiRicevutaForm
            clienteId={clienteId}
            cliente={cliente}
            preselect={ricevutaPreselect}
            onSuccess={handleRicevutaCreata}
            onCancel={() => { setShowEmittiRicevuta(false); setRicevutaPreselect(undefined) }}
          />
        </Modal>
      )}

      {/* Dialog annulla ricevuta — invariante 5 */}
      <ConfirmDialog
        isOpen={annullaRicevutaTarget !== null}
        onClose={() => setAnnullaRicevutaTarget(null)}
        onConfirm={() => void handleAnnullaRicevuta()}
        title={t('ricevute.annulla_dialog.titolo')}
        message={t('ricevute.annulla_dialog.messaggio')}
        confirmLabel={t('ricevute.annulla_dialog.conferma')}
        cancelLabel={t('ricevute.annulla_dialog.annulla')}
        variant="danger"
        isLoading={isAnnullandoRicevuta}
      />
    </div>
  )
}
