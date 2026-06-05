import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app } from 'electron'
import log from 'electron-log'
import type { AppSettings } from '../../types/shared'

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'it',
  primaryColor: '59,130,246',
  expiry_warning_days_certificates: 30,
  dicitura_pie: '',
  receipt_start_number: 1
}

export function getSettingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/**
 * Carica le impostazioni dal file JSON su disco.
 * Se il file non esiste o non è parsabile, restituisce i valori di default.
 */
export function loadSettings(): AppSettings {
  const filePath = getSettingsPath()

  if (!existsSync(filePath)) {
    log.info('[settings] File impostazioni non trovato, uso defaults')
    return { ...DEFAULT_SETTINGS }
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>

    return {
      theme: parsed.theme ?? DEFAULT_SETTINGS.theme,
      language: parsed.language ?? DEFAULT_SETTINGS.language,
      primaryColor: parsed.primaryColor ?? DEFAULT_SETTINGS.primaryColor,
      expiry_warning_days_certificates:
        parsed.expiry_warning_days_certificates ??
        DEFAULT_SETTINGS.expiry_warning_days_certificates,
      dicitura_pie: parsed.dicitura_pie ?? DEFAULT_SETTINGS.dicitura_pie,
      receipt_start_number: parsed.receipt_start_number ?? DEFAULT_SETTINGS.receipt_start_number
    }
  } catch (err) {
    log.error('[settings] Errore lettura impostazioni, uso defaults:', err)
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * Salva le impostazioni su file JSON.
 */
export function saveSettings(settings: AppSettings): void {
  const filePath = getSettingsPath()
  try {
    writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
    log.info('[settings] Impostazioni salvate')
  } catch (err) {
    log.error('[settings] Errore salvataggio impostazioni:', err)
    throw new Error('Impossibile salvare le impostazioni')
  }
}
