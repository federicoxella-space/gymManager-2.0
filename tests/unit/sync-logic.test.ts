import { describe, it, expect } from 'vitest'
import { decideAzioneApertura, decideAzionePolling, uploadConsentito } from '../../src/main/sync/sync-logic'

describe('decideAzioneApertura', () => {
  it('nessun file remoto → primo-avvio', () =>
    expect(decideAzioneApertura({ remoteRevision: null, lastRemoteRevision: null, localDirty: false })).toBe('primo-avvio'))
  it('revisione invariata → usa-locale', () =>
    expect(decideAzioneApertura({ remoteRevision: 'r1', lastRemoteRevision: 'r1', localDirty: true })).toBe('usa-locale'))
  it('remoto avanzato + pulito → download-auto', () =>
    expect(decideAzioneApertura({ remoteRevision: 'r2', lastRemoteRevision: 'r1', localDirty: false })).toBe('download-auto'))
  it('remoto avanzato + dirty → conflitto', () =>
    expect(decideAzioneApertura({ remoteRevision: 'r2', lastRemoteRevision: 'r1', localDirty: true })).toBe('conflitto'))
})

describe('decideAzionePolling', () => {
  it('invariato → nessuna', () =>
    expect(decideAzionePolling({ remoteRevision: 'r1', lastRemoteRevision: 'r1', localDirty: true })).toBe('nessuna'))
  it('avanzato + pulito → banner-reload', () =>
    expect(decideAzionePolling({ remoteRevision: 'r2', lastRemoteRevision: 'r1', localDirty: false })).toBe('banner-reload'))
  it('avanzato + dirty → conflitto', () =>
    expect(decideAzionePolling({ remoteRevision: 'r2', lastRemoteRevision: 'r1', localDirty: true })).toBe('conflitto'))
  it('remoto null → nessuna', () =>
    expect(decideAzionePolling({ remoteRevision: null, lastRemoteRevision: 'r1', localDirty: false })).toBe('nessuna'))
})

describe('uploadConsentito', () => {
  it('remoto invariato → consentito', () => expect(uploadConsentito('r1', 'r1')).toBe(true))
  it('remoto assente → consentito', () => expect(uploadConsentito(null, 'r1')).toBe(true))
  it('remoto avanzato → negato', () => expect(uploadConsentito('r2', 'r1')).toBe(false))
  it('entrambi null → consentito (primo avvio)', () => expect(uploadConsentito(null, null)).toBe(true))
})
