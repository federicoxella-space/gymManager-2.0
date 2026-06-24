/**
 * Test unit per sync-service.ts — orchestrazione con Drive mockato.
 *
 * drive-service, restore-service e sync-state sono mockati con vi.mock.
 * Il window viene iniettato con `initSyncService({ webContents: { send: vi.fn() } } as any)`:
 * l'uso di `as any` è ammesso SOLO nel test per il mock del BrowserWindow di Electron
 * (non disponibile in ambiente Vitest Node-only).
 *
 * Pattern di mock: vi.mock hoistato prima delle importazioni, factory con vi.fn().
 * Le implementazioni di default vengono sovrascritte per-test con mockImplementation/mockResolvedValue.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mock di electron-log ──────────────────────────────────────────────────────
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

// ── Mock di drive-service ──────────────────────────────────────────────────────
vi.mock('../../src/main/backup/drive-service', () => ({
  isDriveConnected: vi.fn(() => true),
  getOrCreateSyncFile: vi.fn(async () => 'file-id-default'),
  getSyncMetadata: vi.fn(async (_fileId: string) => ({
    revision: 'rev-remote',
    modifiedTime: '2026-06-14T10:00:00.000Z',
    size: 1024,
  })),
  uploadSync: vi.fn(async (_fileId: string, _dbPath: string) => 'rev-new'),
  downloadSync: vi.fn(async (_fileId: string, _dest: string) => undefined),
  uploadConflictCopy: vi.fn(async (_dbPath: string) => 'conflict-file-id'),
}))

// ── Mock di restore-service ────────────────────────────────────────────────────
vi.mock('../../src/main/backup/restore-service', () => ({
  eseguiRipristinoConChiaveCorrente: vi.fn(async (_path: string) => undefined),
}))

// ── Mock di sync-state ────────────────────────────────────────────────────────
vi.mock('../../src/main/sync/sync-state', () => ({
  loadSyncState: vi.fn(() => ({
    enabled: true,
    syncFileId: 'file-id-stored',
    lastRemoteRevision: 'rev-remote',   // stesso della mock getSyncMetadata → invariato
    lastLocalHash: 'hash-local',
    lastSyncAt: '2026-06-14T09:00:00.000Z',
    pollingSec: 60,
  })),
  saveSyncState: vi.fn(),
  hashDbFile: vi.fn(() => 'hash-after-sync'),
  isLocalDirty: vi.fn(() => false),
}))

// ── Mock di database (per DB_PATH) ────────────────────────────────────────────
vi.mock('../../src/main/db/database', () => ({
  DB_PATH: '/tmp/gymmanager-test.db',
}))

// Import DOPO i mock
import * as driveService from '../../src/main/backup/drive-service'
import * as restoreService from '../../src/main/backup/restore-service'
import * as syncState from '../../src/main/sync/sync-state'
import {
  initSyncService,
  getStatus,
  upload,
  checkRemote,
  resolveConflict,
  enableSync,
  disableSync,
  setPolling,
  syncOnOpen,
} from '../../src/main/sync/sync-service'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Crea un finto BrowserWindow con spy su webContents.send. */
function createFakeWindow() {
  return {
    webContents: {
      send: vi.fn(),
    },
  }
}

type FakeWindow = ReturnType<typeof createFakeWindow>

// ── Setup ─────────────────────────────────────────────────────────────────────

let fakeWin: FakeWindow

beforeEach(() => {
  vi.clearAllMocks()

  fakeWin = createFakeWindow()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initSyncService(fakeWin as any)

  // Ripristina lo stato di default dei mock (lo stato "tutto allineato")
  vi.mocked(syncState.loadSyncState).mockReturnValue({
    enabled: true,
    syncFileId: 'file-id-stored',
    lastRemoteRevision: 'rev-remote',
    lastLocalHash: 'hash-local',
    lastSyncAt: '2026-06-14T09:00:00.000Z',
    pollingSec: 60,
  })
  vi.mocked(syncState.isLocalDirty).mockReturnValue(false)
  vi.mocked(syncState.hashDbFile).mockReturnValue('hash-after-sync')
  vi.mocked(driveService.getSyncMetadata).mockResolvedValue({
    revision: 'rev-remote',
    modifiedTime: '2026-06-14T10:00:00.000Z',
    size: 1024,
  })
  vi.mocked(driveService.uploadSync).mockResolvedValue('rev-new')
  vi.mocked(driveService.downloadSync).mockResolvedValue(undefined)
  vi.mocked(driveService.uploadConflictCopy).mockResolvedValue('conflict-file-id')
  vi.mocked(restoreService.eseguiRipristinoConChiaveCorrente).mockResolvedValue(undefined)
  // Default: Drive connesso e file di sync risolvibile (precondizioni di enableSync)
  vi.mocked(driveService.isDriveConnected).mockReturnValue(true)
  vi.mocked(driveService.getOrCreateSyncFile).mockResolvedValue('file-id-default')
})

// ── Suite: getStatus ──────────────────────────────────────────────────────────

describe('getStatus', () => {
  it('ritorna lo stato corretto quando tutto è allineato', async () => {
    vi.mocked(driveService.isDriveConnected).mockReturnValue(true)
    vi.mocked(syncState.isLocalDirty).mockReturnValue(false)

    const status = await getStatus()
    expect(status.enabled).toBe(true)
    expect(status.connected).toBe(true)
    expect(status.dirty).toBe(false)
    expect(status.conflict).toBe(false)
  })

  it('ritorna dirty=true se il DB locale è stato modificato', async () => {
    vi.mocked(syncState.isLocalDirty).mockReturnValue(true)

    const status = await getStatus()
    expect(status.dirty).toBe(true)
  })

  it('ritorna connected=false se Drive non è connesso', async () => {
    vi.mocked(driveService.isDriveConnected).mockReturnValue(false)

    const status = await getStatus()
    expect(status.connected).toBe(false)
  })
})

// ── Suite: upload — remoto invariato ──────────────────────────────────────────

describe('upload: remoto invariato (uploadConsentito=true)', () => {
  it('chiama uploadSync con il fileId e DB_PATH corretti', async () => {
    // getSyncMetadata ritorna la stessa revisione di loadSyncState.lastRemoteRevision → consentito
    vi.mocked(driveService.getSyncMetadata).mockResolvedValue({
      revision: 'rev-remote',   // === lastRemoteRevision
      modifiedTime: '2026-06-14T10:00:00.000Z',
      size: 1024,
    })

    await upload()

    expect(driveService.uploadSync).toHaveBeenCalledOnce()
    expect(driveService.uploadSync).toHaveBeenCalledWith('file-id-stored', '/tmp/gymmanager-test.db')
  })

  it('salva il nuovo stato con la nuova revisione e il nuovo hash', async () => {
    vi.mocked(driveService.getSyncMetadata).mockResolvedValue({
      revision: 'rev-remote',
      modifiedTime: '2026-06-14T10:00:00.000Z',
      size: 1024,
    })
    vi.mocked(driveService.uploadSync).mockResolvedValue('rev-new')
    vi.mocked(syncState.hashDbFile).mockReturnValue('hash-after-upload')

    await upload()

    expect(syncState.saveSyncState).toHaveBeenCalledOnce()
    const savedState = vi.mocked(syncState.saveSyncState).mock.calls[0][0]
    expect(savedState.lastRemoteRevision).toBe('rev-new')
    expect(savedState.lastLocalHash).toBe('hash-after-upload')
    expect(savedState.lastSyncAt).not.toBeNull()
  })

  it('NON emette sync:conflict', async () => {
    vi.mocked(driveService.getSyncMetadata).mockResolvedValue({
      revision: 'rev-remote',
      modifiedTime: '2026-06-14T10:00:00.000Z',
      size: 1024,
    })

    await upload()

    expect(fakeWin.webContents.send).not.toHaveBeenCalledWith(
      'sync:conflict',
      expect.anything()
    )
  })
})

// ── Suite: upload — remoto avanzato ──────────────────────────────────────────

describe('upload: remoto avanzato (uploadConsentito=false)', () => {
  beforeEach(() => {
    // Il remoto ha una revisione diversa (più recente) rispetto al nostro lastRemoteRevision
    vi.mocked(driveService.getSyncMetadata).mockResolvedValue({
      revision: 'rev-advanced',   // !== 'rev-remote'
      modifiedTime: '2026-06-14T11:00:00.000Z',
      size: 2048,
    })
  })

  it('NON chiama uploadSync', async () => {
    await upload()
    expect(driveService.uploadSync).not.toHaveBeenCalled()
  })

  it('emette sync:conflict al renderer', async () => {
    await upload()
    expect(fakeWin.webContents.send).toHaveBeenCalledWith('sync:conflict', expect.anything())
  })

  it('NON salva lo stato (stato rimane invariato)', async () => {
    await upload()
    expect(syncState.saveSyncState).not.toHaveBeenCalled()
  })
})

// ── Suite: checkRemote ────────────────────────────────────────────────────────

describe('checkRemote: remoto avanzato + locale pulito → sync:remote-changed', () => {
  it('emette sync:remote-changed (banner) quando il remoto è avanzato e locale non è dirty', async () => {
    // Remoto avanzato rispetto al lastRemoteRevision
    vi.mocked(driveService.getSyncMetadata).mockResolvedValue({
      revision: 'rev-advanced',   // !== lastRemoteRevision 'rev-remote'
      modifiedTime: '2026-06-14T11:00:00.000Z',
      size: 1024,
    })
    vi.mocked(syncState.isLocalDirty).mockReturnValue(false)   // locale pulito

    await checkRemote()

    expect(fakeWin.webContents.send).toHaveBeenCalledWith(
      'sync:remote-changed',
      expect.objectContaining({ remoteRevision: 'rev-advanced' })
    )
  })
})

describe('checkRemote: remoto avanzato + locale dirty → sync:conflict', () => {
  it('emette sync:conflict quando il remoto è avanzato e locale ha modifiche', async () => {
    vi.mocked(driveService.getSyncMetadata).mockResolvedValue({
      revision: 'rev-advanced',
      modifiedTime: '2026-06-14T11:00:00.000Z',
      size: 1024,
    })
    vi.mocked(syncState.isLocalDirty).mockReturnValue(true)   // locale dirty

    await checkRemote()

    expect(fakeWin.webContents.send).toHaveBeenCalledWith('sync:conflict', expect.anything())
  })
})

describe('checkRemote: remoto invariato → nessun evento', () => {
  it('non emette eventi quando il remoto è invariato', async () => {
    // revision === lastRemoteRevision → nessuna azione
    vi.mocked(driveService.getSyncMetadata).mockResolvedValue({
      revision: 'rev-remote',   // === lastRemoteRevision
      modifiedTime: '2026-06-14T10:00:00.000Z',
      size: 1024,
    })

    await checkRemote()

    expect(fakeWin.webContents.send).not.toHaveBeenCalled()
  })
})

describe('checkRemote: sync disabilitato → non fa nulla', () => {
  it('ritorna immediatamente se enabled=false', async () => {
    vi.mocked(syncState.loadSyncState).mockReturnValue({
      enabled: false,
      syncFileId: 'file-id-stored',
      lastRemoteRevision: 'rev-remote',
      lastLocalHash: 'hash-local',
      lastSyncAt: null,
      pollingSec: 60,
    })

    await checkRemote()

    expect(driveService.getSyncMetadata).not.toHaveBeenCalled()
    expect(fakeWin.webContents.send).not.toHaveBeenCalled()
  })
})

// ── Suite: syncOnOpen ─────────────────────────────────────────────────────────

describe('syncOnOpen: download-auto quando remoto avanzato e locale pulito', () => {
  it('chiama downloadSync + eseguiRipristinoConChiaveCorrente e emette sync:reloaded', async () => {
    vi.mocked(driveService.getSyncMetadata).mockResolvedValue({
      revision: 'rev-advanced',
      modifiedTime: '2026-06-14T11:00:00.000Z',
      size: 1024,
    })
    vi.mocked(syncState.isLocalDirty).mockReturnValue(false)

    await syncOnOpen()

    expect(driveService.downloadSync).toHaveBeenCalledOnce()
    expect(restoreService.eseguiRipristinoConChiaveCorrente).toHaveBeenCalledOnce()
    expect(fakeWin.webContents.send).toHaveBeenCalledWith(
      'sync:reloaded',
      expect.objectContaining({ revision: 'rev-advanced' })
    )
  })
})

describe('syncOnOpen: conflitto quando remoto avanzato e locale dirty', () => {
  it('emette sync:conflict senza scaricare nulla', async () => {
    vi.mocked(driveService.getSyncMetadata).mockResolvedValue({
      revision: 'rev-advanced',
      modifiedTime: '2026-06-14T11:00:00.000Z',
      size: 1024,
    })
    vi.mocked(syncState.isLocalDirty).mockReturnValue(true)

    await syncOnOpen()

    expect(driveService.downloadSync).not.toHaveBeenCalled()
    expect(fakeWin.webContents.send).toHaveBeenCalledWith('sync:conflict', expect.anything())
  })
})

// ── Suite: resolveConflict ────────────────────────────────────────────────────

describe("resolveConflict('remoto')", () => {
  it('scarica il remoto, ricarica il DB e emette sync:reloaded', async () => {
    await resolveConflict('remoto')

    expect(driveService.downloadSync).toHaveBeenCalledOnce()
    expect(restoreService.eseguiRipristinoConChiaveCorrente).toHaveBeenCalledOnce()
    expect(fakeWin.webContents.send).toHaveBeenCalledWith(
      'sync:reloaded',
      expect.objectContaining({ revision: 'rev-remote' })
    )
    // Deve salvare lo stato aggiornato
    expect(syncState.saveSyncState).toHaveBeenCalledOnce()
  })
})

describe("resolveConflict('locale')", () => {
  it('forza uploadSync senza guardia e salva lo stato aggiornato', async () => {
    await resolveConflict('locale')

    expect(driveService.uploadSync).toHaveBeenCalledOnce()
    expect(driveService.uploadSync).toHaveBeenCalledWith('file-id-stored', '/tmp/gymmanager-test.db')
    // Non deve scaricare nulla
    expect(driveService.downloadSync).not.toHaveBeenCalled()
    expect(restoreService.eseguiRipristinoConChiaveCorrente).not.toHaveBeenCalled()

    const savedState = vi.mocked(syncState.saveSyncState).mock.calls[0][0]
    expect(savedState.lastRemoteRevision).toBe('rev-new')
  })
})

describe("resolveConflict('copia')", () => {
  it('chiama uploadConflictCopy, poi scarica il remoto e ricarica il DB', async () => {
    await resolveConflict('copia')

    // Prima carica la copia di conflitto
    expect(driveService.uploadConflictCopy).toHaveBeenCalledOnce()
    expect(driveService.uploadConflictCopy).toHaveBeenCalledWith('/tmp/gymmanager-test.db')

    // Poi adotta il remoto
    expect(driveService.downloadSync).toHaveBeenCalledOnce()
    expect(restoreService.eseguiRipristinoConChiaveCorrente).toHaveBeenCalledOnce()
    expect(fakeWin.webContents.send).toHaveBeenCalledWith('sync:reloaded', expect.anything())
  })

  it("l'ordine è: getSyncMetadata → uploadConflictCopy → (getSyncMetadata fresh) → downloadSync → reload", async () => {
    const order: string[] = []
    vi.mocked(driveService.uploadConflictCopy).mockImplementation(async () => {
      order.push('uploadConflictCopy')
      return 'conflict-file-id'
    })
    vi.mocked(driveService.getSyncMetadata).mockImplementation(async () => {
      order.push('getSyncMetadata')
      return { revision: 'rev-remote', modifiedTime: '2026-06-14T10:00:00.000Z', size: 1024 }
    })
    vi.mocked(driveService.downloadSync).mockImplementation(async () => {
      order.push('downloadSync')
    })
    vi.mocked(restoreService.eseguiRipristinoConChiaveCorrente).mockImplementation(async () => {
      order.push('reload')
    })

    await resolveConflict('copia')

    // uploadConflictCopy viene dopo il primo getSyncMetadata (che risolve fileId+meta)
    const idxUploadConflict = order.indexOf('uploadConflictCopy')
    const idxFirstGetMeta = order.indexOf('getSyncMetadata')
    expect(idxFirstGetMeta).toBeGreaterThanOrEqual(0)
    expect(idxUploadConflict).toBeGreaterThan(idxFirstGetMeta)

    // downloadSync e reload avvengono dopo uploadConflictCopy
    const idxDownload = order.indexOf('downloadSync')
    const idxReload = order.indexOf('reload')
    expect(idxDownload).toBeGreaterThan(idxUploadConflict)
    expect(idxReload).toBeGreaterThan(idxDownload)
  })
})

// ── Suite: enableSync / disableSync / setPolling ──────────────────────────────

describe('enableSync', () => {
  it('lancia SYNC_DRIVE_NON_CONNESSO se Drive non è connesso, senza abilitare', async () => {
    vi.mocked(driveService.isDriveConnected).mockReturnValue(false)
    vi.mocked(syncState.loadSyncState).mockReturnValue({
      enabled: false,
      syncFileId: null,
      lastRemoteRevision: null,
      lastLocalHash: null,
      lastSyncAt: null,
      pollingSec: 60,
    })

    await expect(enableSync()).rejects.toThrow('SYNC_DRIVE_NON_CONNESSO')
    // Non deve aver tentato di creare il file di sync né salvato enabled=true
    expect(driveService.getOrCreateSyncFile).not.toHaveBeenCalled()
    expect(syncState.saveSyncState).not.toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    )
  })

  it('in caso di errore su getOrCreateSyncFile fa rollback (enabled=false) e rilancia', async () => {
    vi.mocked(driveService.isDriveConnected).mockReturnValue(true)
    vi.mocked(syncState.loadSyncState).mockReturnValue({
      enabled: false,
      syncFileId: null,
      lastRemoteRevision: null,
      lastLocalHash: null,
      lastSyncAt: null,
      pollingSec: 60,
    })
    vi.mocked(driveService.getOrCreateSyncFile).mockRejectedValue(new Error('rete KO'))

    await expect(enableSync()).rejects.toThrow('rete KO')
    // Rollback: l'ultimo salvataggio riporta enabled=false
    expect(syncState.saveSyncState).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })

  it('salva lo stato con enabled=true', async () => {
    vi.mocked(syncState.loadSyncState).mockReturnValue({
      enabled: false,
      syncFileId: null,
      lastRemoteRevision: null,
      lastLocalHash: null,
      lastSyncAt: null,
      pollingSec: 60,
    })
    // Nessun file remoto con contenuto → getSyncMetadata ritorna revision 'rev-new' (simula file vuoto già creato)
    // ma lastRemoteRevision === null, quindi controlliamo il path "primo avvio con file remoto esistente"
    vi.mocked(driveService.getOrCreateSyncFile).mockResolvedValue('new-file-id')
    vi.mocked(driveService.getSyncMetadata).mockResolvedValue({
      revision: 'rev-existing',
      modifiedTime: '2026-06-14T09:00:00.000Z',
      size: 512,
    })

    await enableSync()

    // Deve aver salvato lo stato con enabled=true
    const calls = vi.mocked(syncState.saveSyncState).mock.calls
    const firstCall = calls[0][0]
    expect(firstCall.enabled).toBe(true)
  })

  it('emette sync:conflict se il remoto ha già contenuto e mai sincronizzato (primo avvio)', async () => {
    vi.mocked(syncState.loadSyncState).mockReturnValue({
      enabled: false,
      syncFileId: null,
      lastRemoteRevision: null,   // mai sincronizzato
      lastLocalHash: null,
      lastSyncAt: null,
      pollingSec: 60,
    })
    vi.mocked(driveService.getOrCreateSyncFile).mockResolvedValue('new-file-id')
    vi.mocked(driveService.getSyncMetadata).mockResolvedValue({
      revision: 'rev-existing',   // file remoto con contenuto
      modifiedTime: '2026-06-14T09:00:00.000Z',
      size: 512,
    })

    await enableSync()

    expect(fakeWin.webContents.send).toHaveBeenCalledWith(
      'sync:conflict',
      expect.objectContaining({ reason: 'first-run' })
    )
  })
})

describe('disableSync', () => {
  it('salva lo stato con enabled=false', async () => {
    await disableSync()

    const savedState = vi.mocked(syncState.saveSyncState).mock.calls[0][0]
    expect(savedState.enabled).toBe(false)
  })
})

describe('setPolling', () => {
  it('aggiorna pollingSec nello stato', () => {
    setPolling(120)

    expect(syncState.saveSyncState).toHaveBeenCalledOnce()
    const savedState = vi.mocked(syncState.saveSyncState).mock.calls[0][0]
    expect(savedState.pollingSec).toBe(120)
  })
})
