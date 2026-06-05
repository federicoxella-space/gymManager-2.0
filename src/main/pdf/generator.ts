/**
 * Generazione PDF tramite Electron (webContents.printToPDF).
 * Questo modulo dipende da Electron — NON importarlo nei test unitari.
 * La logica di rendering HTML è in src/main/domain/ricevuta.ts (pura, testabile).
 */

import { BrowserWindow } from 'electron'
import log from 'electron-log'

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
