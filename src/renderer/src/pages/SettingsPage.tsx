import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppSettings } from '../../../types/shared'

// ── Colori preset ─────────────────────────────────────────────────────────────

interface PresetColor {
  label: string
  rgb: string
}

const PRESET_COLORS: PresetColor[] = [
  { label: 'Blu', rgb: '37,99,235' },
  { label: 'Indaco', rgb: '79,70,229' },
  { label: 'Viola', rgb: '124,58,237' },
  { label: 'Rosa', rgb: '219,39,119' },
  { label: 'Rosso', rgb: '220,38,38' },
  { label: 'Arancione', rgb: '234,88,12' },
  { label: 'Verde', rgb: '22,163,74' },
  { label: 'Teal', rgb: '13,148,136' },
]

/**
 * Converte una stringa "R,G,B" in un colore esadecimale "#rrggbb"
 * usato dall'input type="color".
 */
function rgbStringToHex(rgb: string): string {
  const parts = rgb.split(',').map((s) => parseInt(s.trim(), 10))
  if (parts.length !== 3 || parts.some(isNaN)) return '#2563eb'
  const [r, g, b] = parts
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
      .join('')
  )
}

/**
 * Converte un colore esadecimale "#rrggbb" nella stringa "R,G,B"
 * attesa da AppSettings.primaryColor.
 */
function hexToRgbString(hex: string): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r},${g},${b}`
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  theme: 'light' | 'dark' | 'system'
  primaryColor: string // "R,G,B"
  dicitura_pie: string
  receipt_start_number: string // stringa per il controllo dell'input
  expiry_warning_days_certificates: string // stringa per il controllo dell'input
}

interface FormErrors {
  receipt_start_number?: string
  expiry_warning_days_certificates?: string
}

// ── Icone ─────────────────────────────────────────────────────────────────────

function CheckIcon(): React.JSX.Element {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

// ── Componente principale ──────────────────────────────────────────────────────

export default function SettingsPage(): React.JSX.Element {
  const { t } = useTranslation()

  const [form, setForm] = useState<FormState>({
    theme: 'system',
    primaryColor: '37,99,235',
    dicitura_pie: '',
    receipt_start_number: '1',
    expiry_warning_days_certificates: '30',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Caricamento impostazioni al mount
  useEffect(() => {
    setIsLoading(true)
    window.api.settings
      .get()
      .then((s: AppSettings) => {
        setForm({
          theme: s.theme,
          primaryColor: s.primaryColor ?? '37,99,235',
          dicitura_pie: s.dicitura_pie ?? '',
          receipt_start_number: String(s.receipt_start_number ?? 1),
          expiry_warning_days_certificates: String(
            s.expiry_warning_days_certificates ?? 30
          ),
        })
      })
      .catch(() => {
        setSaveError(t('common.error_generic'))
      })
      .finally(() => {
        setIsLoading(false)
      })

    return () => {
      if (successTimerRef.current !== null) {
        clearTimeout(successTimerRef.current)
      }
    }
  }, [t])

  // ── Validazione ─────────────────────────────────────────────────────────────

  const validate = useCallback(
    (data: FormState): FormErrors => {
      const errs: FormErrors = {}

      const startNum = parseInt(data.receipt_start_number, 10)
      if (!Number.isInteger(startNum) || startNum < 1 || data.receipt_start_number.trim() === '') {
        errs.receipt_start_number = t('impostazioni.errore_numero_minimo_uno')
      }

      const warnDays = parseInt(data.expiry_warning_days_certificates, 10)
      if (
        !Number.isInteger(warnDays) ||
        warnDays < 1 ||
        warnDays > 365 ||
        data.expiry_warning_days_certificates.trim() === ''
      ) {
        errs.expiry_warning_days_certificates = t('impostazioni.errore_giorni_range')
      }

      return errs
    },
    [t]
  )

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleThemeChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const value = e.target.value as 'light' | 'dark' | 'system'
    setForm((prev) => ({ ...prev, theme: value }))
  }

  function handleColorPickerChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const rgb = hexToRgbString(e.target.value)
    setForm((prev) => ({ ...prev, primaryColor: rgb }))
  }

  function handlePresetColor(rgb: string): void {
    setForm((prev) => ({ ...prev, primaryColor: rgb }))
  }

  function handleDizituraChange(e: React.ChangeEvent<HTMLTextAreaElement>): void {
    const value = e.target.value.slice(0, 200)
    setForm((prev) => ({ ...prev, dicitura_pie: value }))
  }

  function handleStartNumberChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setForm((prev) => ({ ...prev, receipt_start_number: e.target.value }))
    setErrors((prev) => ({ ...prev, receipt_start_number: undefined }))
  }

  function handleWarningDaysChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setForm((prev) => ({ ...prev, expiry_warning_days_certificates: e.target.value }))
    setErrors((prev) => ({ ...prev, expiry_warning_days_certificates: undefined }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setSaveError(null)

    const errs = validate(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setIsSaving(true)
    try {
      const payload: Partial<AppSettings> = {
        theme: form.theme,
        primaryColor: form.primaryColor,
        dicitura_pie: form.dicitura_pie,
        receipt_start_number: parseInt(form.receipt_start_number, 10),
        expiry_warning_days_certificates: parseInt(
          form.expiry_warning_days_certificates,
          10
        ),
      }
      await window.api.settings.set(payload)

      setSuccessMessage(true)
      if (successTimerRef.current !== null) {
        clearTimeout(successTimerRef.current)
      }
      successTimerRef.current = setTimeout(() => {
        setSuccessMessage(false)
      }, 3000)
    } catch {
      setSaveError(t('common.error_generic'))
    } finally {
      setIsSaving(false)
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
      </div>
    )
  }

  const hexColor = rgbStringToHex(form.primaryColor)

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={(e) => { void handleSubmit(e) }} noValidate>

        {/* ── Sezione Aspetto ──────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">
            {t('impostazioni.sezione_aspetto')}
          </h3>

          {/* Tema */}
          <div className="mb-5">
            <label
              htmlFor="settings-theme"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.tema')}
            </label>
            <select
              id="settings-theme"
              value={form.theme}
              onChange={handleThemeChange}
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="system">{t('impostazioni.tema_sistema')}</option>
              <option value="light">{t('impostazioni.tema_chiaro')}</option>
              <option value="dark">{t('impostazioni.tema_scuro')}</option>
            </select>
          </div>

          {/* Colore primario */}
          <div>
            <label
              htmlFor="settings-color"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.colore_primario')}
            </label>

            {/* Preset */}
            <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label={t('impostazioni.colore_primario')}>
              {PRESET_COLORS.map((preset) => {
                const isSelected = form.primaryColor === preset.rgb
                const presetHex = rgbStringToHex(preset.rgb)
                return (
                  <button
                    key={preset.rgb}
                    type="button"
                    title={preset.label}
                    aria-pressed={isSelected}
                    onClick={() => handlePresetColor(preset.rgb)}
                    className={[
                      'w-8 h-8 rounded-full border-2 transition-transform focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
                      isSelected
                        ? 'border-gray-900 dark:border-white scale-110'
                        : 'border-transparent hover:scale-110',
                    ].join(' ')}
                    style={{ backgroundColor: presetHex }}
                  >
                    {isSelected && (
                      <span className="flex items-center justify-center text-white">
                        <CheckIcon />
                      </span>
                    )}
                    <span className="sr-only">{preset.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Color picker personalizzato */}
            <div className="flex items-center gap-3">
              <input
                id="settings-color"
                type="color"
                value={hexColor}
                onChange={handleColorPickerChange}
                className="w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-700 cursor-pointer p-0.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                aria-label={t('impostazioni.colore_primario')}
              />
              <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                {hexColor}
              </span>
            </div>
          </div>
        </section>

        {/* ── Sezione Ricevute ─────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">
            {t('impostazioni.sezione_ricevute')}
          </h3>

          {/* Dicitura piè di ricevuta */}
          <div className="mb-5">
            <label
              htmlFor="settings-dicitura"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.dicitura_pie')}
            </label>
            <textarea
              id="settings-dicitura"
              value={form.dicitura_pie}
              onChange={handleDizituraChange}
              rows={3}
              maxLength={200}
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 text-right">
              {form.dicitura_pie.length}/200
            </p>
          </div>

          {/* Numero iniziale ricevute */}
          <div>
            <label
              htmlFor="settings-start-number"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.numero_iniziale_ricevute')}
            </label>
            <input
              id="settings-start-number"
              type="number"
              min={1}
              step={1}
              value={form.receipt_start_number}
              onChange={handleStartNumberChange}
              className={[
                'block w-full rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                errors.receipt_start_number
                  ? 'border-red-400 dark:border-red-500'
                  : 'border-gray-300 dark:border-gray-700',
              ].join(' ')}
              aria-describedby={
                errors.receipt_start_number
                  ? 'settings-start-number-error'
                  : 'settings-start-number-hint'
              }
              aria-invalid={errors.receipt_start_number !== undefined}
            />
            {errors.receipt_start_number ? (
              <p
                id="settings-start-number-error"
                role="alert"
                className="mt-1.5 text-sm text-red-600 dark:text-red-400"
              >
                {errors.receipt_start_number}
              </p>
            ) : (
              <p
                id="settings-start-number-hint"
                className="mt-1.5 text-sm text-amber-600 dark:text-amber-400"
              >
                {t('impostazioni.numero_iniziale_avviso')}
              </p>
            )}
          </div>
        </section>

        {/* ── Sezione Scadenze ─────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">
            {t('impostazioni.sezione_scadenze')}
          </h3>

          <div>
            <label
              htmlFor="settings-warning-days"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.preavviso_certificati')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="settings-warning-days"
                type="number"
                min={1}
                max={365}
                step={1}
                value={form.expiry_warning_days_certificates}
                onChange={handleWarningDaysChange}
                className={[
                  'block w-32 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                  errors.expiry_warning_days_certificates
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-700',
                ].join(' ')}
                aria-describedby={
                  errors.expiry_warning_days_certificates
                    ? 'settings-warning-days-error'
                    : undefined
                }
                aria-invalid={errors.expiry_warning_days_certificates !== undefined}
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t('impostazioni.giorni')}
              </span>
            </div>
            {errors.expiry_warning_days_certificates && (
              <p
                id="settings-warning-days-error"
                role="alert"
                className="mt-1.5 text-sm text-red-600 dark:text-red-400"
              >
                {errors.expiry_warning_days_certificates}
              </p>
            )}
          </div>
        </section>

        {/* ── Feedback globale e submit ─────────────────────────────────────── */}

        {saveError !== null && (
          <div
            role="alert"
            className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
          >
            {saveError}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400 flex items-center gap-2"
          >
            <CheckIcon />
            <span>{t('impostazioni.salvato')}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            {isSaving ? t('common.loading') : t('impostazioni.salva')}
          </button>
        </div>
      </form>
    </div>
  )
}
