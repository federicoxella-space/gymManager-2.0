/**
 * Helper per lanciare l'app Electron in Playwright.
 *
 * NOTA: richiede che l'app sia compilata (`npm run build:electron`)
 * e che non ci sia un DB esistente nella userData directory.
 * Per CI, usare una directory temporanea tramite la variabile
 * d'ambiente ELECTRON_USER_DATA_DIR.
 */

import { _electron as electron } from 'playwright-core'
import type { ElectronApplication } from 'playwright-core'
import { join } from 'path'

export { ElectronApplication }

/**
 * Lancia l'applicazione Electron per i test e2e.
 * Richiede la build in `out/main/index.js`.
 */
export async function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: [join(__dirname, '../../../out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test' }
  })
}
