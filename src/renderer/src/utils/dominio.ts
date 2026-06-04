/**
 * Funzioni di utilità di dominio condivise nel renderer.
 * Non importano da main/domain per rispettare il confine di processo.
 */

/**
 * Determina se la data di nascita corrisponde a un minorenne
 * (cioè non ha ancora compiuto 18 anni alla data odierna).
 */
export function isMinorenne(dataNascita: string | null | undefined): boolean {
  if (!dataNascita) return false
  const nascita = new Date(dataNascita)
  if (isNaN(nascita.getTime())) return false
  const oggi = new Date()
  const anni18fa = new Date(oggi.getFullYear() - 18, oggi.getMonth(), oggi.getDate())
  return nascita > anni18fa
}
