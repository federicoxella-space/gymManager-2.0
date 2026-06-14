import log from 'electron-log'
import { loadSettings } from '../settings/store'
import { backupAutomatico } from './backup-service'

/** Intervallo minimo difensivo: 1 ora. */
const MIN_HOURS = 1

let timer: ReturnType<typeof setInterval> | null = null

/**
 * Converte ore in millisecondi, con un minimo difensivo di 1 ora.
 * Funzione pura, testabile.
 */
export function intervalloMs(ore: number): number {
  const h = Number.isFinite(ore) && ore >= MIN_HOURS ? Math.floor(ore) : MIN_HOURS
  return h * 3600 * 1000
}

/** Ferma il timer periodico se attivo. */
export function stopBackupScheduler(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

/**
 * (Ri)avvia lo scheduler in base alle impostazioni correnti.
 * Idempotente: ferma sempre il timer precedente prima di valutare.
 * Il primo scatto avviene dopo N ore (nessun backup immediato).
 */
export function restartBackupScheduler(): void {
  stopBackupScheduler()
  const settings = loadSettings()
  if (!settings.backup_periodic_enabled) {
    log.info('[backup] Scheduler periodico disattivato')
    return
  }
  const ms = intervalloMs(settings.backup_periodic_hours)
  timer = setInterval(() => {
    backupAutomatico()
      .then((p) => log.info(`[backup] Backup periodico completato: ${p}`))
      .catch((err) => log.warn('[backup] Backup periodico fallito (non bloccante):', err))
  }, ms)
  log.info(`[backup] Scheduler periodico attivo: ogni ${ms / 3600000}h`)
}

/** Alias di avvio iniziale (chiamato dopo l'apertura del DB). */
export function initBackupScheduler(): void {
  restartBackupScheduler()
}
