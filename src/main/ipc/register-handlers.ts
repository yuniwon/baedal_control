import { ipcMain } from 'electron'
import type { CredentialVault } from '../services/credential-vault'
import type {
  MenuRecord,
  PlatformCode,
  PlatformMenuMappingRecord,
  SyncPreviewItem
} from '../../shared/contracts'
import { buildSyncPreview } from '../services/sync-planner'

interface HandlerDependencies {
  menuRepository: { list: () => MenuRecord[]; upsert: (payload: MenuRecord) => void }
  mappingRepository: {
    listAll: () => PlatformMenuMappingRecord[]
    upsert: (payload: PlatformMenuMappingRecord) => void
  }
  syncRunRepository: { list: () => unknown[] }
  credentialVault: CredentialVault
  syncEngine?: { run: (items: SyncPreviewItem[]) => Promise<unknown> }
  onCredentialSaved?: (platformCode: PlatformCode) => void
}

export const registerHandlers = ({
  menuRepository,
  mappingRepository,
  syncRunRepository,
  credentialVault,
  syncEngine,
  onCredentialSaved
}: HandlerDependencies) => {
  const register = (
    channel: string,
    handler: Parameters<typeof ipcMain.handle>[1]
  ) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, handler)
  }

  register('menus:list', async () => menuRepository.list())
  register('menus:save', async (_event, payload) => {
    menuRepository.upsert(payload)
    return { ok: true }
  })

  register('mappings:list', async () => mappingRepository.listAll())
  register('mappings:save', async (_event, payload) => {
    mappingRepository.upsert(payload)
    return { ok: true }
  })

  register('syncRuns:list', async () => syncRunRepository.list())

  register('settings:get-platform-credential-status', async () => {
    const platforms: PlatformCode[] = ['baemin', 'coupangeats', 'ddangyo']
    return platforms.map((platformCode) => ({
      platformCode,
      connected: Boolean(credentialVault.get(platformCode))
    }))
  })

  register('settings:save-platform-credential', async (_event, payload) => {
    const platformCode = payload.platformCode as PlatformCode
    credentialVault.set(platformCode, payload.username, payload.password)
    onCredentialSaved?.(platformCode)
    return { ok: true }
  })

  register('sync:preview', async () =>
    buildSyncPreview({
      menus: menuRepository.list(),
      mappings: mappingRepository.listAll()
    })
  )

  register('sync:run', async () => {
    const preview = buildSyncPreview({
      menus: menuRepository.list(),
      mappings: mappingRepository.listAll()
    })

    return syncEngine?.run(preview.items) ?? { syncRunId: null, summary: '0 succeeded, 0 failed' }
  })
}
