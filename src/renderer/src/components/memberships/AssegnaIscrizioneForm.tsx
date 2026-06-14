import React, { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { IscrizioneClienteRow, TipoIscrizioneRow } from '../../../../types/shared'

interface AssegnaIscrizioneFormProps {
  clienteId: number
  tipiDisponibili: TipoIscrizioneRow[]
  iscrizioneAttiva: IscrizioneClienteRow | null
  onSuccess: (iscrizione: IscrizioneClienteRow, emettiRicevuta: boolean) => void
  onCancel: () => void
}

type SubmitState = 'idle' | 'submitting' | 'error'

/** Calcola la data di scadenza aggiungendo N mesi a una data YYYY-MM-DD */
function aggiungiMesi(dataInizio: string, mesi: number): string {
  if (!dataInizio) return ''
  const d = new Date(dataInizio)
  d.setMonth(d.getMonth() + mesi)
  return d.toISOString().split('T')[0]
}

/** Ritorna la data odierna in formato YYYY-MM-DD */
function oggi(): string {
  return new Date().toISOString().split('T')[0]
}

/** Formatta una data YYYY-MM-DD in formato italiano gg/mm/aaaa */
function formatData(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
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

export default function AssegnaIscrizioneForm({
  clienteId,
  tipiDisponibili,
  iscrizioneAttiva,
  onSuccess,
  onCancel,
}: AssegnaIscrizioneFormProps): React.JSX.Element {
  const { t } = useTranslation()

  const tipoErrId = useId()
  const dataInizioErrId = useId()
  const dataScadenzaErrId = useId()
  const prezzoErrId = useId()

  const tipiAttivi = tipiDisponibili.filter((t) => t.stato === 'attivo')

  const [tipoId, setTipoId] = useState<string>(tipiAttivi.length > 0 ? String(tipiAttivi[0].id) : '')
  const [dataInizio, setDataInizio] = useState(oggi())
  const [dataScadenza, setDataScadenza] = useState('')
  const [prezzo, setPrezzo] = useState<string>('')
  const [statoPagamento, setStatoPagamento] = useState<'da_incassare' | 'pagato'>('da_incassare')
  const [metodoPagamento, setMetodoPagamento] = useState<string>('contanti')

  const [tipoError, setTipoError] = useState('')
  const [dataIniziError, setDataIniziError] = useState('')
  const [dataScadenzaError, setDataScadenzaError] = useState('')
  const [prezzoError, setPrezzoError] = useState('')

  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const isSubmitting = submitState === 'submitting'
  const [emettiRicevuta, setEmettiRicevuta] = useState(false)

  // Quando cambia il tipo selezionato, aggiorna prezzo e scadenza
  useEffect(() => {
    if (!tipoId) return
    const tipo = tipiAttivi.find((t) => String(t.id) === tipoId)
    if (!tipo) return
    setPrezzo(String(tipo.prezzo_default))
    if (dataInizio) {
      setDataScadenza(aggiungiMesi(dataInizio, tipo.durata_mesi))
    }
  }, [tipoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Quando cambia la data inizio, ricalcola la scadenza
  useEffect(() => {
    if (!dataInizio || !tipoId) return
    const tipo = tipiAttivi.find((t) => String(t.id) === tipoId)
    if (!tipo) return
    setDataScadenza(aggiungiMesi(dataInizio, tipo.durata_mesi))
  }, [dataInizio]) // eslint-disable-line react-hooks/exhaustive-deps

  function validate(): boolean {
    let ok = true
    if (!tipoId) {
      setTipoError(t('common.error_generic'))
      ok = false
    } else {
      setTipoError('')
    }
    if (!dataInizio) {
      setDataIniziError(t('common.error_generic'))
      ok = false
    } else {
      setDataIniziError('')
    }
    if (!dataScadenza) {
      setDataScadenzaError(t('common.error_generic'))
      ok = false
    } else {
      setDataScadenzaError('')
    }
    const pr = Number(prezzo)
    if (prezzo === '' || isNaN(pr) || pr < 0) {
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
      // INVARIANTE 1: se esiste un'iscrizione attiva, la invalidiamo prima di assegnare la nuova
      if (iscrizioneAttiva) {
        await window.api.iscrizioni.invalida(iscrizioneAttiva.id)
      }
      const result = await window.api.iscrizioni.assegna({
        cliente_id: clienteId,
        tipo_iscrizione_id: Number(tipoId),
        data_inizio: dataInizio,
        data_scadenza: dataScadenza,
        prezzo: Number(prezzo),
        stato_pagamento: statoPagamento,
        metodo_pagamento: statoPagamento === 'pagato' ? metodoPagamento : undefined,
      })
      setSubmitState('idle')
      onSuccess(result, emettiRicevuta)
    } catch {
      setSubmitState('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Banner rinnovo */}
      {iscrizioneAttiva && (
        <div
          role="status"
          className="px-4 py-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 text-sm text-yellow-800 dark:text-yellow-300"
        >
          {t('iscrizioni.form.nota_rinnovo')}
        </div>
      )}

      {/* Errore generico */}
      {submitState === 'error' && (
        <div
          role="alert"
          className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700"
        >
          {t('iscrizioni.errore_salvataggio')}
        </div>
      )}

      {/* Tipo iscrizione */}
      <div>
        <label className={labelClass} htmlFor="assegna-iscr-tipo">
          {t('iscrizioni.form.tipo')}
        </label>
        <select
          id="assegna-iscr-tipo"
          data-testid="select-tipo-iscrizione"
          value={tipoId}
          onChange={(e) => setTipoId(e.target.value)}
          disabled={isSubmitting}
          aria-invalid={tipoError ? true : undefined}
          aria-describedby={tipoError ? tipoErrId : undefined}
          className={inputClass}
        >
          <option value="">{t('iscrizioni.form.tipo_seleziona')}</option>
          {tipiAttivi.map((tipo) => (
            <option key={tipo.id} value={String(tipo.id)}>
              {tipo.nome} — {tipo.durata_mesi} {tipo.durata_mesi === 1 ? 'mese' : 'mesi'}
            </option>
          ))}
        </select>
        {tipoError && (
          <p id={tipoErrId} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {tipoError}
          </p>
        )}
      </div>

      {/* Date */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="assegna-iscr-inizio">
            {t('iscrizioni.form.data_inizio')}
          </label>
          <input
            id="assegna-iscr-inizio"
            data-testid="campo-data-inizio-isc"
            type="date"
            value={dataInizio}
            onChange={(e) => setDataInizio(e.target.value)}
            disabled={isSubmitting}
            aria-invalid={dataIniziError ? true : undefined}
            aria-describedby={dataIniziError ? dataInizioErrId : undefined}
            className={inputClass}
          />
          {dataIniziError && (
            <p id={dataInizioErrId} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {dataIniziError}
            </p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="assegna-iscr-scadenza">
            {t('iscrizioni.form.data_scadenza')}
          </label>
          <input
            id="assegna-iscr-scadenza"
            data-testid="campo-data-scadenza-isc"
            type="date"
            value={dataScadenza}
            onChange={(e) => setDataScadenza(e.target.value)}
            disabled={isSubmitting}
            aria-invalid={dataScadenzaError ? true : undefined}
            aria-describedby={dataScadenzaError ? dataScadenzaErrId : undefined}
            className={inputClass}
          />
          {dataScadenzaError && (
            <p id={dataScadenzaErrId} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {dataScadenzaError}
            </p>
          )}
        </div>
      </div>

      {/* Prezzo */}
      <div>
        <label className={labelClass} htmlFor="assegna-iscr-prezzo">
          {t('iscrizioni.form.prezzo')}
        </label>
        <input
          id="assegna-iscr-prezzo"
          type="number"
          min={0}
          step={0.01}
          value={prezzo}
          onChange={(e) => setPrezzo(e.target.value)}
          disabled={isSubmitting}
          aria-invalid={prezzoError ? true : undefined}
          aria-describedby={prezzoError ? prezzoErrId : undefined}
          className={inputClass}
        />
        {prezzoError && (
          <p id={prezzoErrId} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {prezzoError}
          </p>
        )}
      </div>

      {/* Stato pagamento */}
      <div>
        <label className={labelClass} htmlFor="assegna-iscr-stato-pag">
          {t('iscrizioni.form.stato_pagamento')}
        </label>
        <select
          id="assegna-iscr-stato-pag"
          value={statoPagamento}
          onChange={(e) => setStatoPagamento(e.target.value as 'da_incassare' | 'pagato')}
          disabled={isSubmitting}
          className={inputClass}
        >
          <option value="da_incassare">{t('iscrizioni.pagamento.da_incassare')}</option>
          <option value="pagato">{t('iscrizioni.pagamento.pagato')}</option>
        </select>
      </div>

      {/* Metodo pagamento — visibile solo se pagato */}
      {statoPagamento === 'pagato' && (
        <div>
          <label className={labelClass} htmlFor="assegna-iscr-metodo">
            {t('iscrizioni.form.metodo_pagamento')}
          </label>
          <select
            id="assegna-iscr-metodo"
            value={metodoPagamento}
            onChange={(e) => setMetodoPagamento(e.target.value)}
            disabled={isSubmitting}
            className={inputClass}
          >
            <option value="contanti">{t('iscrizioni.metodo.contanti')}</option>
            <option value="pos">{t('iscrizioni.metodo.pos')}</option>
            <option value="bonifico">{t('iscrizioni.metodo.bonifico')}</option>
          </select>
        </div>
      )}

      {/* Checkbox emetti ricevuta ora (B1) */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="assegna-iscr-ricevuta"
          checked={emettiRicevuta}
          onChange={(e) => setEmettiRicevuta(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <label htmlFor="assegna-iscr-ricevuta" className="text-sm text-gray-700 dark:text-gray-300">
          {t('iscrizioni.form.emetti_ricevuta')}
        </label>
      </div>

      {/* Mostra scadenza corrente se rinnovo */}
      {iscrizioneAttiva && dataScadenza && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('iscrizioni.periodo')}: {formatData(dataInizio)} → {formatData(dataScadenza)}
        </p>
      )}

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
          {t('common.cancel')}
        </button>
        <button
          data-testid="btn-salva-iscrizione"
          type="submit"
          disabled={isSubmitting}
          className={[
            'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            'bg-primary-600 hover:bg-primary-700 text-white',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {isSubmitting ? t('common.loading') : t('common.save')}
        </button>
      </div>
    </form>
  )
}
