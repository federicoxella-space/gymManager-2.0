import React, { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CertificatoRow } from '../../../../types/shared'

interface CertificatoFormProps {
  clienteId: number
  onSuccess: (certificato: CertificatoRow) => void
  onCancel: () => void
}

type SubmitState = 'idle' | 'submitting' | 'error'

const inputClass = [
  'px-3 py-2 text-sm rounded-lg border w-full',
  'border-gray-300 dark:border-gray-600',
  'bg-white dark:bg-gray-800',
  'text-gray-900 dark:text-gray-100',
  'placeholder-gray-500 dark:placeholder-gray-500',
  'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ')

export default function CertificatoForm({
  clienteId,
  onSuccess,
  onCancel,
}: CertificatoFormProps): React.JSX.Element {
  const { t } = useTranslation()
  const tipoId = useId()
  const dataId = useId()
  const [tipo, setTipo] = useState('')
  const [dataScadenza, setDataScadenza] = useState('')
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [tipoError, setTipoError] = useState('')
  const [dataError, setDataError] = useState('')

  const isSubmitting = submitState === 'submitting'

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()

    // Validazione locale
    let valid = true
    if (!tipo) {
      setTipoError(t('validazione.selezione_obbligatoria'))
      valid = false
    } else {
      setTipoError('')
    }
    if (!dataScadenza) {
      setDataError(t('validazione.data_obbligatoria'))
      valid = false
    } else {
      setDataError('')
    }
    if (!valid) return

    setSubmitState('submitting')
    try {
      const result = await window.api.certificati.add({
        cliente_id: clienteId,
        tipo,
        data_scadenza: dataScadenza,
      })
      setSubmitState('idle')
      onSuccess(result)
    } catch {
      setSubmitState('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Errore generico */}
      {submitState === 'error' && (
        <div
          className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700"
          role="alert"
        >
          {t('clienti.certificato.errore_salvataggio')}
        </div>
      )}

      {/* Tipo certificato */}
      <div className="flex flex-col gap-1">
        <label htmlFor={tipoId} className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('clienti.certificato.tipo_label')}
          <span aria-hidden="true" className="text-red-500 ml-0.5">*</span>
        </label>
        <select
          id={tipoId}
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          disabled={isSubmitting}
          aria-required={true}
          aria-invalid={tipoError ? true : undefined}
          aria-describedby={tipoError ? `${tipoId}-error` : undefined}
          className={inputClass}
        >
          <option value="">{t('clienti.certificato.tipo_seleziona')}</option>
          <option value="non_agonistico">{t('clienti.certificato.tipo_non_agonistico')}</option>
          <option value="agonistico">{t('clienti.certificato.tipo_agonistico')}</option>
        </select>
        {tipoError && (
          <p id={`${tipoId}-error`} className="text-xs text-red-600 dark:text-red-400" role="alert">
            {tipoError}
          </p>
        )}
      </div>

      {/* Data di scadenza */}
      <div className="flex flex-col gap-1">
        <label htmlFor={dataId} className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('clienti.certificato.scadenza_label')}
          <span aria-hidden="true" className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id={dataId}
          type="date"
          value={dataScadenza}
          onChange={(e) => setDataScadenza(e.target.value)}
          disabled={isSubmitting}
          aria-required={true}
          aria-invalid={dataError ? true : undefined}
          aria-describedby={dataError ? `${dataId}-error` : undefined}
          className={inputClass}
        />
        {dataError && (
          <p id={`${dataId}-error`} className="text-xs text-red-600 dark:text-red-400" role="alert">
            {dataError}
          </p>
        )}
      </div>

      {/* Legenda stati */}
      <div className="rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 space-y-1.5">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2" />
          {t('clienti.certificato.descrizione_valido')}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-2" />
          {t('clienti.certificato.descrizione_in_scadenza')}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-2" />
          {t('clienti.certificato.descrizione_scaduto')}
        </p>
      </div>

      {/* Pulsanti */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className={[
            'px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
            'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200',
            'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {t('clienti.form.annulla')}
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className={[
            'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            'bg-primary-600 hover:bg-primary-700 text-white',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {isSubmitting ? t('common.loading') : t('clienti.form.salva')}
        </button>
      </div>
    </form>
  )
}
