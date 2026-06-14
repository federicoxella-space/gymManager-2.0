import React, { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AbbonamentoClienteRow, IscrizioneClienteRow, TipoAbbonamentoRow } from '../../../../types/shared'

interface AssegnaAbbonamentoFormProps {
  clienteId: number
  tipiDisponibili: TipoAbbonamentoRow[]
  iscrizioneAttiva: IscrizioneClienteRow | null
  onSuccess: (abbonamento: AbbonamentoClienteRow, emettiRicevuta: boolean) => void
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

export default function AssegnaAbbonamentoForm({
  clienteId,
  tipiDisponibili,
  iscrizioneAttiva,
  onSuccess,
  onCancel,
}: AssegnaAbbonamentoFormProps): React.JSX.Element {
  const { t } = useTranslation()

  const tipoErrId = useId()
  const dataInizioErrId = useId()
  const dataScadenzaErrId = useId()
  const prezzoErrId = useId()

  const tipiAttivi = tipiDisponibili.filter((tp) => tp.stato === 'attivo')

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

  // INVARIANTE 3: controlla se la scadenza abbonamento supera quella dell'iscrizione
  const superaIscrizione: boolean =
    iscrizioneAttiva !== null &&
    dataScadenza !== '' &&
    dataScadenza > iscrizioneAttiva.data_scadenza

  // Quando cambia il tipo, aggiorna prezzo e scadenza
  useEffect(() => {
    if (!tipoId) return
    const tipo = tipiAttivi.find((tp) => String(tp.id) === tipoId)
    if (!tipo) return
    setPrezzo(String(tipo.prezzo_default))
    if (dataInizio) {
      setDataScadenza(aggiungiMesi(dataInizio, tipo.durata_mesi))
    }
  }, [tipoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Quando cambia la data inizio, ricalcola la scadenza
  useEffect(() => {
    if (!dataInizio || !tipoId) return
    const tipo = tipiAttivi.find((tp) => String(tp.id) === tipoId)
    if (!tipo) return
    setDataScadenza(aggiungiMesi(dataInizio, tipo.durata_mesi))
  }, [dataInizio]) // eslint-disable-line react-hooks/exhaustive-deps

  function validate(): boolean {
    let ok = true
    if (!tipoId) { setTipoError(t('validazione.selezione_obbligatoria')); ok = false } else setTipoError('')
    if (!dataInizio) { setDataIniziError(t('validazione.data_obbligatoria')); ok = false } else setDataIniziError('')
    if (!dataScadenza) { setDataScadenzaError(t('validazione.data_obbligatoria')); ok = false } else setDataScadenzaError('')
    const pr = Number(prezzo)
    if (prezzo === '' || isNaN(pr) || pr < 0) { setPrezzoError(t('validazione.prezzo_non_valido')); ok = false } else setPrezzoError('')
    return ok
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    // INVARIANTE 2: blocca se nessuna iscrizione attiva
    if (!iscrizioneAttiva) return
    if (!validate()) return
    setSubmitState('submitting')
    try {
      const result = await window.api.abbonamenti.assegna({
        cliente_id: clienteId,
        tipo_abbonamento_id: Number(tipoId),
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

  // INVARIANTE 2: se nessuna iscrizione attiva, mostra solo il messaggio di errore
  if (!iscrizioneAttiva) {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700"
        >
          {t('abbonamenti.no_iscrizione_attiva')}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className={[
              'px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
              'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200',
              'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700',
            ].join(' ')}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* INVARIANTE 3: banner avviso non bloccante */}
      {superaIscrizione && (
        <div
          role="status"
          className="px-4 py-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 text-sm text-orange-800 dark:text-orange-300"
        >
          {t('abbonamenti.oltre_scadenza_iscrizione', {
            dataAbb: formatData(dataScadenza),
            dataIscr: formatData(iscrizioneAttiva.data_scadenza),
          })}
        </div>
      )}

      {/* Errore generico */}
      {submitState === 'error' && (
        <div
          data-testid="errore-salvataggio"
          role="alert"
          className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700"
        >
          {t('abbonamenti.errore_salvataggio')}
        </div>
      )}

      {/* Tipo abbonamento */}
      <div>
        <label className={labelClass} htmlFor="assegna-abb-tipo">
          {t('abbonamenti.form.tipo')}
        </label>
        <select
          id="assegna-abb-tipo"
          data-testid="select-tipo-abbonamento"
          value={tipoId}
          onChange={(e) => setTipoId(e.target.value)}
          disabled={isSubmitting}
          aria-invalid={tipoError ? true : undefined}
          aria-describedby={tipoError ? tipoErrId : undefined}
          className={inputClass}
        >
          <option value="">{t('abbonamenti.form.tipo_seleziona')}</option>
          {tipiAttivi.map((tipo) => (
            <option key={tipo.id} value={String(tipo.id)}>
              {tipo.nome}
              {tipo.categoria ? ` (${tipo.categoria})` : ''} — {tipo.durata_mesi}{' '}
              {tipo.durata_mesi === 1 ? t('common.mese') : t('common.mesi')}
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
          <label className={labelClass} htmlFor="assegna-abb-inizio">
            {t('abbonamenti.form.data_inizio')}
          </label>
          <input
            id="assegna-abb-inizio"
            data-testid="campo-data-inizio-abb"
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
          <label className={labelClass} htmlFor="assegna-abb-scadenza">
            {t('abbonamenti.form.data_scadenza')}
          </label>
          <input
            id="assegna-abb-scadenza"
            data-testid="campo-data-scadenza-abb"
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
        <label className={labelClass} htmlFor="assegna-abb-prezzo">
          {t('abbonamenti.form.prezzo')}
        </label>
        <input
          id="assegna-abb-prezzo"
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
        <label className={labelClass} htmlFor="assegna-abb-stato-pag">
          {t('abbonamenti.form.stato_pagamento')}
        </label>
        <select
          id="assegna-abb-stato-pag"
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
          <label className={labelClass} htmlFor="assegna-abb-metodo">
            {t('abbonamenti.form.metodo_pagamento')}
          </label>
          <select
            id="assegna-abb-metodo"
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
          id="assegna-abb-ricevuta"
          checked={emettiRicevuta}
          onChange={(e) => setEmettiRicevuta(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <label htmlFor="assegna-abb-ricevuta" className="text-sm text-gray-700 dark:text-gray-300">
          {t('abbonamenti.form.emetti_ricevuta')}
        </label>
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
          {t('common.cancel')}
        </button>
        <button
          data-testid="btn-salva-abbonamento"
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
