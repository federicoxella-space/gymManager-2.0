import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImportPreview } from '../../../../types/shared'
import Modal from '../ui/Modal'

interface ImportClientiDialogProps {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}

type Step = 'seleziona' | 'anteprima' | 'esito'

export default function ImportClientiDialog({
  isOpen,
  onClose,
  onImported,
}: ImportClientiDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  const [step, setStep] = useState<Step>('seleziona')
  const [filePath, setFilePath] = useState<string>('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [report, setReport] = useState<{ importati: number; saltati: number; errori: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string>('')

  function reset(): void {
    setStep('seleziona')
    setFilePath('')
    setPreview(null)
    setReport(null)
    setBusy(false)
    setErrore('')
  }

  function handleClose(): void {
    reset()
    onClose()
  }

  async function handleScegliFile(): Promise<void> {
    setErrore('')
    const res = await window.api.dialog.showOpenDialog({
      title: t('clienti.import.seleziona_file'),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile'],
    })
    if (res.canceled || res.filePaths.length === 0) return
    const path = res.filePaths[0]
    setFilePath(path)
    setBusy(true)
    try {
      const p = await window.api.clienti.import.analizza(path)
      setPreview(p)
      setStep('anteprima')
    } catch {
      setErrore(t('clienti.import.errore_analisi'))
    } finally {
      setBusy(false)
    }
  }

  async function handleScaricaModello(): Promise<void> {
    setErrore('')
    const res = await window.api.dialog.showSaveDialog({
      title: t('clienti.import.scarica_modello'),
      defaultPath: 'modello-clienti.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })
    if (res.canceled || !res.filePath) return
    try {
      await window.api.clienti.import.template(res.filePath)
    } catch {
      setErrore(t('clienti.import.errore_analisi'))
    }
  }

  async function handleConferma(): Promise<void> {
    if (!filePath) return
    setBusy(true)
    setErrore('')
    try {
      const r = await window.api.clienti.import.esegui(filePath)
      setReport(r)
      setStep('esito')
      onImported()
    } catch {
      setErrore(t('clienti.import.errore_import'))
    } finally {
      setBusy(false)
    }
  }

  const scarti = preview?.righe.filter((r) => r.esito !== 'nuovo') ?? []

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('clienti.import.titolo')} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {errore && (
          <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700" role="alert">
            {errore}
          </div>
        )}

        {step === 'seleziona' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('clienti.import.riepilogo')}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={handleScegliFile}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-50"
              >
                {busy ? t('clienti.import.analisi_in_corso') : t('clienti.import.seleziona_file')}
              </button>
              <button
                type="button"
                onClick={handleScaricaModello}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {t('clienti.import.scarica_modello')}
              </button>
            </div>
          </div>
        )}

        {step === 'anteprima' && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Contatore label={t('clienti.import.totali')} valore={preview.totali} />
              <Contatore label={t('clienti.import.nuovi')} valore={preview.nuovi} accent="text-green-600 dark:text-green-400" />
              <Contatore label={t('clienti.import.duplicati')} valore={preview.duplicati} />
              <Contatore label={t('clienti.import.errori')} valore={preview.errori} accent="text-red-600 dark:text-red-400" />
            </div>

            {scarti.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {t('clienti.import.dettaglio_scarti')}
                </h3>
                <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">{t('clienti.import.colonna_riga')}</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">{t('clienti.import.colonna_cf')}</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">{t('clienti.import.colonna_motivo')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scarti.map((r) => (
                        <tr key={r.riga} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{r.riga}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{r.cf ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{r.messaggio}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {t('clienti.import.annulla')}
              </button>
              <button
                type="button"
                disabled={busy || preview.nuovi === 0}
                onClick={handleConferma}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-50"
              >
                {preview.nuovi === 0
                  ? t('clienti.import.nessun_nuovo')
                  : busy
                    ? t('clienti.import.import_in_corso')
                    : t('clienti.import.conferma_import', { count: preview.nuovi })}
              </button>
            </div>
          </div>
        )}

        {step === 'esito' && report && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('clienti.import.esito_titolo')}
            </h3>
            <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
              <li>{t('clienti.import.esito_importati', { count: report.importati })}</li>
              <li>{t('clienti.import.esito_saltati', { count: report.saltati })}</li>
              <li>{t('clienti.import.esito_errori', { count: report.errori })}</li>
            </ul>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
              >
                {t('clienti.import.chiudi')}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function Contatore({
  label,
  valore,
  accent,
}: {
  label: string
  valore: number
  accent?: string
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <div className={`text-2xl font-semibold ${accent ?? 'text-gray-900 dark:text-gray-100'}`}>{valore}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</div>
    </div>
  )
}
