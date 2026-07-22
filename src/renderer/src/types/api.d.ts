/**
 * Tipizzazione globale di `window.api` nel renderer.
 *
 * L'unica fonte di verità dei tipi condivisi (incluso `ElectronAPI`) è
 * `src/types/shared.ts`: qui la importiamo e la agganciamo all'oggetto globale
 * `Window`, senza ridichiarare/duplicare le definizioni. Aggiungere o modificare
 * un metodo dell'API si fa quindi in un solo posto (`shared.ts`).
 */
import type { ElectronAPI } from '../../../types/shared'

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
