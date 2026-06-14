import React, { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ClienteRow, ComuneInfo, CreateClienteInput, ValidationError } from '../../../../types/shared'
import { isMinorenne, decodeCFBasic } from '../../utils/dominio'
import { useModalDirty } from '../ui/Modal'

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
  comune_nascita: string
  via: string
  civico: string
  citta: string
  provincia: string
  cap: string
  email: string
  telefono: string
  note: string
}

type TutoreInfo = {
  nome: string
  cognome: string
  codice_fiscale: string
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
    comune_nascita: initialData?.comune_nascita ?? '',
    via: initialData?.via ?? '',
    civico: initialData?.civico ?? '',
    citta: initialData?.citta ?? '',
    provincia: initialData?.provincia ?? '',
    cap: initialData?.cap ?? '',
    email: initialData?.email ?? '',
    telefono: initialData?.telefono ?? '',
    note: initialData?.note ?? '',
  }
}

interface FieldProps {
  label: string
  error?: string
  children: React.ReactNode
  required?: boolean
}

function Field({ label, error, children, required }: FieldProps): React.JSX.Element {
  const id = useId()
  const errorId = `${id}-error`
  const childArray = React.Children.toArray(children)
  const enhanced = childArray.map((child, i) =>
    i === 0 && React.isValidElement(child)
      ? React.cloneElement(child as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
          id,
          'aria-required': required ? true : undefined,
          'aria-invalid': error ? true : undefined,
          'aria-describedby': error ? errorId : undefined,
        })
      : child,
  )
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span aria-hidden="true" className="text-red-500 ml-0.5">*</span>}
      </label>
      {enhanced}
      {error && (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400" role="alert">
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
  'placeholder-gray-500 dark:placeholder-gray-500',
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
  const [comuneSuggerimenti, setComuneSuggerimenti] = useState<ComuneInfo[]>([])
  const [codiceComune, setCodiceComune] = useState('')
  const [cfError, setCfError] = useState<string | null>(null)

  // Stato tutore (B7): selezione cliente come tutore via FK
  const [tutoreId, setTutoreId] = useState<number | null>(initialData?.tutore_id ?? null)
  const [tutoreInfo, setTutoreInfo] = useState<TutoreInfo | null>(
    initialData?.tutore_id
      ? {
          nome: initialData.tutore_nome ?? '',
          cognome: initialData.tutore_cognome ?? '',
          codice_fiscale: initialData.tutore_cf ?? '',
        }
      : null,
  )
  const [tutoreQuery, setTutoreQuery] = useState('')
  const [tutoreRisultati, setTutoreRisultati] = useState<ClienteRow[]>([])
  const [tutoreAvvisoMinorenne, setTutoreAvvisoMinorenne] = useState(false)

  const isDirty = JSON.stringify(formData) !== JSON.stringify(buildInitialData(initialData))
  useModalDirty(isDirty)

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

  // Ricerca tutore: al cambio query (≥2 caratteri) chiama clienti.list
  useEffect(() => {
    if (tutoreQuery.trim().length < 2) {
      setTutoreRisultati([])
      return
    }
    void window.api.clienti
      .list({ search: tutoreQuery.trim(), stato: 'attivo' })
      .then((risultati) => {
        const filtrati = risultati.filter(
          (c) =>
            // Esclude il cliente corrente in edit
            c.id !== initialData?.id,
        )
        setTutoreRisultati(filtrati)
      })
      .catch(() => setTutoreRisultati([]))
  }, [tutoreQuery, initialData?.id])

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

  async function handleCalcolaCF(): Promise<void> {
    setCfError(null)
    const sesso = formData.sesso === 'M' || formData.sesso === 'F' ? (formData.sesso as 'M' | 'F') : null
    if (!formData.nome.trim() || !formData.cognome.trim() || !formData.data_nascita || !sesso || !codiceComune) {
      setCfError(t('clienti.form.calcola_cf_dati_mancanti'))
      return
    }
    try {
      const cf = await window.api.cf.calcola({
        nome: formData.nome.trim(),
        cognome: formData.cognome.trim(),
        dataNascita: formData.data_nascita,
        sesso,
        codiceComune
      })
      setFormData((prev) => ({ ...prev, codice_fiscale: cf }))
    } catch {
      setCfError(t('clienti.form.calcola_cf_dati_mancanti'))
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const erroriLocali: ValidationError[] = []
    if (!formData.nome.trim()) erroriLocali.push({ field: 'nome', message: t('validazione.obbligatorio') })
    if (!formData.cognome.trim()) erroriLocali.push({ field: 'cognome', message: t('validazione.obbligatorio') })
    const cf = formData.codice_fiscale.toUpperCase().trim()
    if (!cf) {
      erroriLocali.push({ field: 'codice_fiscale', message: t('validazione.obbligatorio') })
    } else if (!isFormatoCFValido(cf)) {
      erroriLocali.push({ field: 'codice_fiscale', message: t('clienti.form.cf_formato_invalido') })
    }
    if (erroriLocali.length > 0) {
      setApiErrors(erroriLocali)
      return
    }
    setSubmitState('submitting')
    setApiErrors([])

    const input: CreateClienteInput = {
      nome: formData.nome.trim(),
      cognome: formData.cognome.trim(),
      codice_fiscale: formData.codice_fiscale.toUpperCase().trim(),
      numero_tessera: formData.numero_tessera.trim() || undefined,
      data_nascita: formData.data_nascita || null,
      sesso: formData.sesso || null,
      comune_nascita: formData.comune_nascita.trim() || null,
      via: formData.via.trim() || null,
      civico: formData.civico.trim() || null,
      citta: formData.citta.trim() || null,
      provincia: formData.provincia.trim() || null,
      cap: formData.cap.trim() || null,
      email: formData.email.trim() || null,
      telefono: formData.telefono.trim() || null,
      note: formData.note.trim() || null,
      // B7 Task 5: tutore collegato tramite FK cliente
      tutore_id: tutoreId,
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
      <p className="text-xs text-gray-500 dark:text-gray-400">{t('common.campi_obbligatori')}</p>
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
                {t('clienti.form.cf_formato_invalido')}
              </p>
            )}
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => { void handleCalcolaCF() }}
                className="text-sm px-3 py-1.5 rounded-lg border border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
              >
                {t('clienti.form.calcola_cf')}
              </button>
              {cfError && <span role="alert" className="text-xs text-amber-700 dark:text-amber-400">{cfError}</span>}
            </div>
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

          <div className="relative sm:col-span-2">
            <label htmlFor="comune_nascita" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('clienti.form.comune_nascita')}
            </label>
            <input
              id="comune_nascita"
              name="comune_nascita"
              type="text"
              autoComplete="off"
              value={formData.comune_nascita}
              placeholder={t('clienti.form.comune_nascita_placeholder')}
              disabled={isSubmitting}
              onChange={(e) => {
                const v = e.target.value
                setFormData((prev) => ({ ...prev, comune_nascita: v }))
                setCodiceComune('')
                if (v.trim().length >= 2) {
                  void window.api.cf.cercaComuni(v).then(setComuneSuggerimenti).catch(() => setComuneSuggerimenti([]))
                } else {
                  setComuneSuggerimenti([])
                }
              }}
              className={inputClass}
            />
            {comuneSuggerimenti.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg divide-y divide-gray-100 dark:divide-gray-800">
                {comuneSuggerimenti.map((c) => (
                  <li key={`${c.codiceCatastale}-${c.nome}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({ ...prev, comune_nascita: c.nome }))
                        setCodiceComune(c.codiceCatastale)
                        setComuneSuggerimenti([])
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      {c.nome} <span className="text-xs text-gray-400">({c.sigla})</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Sezione tutore (minorenne) — B7: ricerca/selezione cliente */}
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

          {/* Campo di ricerca tutore */}
          <div className="relative mb-3">
            <label
              htmlFor="tutore-search"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('clienti.form.tutore_cerca')}
            </label>
            <input
              id="tutore-search"
              type="text"
              autoComplete="off"
              value={tutoreQuery}
              placeholder={t('clienti.form.tutore_cerca')}
              disabled={isSubmitting}
              onChange={(e) => {
                setTutoreQuery(e.target.value)
              }}
              className={inputClass}
            />
            {tutoreRisultati.length > 0 && (
              <ul
                role="listbox"
                aria-label={t('clienti.form.tutore_cerca')}
                className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg divide-y divide-gray-100 dark:divide-gray-800"
              >
                {tutoreRisultati.map((c) => (
                  <li key={c.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onClick={() => {
                        setTutoreId(c.id)
                        setTutoreInfo({
                          nome: c.nome,
                          cognome: c.cognome,
                          codice_fiscale: c.codice_fiscale,
                        })
                        setTutoreQuery('')
                        setTutoreRisultati([])
                        setTutoreAvvisoMinorenne(isMinorenne(c.data_nascita))
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      {c.cognome} {c.nome}{' '}
                      <span className="text-xs text-gray-400">({c.codice_fiscale})</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Riquadro tutore selezionato / nessun tutore */}
          {tutoreInfo ? (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 text-sm text-primary-800 dark:text-primary-200">
              <span>
                {t('clienti.form.tutore_selezionato', {
                  nome: `${tutoreInfo.cognome} ${tutoreInfo.nome}`,
                  cf: tutoreInfo.codice_fiscale,
                })}
              </span>
              <button
                type="button"
                onClick={() => {
                  setTutoreId(null)
                  setTutoreInfo(null)
                  setTutoreAvvisoMinorenne(false)
                }}
                disabled={isSubmitting}
                className="ml-3 text-xs font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
              >
                {t('clienti.form.tutore_rimuovi')}
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              {t('clienti.form.tutore_nessuno')}
            </p>
          )}

          {/* Avviso non bloccante se il tutore selezionato è minorenne */}
          {tutoreAvvisoMinorenne && (
            <p
              role="alert"
              className="mt-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2"
            >
              {t('clienti.form.tutore_avviso_minorenne')}
            </p>
          )}
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
