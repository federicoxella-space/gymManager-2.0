import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ClienteRow, CreateClienteInput, ValidationError } from '../../../../types/shared'
import { isMinorenne, decodeCFBasic } from '../../utils/dominio'

interface ClientFormProps {
  mode: 'create' | 'edit'
  initialData?: ClienteRow
  onSuccess: (cliente: ClienteRow) => void
  onCancel: () => void
}

type FormData = {
  numero_tessera: string
  nome: string
  cognome: string
  codice_fiscale: string
  data_nascita: string
  sesso: string
  via: string
  civico: string
  citta: string
  provincia: string
  cap: string
  email: string
  telefono: string
  note: string
  tutore_nome: string
  tutore_cognome: string
  tutore_cf: string
}

type SubmitState = 'idle' | 'submitting' | 'error'

/** Verifica il formato di base del codice fiscale nel renderer (solo struttura). */
function isFormatoCFValido(cf: string): boolean {
  if (!cf) return false
  const upper = cf.toUpperCase().trim()
  return /^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/.test(upper)
}

function buildInitialData(initialData?: ClienteRow): FormData {
  return {
    numero_tessera: initialData?.numero_tessera ?? '',
    nome: initialData?.nome ?? '',
    cognome: initialData?.cognome ?? '',
    codice_fiscale: initialData?.codice_fiscale ?? '',
    data_nascita: initialData?.data_nascita ?? '',
    sesso: initialData?.sesso ?? '',
    via: initialData?.via ?? '',
    civico: initialData?.civico ?? '',
    citta: initialData?.citta ?? '',
    provincia: initialData?.provincia ?? '',
    cap: initialData?.cap ?? '',
    email: initialData?.email ?? '',
    telefono: initialData?.telefono ?? '',
    note: initialData?.note ?? '',
    tutore_nome: initialData?.tutore_nome ?? '',
    tutore_cognome: initialData?.tutore_cognome ?? '',
    tutore_cf: initialData?.tutore_cf ?? '',
  }
}

interface FieldProps {
  label: string
  error?: string
  children: React.ReactNode
  required?: boolean
}

function Field({ label, error, children, required }: FieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

const inputClass = [
  'px-3 py-2 text-sm rounded-lg border',
  'border-gray-300 dark:border-gray-600',
  'bg-white dark:bg-gray-800',
  'text-gray-900 dark:text-gray-100',
  'placeholder-gray-400 dark:placeholder-gray-500',
  'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ')

const inputErrorClass = 'border-red-400 dark:border-red-500'

export default function ClientForm({
  mode,
  initialData,
  onSuccess,
  onCancel,
}: ClientFormProps): React.JSX.Element {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<FormData>(() => buildInitialData(initialData))
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [apiErrors, setApiErrors] = useState<ValidationError[]>([])
  const [cfFormatoWarning, setCfFormatoWarning] = useState(false)

  const minorenneFlag = isMinorenne(formData.data_nascita)
  const isSubmitting = submitState === 'submitting'

  // CF bidirezionale: quando il CF è completo (16 caratteri), precompila data_nascita e sesso
  useEffect(() => {
    const cf = formData.codice_fiscale.toUpperCase().trim()
    if (cf.length !== 16) return
    try {
      const decoded = decodeCFBasic(cf)
      if (!decoded) return
      const { sesso, annoNascita, meseNascita, giornoNascita } = decoded
      // Formato YYYY-MM-DD per l'input date
      const mm = String(meseNascita).padStart(2, '0')
      const dd = String(giornoNascita).padStart(2, '0')
      const dataNascita = `${annoNascita}-${mm}-${dd}`
      setFormData((prev) => ({
        ...prev,
        // Precompila solo se i campi sono vuoti (non sovrascrivere la scelta esplicita dell'utente)
        data_nascita: prev.data_nascita || dataNascita,
        sesso: prev.sesso || sesso,
      }))
    } catch {
      // Non interrompere il flusso in caso di CF non decodificabile
    }
  }, [formData.codice_fiscale])

  // Reset errori quando cambiano i dati
  useEffect(() => {
    setApiErrors([])
  }, [formData])

  const getFieldError = (field: string): string | undefined =>
    apiErrors.find((e) => e.field === field)?.message

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ): void {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))

    // Validazione formato CF in tempo reale
    if (name === 'codice_fiscale') {
      const normalized = value.toUpperCase().trim()
      setCfFormatoWarning(normalized.length > 0 && !isFormatoCFValido(normalized))
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setSubmitState('submitting')
    setApiErrors([])

    const input: CreateClienteInput = {
      nome: formData.nome.trim(),
      cognome: formData.cognome.trim(),
      codice_fiscale: formData.codice_fiscale.toUpperCase().trim(),
      numero_tessera: formData.numero_tessera.trim() || undefined,
      data_nascita: formData.data_nascita || null,
      sesso: formData.sesso || null,
      via: formData.via.trim() || null,
      civico: formData.civico.trim() || null,
      citta: formData.citta.trim() || null,
      provincia: formData.provincia.trim() || null,
      cap: formData.cap.trim() || null,
      email: formData.email.trim() || null,
      telefono: formData.telefono.trim() || null,
      note: formData.note.trim() || null,
      tutore_nome: formData.tutore_nome.trim() || null,
      tutore_cognome: formData.tutore_cognome.trim() || null,
      tutore_cf: formData.tutore_cf.toUpperCase().trim() || null,
    }

    try {
      let result: ClienteRow
      if (mode === 'create') {
        result = await window.api.clienti.create(input)
      } else {
        if (!initialData) throw new Error('initialData mancante per la modalità edit')
        result = await window.api.clienti.update(initialData.id, input)
      }
      setSubmitState('idle')
      onSuccess(result)
    } catch (err: unknown) {
      // L'API può restituire errori di validazione come array
      const maybeErrors = (err as { errors?: ValidationError[] })?.errors
      if (Array.isArray(maybeErrors) && maybeErrors.length > 0) {
        setApiErrors(maybeErrors)
        setSubmitState('idle')
      } else {
        setSubmitState('error')
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Errore generico */}
      {submitState === 'error' && (
        <div
          className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700"
          role="alert"
        >
          {t('clienti.form.errore_invio')}
        </div>
      )}

      {/* Sezione dati anagrafici */}
      <section>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
          {t('clienti.form.sezione_anagrafica')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('clienti.form.nome')} error={getFieldError('nome')} required>
            <input
              data-testid="campo-nome"
              type="text"
              name="nome"
              value={formData.nome}
              onChange={handleChange}
              disabled={isSubmitting}
              autoComplete="given-name"
              className={[inputClass, getFieldError('nome') ? inputErrorClass : ''].join(' ')}
            />
          </Field>

          <Field label={t('clienti.form.cognome')} error={getFieldError('cognome')} required>
            <input
              data-testid="campo-cognome"
              type="text"
              name="cognome"
              value={formData.cognome}
              onChange={handleChange}
              disabled={isSubmitting}
              autoComplete="family-name"
              className={[inputClass, getFieldError('cognome') ? inputErrorClass : ''].join(' ')}
            />
          </Field>

          <Field
            label={t('clienti.form.cf')}
            error={getFieldError('codice_fiscale')}
            required
          >
            <input
              data-testid="campo-codice-fiscale"
              type="text"
              name="codice_fiscale"
              value={formData.codice_fiscale}
              onChange={handleChange}
              disabled={isSubmitting}
              maxLength={16}
              autoComplete="off"
              placeholder={t('clienti.form.cf_hint')}
              className={[
                inputClass,
                'uppercase',
                getFieldError('codice_fiscale') ? inputErrorClass : '',
              ].join(' ')}
            />
            {cfFormatoWarning && !getFieldError('codice_fiscale') && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                {t('clienti.form.cf_hint')}
              </p>
            )}
          </Field>

          <Field label={t('clienti.form.numero_tessera')}>
            <input
              type="text"
              name="numero_tessera"
              value={formData.numero_tessera}
              onChange={handleChange}
              disabled={isSubmitting}
              placeholder={t('clienti.form.numero_tessera')}
              className={inputClass}
            />
          </Field>

          <Field label={t('clienti.form.data_nascita')}>
            <input
              data-testid="campo-data-nascita"
              type="date"
              name="data_nascita"
              value={formData.data_nascita}
              onChange={handleChange}
              disabled={isSubmitting}
              className={inputClass}
            />
          </Field>

          <Field label={t('clienti.form.sesso')}>
            <select
              name="sesso"
              value={formData.sesso}
              onChange={handleChange}
              disabled={isSubmitting}
              className={inputClass}
            >
              <option value="">{t('clienti.form.sesso_seleziona')}</option>
              <option value="M">{t('clienti.form.sesso_m')}</option>
              <option value="F">{t('clienti.form.sesso_f')}</option>
            </select>
          </Field>
        </div>
      </section>

      {/* Sezione tutore (minorenne) */}
      {minorenneFlag && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {t('clienti.form.sezione_tutore')}
            </h3>
          </div>
          <p className="text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg px-3 py-2 mb-4">
            {t('clienti.form.tutore_nota')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label={t('clienti.form.tutore_nome')}
              error={getFieldError('tutore_nome')}
              required
            >
              <input
                type="text"
                name="tutore_nome"
                value={formData.tutore_nome}
                onChange={handleChange}
                disabled={isSubmitting}
                className={[inputClass, getFieldError('tutore_nome') ? inputErrorClass : ''].join(' ')}
              />
            </Field>

            <Field
              label={t('clienti.form.tutore_cognome')}
              error={getFieldError('tutore_cognome')}
              required
            >
              <input
                type="text"
                name="tutore_cognome"
                value={formData.tutore_cognome}
                onChange={handleChange}
                disabled={isSubmitting}
                className={[inputClass, getFieldError('tutore_cognome') ? inputErrorClass : ''].join(' ')}
              />
            </Field>

            <Field
              label={t('clienti.form.tutore_cf')}
              error={getFieldError('tutore_cf')}
              required
            >
              <input
                type="text"
                name="tutore_cf"
                value={formData.tutore_cf}
                onChange={handleChange}
                disabled={isSubmitting}
                maxLength={16}
                autoComplete="off"
                className={[inputClass, 'uppercase', getFieldError('tutore_cf') ? inputErrorClass : ''].join(' ')}
              />
            </Field>
          </div>
        </section>
      )}

      {/* Sezione contatti e indirizzo */}
      <section>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
          {t('clienti.form.sezione_contatti')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('clienti.form.email')}>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              disabled={isSubmitting}
              autoComplete="email"
              className={inputClass}
            />
          </Field>

          <Field label={t('clienti.form.telefono')}>
            <input
              type="tel"
              name="telefono"
              value={formData.telefono}
              onChange={handleChange}
              disabled={isSubmitting}
              autoComplete="tel"
              className={inputClass}
            />
          </Field>

          <div className="sm:col-span-2 grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Field label={t('clienti.form.via')}>
                <input
                  type="text"
                  name="via"
                  value={formData.via}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  autoComplete="street-address"
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label={t('clienti.form.civico')}>
              <input
                type="text"
                name="civico"
                value={formData.civico}
                onChange={handleChange}
                disabled={isSubmitting}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label={t('clienti.form.citta')}>
            <input
              type="text"
              name="citta"
              value={formData.citta}
              onChange={handleChange}
              disabled={isSubmitting}
              autoComplete="address-level2"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('clienti.form.provincia')}>
              <input
                type="text"
                name="provincia"
                value={formData.provincia}
                onChange={handleChange}
                disabled={isSubmitting}
                maxLength={2}
                className={[inputClass, 'uppercase'].join(' ')}
              />
            </Field>
            <Field label={t('clienti.form.cap')}>
              <input
                type="text"
                name="cap"
                value={formData.cap}
                onChange={handleChange}
                disabled={isSubmitting}
                maxLength={5}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label={t('clienti.form.note')}>
              <textarea
                name="note"
                value={formData.note}
                onChange={handleChange}
                disabled={isSubmitting}
                rows={3}
                className={[inputClass, 'resize-none'].join(' ')}
              />
            </Field>
          </div>
        </div>
      </section>

      {/* Pulsanti azione */}
      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
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
          data-testid="btn-salva-cliente"
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
