import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ClienteRow,
  CreaRigaInput,
  CreaRicevutaInput,
  RicevutaConRighe,
  VocePagabile,
} from '../../../../types/shared'
import { calcolaIntestatario, indirizzoIntestatarioCompleto } from '../../utils/dominio'
import { apriPdfBase64 } from '../../utils/pdf'

interface EmittiRicevutaFormProps {
  clienteId: number
  cliente: ClienteRow
  onSuccess: (ricevuta: RicevutaConRighe) => void
  onCancel: () => void
  /** Se passato, preseleziona la voce corrispondente (oltre a quelle da incassare). */
  preselect?: { tipo: 'iscrizione' | 'abbonamento'; riferimentoId: number }
}

type SubmitState = 'idle' | 'loading' | 'submitting' | 'error'

interface RigaLibera {
  id: number
  descrizione: string
  prezzo: string
}

const inputClass = [
  'px-3 py-2 text-sm rounded-lg border w-full',
  'border-gray-300 dark:border-gray-600',
  'bg-white dark:bg-gray-800',
  'text-gray-900 dark:text-gray-100',
  'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ')

const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

/** Ritorna la data odierna in formato YYYY-MM-DD */
function oggi(): string {
  return new Date().toISOString().split('T')[0]
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

let rigaLibId = 0

export default function EmittiRicevutaForm({
  clienteId,
  cliente,
  onSuccess,
  onCancel,
  preselect,
}: EmittiRicevutaFormProps): React.JSX.Element {
  const { t } = useTranslation()

  const [submitState, setSubmitState] = useState<SubmitState>('loading')
  const [vociPagabili, setVociPagabili] = useState<VocePagabile[]>([])
  const [vociSelezionate, setVociSelezionate] = useState<Set<number>>(new Set())
  const [righeLibere, setRigheLibere] = useState<RigaLibera[]>([])
  const [dataEmissione, setDataEmissione] = useState(oggi())
  const [metodoPagamento, setMetodoPagamento] = useState<'contanti' | 'pos' | 'bonifico'>('contanti')
  const [statoPagamento, setStatoPagamento] = useState<'pagato' | 'da_incassare'>('pagato')
  const [dictPie, setDictPie] = useState('')
  const [validationError, setValidationError] = useState('')

  const intestatario = calcolaIntestatario(cliente)
  const indirizzoOk = indirizzoIntestatarioCompleto(cliente)
  const [ricevutaEmessa, setRicevutaEmessa] = useState<RicevutaConRighe | null>(null)
  const [pdfError, setPdfError] = useState(false)

  const loadVoci = useCallback(async (): Promise<void> => {
    setSubmitState('loading')
    try {
      const [voci, settings] = await Promise.all([
        window.api.ricevute.vociPagabili(clienteId),
        window.api.settings.get(),
      ])
      setVociPagabili(voci)
      // Preseleziona tutte le voci da incassare
      const idxDaIncassare = voci
        .map((v, idx) => (v.stato_pagamento === 'da_incassare' ? idx : -1))
        .filter((idx) => idx >= 0)
      const selezione = new Set(idxDaIncassare)
      if (preselect) {
        const idxPre = voci.findIndex(
          (v) => v.tipo === preselect.tipo && v.riferimentoId === preselect.riferimentoId,
        )
        if (idxPre >= 0) selezione.add(idxPre)
      }
      setVociSelezionate(selezione)
      // Precarica dicitura dalle impostazioni se disponibile
      const diciaturaDefault = settings.dicitura_pie ?? ''
      setDictPie(diciaturaDefault)
      setSubmitState('idle')
    } catch {
      setSubmitState('error')
    }
  }, [clienteId, preselect])

  useEffect(() => {
    void loadVoci()
  }, [loadVoci])

  function toggleVoce(idx: number): void {
    setVociSelezionate((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
      }
      return next
    })
    setValidationError('')
  }

  function aggiungiRigaLibera(): void {
    setRigheLibere((prev) => [...prev, { id: ++rigaLibId, descrizione: '', prezzo: '' }])
  }

  function rimuoviRigaLibera(id: number): void {
    setRigheLibere((prev) => prev.filter((r) => r.id !== id))
  }

  function aggiornaRigaLibera(id: number, campo: 'descrizione' | 'prezzo', valore: string): void {
    setRigheLibere((prev) => prev.map((r) => (r.id === id ? { ...r, [campo]: valore } : r)))
    setValidationError('')
  }

  // Calcolo totale
  const totaleVoci = vociPagabili
    .filter((_, idx) => vociSelezionate.has(idx))
    .reduce((acc, v) => acc + v.prezzo, 0)

  const totaleLibere = righeLibere.reduce((acc, r) => {
    const p = Number(r.prezzo)
    return acc + (isNaN(p) || p < 0 ? 0 : p)
  }, 0)

  const totale = totaleVoci + totaleLibere

  function validate(): boolean {
    const haVoci = vociSelezionate.size > 0
    const haRighe = righeLibere.length > 0

    if (!haVoci && !haRighe) {
      setValidationError(t('ricevute.form.errore_nessuna_voce'))
      return false
    }

    // Valida righe libere: tutte devono avere descrizione e prezzo >= 0
    for (const r of righeLibere) {
      const p = Number(r.prezzo)
      if (!r.descrizione.trim() || r.prezzo === '' || isNaN(p) || p < 0) {
        setValidationError(t('ricevute.form.errore_riga_libera'))
        return false
      }
    }

    return true
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!validate()) return

    if (!indirizzoOk) {
      setValidationError(t('ricevute.form.indirizzo_mancante'))
      return
    }

    setSubmitState('submitting')
    try {
      const righeVoci: CreaRigaInput[] = vociPagabili
        .filter((_, idx) => vociSelezionate.has(idx))
        .map((v) => ({
          tipo: v.tipo,
          riferimentoId: v.riferimentoId,
          descrizione: v.descrizione,
          dataInizio: v.dataInizio,
          dataFine: v.dataFine,
          prezzo: v.prezzo,
        }))

      const righeLib: CreaRigaInput[] = righeLibere.map((r) => ({
        tipo: 'libera' as const,
        descrizione: r.descrizione.trim(),
        prezzo: Number(r.prezzo),
      }))

      const input: CreaRicevutaInput = {
        clienteId,
        dataEmissione,
        metodo_pagamento: metodoPagamento,
        stato_pagamento: statoPagamento,
        dictPie: dictPie.trim() || undefined,
        righe: [...righeVoci, ...righeLib],
      }

      const ricevuta = await window.api.ricevute.crea(input)
      setRicevutaEmessa(ricevuta)
    } catch {
      setSubmitState('error')
    }
  }

  if (ricevutaEmessa) {
    const numeroFmt = `${ricevutaEmessa.anno}-${ricevutaEmessa.numero}`
    const handleVisualizza = async (): Promise<void> => {
      setPdfError(false)
      try {
        const base64 = await window.api.pdf.genera({ ricevutaId: ricevutaEmessa.id })
        apriPdfBase64(base64)
      } catch {
        setPdfError(true)
      }
    }
    return (
      <div className="space-y-5">
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400"
        >
          {t('ricevute.form.emessa_ok', { numero: numeroFmt })}
        </div>
        {pdfError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {t('ricevute.errore_caricamento')}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => void handleVisualizza()}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
          >
            {t('ricevute.form.visualizza_pdf')}
          </button>
          <button
            type="button"
            onClick={() => onSuccess(ricevutaEmessa)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
          >
            {t('ricevute.form.chiudi')}
          </button>
        </div>
      </div>
    )
  }

  if (submitState === 'loading') {
    return (
      <div className="flex items-center justify-center py-10 gap-3 text-gray-600 dark:text-gray-400" role="status" aria-live="polite">
        <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-primary-600 animate-spin" aria-hidden="true" />
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    )
  }

  // Errore al caricamento iniziale (prima del primo fetch riuscito)
  if (submitState === 'error' && vociPagabili.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4">
        <p className="text-sm text-red-600 dark:text-red-400">{t('ricevute.errore_caricamento')}</p>
        <button
          type="button"
          onClick={() => void loadVoci()}
          className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          {t('common.riprova')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-6">
      {/* Intestatario */}
      <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
        <span className="text-gray-500 dark:text-gray-400">{t('ricevute.form.intestatario')}: </span>
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {intestatario.nome} {intestatario.cognome}
        </span>
        {intestatario.isTutore && intestatario.assistitoCf && (
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            {t('ricevute.form.tutore_di', { cf: intestatario.assistitoCf })}
          </span>
        )}
        {!indirizzoOk && (
          <p role="alert" className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            {t('ricevute.form.indirizzo_mancante')}
          </p>
        )}
      </div>

      {/* Errore di submit */}
      {submitState === 'error' && vociPagabili.length > 0 && (
        <div
          role="alert"
          className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700"
        >
          {t('ricevute.form.errore_salvataggio')}
        </div>
      )}

      {/* Errore di validazione */}
      {validationError && (
        <div
          role="alert"
          className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700"
        >
          {validationError}
        </div>
      )}

      {/* Voci pagabili */}
      <div>
        <p className={labelClass}>{t('ricevute.form.voci_pagabili')}</p>
        {vociPagabili.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            {t('ricevute.form.nessuna_voce')}
          </p>
        ) : (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
            {vociPagabili.map((voce, idx) => (
              <label
                key={`${voce.tipo}-${voce.riferimentoId}`}
                className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
              >
                <input
                  data-testid={
                    voce.tipo === 'iscrizione'
                      ? 'check-voce-iscrizione'
                      : voce.tipo === 'abbonamento'
                        ? 'check-voce-abbonamento'
                        : undefined
                  }
                  type="checkbox"
                  checked={vociSelezionate.has(idx)}
                  onChange={() => toggleVoce(idx)}
                  disabled={submitState === 'submitting'}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {voce.descrizione}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {formatData(voce.dataInizio)} → {formatData(voce.dataFine)}
                  </p>
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 shrink-0">
                  {formatValuta(voce.prezzo)}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Righe libere */}
      <div className="space-y-2">
        {righeLibere.map((riga) => (
          <div
            key={riga.id}
            className="flex gap-2 items-start rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/30"
          >
            <div className="flex-1">
              <input
                type="text"
                value={riga.descrizione}
                onChange={(e) => aggiornaRigaLibera(riga.id, 'descrizione', e.target.value)}
                placeholder={t('ricevute.form.descrizione_libera')}
                disabled={submitState === 'submitting'}
                className={inputClass}
              />
            </div>
            <div className="w-28 shrink-0">
              <input
                type="number"
                min={0}
                step={0.01}
                value={riga.prezzo}
                onChange={(e) => aggiornaRigaLibera(riga.id, 'prezzo', e.target.value)}
                placeholder={t('ricevute.form.prezzo_libero')}
                disabled={submitState === 'submitting'}
                className={inputClass}
              />
            </div>
            <button
              type="button"
              onClick={() => rimuoviRigaLibera(riga.id)}
              disabled={submitState === 'submitting'}
              aria-label={t('common.delete')}
              className="mt-0.5 p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={aggiungiRigaLibera}
          disabled={submitState === 'submitting'}
          className="inline-flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t('ricevute.form.riga_libera')}
        </button>
      </div>

      {/* Totale anteprima */}
      <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
        <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
          {t('ricevute.form.totale')}
        </span>
        <span className="text-lg font-bold text-primary-700 dark:text-primary-300">
          {formatValuta(totale)}
        </span>
      </div>

      {/* Data emissione */}
      <div>
        <label className={labelClass} htmlFor="ricevuta-data">
          {t('ricevute.form.data_emissione')}
        </label>
        <input
          id="ricevuta-data"
          data-testid="campo-data-emissione"
          type="date"
          value={dataEmissione}
          onChange={(e) => setDataEmissione(e.target.value)}
          disabled={submitState === 'submitting'}
          className={inputClass}
        />
      </div>

      {/* Metodo di pagamento */}
      <div>
        <label className={labelClass} htmlFor="ricevuta-metodo">
          {t('ricevute.form.metodo_pagamento')}
        </label>
        <select
          id="ricevuta-metodo"
          data-testid="select-metodo-pagamento"
          value={metodoPagamento}
          onChange={(e) => setMetodoPagamento(e.target.value as 'contanti' | 'pos' | 'bonifico')}
          disabled={submitState === 'submitting'}
          className={inputClass}
        >
          <option value="contanti">{t('iscrizioni.metodo.contanti')}</option>
          <option value="pos">{t('iscrizioni.metodo.pos')}</option>
          <option value="bonifico">{t('iscrizioni.metodo.bonifico')}</option>
        </select>
      </div>

      {/* Stato pagamento */}
      <div>
        <label className={labelClass} htmlFor="ricevuta-stato-pag">
          {t('ricevute.form.stato_pagamento')}
        </label>
        <select
          id="ricevuta-stato-pag"
          value={statoPagamento}
          onChange={(e) => setStatoPagamento(e.target.value as 'pagato' | 'da_incassare')}
          disabled={submitState === 'submitting'}
          className={inputClass}
        >
          <option value="pagato">{t('iscrizioni.pagamento.pagato')}</option>
          <option value="da_incassare">{t('iscrizioni.pagamento.da_incassare')}</option>
        </select>
      </div>

      {/* Dicitura a piè */}
      <div>
        <label className={labelClass} htmlFor="ricevuta-pie">
          {t('ricevute.form.dicitura_pie')}
        </label>
        <textarea
          id="ricevuta-pie"
          value={dictPie}
          onChange={(e) => setDictPie(e.target.value)}
          disabled={submitState === 'submitting'}
          rows={3}
          className={[inputClass, 'resize-y'].join(' ')}
        />
      </div>

      {/* Azioni */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitState === 'submitting'}
          className={[
            'px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
            'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200',
            'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {t('common.cancel')}
        </button>
        <button
          data-testid="btn-emetti-ricevuta"
          type="submit"
          disabled={submitState === 'submitting'}
          className={[
            'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            'bg-primary-600 hover:bg-primary-700 text-white',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {submitState === 'submitting' ? t('common.loading') : t('ricevute.form.emetti')}
        </button>
      </div>
    </form>
  )
}
