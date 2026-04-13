import { ipcMain } from 'electron'
import type { CredentialVault } from '../services/credential-vault'
import type {
  PlatformImportResult,
  MenuRecord,
  PlatformCode,
  PlatformImportSummary,
  PlatformInspectionReport,
  PlatformImportChangeRecord,
  PlatformImportRunRecord,
  LogicalOptionGroupRecord,
  PlatformMenuCatalogRecord,
  PlatformOptionGroupRecord,
  PlatformMenuMappingRecord,
  SyncPreviewItem,
  SyncRunItemRecord,
  SyncRunRecord
} from '../../shared/contracts'
import { buildSyncPreview } from '../services/sync-planner'

interface HandlerDependencies {
  menuRepository: {
    list: () => MenuRecord[]
    upsert: (payload: MenuRecord) => void
    remove?: (menuId: string) => void
  }
  mappingRepository: {
    listAll: () => PlatformMenuMappingRecord[]
    listForMenu?: (menuId: string) => PlatformMenuMappingRecord[]
    upsert: (payload: PlatformMenuMappingRecord) => void
    remove?: (mappingId: string) => void
  }
  platformMenuRepository: { listAll: () => PlatformMenuCatalogRecord[] }
  platformOptionGroupRepository?: { listAll: () => PlatformOptionGroupRecord[] }
  platformImportRunRepository?: { listLatest: (limit?: number) => PlatformImportRunRecord[] }
  platformImportChangeRepository?: { listLatest: (limit?: number) => PlatformImportChangeRecord[] }
  logicalOptionGroupService?: { list: () => LogicalOptionGroupRecord[] }
  syncRunRepository: { list: () => SyncRunRecord[] }
  syncRunItemRepository?: { listForRunIds: (syncRunIds: string[]) => SyncRunItemRecord[] }
  credentialVault: CredentialVault
  platformMenuImporter?: { importPlatform: (platformCode: PlatformCode) => Promise<PlatformImportResult> }
  syncEngine?: { run: (items: SyncPreviewItem[]) => Promise<unknown> }
  onCredentialSaved?: (platformCode: PlatformCode) => void
}

export const registerHandlers = ({
  menuRepository,
  mappingRepository,
  platformMenuRepository,
  platformOptionGroupRepository,
  platformImportRunRepository,
  platformImportChangeRepository,
  logicalOptionGroupService,
  syncRunRepository,
  syncRunItemRepository,
  credentialVault,
  platformMenuImporter,
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

  const getSyncPreviewItemKey = (item: SyncPreviewItem) =>
    JSON.stringify({
      platformCode: item.platformCode,
      menuId: item.menuId,
      platformMenuId: item.platformMenuId,
      previousName: item.previousName,
      previousPrice: item.previousPrice ?? null,
      nextName: item.nextName,
      nextPrice: item.nextPrice
    })

  const normalizeListLimit = (value: unknown, defaultLimit = 50, maxLimit = 200) => {
    const numericLimit = typeof value === 'number' ? value : Number.NaN

    if (!Number.isFinite(numericLimit) || numericLimit <= 0) {
      return defaultLimit
    }

    return Math.min(Math.floor(numericLimit), maxLimit)
  }

  register('menus:list', async () => menuRepository.list())
  register('menus:save', async (_event, payload) => {
    menuRepository.upsert(payload)
    return { ok: true }
  })
  register('menus:delete', async (_event, menuId) => {
    const menuMappings = mappingRepository.listForMenu?.(menuId as string) ?? []

    if (menuMappings.length > 0) {
      return {
        ok: false,
        error: 'menu_has_mappings'
      }
    }

    menuRepository.remove?.(menuId as string)
    return { ok: true }
  })

  register('mappings:list', async () => mappingRepository.listAll())
  register('platformOptionGroups:list', async () => platformOptionGroupRepository?.listAll() ?? [])
  register('logicalOptionGroups:list', async () => logicalOptionGroupService?.list() ?? [])
  register('platformMenus:list', async () => platformMenuRepository.listAll())
  register('platformImportRuns:list', async (_event, limit?: number) =>
    platformImportRunRepository?.listLatest(normalizeListLimit(limit)) ?? []
  )
  register('platformImportChanges:listLatest', async (_event, limit?: number) =>
    platformImportChangeRepository?.listLatest(normalizeListLimit(limit)) ?? []
  )
  register('mappings:save', async (_event, payload) => {
    mappingRepository.upsert(payload)
    return { ok: true }
  })
  register('mappings:delete', async (_event, mappingId) => {
    mappingRepository.remove?.(mappingId as string)
    return { ok: true }
  })

  register('syncRuns:list', async () => {
    const runs = syncRunRepository.list()
    const syncRunIds = runs.map((run) => run.syncRunId)
    const items = syncRunItemRepository?.listForRunIds(syncRunIds) ?? []
    const itemsByRunId = new Map<string, SyncRunItemRecord[]>()

    for (const item of items) {
      const group = itemsByRunId.get(item.syncRunId) ?? []
      group.push(item)
      itemsByRunId.set(item.syncRunId, group)
    }

    return runs.map((run) => ({
      ...run,
      items: itemsByRunId.get(run.syncRunId) ?? []
    }))
  })

  register('settings:get-platform-credential-status', async () => {
    const platforms: PlatformCode[] = ['baemin', 'coupangeats', 'ddangyo']
    return platforms.map((platformCode) => ({
      platformCode,
      connected: Boolean(credentialVault.get(platformCode))
    }))
  })

  register('settings:list-platform-credentials', async () => {
    const platforms: PlatformCode[] = ['baemin', 'coupangeats', 'ddangyo']
    return platforms.map((platformCode) => {
      const credential = credentialVault.get(platformCode)
      return {
        platformCode,
        connected: Boolean(credential),
        username: credential?.username ?? '',
        password: credential?.password ?? ''
      }
    })
  })

  const runPlatformImport = async (platformCode: PlatformCode) => {
    try {
      const importResult = await platformMenuImporter?.importPlatform(platformCode)
      return {
        ok: true as const,
        importSummary: importResult?.summary as PlatformImportSummary | undefined,
        importInspection: importResult?.inspection as PlatformInspectionReport | undefined
      }
    } catch (error) {
      return {
        ok: true as const,
        importError: error instanceof Error ? error.message : 'unknown_error'
      }
    }
  }

  register('settings:save-platform-credential', async (_event, payload) => {
    const platformCode = payload.platformCode as PlatformCode
    credentialVault.set(platformCode, payload.username, payload.password)
    onCredentialSaved?.(platformCode)

    return runPlatformImport(platformCode)
  })

  register('settings:import-platform-menus', async (_event, payload) => {
    const platformCode = payload.platformCode as PlatformCode
    if (!credentialVault.get(platformCode)) {
      return {
        ok: true as const,
        importError: 'credential_not_found'
      }
    }

    return runPlatformImport(platformCode)
  })

  register('sync:preview', async () =>
    buildSyncPreview({
      menus: menuRepository.list(),
      mappings: mappingRepository.listAll(),
      platformMenus: platformMenuRepository.listAll()
    })
  )

  register('sync:run', async () => {
    const preview = buildSyncPreview({
      menus: menuRepository.list(),
      mappings: mappingRepository.listAll(),
      platformMenus: platformMenuRepository.listAll()
    })

    return syncEngine?.run(preview.items) ?? { syncRunId: null, summary: '0 succeeded, 0 failed' }
  })

  register('sync:run-items', async (_event, payload) => {
    const requestedItems = Array.isArray(payload) ? (payload as SyncPreviewItem[]) : []
    const preview = buildSyncPreview({
      menus: menuRepository.list(),
      mappings: mappingRepository.listAll(),
      platformMenus: platformMenuRepository.listAll()
    })
    const executableItemKeys = new Set(preview.items.map(getSyncPreviewItemKey))
    const executableItems = requestedItems.filter((item) =>
      executableItemKeys.has(getSyncPreviewItemKey(item))
    )
    const skippedCount = requestedItems.length - executableItems.length

    if (executableItems.length === 0) {
      return {
        syncRunId: null,
        summary: `실행 가능 0건, 제외 ${skippedCount}건`,
        skippedCount
      }
    }

    const result = ((await syncEngine?.run(executableItems)) as
      | { syncRunId: string | null; summary: string }
      | undefined) ?? {
      syncRunId: null,
      summary: '성공 0건, 실패 0건'
    }

    if (skippedCount === 0) {
      return result
    }

    return {
      ...result,
      summary: `${result.summary} · 제외 ${skippedCount}건`,
      skippedCount
    }
  })
}
