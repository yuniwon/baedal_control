import { ipcMain } from 'electron'
import type { CredentialVault } from '../services/credential-vault'
import type {
  AgentActionPlanReport,
  AgentReportFilterInput,
  AgentReportEnvelope,
  BrowserInspectionSnapshot,
  BrowserInspectorStatus,
  PlatformImportResult,
  MenuRecord,
  PlatformCode,
  PlatformImportSummary,
  PlatformInspectionReport,
  PlatformImportChangeRecord,
  PlatformImportRunRecord,
  LogicalOptionGroupRecord,
  ManagedChromeSessionStatus,
  PlatformMenuCatalogRecord,
  PlatformOptionGroupRecord,
  PlatformMenuMappingRecord,
  SyncPreviewItem,
  SyncRunItemRecord,
  SyncRunRecord
} from '../../shared/contracts'
import { serializePlatformMenuPriceVariants } from '../../shared/platform-menu-price-variants'
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
  browserInspectionSnapshotRepository?: {
    listLatest: (limit?: number) => BrowserInspectionSnapshot[]
    save?: (snapshot: BrowserInspectionSnapshot) => void
  }
  browserInspectorBridge?: { getStatus: () => BrowserInspectorStatus }
  agentOperationsReportService?: {
    getNextActionPlan: (
      filters: AgentReportFilterInput
    ) => Promise<AgentReportEnvelope<AgentActionPlanReport>>
  }
  managedChromeLauncher?: {
    getStatus: () => BrowserInspectorStatus
    launch: (url?: string) => Promise<BrowserInspectorStatus> | BrowserInspectorStatus
  }
  managedChromeLoginAutomator?: {
    getLaunchUrl: (platformCode: PlatformCode) => string | null
    autoLogin: (
      platformCode: PlatformCode,
      credential?: { username: string; password: string } | null
    ) =>
      | Promise<{
          platformCode: PlatformCode
          status:
            | 'submitted'
            | 'already_authenticated'
            | 'credential_missing'
            | 'login_tab_not_found'
            | 'unsupported'
            | 'failed'
          message: string
        }>
      | {
          platformCode: PlatformCode
          status:
            | 'submitted'
            | 'already_authenticated'
            | 'credential_missing'
            | 'login_tab_not_found'
            | 'unsupported'
            | 'failed'
          message: string
        }
  }
  managedChromeSessionProbe?: {
    inspect: () => Promise<ManagedChromeSessionStatus> | ManagedChromeSessionStatus
  }
  managedChromeSnapshotCapturer?: {
    captureTab: (tabId: string) => Promise<BrowserInspectionSnapshot> | BrowserInspectionSnapshot
  }
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
  browserInspectionSnapshotRepository,
  browserInspectorBridge,
  agentOperationsReportService,
  managedChromeLauncher,
  managedChromeLoginAutomator,
  managedChromeSessionProbe,
  managedChromeSnapshotCapturer,
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
      previousPriceVariants: serializePlatformMenuPriceVariants(item.previousPriceVariants),
      nextName: item.nextName,
      nextPrice: item.nextPrice,
      nextPriceVariants: serializePlatformMenuPriceVariants(item.nextPriceVariants),
      executionMode: item.executionMode ?? null
    })

  const normalizeListLimit = (value: unknown, defaultLimit = 50, maxLimit = 200) => {
    const numericLimit = typeof value === 'number' ? value : Number.NaN

    if (!Number.isFinite(numericLimit) || numericLimit <= 0) {
      return defaultLimit
    }

    return Math.min(Math.floor(numericLimit), maxLimit)
  }

  const isPlatformCode = (value: unknown): value is PlatformCode =>
    value === 'baemin' || value === 'coupangeats' || value === 'ddangyo'

  const getBrowserInspectorStatus = (): BrowserInspectorStatus => ({
    receiverUrl: '',
    extensionPath: '',
    isRunning: false,
    chromeAvailable: false,
    chromePath: null,
    chromeProfilePath: null,
    managedChromeRunning: false,
    lastLaunchUrl: null,
    chromeError: null,
    ...(managedChromeLauncher?.getStatus() ?? {}),
    ...(browserInspectorBridge?.getStatus() ?? {})
  })

  const getSyncPreview = async () =>
    buildSyncPreview({
      menus: menuRepository.list(),
      mappings: mappingRepository.listAll(),
      platformMenus: platformMenuRepository.listAll(),
      platformImportRuns: platformImportRunRepository?.listLatest(50) ?? [],
      managedChromeSession: (await managedChromeSessionProbe?.inspect()) ?? null
    })

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
  register('agentReports:getNextActionPlan', async (_event, filters?: Record<string, unknown>) =>
    agentOperationsReportService?.getNextActionPlan(filters ?? {}) ?? {
      task: 'agent-plan-next-actions',
      generatedAt: new Date().toISOString(),
      summary: '제안 서비스를 사용할 수 없습니다.',
      data: {
        total: 1,
        byPriority: { high: 0, medium: 0, low: 1 },
        items: [
          {
            id: 'idle:service-unavailable',
            kind: 'idle',
            priority: 'low',
            title: '제안 서비스를 사용할 수 없습니다.',
            detail: '메인 프로세스에서 실행 제안 서비스를 아직 연결하지 않았습니다.',
            evidence: [],
            commands: []
          }
        ]
      }
    }
  )
  register('browserInspectionSnapshots:listLatest', async (_event, limit?: number) =>
    browserInspectionSnapshotRepository?.listLatest(normalizeListLimit(limit)) ?? []
  )
  register('browserInspector:getStatus', async () => getBrowserInspectorStatus())
  register('browserInspector:getManagedChromeSession', async () => {
    return (
      (await managedChromeSessionProbe?.inspect()) ?? {
        endpointUrl: 'http://127.0.0.1:39482',
        connected: false,
        error: null,
        tabs: []
      }
    )
  })
  register(
    'browserInspector:launchManagedChrome',
    async (
      _event,
      payload?: { url?: string; platformCode?: PlatformCode; autoLogin?: boolean }
    ) => {
      const requestedUrl =
        payload && typeof payload.url === 'string' && payload.url.trim().length > 0
          ? payload.url.trim()
          : undefined
      const platformCode = isPlatformCode(payload?.platformCode) ? payload.platformCode : null
      const autoLoginRequested = Boolean(platformCode) && payload?.autoLogin === true
      const launchUrl =
        requestedUrl ??
        (platformCode && autoLoginRequested
          ? managedChromeLoginAutomator?.getLaunchUrl(platformCode) ?? undefined
          : undefined)

      let launchStatus: BrowserInspectorStatus | undefined
      if (managedChromeLauncher) {
        launchStatus = await managedChromeLauncher.launch(launchUrl)
      }

      const autoLoginStatus =
        platformCode && autoLoginRequested && managedChromeLoginAutomator
          ? await managedChromeLoginAutomator.autoLogin(platformCode, credentialVault.get(platformCode))
          : null

      return {
        ...getBrowserInspectorStatus(),
        ...(launchStatus ?? {}),
        ...(autoLoginStatus
          ? {
              managedChromeAutoLoginPlatformCode: autoLoginStatus.platformCode,
              managedChromeAutoLoginStatus: autoLoginStatus.status,
              managedChromeAutoLoginMessage: autoLoginStatus.message
            }
          : {})
      }
    }
  )
  register('browserInspector:captureManagedChromeTab', async (_event, payload?: { tabId?: string }) => {
    const tabId = typeof payload?.tabId === 'string' ? payload.tabId.trim() : ''
    if (!tabId) {
      throw new Error('managed_chrome_tab_id_required')
    }

    const snapshot = await managedChromeSnapshotCapturer?.captureTab(tabId)
    if (!snapshot) {
      throw new Error('managed_chrome_capture_unavailable')
    }

    browserInspectionSnapshotRepository?.save?.(snapshot)
    return snapshot
  })
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
      const importInspection =
        error && typeof error === 'object' && 'inspection' in error
          ? ((error as { inspection?: PlatformInspectionReport }).inspection as
              | PlatformInspectionReport
              | undefined)
          : undefined
      return {
        ok: true as const,
        importError: error instanceof Error ? error.message : 'unknown_error',
        importInspection
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

  register('sync:preview', async () => getSyncPreview())

  register('sync:run', async () => {
    const preview = await getSyncPreview()

    return syncEngine?.run(preview.items) ?? { syncRunId: null, summary: '0 succeeded, 0 failed' }
  })

  register('sync:run-items', async (_event, payload) => {
    const requestedItems = Array.isArray(payload) ? (payload as SyncPreviewItem[]) : []
    const preview = await getSyncPreview()
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
