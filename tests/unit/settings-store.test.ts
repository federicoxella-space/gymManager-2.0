import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'

const TEST_USER_DATA = join(tmpdir(), `gymmanager-settings-test-${process.pid}`)

vi.mock('electron', () => ({
  app: { getPath: (_n: string) => TEST_USER_DATA, getVersion: () => '0.1.0-test' }
}))
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { loadSettings, getSettingsPath } from '../../src/main/settings/store'

beforeEach(() => {
  mkdirSync(TEST_USER_DATA, { recursive: true })
})
afterEach(() => {
  if (existsSync(TEST_USER_DATA)) rmSync(TEST_USER_DATA, { recursive: true, force: true })
})

describe('loadSettings — chiavi backup B8', () => {
  it('usa i default quando il file non esiste', () => {
    const s = loadSettings()
    expect(s.backup_dir).toBe('')
    expect(s.backup_periodic_enabled).toBe(false)
    expect(s.backup_periodic_hours).toBe(6)
    expect(s.backup_retention).toBe(10)
  })

  it('legge i valori persistiti', () => {
    writeFileSync(
      getSettingsPath(),
      JSON.stringify({
        backup_dir: 'D:/GymBackup',
        backup_periodic_enabled: true,
        backup_periodic_hours: 12,
        backup_retention: 20
      }),
      'utf-8'
    )
    const s = loadSettings()
    expect(s.backup_dir).toBe('D:/GymBackup')
    expect(s.backup_periodic_enabled).toBe(true)
    expect(s.backup_periodic_hours).toBe(12)
    expect(s.backup_retention).toBe(20)
  })
})
