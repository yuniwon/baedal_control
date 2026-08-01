import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { CredentialVault } from '../services/credential-vault'
import type {
  AgentActionPlanReport,
  AgentReportFilterInput,
  AgentReportEnvelope,
  BrowserInspectionSnapshot,
  BrowserInspectorStatus,
  CatalogBootstrapActivationInput,
  CatalogBootstrapPreview,
  CatalogBootstrapPreviewInput,
  CatalogIntentRule,
  CatalogReviewItem,
  CatalogReviewCanonicalMergeInput,
  CatalogReviewLinkInput,
  CatalogReviewResolutionInput,
  CatalogMaintenanceApplyInput,
  CatalogMaintenancePreview,
  CatalogMaintenanceResult,
  CatalogWorkspaceRecord,
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
  PlatformSessionStateRecord,
  PlatformAuthPreferenceRecord,
  SyncPreviewItem,
  SyncRunItemRecord,
  SyncRunRecord
} from '../../shared/contracts'
import { serializePlatformMenuPriceVariants } from '../../shared/platform-menu-price-variants'
import { PLATFORM_CODES, isPlatformCode } from '../../shared/platforms'
import { PLATFORM_CAPABILITIES } from '../../shared/platform-capabilities'
import { requiresApplicationCredential } from '../services/platform-session-strategy'
import { buildSyncPreview } from '../services/sync-planner'

const platformCodeSchema = z.enum(PLATFORM_CODES)
const catalogReviewKindSchema = z.enum([
  'missing_on_platform',
  'option_only_on_platform',
  'option_candidate_on_platform',
  'canonical_platform_only',
  'unmatched_platform_menu',
  'price_outlier',
  'option_price_outlier',
  'price_policy_pattern',
  'variant_shape_conflict',
  'duplicate_option_group',
  'option_shape_conflict',
  'legacy_noise_candidate',
  'external_drift',
  'lossy_projection',
  'authentication_required'
])
const catalogRecommendationSchema = z.enum([
  'add_to_platform',
  'add_to_canonical',
  'align_to_canonical',
  'keep_platform_value',
  'merge_canonical_only',
  'ignore_source',
  'manual_review'
])
const catalogReviewItemSchema = z.object({
  reviewItemId: z.string().trim().min(1),
  workspaceId: z.string().trim().min(1),
  fingerprint: z.string().trim().min(1),
  kind: catalogReviewKindSchema,
  state: z.enum(['open', 'resolved', 'deferred', 'blocked']),
  confidence: z.number().min(0).max(1),
  title: z.string().trim().min(1),
  explanation: z.string().trim().min(1),
  recommendation: catalogRecommendationSchema.nullable(),
  evidenceJson: z.string(),
  canonicalMenuId: z.string().nullable().optional(),
  platformCode: platformCodeSchema.nullable().optional(),
  sourceEntityId: z.string().nullable().optional(),
  intentRuleId: z.string().nullable().optional()
}).passthrough()
const catalogMappingSchema = z.object({
  mappingId: z.string().trim().min(1),
  menuId: z.string().trim().min(1),
  platformCode: platformCodeSchema,
  platformMenuId: z.string().trim().min(1),
  platformMenuName: z.string().trim().min(1),
  matchedBy: z.enum(['auto', 'manual']),
  isConfirmed: z.union([z.literal(0), z.literal(1)])
}).passthrough()
const catalogMenuSchema = z.object({
  menuId: z.string().trim().min(1),
  baseName: z.string().trim().min(1),
  basePrice: z.number().int().nonnegative(),
  basePriceVariants: z.unknown().nullable().optional(),
  isDirty: z.union([z.literal(0), z.literal(1)]),
  isManaged: z.union([z.literal(0), z.literal(1)]).optional()
}).passthrough()
const catalogBootstrapPreviewSchema = z.object({
  workspaceId: z.string().trim().min(1),
  seedMode: z.enum(['platform', 'blank']),
  seedPlatformCode: platformCodeSchema.nullable()
}).strict()
const catalogBootstrapActivationSchema = z.object({
  workspaceId: z.string().trim().min(1),
  seedMode: z.enum(['platform', 'blank']),
  seedPlatformCode: platformCodeSchema.nullable(),
  previewFingerprint: z.string().trim().min(1),
  menus: z.array(catalogMenuSchema),
  ignoredSourceEntityIds: z.array(z.string().trim().min(1)),
  confirmedMappings: z.array(catalogMappingSchema),
  remainingReviewItems: z.array(catalogReviewItemSchema)
}).strict()
const catalogReviewResolutionSchema = z.object({
  reviewItemIds: z.array(z.string().trim().min(1)).min(1),
  resolution: z.enum([
    'apply_recommendation',
    'keep_platform_value',
    'exclude_platform',
    'defer',
    'ignore_source',
    'merge_canonical_only'
  ]),
  remember: z.boolean(),
  scope: z.enum(['entity', 'platform', 'category', 'field', 'workspace']),
  reason: z.string().trim().min(1),
  expiresAt: z.string().datetime().nullable().optional()
}).strict()
const catalogReviewLinkSchema = z.object({
  reviewItemId: z.string().trim().min(1),
  sourceEntityId: z.string().trim().min(1)
}).strict()
const catalogReviewCanonicalMergeSchema = z.object({
  reviewItemId: z.string().trim().min(1),
  targetCanonicalMenuId: z.string().trim().min(1)
}).strict()
const catalogMaintenancePreviewSchema = z.object({
  referencePlatformCode: platformCodeSchema
}).strict()
const catalogMaintenanceApplySchema = z.object({
  referencePlatformCode: platformCodeSchema,
  acceptedCandidateIds: z.array(z.string().trim().min(1)),
  excludeHiddenOnlyMenus: z.boolean()
}).strict()

const parseCatalogPayload = <T>(schema: z.ZodType<T>, payload: unknown): T => {
  const result = schema.safeParse(payload)
  if (result.success) {
    return result.data
  }

  const fields = result.error.issues
    .map((issue) => `${issue.path.join('.') || 'payload'}:${issue.code}`)
    .join(',')
  throw new Error(`invalid_catalog_request:${fields}`)
}

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
  platformSessionOrchestrator?: {
    list: () => PlatformSessionStateRecord[]
    check: (platformCode: PlatformCode) => Promise<PlatformSessionStateRecord>
    connect: (platformCode: PlatformCode) => Promise<PlatformSessionStateRecord>
    resumeAfterUserAction: (platformCode: PlatformCode) => Promise<PlatformSessionStateRecord>
  }
  platformAuthPreferenceRepository?: {
    get: (workspaceId: string, platformCode: PlatformCode) => PlatformAuthPreferenceRecord
    setAutoClickConsent: (
      workspaceId: string,
      platformCode: PlatformCode,
      consented: boolean,
      changedAt: string
    ) => PlatformAuthPreferenceRecord
  }
  catalogWorkspaceRepository?: { getDefault: () => CatalogWorkspaceRecord }
  catalogBootstrapService?: {
    preview: (input: CatalogBootstrapPreviewInput) => CatalogBootstrapPreview
    activate: (input: CatalogBootstrapActivationInput) => CatalogWorkspaceRecord
  }
  catalogReviewRepository?: {
    listOpen: (workspaceId: string) => CatalogReviewItem[]
    resolve: (reviewItemIds: string[], intentRuleId?: string | null) => void
    setState: (
      reviewItemIds: string[],
      state: 'resolved' | 'deferred',
      intentRuleId?: string | null
    ) => void
  }
  catalogIntentRuleRepository?: { upsert: (record: CatalogIntentRule) => void }
  catalogMaintenanceService?: {
    preview: (referencePlatformCode: PlatformCode) => CatalogMaintenancePreview
    apply: (input: CatalogMaintenanceApplyInput) => CatalogMaintenanceResult
    mergeCanonicalMenus?: (sourceMenuId: string, targetMenuId: string) => {
      ok: true
      backupPath: string | null
      sourceMenuId: string
      targetMenuId: string
    }
  }
  syncEngine?: { run: (items: SyncPreviewItem[]) => Promise<unknown> }
  onCredentialSaved?: (platformCode: PlatformCode) => void
  createId?: () => string
  now?: () => string
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
  platformSessionOrchestrator,
  platformAuthPreferenceRepository,
  catalogWorkspaceRepository,
  catalogBootstrapService,
  catalogReviewRepository,
  catalogIntentRuleRepository,
  catalogMaintenanceService,
  syncEngine,
  onCredentialSaved,
  createId,
  now = () => new Date().toISOString()
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

  const parsePlatformSessionRequest = (payload: unknown) => {
    const result = z.object({ platformCode: platformCodeSchema }).safeParse(payload)
    if (!result.success) {
      throw new Error('invalid_platform_code')
    }
    return result.data.platformCode
  }

  register('platformSessions:list', async () => platformSessionOrchestrator?.list() ?? [])
  register('platformSessions:check', async (_event, payload) => {
    const platformCode = parsePlatformSessionRequest(payload)
    if (!platformSessionOrchestrator) {
      throw new Error('platform_session_orchestrator_unavailable')
    }
    return platformSessionOrchestrator.check(platformCode)
  })
  register('platformSessions:connect', async (_event, payload) => {
    const platformCode = parsePlatformSessionRequest(payload)
    if (!platformSessionOrchestrator) {
      throw new Error('platform_session_orchestrator_unavailable')
    }
    return platformSessionOrchestrator.connect(platformCode)
  })
  register('platformSessions:resumeAfterUserAction', async (_event, payload) => {
    const platformCode = parsePlatformSessionRequest(payload)
    if (!platformSessionOrchestrator) {
      throw new Error('platform_session_orchestrator_unavailable')
    }
    return platformSessionOrchestrator.resumeAfterUserAction(platformCode)
  })

  register('platformAuthPreferences:list', async () => {
    if (!platformAuthPreferenceRepository) {
      return []
    }
    return PLATFORM_CODES.map((platformCode) =>
      platformAuthPreferenceRepository.get('default', platformCode)
    )
  })
  register('platformAuthPreferences:setAutoClickConsent', async (_event, payload) => {
    const result = z.object({
      platformCode: platformCodeSchema,
      consented: z.boolean()
    }).safeParse(payload)
    if (!result.success) {
      throw new Error('invalid_platform_auth_preference')
    }
    const { platformCode, consented } = result.data
    if (!PLATFORM_CAPABILITIES[platformCode].authentication.strategies.includes(
      'managed_password_manager_login'
    )) {
      throw new Error('password_manager_login_unsupported')
    }
    if (!platformAuthPreferenceRepository) {
      throw new Error('platform_auth_preference_repository_unavailable')
    }
    return platformAuthPreferenceRepository.setAutoClickConsent(
      'default',
      platformCode,
      consented,
      now()
    )
  })

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
  register('catalogWorkspace:get', async () => {
    if (!catalogWorkspaceRepository) {
      throw new Error('catalog_workspace_unavailable')
    }
    return catalogWorkspaceRepository.getDefault()
  })
  register('catalogBootstrap:preview', async (_event, payload: unknown) => {
    if (!catalogBootstrapService) {
      throw new Error('catalog_bootstrap_unavailable')
    }
    const input = parseCatalogPayload(catalogBootstrapPreviewSchema, payload)
    return catalogBootstrapService.preview(input)
  })
  register('catalogBootstrap:activate', async (_event, payload: unknown) => {
    if (!catalogBootstrapService) {
      throw new Error('catalog_bootstrap_unavailable')
    }
    const input = parseCatalogPayload(catalogBootstrapActivationSchema, payload)
    return catalogBootstrapService.activate(input as CatalogBootstrapActivationInput)
  })
  register('catalogReviews:listOpen', async () =>
    catalogReviewRepository?.listOpen('default') ?? []
  )
  register('catalogReviews:resolve', async (_event, payload: unknown) => {
    if (!catalogReviewRepository) {
      throw new Error('catalog_reviews_unavailable')
    }
    const input = parseCatalogPayload(
      catalogReviewResolutionSchema,
      payload
    ) as CatalogReviewResolutionInput
    const openItems = catalogReviewRepository.listOpen('default')
    const itemsById = new Map(openItems.map((item) => [item.reviewItemId, item]))
    const selectedItems = input.reviewItemIds.map((reviewItemId) => {
      const item = itemsById.get(reviewItemId)
      if (!item) {
        throw new Error(`catalog_review_item_not_open:${reviewItemId}`)
      }
      return item
    })

    for (const item of selectedItems) {
      let intentRuleId: string | null = null
      if (input.remember) {
        if (!catalogIntentRuleRepository) {
          throw new Error('catalog_intent_rules_unavailable')
        }

        let evidence: Record<string, unknown> = {}
        try {
          evidence = JSON.parse(item.evidenceJson) as Record<string, unknown>
        } catch {
          evidence = {}
        }
        const fieldKey = typeof evidence.fieldKey === 'string' ? evidence.fieldKey : null
        const categoryKey = typeof evidence.categoryKey === 'string' ? evidence.categoryKey : null
        if (input.scope === 'entity' && !item.canonicalMenuId && !item.sourceEntityId) {
          throw new Error(`catalog_intent_scope_unavailable:entity:${item.reviewItemId}`)
        }
        if (input.scope === 'platform' && !item.platformCode) {
          throw new Error(`catalog_intent_scope_unavailable:platform:${item.reviewItemId}`)
        }
        if (input.scope === 'field' && !fieldKey) {
          throw new Error(`catalog_intent_scope_unavailable:field:${item.reviewItemId}`)
        }
        if (input.scope === 'category' && !categoryKey) {
          throw new Error(`catalog_intent_scope_unavailable:category:${item.reviewItemId}`)
        }

        intentRuleId = createId?.() ?? randomUUID()
        catalogIntentRuleRepository.upsert({
          intentRuleId,
          workspaceId: item.workspaceId,
          kind: item.kind,
          scope: input.scope,
          resolution: input.resolution,
          platformCode: input.scope === 'workspace' ? null : item.platformCode ?? null,
          canonicalMenuId: input.scope === 'entity' ? item.canonicalMenuId ?? null : null,
          sourceEntityId: input.scope === 'entity' ? item.sourceEntityId ?? null : null,
          fieldKey: input.scope === 'field' ? fieldKey : null,
          categoryKey: input.scope === 'category' ? categoryKey : null,
          reason: input.reason,
          expiresAt: input.expiresAt ?? null,
          isActive: 1
        })
      }

      if (input.resolution === 'defer') {
        catalogReviewRepository.setState([item.reviewItemId], 'deferred', intentRuleId)
      } else {
        catalogReviewRepository.resolve([item.reviewItemId], intentRuleId)
      }
    }

    return { ok: true as const, resolvedCount: selectedItems.length }
  })
  register('catalogReviews:link', async (_event, payload: unknown) => {
    if (!catalogReviewRepository) {
      throw new Error('catalog_reviews_unavailable')
    }

    const input = parseCatalogPayload(catalogReviewLinkSchema, payload) as CatalogReviewLinkInput
    const openItems = catalogReviewRepository.listOpen('default')
    const item = openItems.find((candidate) => candidate.reviewItemId === input.reviewItemId)
    if (!item) {
      throw new Error(`catalog_review_item_not_open:${input.reviewItemId}`)
    }
    if (
      item.kind !== 'missing_on_platform' ||
      !item.canonicalMenuId ||
      !item.platformCode
    ) {
      throw new Error(`catalog_review_link_unsupported:${item.reviewItemId}`)
    }

    let evidence: Record<string, unknown> = {}
    try {
      evidence = JSON.parse(item.evidenceJson) as Record<string, unknown>
    } catch {
      evidence = {}
    }
    const sourceIds = Array.isArray(evidence.sourceEntityIds)
      ? evidence.sourceEntityIds.filter((value): value is string => typeof value === 'string')
      : []
    const generalCandidates = Array.isArray(evidence.generalCandidates)
      ? evidence.generalCandidates.filter(
          (value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object'
        )
      : []
    if (
      sourceIds.length > 0 && !sourceIds.includes(input.sourceEntityId) &&
      !generalCandidates.some((candidate) => candidate.platformMenuId === input.sourceEntityId)
    ) {
      throw new Error(`catalog_review_link_candidate_not_found:${input.sourceEntityId}`)
    }

    const source = platformMenuRepository.listAll().find(
      (candidate) =>
        candidate.platformCode === item.platformCode &&
        candidate.platformMenuId === input.sourceEntityId
    )
    if (!source || source.presenceStatus === 'absent_confirmed' || source.presenceStatus === 'missing_suspected') {
      throw new Error(`catalog_review_link_source_unavailable:${input.sourceEntityId}`)
    }

    const existingMapping = mappingRepository.listAll().find(
      (mapping) =>
        mapping.platformCode === item.platformCode &&
        mapping.platformMenuId === input.sourceEntityId &&
        mapping.mappingStatus !== 'source_absent'
    )
    if (existingMapping && existingMapping.menuId !== item.canonicalMenuId) {
      throw new Error(`catalog_review_link_source_already_mapped:${input.sourceEntityId}`)
    }

    const mappingId = `${item.canonicalMenuId}:${item.platformCode}:${input.sourceEntityId}`
    mappingRepository.upsert({
      mappingId,
      menuId: item.canonicalMenuId,
      platformCode: item.platformCode,
      platformMenuId: source.platformMenuId,
      platformMenuName: source.platformMenuName,
      platformMenuCurrentPrice: source.platformMenuCurrentPrice ?? null,
      platformMenuPriceCount: source.platformMenuPriceCount ?? null,
      platformMenuGroupName: source.platformMenuGroupName ?? null,
      platformMenuStatus: source.platformMenuStatus ?? null,
      platformMenuPriceSummary: source.platformMenuPriceSummary ?? null,
      platformMenuPriceVariants: source.platformMenuPriceVariants ?? null,
      platformMenuBindingSummary: source.platformMenuBindingSummary ?? null,
      platformMenuBindingStatus: source.platformMenuBindingStatus ?? null,
      matchedBy: 'manual',
      isConfirmed: 1
    })

    const relatedReviewIds = openItems
      .filter((candidate) =>
        candidate.reviewItemId === item.reviewItemId ||
        (
          candidate.platformCode === item.platformCode &&
          candidate.sourceEntityId === input.sourceEntityId
        )
      )
      .map((candidate) => candidate.reviewItemId)
    catalogReviewRepository.resolve(relatedReviewIds)

    return {
      ok: true as const,
      mappingId,
      resolvedCount: relatedReviewIds.length
    }
  })
  register('catalogReviews:mergeCanonical', async (_event, payload: unknown) => {
    if (!catalogReviewRepository || !catalogMaintenanceService?.mergeCanonicalMenus) {
      throw new Error('catalog_reviews_unavailable')
    }

    const input = parseCatalogPayload(
      catalogReviewCanonicalMergeSchema,
      payload
    ) as CatalogReviewCanonicalMergeInput
    const openItems = catalogReviewRepository.listOpen('default')
    const item = openItems.find((candidate) => candidate.reviewItemId === input.reviewItemId)
    if (!item) {
      throw new Error(`catalog_review_item_not_open:${input.reviewItemId}`)
    }
    if (item.kind !== 'canonical_platform_only' || !item.canonicalMenuId) {
      throw new Error(`catalog_review_merge_unsupported:${item.reviewItemId}`)
    }

    let evidence: Record<string, unknown> = {}
    try {
      evidence = JSON.parse(item.evidenceJson) as Record<string, unknown>
    } catch {
      evidence = {}
    }
    const candidates = Array.isArray(evidence.canonicalCandidates)
      ? evidence.canonicalCandidates.filter(
          (value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object'
        )
      : []
    if (!candidates.some((candidate) => candidate.canonicalMenuId === input.targetCanonicalMenuId)) {
      throw new Error(`catalog_review_merge_candidate_not_found:${input.targetCanonicalMenuId}`)
    }

    const relatedReviewIds = openItems
      .filter((candidate) => candidate.canonicalMenuId === item.canonicalMenuId)
      .map((candidate) => candidate.reviewItemId)
    const result = catalogMaintenanceService.mergeCanonicalMenus(
      item.canonicalMenuId,
      input.targetCanonicalMenuId
    )

    return {
      ok: true as const,
      backupPath: result.backupPath,
      sourceMenuId: result.sourceMenuId,
      targetMenuId: result.targetMenuId,
      resolvedCount: relatedReviewIds.length
    }
  })
  register('catalogMaintenance:preview', async (_event, payload: unknown) => {
    if (!catalogMaintenanceService) throw new Error('catalog_maintenance_unavailable')
    const input = parseCatalogPayload(catalogMaintenancePreviewSchema, payload)
    return catalogMaintenanceService.preview(input.referencePlatformCode)
  })
  register('catalogMaintenance:apply', async (_event, payload: unknown) => {
    if (!catalogMaintenanceService) throw new Error('catalog_maintenance_unavailable')
    const input = parseCatalogPayload(catalogMaintenanceApplySchema, payload)
    return catalogMaintenanceService.apply(input)
  })
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
      const usesPasswordManagerLogin = Boolean(
        platformCode &&
          PLATFORM_CAPABILITIES[platformCode].authentication.strategies.includes(
            'managed_password_manager_login'
          )
      )

      if (platformCode && autoLoginRequested && usesPasswordManagerLogin) {
        if (!platformSessionOrchestrator) {
          throw new Error('platform_session_orchestrator_unavailable')
        }
        const sessionState = await platformSessionOrchestrator.connect(platformCode)
        const ready = sessionState.state === 'ready'
        return {
          ...getBrowserInspectorStatus(),
          managedChromeAutoLoginPlatformCode: platformCode,
          managedChromeAutoLoginStatus: ready ? 'already_authenticated' : 'failed',
          managedChromeAutoLoginMessage: ready
            ? '쿠팡이츠 로그인 상태를 확인했습니다.'
            : sessionState.detailCode ?? '쿠팡이츠 로그인에 사용자 확인이 필요합니다.'
        }
      }

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
    return PLATFORM_CODES.map((platformCode) => {
      const usesApplicationCredential = requiresApplicationCredential(
        PLATFORM_CAPABILITIES[platformCode].authentication.strategies
      )
      return {
        platformCode,
        connected: usesApplicationCredential ? Boolean(credentialVault.get(platformCode)) : false
      }
    })
  })

  register('settings:list-platform-credentials', async () => {
    return PLATFORM_CODES.map((platformCode) => {
      const usesApplicationCredential = requiresApplicationCredential(
        PLATFORM_CAPABILITIES[platformCode].authentication.strategies
      )
      const credential = usesApplicationCredential ? credentialVault.get(platformCode) : null
      return {
        platformCode,
        connected: Boolean(credential),
        username: credential?.username ?? '',
        password: credential?.password ?? ''
      }
    })
  })

  register('settings:get-legacy-platform-credential-status', async (_event, payload) => {
    const platformCode = parsePlatformSessionRequest(payload)
    return { stored: credentialVault.hasStoredEntry(platformCode) }
  })

  register('settings:clear-legacy-platform-credential', async (_event, payload) => {
    const platformCode = parsePlatformSessionRequest(payload)
    if (platformCode !== 'coupangeats') {
      throw new Error('legacy_credential_cleanup_unsupported')
    }
    credentialVault.clear(platformCode)
    return { ok: true as const }
  })

  const runPlatformImport = async (
    platformCode: PlatformCode,
    sessionAction?: () => Promise<PlatformSessionStateRecord>
  ) => {
    const sessionState = await sessionAction?.()
    if (sessionState && sessionState.state !== 'ready') {
      return {
        ok: true as const,
        sessionState,
        importError: `platform_session_not_ready:${sessionState.state}`
      }
    }

    try {
      const importResult = await platformMenuImporter?.importPlatform(platformCode)
      return {
        ok: true as const,
        ...(sessionState ? { sessionState } : {}),
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
        ...(sessionState ? { sessionState } : {}),
        importError: error instanceof Error ? error.message : 'unknown_error',
        importInspection
      }
    }
  }

  register('settings:save-platform-credential', async (_event, payload) => {
    if (!isPlatformCode(payload.platformCode)) {
      throw new Error('invalid_platform_code')
    }
    const platformCode = payload.platformCode as PlatformCode
    if (!requiresApplicationCredential(
      PLATFORM_CAPABILITIES[platformCode].authentication.strategies
    )) {
      throw new Error('application_credential_not_supported')
    }
    credentialVault.set(platformCode, payload.username, payload.password)
    onCredentialSaved?.(platformCode)

    return runPlatformImport(
      platformCode,
      platformSessionOrchestrator
        ? () => platformSessionOrchestrator.connect(platformCode)
        : undefined
    )
  })

  register('settings:import-platform-menus', async (_event, payload) => {
    if (!isPlatformCode(payload.platformCode)) {
      throw new Error('invalid_platform_code')
    }
    const platformCode = payload.platformCode as PlatformCode
    const usesApplicationCredential = requiresApplicationCredential(
      PLATFORM_CAPABILITIES[platformCode].authentication.strategies
    )
    if (usesApplicationCredential && !credentialVault.get(platformCode)) {
      return {
        ok: true as const,
        importError: 'credential_not_found'
      }
    }

    return runPlatformImport(
      platformCode,
      platformSessionOrchestrator
        ? () => platformSessionOrchestrator.connect(platformCode)
        : undefined
    )
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
