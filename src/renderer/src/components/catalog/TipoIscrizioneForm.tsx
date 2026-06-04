import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  TipoIscrizioneRow,
  CreateTipoIscrizioneInput,
  UpdateTipoIscrizioneInput,
} from '../../../../types/shared'

interface TipoIscrizioneFormProps {
  /** Se fornito, siamo in modalità modifica */
  initialData?: TipoIscrizioneRow
  onSuccess: (tipo: TipoIscrizioneRow) => void
  onCancel: () => void
}

type SubmitState = 'idle' | 'submitting' | 'error'

const inputClass = [
  'px-3 py-2 text-sm rounded-lg border w-full',
  'border-gray-300 dark:border-gray-600',
  'bg-white dark:bg-gray-800',
  'text-gray-900 dark:text-gray-100',
  'placeholder-gray-400 dark:placeholder-gray-500',
  'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ')

const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

export default function TipoIscrizioneForm({
  initialData,
  onSuccess,
  onCancel,
}: TipoIscrizioneFormProps): React.JSX.Element {
  const { t } = useTranslation()
  const isEdit = initialData !== undefined

  const [nome, setNome] = useState(initialData?.nome ?? '')
  const [descrizione, setDescrizione] = useState(initialData?.descrizione ?? '')
  const [durataMesi, setDurataMesi] = useState<string>(
    initialData ? String(initialData.durata_mesi) : '1',
  )
  const [prezzoDefault, setPrezzoDefault] = useState<string>(
    initialData ? String(initialData.prezzo_default) : '0',
  )

  const [nomeError, setNomeError] = useState('')
  const [durataError, setDurataError] = useState('')
  const [prezzoError, setPrezzoError] = useState('')
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const isSubmitting = submitState === 'submitting'

  function validate(): boolean {
    let ok = true
    if (!nome.trim()) {
      setNomeError(t('common.error_generic'))
      ok = false
    } else {
      setNomeError('')
    }
    const dur = Number(durataMesi)
    if (!durataMesi || isNaN(dur) || dur < 1 || !Number.isInteger(dur)) {
      setDurataError(t('common.error_generic'))
      ok = false
    } else {
      setDurataError('')
    }
    const pr = Number(prezzoDefault)
    if (prezzoDefault === '' || isNaN(pr) || pr < 0) {
      setPrezzoError(t('common.error_generic'))
      ok = false
    } else {
      setPrezzoError('')
    }
    return ok
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!validate()) return
    setSubmitState('submitting')
    try {
      let result: TipoIscrizioneRow
      if (isEdit && initialData) {
        const data: UpdateTipoIscrizioneInput = {
          nome: nome.trim(),
          descrizione: descrizione.trim() || undefined,
          durata_mesi: Number(durataMesi),
          prezzo_default: Number(prezzoDefault),
        }
        result = await window.api.catalogo.tipiIscrizione.update(initialData.id, data)
      } else {
        const data: CreateTipoIscrizioneInput = {
          nome: nome.trim(),
          descrizione: descrizione.trim() || undefined,
          durata_mesi: Number(durataMesi),
          prezzo_default: Number(prezzoDefault),
        }
        result = await window.api.catalogo.tipiIscrizione.create(data)
      }
      setSubmitState('idle')
      onSuccess(result)
    } catch {
      setSubmitState('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {submitState === 'error' && (
        <div
          role="alert"
          className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700"
        >
          {t('catalogo.form.errore_salvataggio')}
        </div>
      )}

      {/* Nome */}
      <div>
        <label className={labelClass} htmlFor="tipo-iscr-nome">
          {t('catalogo.form.nome')}
        </label>
        <input
          id="tipo-iscr-nome"
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          disabled={isSubmitting}
          className={inputClass}
          autoFocus
        />
        {nomeError && (
          <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {nomeError}
          </p>
        )}
      </div>

      {/* Descrizione */}
      <div>
        <label className={labelClass} htmlFor="tipo-iscr-desc">
          {t('catalogo.form.descrizione')}
        </label>
        <textarea
          id="tipo-iscr-desc"
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
          disabled={isSubmitting}
          rows={2}
          className={inputClass}
        />
      </div>

      {/* Durata mesi + Prezzo */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="tipo-iscr-durata">
            {t('catalogo.form.durata_mesi')}
          </label>
          <input
            id="tipo-iscr-durata"
            type="number"
            min={1}
            step={1}
            value={durataMesi}
            onChange={(e) => setDurataMesi(e.target.value)}
            disabled={isSubmitting}
            className={inputClass}
          />
          {durataError && (
            <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {durataError}
            </p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="tipo-iscr-prezzo">
            {t('catalogo.form.prezzo_default')}
          </label>
          <input
            id="tipo-iscr-prezzo"
            type="number"
            min={0}
            step={0.01}
            value={prezzoDefault}
            onChange={(e) => setPrezzoDefault(e.target.value)}
            disabled={isSubmitting}
            className={inputClass}
          />
          {prezzoError && (
            <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {prezzoError}
            </p>
          )}
        </div>
      </div>

      {/* Azioni */}
      <div className="flex justify-end gap-3 pt-2">
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
          {t('catalogo.form.annulla')}
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
          {isSubmitting ? t('common.loading') : t('catalogo.form.salva')}
        </button>
      </div>
    </form>
  )
}
