import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CertificatoRow, ClienteRow } from '../../../../types/shared'
import { useSettings } from '../../context/SettingsContext'
import { isMinorenne } from '../../utils/dominio'
import Badge from '../ui/Badge'
import Modal from '../ui/Modal'
import ConfirmDialog from '../ui/ConfirmDialog'
import ClientBadge, { getStatoCert } from './ClientBadge'
import ClientForm from './ClientForm'
import CertificatoForm from '../certificati/CertificatoForm'

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

interface SectionProps {
  title: string
  children: React.ReactNode
}

function Section({ title, children }: SectionProps): React.JSX.Element {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
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

  useEffect(() => {
    void loadCliente()
  }, [loadCliente])

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
      <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
        <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-primary-600 animate-spin" />
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

      {/* Sezione Iscrizione attiva (placeholder F2) */}
      <Section title={t('clienti.dettaglio.sezione_iscrizione')}>
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">
          {t('common.coming_soon')} (F2)
        </p>
      </Section>

      {/* Sezione Abbonamenti (placeholder F2) */}
      <Section title={t('clienti.dettaglio.sezione_abbonamenti')}>
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">
          {t('common.coming_soon')} (F2)
        </p>
      </Section>

      {/* Sezione Ricevute (placeholder F3) */}
      <Section title={t('clienti.dettaglio.sezione_ricevute')}>
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">
          {t('common.coming_soon')} (F3)
        </p>
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
    </div>
  )
}
