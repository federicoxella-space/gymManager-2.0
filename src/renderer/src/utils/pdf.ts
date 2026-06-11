/** Apre un PDF (stringa base64) in una nuova finestra del browser. */
export function apriPdfBase64(base64: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}
