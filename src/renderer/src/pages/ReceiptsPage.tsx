import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RicevutaRow } from '../../../types/shared'
import Badge from '../components/ui/Badge'
import ConfirmDialog from '../components/ui/ConfirmDialog'

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

/** Apre un PDF (stringa base64) in una nuova finestra */
function apriPdf(base64: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}

/** Scarica un PDF (stringa base64) come file */
function scaricaPdf(base64: string, numero: number, anno: number): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ricevuta-${anno}-${numero}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

interface ReceiptsPageProps {
  initialFilter?: { stato_pagamento?: 'pagato' | 'da_incassare' }
}

export default function ReceiptsPage({ initialFilter }: ReceiptsPageProps = {}): React.JSX.Element {
  const { t } = useTranslation()

  const [ricevute, setRicevute] = useState<RicevutaRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Filtri
  const annoCorrente = new Date().getFullYear()
  const [anni, setAnni] = useState<number[]>([annoCorrente])
  const [filtroAnno, setFiltroAnno] = useState<number>(annoCorrente)
  const [filtroStato, setFiltroStato] = useState<string>('')
  const [filtroPagamento, setFiltroPagamento] = useState<string>(
    initialFilter?.stato_pagamento === 'da_incassare' ? 'da_incassare' : '',
  )
  const [filtroSearch, setFiltroSearch] = useState('')

  // Annullamento
  const [annullaTarget, setAnnullaTarget] = useState<RicevutaRow | null>(null)
  const [isAnnullando, setIsAnnullando] = useState(false)

  // PDF
  const [pdfLoading, setPdfLoading] = useState<number | null>(null)
  const [pdfError, setPdfError] = useState<number | null>(null)

  // Carica gli anni con ricevute effettive dal DB
  useEffect(() => {
    window.api.ricevute.anni()
      .then(result => {
        const list = result.length > 0 ? result : [annoCorrente]
        setAnni(list)
        // Se l'anno corrente non è in lista, seleziona il più recente disponibile
        if (!list.includes(filtroAnno)) {
          setFiltroAnno(list[0])
        }
      })
      .catch(() => {
        setAnni([annoCorrente])
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadRicevute = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setLoadError(false)
    try {
      const data = await window.api.ricevute.list({
        anno: filtroAnno,
        stato: filtroStato || undefined,
      })
      setRicevute(data)
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }, [filtroAnno, filtroStato])

  useEffect(() => {
    void loadRicevute()
  }, [loadRicevute])

  // Filtra localmente per ricerca e stato pagamento
  const ricevuteFiltrate = ricevute.filter((r) => {
    if (filtroPagamento && r.stato_pagamento !== filtroPagamento) return false
    if (!filtroSearch.trim()) return true
    const q = filtroSearch.toLowerCase()
    const nomeCliente = `${r.intestatario_cognome} ${r.intestatario_nome}`.toLowerCase()
    return (
      String(r.numero).includes(q) ||
      nomeCliente.includes(q) ||
      `${r.anno}-${r.numero}`.toLowerCase().includes(q)
    )
  })

  async function handleVisualizzaPdf(ricevuta: RicevutaRow): Promise<void> {
    setPdfLoading(ricevuta.id)
    setPdfError(null)
    try {
      const base64 = await window.api.pdf.genera({ ricevutaId: ricevuta.id })
      apriPdf(base64)
    } catch {
      setPdfError(ricevuta.id)
    } finally {
      setPdfLoading(null)
    }
  }

  async function handleScaricaPdf(ricevuta: RicevutaRow): Promise<void> {
    setPdfLoading(ricevuta.id)
    setPdfError(null)
    try {
      const base64 = await window.api.pdf.genera({ ricevutaId: ricevuta.id })
      scaricaPdf(base64, ricevuta.numero, ricevuta.anno)
    } catch {
      setPdfError(ricevuta.id)
    } finally {
      setPdfLoading(null)
    }
  }

  async function handleAnnulla(): Promise<void> {
    if (!annullaTarget) return
    setIsAnnullando(true)
    try {
      const aggiornata = await window.api.ricevute.annulla(annullaTarget.id)
      setRicevute((prev) => prev.map((r) => (r.id === aggiornata.id ? aggiornata : r)))
      setAnnullaTarget(null)
    } catch {
      // L'errore verrà gestito visivamente rimandando l'utente al reload
    } finally {
      setIsAnnullando(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Barra filtri */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Filtro anno */}
        <div>
          <label
            htmlFor="ricevute-filtro-anno"
            className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
          >
            {t('ricevute.filtri.anno')}
          </label>
          <select
            id="ricevute-filtro-anno"
            value={filtroAnno}
            onChange={(e) => setFiltroAnno(Number(e.target.value))}
            className="pl-3 pr-10 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {anni.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro stato */}
        <div>
          <label
            htmlFor="ricevute-filtro-stato"
            className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
          >
            {t('ricevute.filtri.stato')}
          </label>
          <select
            id="ricevute-filtro-stato"
            value={filtroStato}
            onChange={(e) => setFiltroStato(e.target.value)}
            className="pl-3 pr-10 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('ricevute.filtri.tutti_stati')}</option>
            <option value="emessa">{t('ricevute.stato.emessa')}</option>
            <option value="annullata">{t('ricevute.stato.annullata')}</option>
          </select>
        </div>

        {/* Filtro stato pagamento */}
        <div>
          <label
            htmlFor="ricevute-filtro-pagamento"
            className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
          >
            {t('ricevute.filtri.stato_pagamento')}
          </label>
          <select
            id="ricevute-filtro-pagamento"
            value={filtroPagamento}
            onChange={(e) => setFiltroPagamento(e.target.value)}
            className="pl-3 pr-10 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('ricevute.filtri.tutti_stati')}</option>
            <option value="pagato">{t('iscrizioni.pagamento.pagato')}</option>
            <option value="da_incassare">{t('iscrizioni.pagamento.da_incassare')}</option>
          </select>
        </div>

        {/* Ricerca */}
        <div className="flex-1 min-w-[200px]">
          <label
            htmlFor="ricevute-search"
            className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
          >
            {t('ricevute.filtri.cerca')}
          </label>
          <input
            id="ricevute-search"
            type="search"
            value={filtroSearch}
            onChange={(e) => setFiltroSearch(e.target.value)}
            placeholder={t('ricevute.filtri.cerca')}
            className="px-3 py-2 text-sm rounded-lg border w-full border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Stati loading / error / empty */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-gray-600 dark:text-gray-400" role="status" aria-live="polite">
          <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-primary-600 animate-spin" aria-hidden="true" />
          <span className="text-sm">{t('common.loading')}</span>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-sm text-red-600 dark:text-red-400">{t('ricevute.errore_caricamento')}</p>
          <button
            type="button"
            onClick={() => void loadRicevute()}
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >
            {t('common.riprova')}
          </button>
        </div>
      ) : ricevuteFiltrate.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('ricevute.nessuna')}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  {t('ricevute.colonne.numero')}
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  {t('ricevute.colonne.data')}
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  {t('ricevute.colonne.cliente')}
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">
                  {t('ricevute.colonne.importo')}
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  {t('ricevute.colonne.metodo')}
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  {t('ricevute.colonne.stato_pagamento')}
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  {t('ricevute.colonne.stato')}
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {ricevuteFiltrate.map((r) => (
                <tr
                  key={r.id}
                  className={[
                    'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors',
                    r.stato === 'annullata' ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  {/* Numero */}
                  <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-300">
                    {r.anno}-{r.numero}
                  </td>

                  {/* Data */}
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {formatData(r.data_emissione)}
                  </td>

                  {/* Cliente */}
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                    {r.intestatario_cognome} {r.intestatario_nome}
                  </td>

                  {/* Importo */}
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                    {formatValuta(r.totale)}
                  </td>

                  {/* Metodo */}
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 capitalize">
                    {r.metodo_pagamento}
                  </td>

                  {/* Stato pagamento */}
                  <td className="px-4 py-3">
                    <Badge variant={r.stato_pagamento === 'pagato' ? 'success' : 'warning'}>
                      {t(`iscrizioni.pagamento.${r.stato_pagamento}`)}
                    </Badge>
                  </td>

                  {/* Stato ricevuta */}
                  <td className="px-4 py-3">
                    <Badge variant={r.stato === 'emessa' ? 'neutral' : 'danger'}>
                      {t(`ricevute.stato.${r.stato}`)}
                    </Badge>
                  </td>

                  {/* Azioni */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Errore PDF */}
                      {pdfError === r.id && (
                        <span className="text-xs text-red-500 dark:text-red-400 mr-1">
                          {t('ricevute.errore_pdf')}
                        </span>
                      )}

                      {/* Visualizza PDF */}
                      <button
                        type="button"
                        onClick={() => void handleVisualizzaPdf(r)}
                        disabled={pdfLoading === r.id}
                        title={t('ricevute.azioni.visualizza')}
                        className="p-1.5 rounded-md text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors disabled:opacity-50"
                        aria-label={t('ricevute.azioni.visualizza')}
                      >
                        {pdfLoading === r.id ? (
                          <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-primary-600 animate-spin" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </button>

                      {/* Scarica PDF */}
                      <button
                        type="button"
                        onClick={() => void handleScaricaPdf(r)}
                        disabled={pdfLoading === r.id}
                        title={t('ricevute.azioni.scarica')}
                        className="p-1.5 rounded-md text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors disabled:opacity-50"
                        aria-label={t('ricevute.azioni.scarica')}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      </button>

                      {/* Annulla — solo se emessa */}
                      {r.stato === 'emessa' && (
                        <button
                          type="button"
                          onClick={() => setAnnullaTarget(r)}
                          title={t('ricevute.azioni.annulla')}
                          className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          aria-label={t('ricevute.azioni.annulla')}
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

      {/* Dialog annullamento ricevuta — invariante 5 */}
      <ConfirmDialog
        isOpen={annullaTarget !== null}
        onClose={() => setAnnullaTarget(null)}
        onConfirm={() => void handleAnnulla()}
        title={t('ricevute.annulla_dialog.titolo')}
        message={t('ricevute.annulla_dialog.messaggio')}
        confirmLabel={t('ricevute.annulla_dialog.conferma')}
        cancelLabel={t('ricevute.annulla_dialog.annulla')}
        variant="danger"
        isLoading={isAnnullando}
      />
    </div>
  )
}
