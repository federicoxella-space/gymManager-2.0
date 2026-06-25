/**
 * Ridimensionamento del logo lato renderer, prima del salvataggio.
 *
 * Perché: il logo viene mostrato nella ricevuta in un box di al massimo
 * LOGO_MAX_WIDTH_PX × LOGO_MAX_HEIGHT_PX. Riducendolo a quel box:
 *   1. la data-URL dell'HTML resta sotto il limite di Chromium in fase di
 *      generazione PDF (il logo è incluso DUE volte nel documento);
 *   2. il formato viene normalizzato a PNG, supportato dal renderer di stampa
 *      (così un HEIC/TIFF non decodificabile viene segnalato come errore chiaro).
 *
 * Il rapporto d'aspetto è SEMPRE preservato: si applica un solo fattore di scala
 * `min(maxW/w, maxH/h, 1)` a entrambe le dimensioni — solo downscale, mai upscale.
 * Quindi 360×192 è il box massimo, non una dimensione imposta: un logo non viene
 * mai deformato.
 *
 * NB: dimensioni allineate a src/main/domain/ricevuta.ts (LOGO_MAX_WIDTH_PX /
 * LOGO_MAX_HEIGHT_PX), che resta la SORGENTE. Sono duplicate qui perché i bundle
 * main e renderer sono separati. Mantenere i due valori in sincronia.
 */

export const LOGO_MAX_WIDTH_PX = 360
export const LOGO_MAX_HEIGHT_PX = 192

/**
 * Calcola le dimensioni di destinazione del logo dentro il box massimo,
 * preservando il rapporto d'aspetto.
 *
 * Applica UN SOLO fattore di scala a entrambi i lati — `min(maxW/w, maxH/h, 1)`:
 *   - lo stesso fattore su width e height ⇒ il rapporto d'aspetto resta invariato;
 *   - il cap a 1 ⇒ solo downscale, mai upscale (niente sgranatura di loghi piccoli).
 *
 * Funzione pura (niente DOM) per essere testabile.
 */
export function calcolaDimensioniLogo(
  larghezza: number,
  altezza: number,
  maxW: number = LOGO_MAX_WIDTH_PX,
  maxH: number = LOGO_MAX_HEIGHT_PX
): { width: number; height: number } {
  if (larghezza <= 0 || altezza <= 0) return { width: 0, height: 0 }
  const scala = Math.min(maxW / larghezza, maxH / altezza, 1)
  return {
    width: Math.max(1, Math.round(larghezza * scala)),
    height: Math.max(1, Math.round(altezza * scala))
  }
}

/**
 * Legge un file immagine, lo ridimensiona dentro il box mantenendo il rapporto
 * d'aspetto e restituisce una data-URL PNG.
 *
 * @throws Error('LOGO_FORMATO_NON_SUPPORTATO') se il browser non sa decodificare l'immagine
 * @throws Error('LOGO_LETTURA_FALLITA') se la lettura del file fallisce
 */
export async function ridimensionaLogo(file: File): Promise<string> {
  const dataUrl = await leggiComeDataUrl(file)
  const img = await caricaImmagine(dataUrl)

  const { width: w, height: h } = calcolaDimensioniLogo(img.width, img.height)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('LOGO_CANVAS_NON_DISPONIBILE')
  ctx.drawImage(img, 0, 0, w, h)

  // PNG: preserva la trasparenza tipica dei loghi; a ≤360×192 px il peso è minimo.
  return canvas.toDataURL('image/png')
}

function leggiComeDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (): void => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('LOGO_LETTURA_FALLITA'))
    }
    reader.onerror = (): void => reject(new Error('LOGO_LETTURA_FALLITA'))
    reader.readAsDataURL(file)
  })
}

function caricaImmagine(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = (): void => resolve(img)
    img.onerror = (): void => reject(new Error('LOGO_FORMATO_NON_SUPPORTATO'))
    img.src = dataUrl
  })
}
