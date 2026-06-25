/**
 * Generazione PDF tramite Electron (webContents.printToPDF).
 * Questo modulo dipende da Electron — NON importarlo nei test unitari.
 * La logica di rendering HTML è in src/main/domain/ricevuta.ts (pura, testabile).
 */

import { BrowserWindow } from 'electron'
import log from 'electron-log'
import { LOGO_MAX_WIDTH_PX, LOGO_MAX_HEIGHT_PX } from '../domain/ricevuta'

/**
 * Tetto di Chromium sulla lunghezza di una URL di navigazione
 * (`url::kMaxURLChars`). `loadURL` rifiuta URL più lunghe e la
 * generazione del PDF fallisce. Il PDF è caricato come `data:text/html;base64,…`,
 * quindi tutto l'HTML (logo incluso, presente in DUE copie) deve stare sotto
 * questo limite una volta codificato in base64.
 */
export const CHROMIUM_MAX_URL_CHARS = 2 * 1024 * 1024 // 2.097.152

/**
 * Limite di sicurezza in export per la data-URL dell'HTML: lasciamo un margine
 * sotto il tetto hard di Chromium per il prefisso `data:text/html;base64,` e per
 * eventuale overhead. Se la data-URL lo supera, l'errore più probabile è un
 * **logo troppo grande** (è la voce di gran lunga più pesante dell'HTML).
 */
export const PDF_DATA_URL_MAX_CHARS = 1_900_000

/**
 * Genera un PDF a partire dall'HTML fornito usando `webContents.printToPDF`.
 *
 * Crea una BrowserWindow nascosta, carica l'HTML come data URI,
 * attende il completamento del caricamento, produce il PDF e chiude la finestra.
 *
 * Opzioni PDF: A4, sfondo stampato, margini di default del browser.
 */
export async function generaPDFInElectron(html: string): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    width: 794,  // ~A4 a 96 dpi
    height: 1123,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      javascript: false,
    },
  })

  try {
    // Codifica l'HTML come data URI; base64 gestisce caratteri speciali e lunghezze elevate
    const encoded = Buffer.from(html, 'utf-8').toString('base64')
    const dataUrl = `data:text/html;base64,${encoded}`

    // Guardia: oltre il limite, loadURL fallirebbe in modo opaco. Diamo un errore
    // chiaro e attribuibile (quasi sempre = logo troppo grande).
    if (dataUrl.length > PDF_DATA_URL_MAX_CHARS) {
      throw new Error(
        `Documento troppo grande per la generazione del PDF (${dataUrl.length} caratteri, ` +
          `limite ${PDF_DATA_URL_MAX_CHARS}). Causa probabile: logo troppo grande. ` +
          `Carica un logo più leggero (consigliato fino a ${LOGO_MAX_WIDTH_PX}×${LOGO_MAX_HEIGHT_PX} px).`
      )
    }

    await win.loadURL(dataUrl)

    const pdfBuffer = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
    })

    log.info('[pdf] PDF generato, dimensione:', pdfBuffer.length, 'byte')
    return Buffer.from(pdfBuffer)
  } catch (err) {
    log.error('[pdf] Errore generazione PDF:', err)
    throw err instanceof Error ? err : new Error('Errore durante la generazione del PDF')
  } finally {
    if (!win.isDestroyed()) {
      win.close()
    }
  }
}
