import { ipcMain } from 'electron'
import type { CredentialVault } from '../services/credential-vault'
import type { PlatformCode } from '../../shared/contracts'

interface HandlerDependencies {
  menuRepository: { list: () => unknown[]; upsert: (payload: unknown) => void }
  mappingRepository: { listAll: () => unknown[]; upsert: (payload: unknown) => void }
  syncRunRepository: { list: () => unknown[] }
  credentialVault: CredentialVault
  syncEngine?: { run: (items: unknown[]) => Promise<unknown> }
  buildSyncPreview?: () => unknown
}

export const registerHandlers = ({
  menuRepository,
  mappingRepository,
  syncRunRepository,
  credentialVault,
  syncEngine,
  buildSyncPreview
}: HandlerDependencies) => {
  ipcMain.handle('menus:list', async () => menuRepository.list())
  ipcMain.handle('menus:save', async (_event, payload) => {
    menuRepository.upsert(payload)
    return { ok: true }
  })

  ipcMain.handle('mappings:list', async () => mappingRepository.listAll())
  ipcMain.handle('mappings:save', async (_event, payload) => {
    mappingRepository.upsert(payload)
    return { ok: true }
  })

  ipcMain.handle('syncRuns:list', async () => syncRunRepository.list())

  ipcMain.handle('settings:get-platform-credential-status', async () => {
    const platforms: PlatformCode[] = ['baemin', 'coupangeats', 'ddangyo']
    return platforms.map((platformCode) => ({
      platformCode,
      connected: Boolean(credentialVault.get(platformCode))
    }))
  })

  ipcMain.handle('settings:save-platform-credential', async (_event, payload) => {
    credentialVault.set(payload.platformCode as PlatformCode, payload.username, payload.password)
    return { ok: true }
  })

  ipcMain.handle('sync:preview', async () => buildSyncPreview?.() ?? { items: [], needsReview: [] })
  ipcMain.handle('sync:run', async () => {
    const preview = buildSyncPreview?.() as { items: unknown[] } | undefined
    return syncEngine?.run(preview?.items ?? []) ?? { syncRunId: null, summary: '0 succeeded, 0 failed' }
  })
}
