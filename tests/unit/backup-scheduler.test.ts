import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const settingsMock = vi.hoisted(() => ({ value: { backup_periodic_enabled: false, backup_periodic_hours: 6 } }))

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))
vi.mock('../../src/main/settings/store', () => ({
  loadSettings: () => settingsMock.value
}))
const backupSpy = vi.fn().mockResolvedValue('/tmp/backup_x.db')
vi.mock('../../src/main/backup/backup-service', () => ({
  backupAutomatico: (...args: unknown[]) => backupSpy(...args)
}))

import { intervalloMs, initBackupScheduler, restartBackupScheduler, stopBackupScheduler } from '../../src/main/backup/backup-scheduler'

beforeEach(() => {
  vi.useFakeTimers()
  backupSpy.mockClear()
  settingsMock.value = { backup_periodic_enabled: false, backup_periodic_hours: 6 }
})
afterEach(() => {
  stopBackupScheduler()
  vi.useRealTimers()
})

describe('intervalloMs', () => {
  it('converte ore in ms', () => {
    expect(intervalloMs(6)).toBe(6 * 3600 * 1000)
  })
  it('applica un minimo difensivo (>= 1 ora)', () => {
    expect(intervalloMs(0)).toBe(3600 * 1000)
    expect(intervalloMs(-5)).toBe(3600 * 1000)
  })
})

describe('scheduler enable/disable', () => {
  it('non programma nulla se disabilitato', () => {
    settingsMock.value = { backup_periodic_enabled: false, backup_periodic_hours: 1 }
    initBackupScheduler()
    vi.advanceTimersByTime(3600 * 1000 * 2)
    expect(backupSpy).not.toHaveBeenCalled()
  })

  it('esegue un backup a ogni intervallo se abilitato', () => {
    settingsMock.value = { backup_periodic_enabled: true, backup_periodic_hours: 1 }
    initBackupScheduler()
    expect(backupSpy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3600 * 1000)
    expect(backupSpy).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3600 * 1000)
    expect(backupSpy).toHaveBeenCalledTimes(2)
  })

  it('restart con disabilitato ferma il timer', () => {
    settingsMock.value = { backup_periodic_enabled: true, backup_periodic_hours: 1 }
    initBackupScheduler()
    settingsMock.value = { backup_periodic_enabled: false, backup_periodic_hours: 1 }
    restartBackupScheduler()
    vi.advanceTimersByTime(3600 * 1000 * 3)
    expect(backupSpy).not.toHaveBeenCalled()
  })
})
