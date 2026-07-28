import { randomUUID } from 'node:crypto'
import type {
  MenuRecord,
  PlatformCode,
  PlatformImportFetchMode,
  PlatformImportResult,
  PlatformImportSummary,
  PlatformInspectionReport,
  PlatformMenuCatalogRecord,
  PlatformMenuMappingRecord,
  PlatformOptionGroupRecord,
  CatalogWorkspaceRecord
} from '../../shared/contracts'
import { cleanCatalogCategoryName } from '../../shared/catalog-normalization'
import type { CatalogIntentRule, CatalogReviewItem } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'
import type { PlatformCatalogReader } from '../platforms/base/plugin'
import type {
  PlatformMenuFetchResult,
  PlatformMenuSnapshot,
  PlatformOptionGroupSnapshot
} from '../platforms/base/types'
import { withSavepoint } from '../db/savepoint'
import { buildOptionSignature } from './option-signature'
import { diffCatalogRows, type CatalogPresenceUpdate } from './catalog-diff-service'
import { analyzeCatalogExceptions } from './catalog-exception-analyzer'
import { applyIntentRules } from './catalog-intent-policy'
import { buildLogicalOptionGroups } from './logical-option-group-service'

interface MenuRepositoryLike {
  list(): MenuRecord[]
  upsert(record: MenuRecord): void
}

interface MappingRepositoryLike {
  listAll(): PlatformMenuMappingRecord[]
  listForMenu(menuId: string): PlatformMenuMappingRecord[]
  upsert(record: PlatformMenuMappingRecord): void
  setMappingStatus(mappingId: string, mappingStatus: 'source_absent'): void
}

interface CatalogWorkspaceRepositoryLike {
  getDefault(): CatalogWorkspaceRecord
}

interface CatalogReviewRepositoryLike {
  replaceOpen(workspaceId: string, items: CatalogReviewItem[]): void
}

interface CatalogIntentRuleRepositoryLike {
  listActive(workspaceId: string, at?: string): CatalogIntentRule[]
}

interface PlatformMenuRepositoryLike {
  listAll(): PlatformMenuCatalogRecord[]
  upsert(record: PlatformMenuCatalogRecord): void
  upsertSeenBatch(platformCode: PlatformCode, importRunId: string, records: PlatformMenuCatalogRecord[]): void
  applyPresenceUpdates(updates: Array<{
    platformCode: PlatformCode
    platformMenuId: string
    missingStreak: number
    presenceStatus: NonNullable<PlatformMenuCatalogRecord['presenceStatus']>
  }>): void
}

interface PlatformOptionGroupRepositoryLike {
  listAll(): PlatformOptionGroupRecord[]
  upsertSeenBatch(platformCode: PlatformCode, importRunId: string, records: PlatformOptionGroupRecord[]): void
  applyPresenceUpdates(updates: Array<{
    platformCode: PlatformCode
    optionGroupId: string
    missingStreak: number
    presenceStatus: NonNullable<PlatformOptionGroupRecord['presenceStatus']>
  }>): void
}

interface PlatformImportRunRepositoryLike {
  start(input: { importRunId: string; platformCode: PlatformCode }): void
  finish(
    importRunId: string,
    input: {
      status: 'completed' | 'partial_failed'
      menuFetchCompleted: number
      optionFetchCompleted: number
      summaryJson?: string | null
      errorMessage?: string | null
    }
  ): void
}

interface PlatformImportChangeRepositoryLike {
  replaceForRun(importRunId: string, changes: Array<{
    changeId: string
    importRunId: string
    platformCode: PlatformCode
    entityType: 'menu' | 'option_group'
    entityKey: string
    entityName: string
    changeType:
      | 'created'
      | 'missing_suspected'
      | 'absent_confirmed'
      | 'resurfaced'
      | 'name_changed'
      | 'price_changed'
      | 'option_signature_changed'
    presenceStatus?: 'present' | 'missing_suspected' | 'absent_confirmed' | 'resurfaced' | null
    beforeJson?: string | null
    afterJson?: string | null
  }>): void
}

interface CatalogImportOrchestratorDependencies {
  db: DatabaseConnection
  adapterRegistry: {
    getReader(platformCode: PlatformCode): PlatformCatalogReader
  }
  menuRepository: MenuRepositoryLike
  mappingRepository: MappingRepositoryLike
  platformMenuRepository: PlatformMenuRepositoryLike
  platformImportRunRepository: PlatformImportRunRepositoryLike
  platformImportChangeRepository: PlatformImportChangeRepositoryLike
  platformOptionGroupRepository?: PlatformOptionGroupRepositoryLike
  catalogWorkspaceRepository: CatalogWorkspaceRepositoryLike
  catalogReviewRepository: CatalogReviewRepositoryLike
  catalogIntentRuleRepository: CatalogIntentRuleRepositoryLike
  createId?: () => string
}

type MenuPresenceChange = {
  changeId: string
  importRunId: string
  platformCode: PlatformCode
  entityType: 'menu'
  entityKey: string
  entityName: string
  changeType:
    | 'created'
    | 'missing_suspected'
    | 'absent_confirmed'
    | 'resurfaced'
    | 'name_changed'
    | 'price_changed'
  presenceStatus?: 'present' | 'missing_suspected' | 'absent_confirmed' | 'resurfaced' | null
  beforeJson?: string | null
  afterJson?: string | null
}

export class CatalogImportOrchestrator {
  constructor(private readonly deps: CatalogImportOrchestratorDependencies) {}

  async importPlatform(platformCode: PlatformCode): Promise<PlatformImportResult> {
    const reader = this.deps.adapterRegistry.getReader(platformCode)
    const importRunId = this.deps.createId?.() ?? randomUUID()
    this.deps.platformImportRunRepository.start({ importRunId, platformCode })
    let menuFetchCompleted = 0
    let optionFetchCompleted = 0

    try {
      const fetchResult = await reader.fetchCatalog()
      this.assertCatalogCompleteness(
        fetchResult.completeness,
        fetchResult.optionCatalogFetched === true
      )
      menuFetchCompleted = 1
      const fetchedMenus = this.normalizePlatformMenus(fetchResult.menus)
      const duplicateMenuCount = Math.max(
        (fetchResult.rawMenuCount ?? fetchResult.menus.length) - fetchedMenus.length,
        0
      )
      const fetchedOptionGroups = fetchResult.optionCatalogFetched === true
        ? fetchResult.optionGroups ?? []
        : []
      optionFetchCompleted = fetchResult.optionCatalogFetched === true ? 1 : 0
      const normalizedOptionGroups = this.normalizePlatformOptionGroups(platformCode, fetchedOptionGroups)
      const currentMenuRows = this.buildMenuRows(fetchedMenus)
      const previousMenus = this.deps.platformMenuRepository
        .listAll()
        .filter((record) => record.platformCode === platformCode)
      const mappings = this.deps.mappingRepository.listAll()
      const catalogWorkspace = this.deps.catalogWorkspaceRepository.getDefault()
      const legacySeedMenus = this.buildLegacyPlatformMenuSeeds(
        platformCode,
        previousMenus,
        mappings
      )
      const previousMenusForDiff = [...previousMenus, ...legacySeedMenus]
      const previousOptionGroups = this.deps.platformOptionGroupRepository
        ?.listAll()
        .filter((record) => record.platformCode === platformCode) ?? []
      const currentOptionGroupRows = optionFetchCompleted === 1
        ? this.buildOptionGroupRows(normalizedOptionGroups)
        : []
      const menuPlan = this.planExistingMappingRefreshes(
        platformCode,
        mappings,
        fetchedMenus,
        catalogWorkspace.lifecycleState === 'active'
      )
      const menuDiff = diffCatalogRows({
        platformCode,
        importRunId,
        entityType: 'menu',
        comparableChangeType: 'price_changed',
        previousRows: previousMenusForDiff.map((record) => ({
          key: record.platformMenuId,
          name: record.platformMenuName,
          comparable: {
            platformMenuName: record.platformMenuName,
            platformMenuCurrentPrice: record.platformMenuCurrentPrice ?? null,
            platformMenuPriceCount: record.platformMenuPriceCount ?? null,
            platformMenuGroupName: record.platformMenuGroupName ?? null,
            platformMenuStatus: record.platformMenuStatus ?? null,
            platformMenuPriceSummary: record.platformMenuPriceSummary ?? null,
            platformMenuPriceVariants: record.platformMenuPriceVariants ?? null,
            platformMenuBindingSummary: record.platformMenuBindingSummary ?? null,
            platformMenuBindingStatus: record.platformMenuBindingStatus ?? null
          },
          previousMissingStreak: record.missingStreak ?? 0,
          previousPresenceStatus: record.presenceStatus ?? 'present'
        })),
        currentRows: currentMenuRows
      })
      const optionGroupDiff = optionFetchCompleted === 1
        ? diffCatalogRows({
            platformCode,
            importRunId,
            entityType: 'option_group',
            comparableChangeType: 'option_signature_changed',
            previousRows: previousOptionGroups.map((record) => ({
              key: record.optionGroupId,
              name: record.optionGroupName,
              comparable: {
                signatureKey: record.signatureKey ?? buildOptionSignature(record),
                mappingMenusCount: record.mappingMenusCount ?? null
              },
              previousMissingStreak: record.missingStreak ?? 0,
              previousPresenceStatus: record.presenceStatus ?? 'present'
            })),
            currentRows: currentOptionGroupRows
          })
        : { changes: [], presenceUpdates: [] }

      withSavepoint(this.deps.db, () => {
        for (const legacySeedMenu of legacySeedMenus) {
          this.deps.platformMenuRepository.upsert(legacySeedMenu)
        }
        this.persistCatalogState(platformCode, importRunId, fetchedMenus, normalizedOptionGroups)
        this.persistExistingMappingRefreshes(menuPlan)
        this.deps.platformMenuRepository.applyPresenceUpdates(
          menuDiff.presenceUpdates.map((update: CatalogPresenceUpdate) => ({
            platformCode,
            platformMenuId: update.key,
            missingStreak: update.missingStreak,
            presenceStatus: update.presenceStatus
          }))
        )
        this.deps.platformOptionGroupRepository?.applyPresenceUpdates(
          optionGroupDiff.presenceUpdates.map((update: CatalogPresenceUpdate) => ({
            platformCode,
            optionGroupId: update.key,
            missingStreak: update.missingStreak,
            presenceStatus: update.presenceStatus
          }))
        )
        this.persistImportChanges(importRunId, [...menuDiff.changes, ...optionGroupDiff.changes])
        if (catalogWorkspace.lifecycleState === 'active') {
          this.applyMenuAbsenceSideEffects(
            platformCode,
            menuDiff.changes.filter((change): change is MenuPresenceChange => change.entityType === 'menu')
          )
          this.refreshCatalogReviewItems(catalogWorkspace.workspaceId)
        }
      })

      const summary = this.buildSummary(
        platformCode,
        fetchedMenus,
        normalizedOptionGroups,
        menuPlan,
        duplicateMenuCount,
        fetchResult.fetchMode
      )
      const inspection = this.appendResultStep(fetchResult.inspection, summary, fetchedMenus)

      this.deps.platformImportRunRepository.finish(importRunId, {
        status: 'completed',
        menuFetchCompleted,
        optionFetchCompleted,
        summaryJson: JSON.stringify(summary),
        errorMessage: null
      })

      return { summary, inspection }
    } catch (error) {
      this.deps.platformImportRunRepository.finish(importRunId, {
        status: 'partial_failed',
        menuFetchCompleted,
        optionFetchCompleted,
        summaryJson: null,
        errorMessage: error instanceof Error ? error.message : 'unknown_error'
      })
      throw error
    }
  }

  private assertCatalogCompleteness(
    completeness: PlatformMenuFetchResult['completeness'],
    expectsOptionCatalog: boolean
  ) {
    if (!completeness) {
      return
    }

    const issueSummary = completeness.issues.length > 0
      ? completeness.issues.join(',')
      : 'unknown'

    if (completeness.menuCatalog !== 'complete') {
      throw new Error(
        `platform_menu_catalog_${completeness.menuCatalog}:${issueSummary}`
      )
    }

    if (!expectsOptionCatalog) {
      return
    }

    if (completeness.optionCatalog !== 'complete') {
      throw new Error(
        `platform_option_catalog_${completeness.optionCatalog}:${issueSummary}`
      )
    }

    if (completeness.optionBindings !== 'complete') {
      throw new Error(
        `platform_option_bindings_${completeness.optionBindings}:${issueSummary}`
      )
    }
  }

  private normalizePlatformMenus(platformMenus: PlatformMenuSnapshot[]) {
    const uniqueMenus = new Map<string, PlatformMenuSnapshot>()

    for (const rawPlatformMenu of platformMenus) {
      const platformMenu = {
        ...rawPlatformMenu,
        platformMenuGroupName: rawPlatformMenu.platformMenuGroupName
          ? cleanCatalogCategoryName(rawPlatformMenu.platformMenuGroupName)
          : rawPlatformMenu.platformMenuGroupName
      }
      if (!platformMenu.platformMenuId.trim() || !platformMenu.platformMenuName.trim()) {
        continue
      }

      const existingMenu = uniqueMenus.get(platformMenu.platformMenuId)
      if (!existingMenu) {
        uniqueMenus.set(platformMenu.platformMenuId, platformMenu)
        continue
      }

      uniqueMenus.set(platformMenu.platformMenuId, {
        ...existingMenu,
        ...platformMenu,
        currentPrice: platformMenu.currentPrice ?? existingMenu.currentPrice,
        platformMenuGroupName:
          platformMenu.platformMenuGroupName ?? existingMenu.platformMenuGroupName,
        platformMenuStatus: platformMenu.platformMenuStatus ?? existingMenu.platformMenuStatus,
        platformMenuPriceSummary:
          platformMenu.platformMenuPriceSummary ?? existingMenu.platformMenuPriceSummary,
        platformMenuPriceVariants:
          platformMenu.platformMenuPriceVariants ?? existingMenu.platformMenuPriceVariants,
        platformMenuBindingLabels: this.mergeBindingLabels(
          existingMenu.platformMenuBindingLabels,
          platformMenu.platformMenuBindingLabels
        )
      })
    }

    return this.assignBindingMetadata([...uniqueMenus.values()])
  }

  private normalizePlatformOptionGroups(
    platformCode: PlatformCode,
    optionGroups: PlatformOptionGroupSnapshot[]
  ): PlatformOptionGroupRecord[] {
    return optionGroups.map((optionGroup) => ({
      platformCode,
      optionGroupId: optionGroup.optionGroupId,
      optionGroupName: optionGroup.optionGroupName,
      minOrderQuantity: optionGroup.minOrderQuantity ?? null,
      maxOrderQuantity: optionGroup.maxOrderQuantity ?? null,
      mappingMenusCount: optionGroup.mappingMenusCount ?? null,
      options: optionGroup.options,
      menus: optionGroup.menus.map((menu) => ({
        ...menu,
        platformMenuGroupName: menu.platformMenuGroupName
          ? cleanCatalogCategoryName(menu.platformMenuGroupName)
          : menu.platformMenuGroupName
      })),
      signatureKey: buildOptionSignature({
        optionGroupName: optionGroup.optionGroupName,
        minOrderQuantity: optionGroup.minOrderQuantity ?? null,
        maxOrderQuantity: optionGroup.maxOrderQuantity ?? null,
        options: optionGroup.options
      })
    }))
  }

  private assignBindingMetadata(platformMenus: PlatformMenuSnapshot[]) {
    const hasBindingSignals = platformMenus.some((platformMenu) => {
      const labels = this.mergeBindingLabels(platformMenu.platformMenuBindingLabels)
      return (
        labels.length > 0 ||
        Boolean(platformMenu.platformMenuBindingSummary) ||
        Boolean(platformMenu.platformMenuBindingStatus)
      )
    })

    if (!hasBindingSignals) {
      return platformMenus.map((platformMenu) => {
        const platformMenuBindingLabels = this.mergeBindingLabels(platformMenu.platformMenuBindingLabels)

        return {
          ...platformMenu,
          ...(platformMenuBindingLabels.length > 0 ? { platformMenuBindingLabels } : {})
        }
      })
    }

    const dominantBindingLabel = this.resolveDominantBindingLabel(platformMenus)

    return platformMenus.map((platformMenu) => {
      const platformMenuBindingLabels = this.mergeBindingLabels(platformMenu.platformMenuBindingLabels)
      const binding = this.resolveBindingMetadata(platformMenuBindingLabels, dominantBindingLabel)

      return {
        ...platformMenu,
        ...(platformMenuBindingLabels.length > 0 ? { platformMenuBindingLabels } : {}),
        ...(binding.summary ? { platformMenuBindingSummary: binding.summary } : {}),
        ...(binding.status ? { platformMenuBindingStatus: binding.status } : {})
      }
    })
  }

  private resolveDominantBindingLabel(platformMenus: PlatformMenuSnapshot[]) {
    const counts = new Map<string, number>()

    for (const platformMenu of platformMenus) {
      const labels = this.mergeBindingLabels(platformMenu.platformMenuBindingLabels)
      for (const label of labels) {
        counts.set(label, (counts.get(label) ?? 0) + 1)
      }
    }

    return [...counts.entries()].sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1]
      }

      return left[0].localeCompare(right[0], 'ko-KR')
    })[0]?.[0]
  }

  private resolveBindingMetadata(
    bindingLabels: string[],
    dominantBindingLabel?: string
  ): { summary?: string; status?: '연결 정상' | '가게 연결 없음' | '다른 가게 연결' | '복수 연결' } {
    if (bindingLabels.length === 0) {
      return {
        summary: '연결 가게 없음',
        status: '가게 연결 없음'
      }
    }

    const summary = bindingLabels.join(' / ')

    if (!dominantBindingLabel) {
      return { summary, status: '연결 정상' }
    }

    if (bindingLabels.includes(dominantBindingLabel)) {
      return {
        summary,
        status: bindingLabels.length === 1 ? '연결 정상' : '복수 연결'
      }
    }

    return {
      summary,
      status: bindingLabels.length === 1 ? '다른 가게 연결' : '복수 연결'
    }
  }

  private mergeBindingLabels(...values: Array<string[] | undefined>) {
    const labels = values
      .flatMap((value) => value ?? [])
      .map((label) => label.trim())
      .filter((label) => label.length > 0)

    return [...new Set(labels)]
  }

  private planExistingMappingRefreshes(
    platformCode: PlatformCode,
    mappings: PlatformMenuMappingRecord[],
    platformMenus: PlatformMenuSnapshot[],
    isCatalogActive: boolean
  ) {
    if (!isCatalogActive) {
      return {
        createdMenuCount: 0,
        linkedMappingCount: 0,
        verifiedMappingCount: 0,
        mappingUpserts: [] as PlatformMenuMappingRecord[]
      }
    }

    const mappingsByPlatformMenuId = new Map(
      mappings
        .filter((mapping) => mapping.platformCode === platformCode)
        .map((mapping) => [mapping.platformMenuId, mapping])
    )
    const mappingUpserts: PlatformMenuMappingRecord[] = []
    let verifiedMappingCount = 0

    for (const platformMenu of platformMenus) {
      const existingMapping = mappingsByPlatformMenuId.get(platformMenu.platformMenuId)
      if (!existingMapping) {
        continue
      }

      const hasBindingSummary = 'platformMenuBindingSummary' in platformMenu
      const hasBindingStatus = 'platformMenuBindingStatus' in platformMenu

      mappingUpserts.push({
        ...existingMapping,
        platformMenuName: platformMenu.platformMenuName,
        platformMenuCurrentPrice:
          platformMenu.currentPrice ?? existingMapping.platformMenuCurrentPrice ?? null,
        platformMenuPriceCount:
          platformMenu.platformMenuPriceCount ?? existingMapping.platformMenuPriceCount ?? null,
        platformMenuGroupName:
          platformMenu.platformMenuGroupName ?? existingMapping.platformMenuGroupName ?? null,
        platformMenuStatus:
          platformMenu.platformMenuStatus ?? existingMapping.platformMenuStatus ?? null,
        platformMenuPriceSummary:
          platformMenu.platformMenuPriceSummary ?? existingMapping.platformMenuPriceSummary ?? null,
        platformMenuPriceVariants:
          platformMenu.platformMenuPriceVariants ?? existingMapping.platformMenuPriceVariants ?? null,
        platformMenuBindingSummary:
          hasBindingSummary ? platformMenu.platformMenuBindingSummary ?? null : null,
        platformMenuBindingStatus:
          hasBindingStatus ? platformMenu.platformMenuBindingStatus ?? null : null
      })
      verifiedMappingCount += 1
    }

    return {
      createdMenuCount: 0,
      linkedMappingCount: 0,
      verifiedMappingCount,
      mappingUpserts
    }
  }

  private persistCatalogState(
    platformCode: PlatformCode,
    importRunId: string,
    platformMenus: PlatformMenuSnapshot[],
    optionGroups: PlatformOptionGroupRecord[]
  ) {
    this.deps.platformMenuRepository.upsertSeenBatch(
      platformCode,
      importRunId,
      platformMenus.map((platformMenu) => ({
        platformCode,
        platformMenuId: platformMenu.platformMenuId,
        platformMenuName: platformMenu.platformMenuName,
        platformMenuCurrentPrice: platformMenu.currentPrice ?? null,
        platformMenuPriceCount: platformMenu.platformMenuPriceCount ?? null,
        platformMenuGroupName: platformMenu.platformMenuGroupName ?? null,
        platformMenuStatus: platformMenu.platformMenuStatus ?? null,
        platformMenuPriceSummary: platformMenu.platformMenuPriceSummary ?? null,
        platformMenuPriceVariants: platformMenu.platformMenuPriceVariants ?? null,
        platformMenuBindingSummary: platformMenu.platformMenuBindingSummary ?? null,
        platformMenuBindingStatus: platformMenu.platformMenuBindingStatus ?? null
      }))
    )

    if (optionGroups.length > 0) {
      this.deps.platformOptionGroupRepository?.upsertSeenBatch(platformCode, importRunId, optionGroups)
    }
  }

  private buildLegacyPlatformMenuSeeds(
    platformCode: PlatformCode,
    previousMenus: PlatformMenuCatalogRecord[],
    mappings: PlatformMenuMappingRecord[]
  ) {
    const existingMenuIds = new Set(previousMenus.map((record) => record.platformMenuId))
    const legacySeeds = new Map<string, PlatformMenuCatalogRecord>()

    for (const mapping of mappings) {
      if (mapping.platformCode !== platformCode || mapping.mappingStatus === 'source_absent') {
        continue
      }

      if (existingMenuIds.has(mapping.platformMenuId) || legacySeeds.has(mapping.platformMenuId)) {
        continue
      }

      legacySeeds.set(mapping.platformMenuId, {
        platformCode,
        platformMenuId: mapping.platformMenuId,
        platformMenuName: mapping.platformMenuName,
        platformMenuCurrentPrice: mapping.platformMenuCurrentPrice ?? null,
        platformMenuPriceCount: mapping.platformMenuPriceCount ?? null,
        platformMenuGroupName: mapping.platformMenuGroupName ?? null,
        platformMenuStatus: mapping.platformMenuStatus ?? null,
        platformMenuPriceSummary: mapping.platformMenuPriceSummary ?? null,
        platformMenuPriceVariants: mapping.platformMenuPriceVariants ?? null,
        platformMenuBindingSummary: mapping.platformMenuBindingSummary ?? null,
        platformMenuBindingStatus: mapping.platformMenuBindingStatus ?? null,
        lastSeenImportId: null,
        missingStreak: 0,
        presenceStatus: 'present',
        presenceChangedAt: null
      })
    }

    return [...legacySeeds.values()]
  }

  private persistExistingMappingRefreshes(menuPlan: {
    mappingUpserts: PlatformMenuMappingRecord[]
  }) {
    for (const mapping of menuPlan.mappingUpserts) {
      this.deps.mappingRepository.upsert(mapping)
    }
  }

  private persistImportChanges(importRunId: string, changes: Array<{
    changeId: string
    importRunId: string
    platformCode: PlatformCode
    entityType: 'menu' | 'option_group'
    entityKey: string
    entityName: string
    changeType:
      | 'created'
      | 'missing_suspected'
      | 'absent_confirmed'
      | 'resurfaced'
      | 'name_changed'
      | 'price_changed'
      | 'option_signature_changed'
    presenceStatus?: 'present' | 'missing_suspected' | 'absent_confirmed' | 'resurfaced' | null
    beforeJson?: string | null
    afterJson?: string | null
  }>) {
    this.deps.platformImportChangeRepository.replaceForRun(importRunId, changes)
  }

  private applyMenuAbsenceSideEffects(platformCode: PlatformCode, changes: MenuPresenceChange[]) {
    const absentChanges = changes.filter((change) => change.changeType === 'absent_confirmed')
    if (absentChanges.length === 0) {
      return
    }

    const allMenus = this.deps.menuRepository.list()

    for (const change of absentChanges) {
      const affectedMappings = this.deps.mappingRepository.listAll().filter(
        (mapping) =>
          mapping.platformCode === platformCode && mapping.platformMenuId === change.entityKey
      )

      for (const mapping of affectedMappings) {
        if (mapping.mappingStatus === 'source_absent') {
          continue
        }

        this.deps.mappingRepository.setMappingStatus(mapping.mappingId, 'source_absent')

        const menuMappings = this.deps.mappingRepository.listForMenu(mapping.menuId)
        if (menuMappings.length === 0) {
          continue
        }

        const allSourceAbsent = menuMappings.every((entry) => entry.mappingStatus === 'source_absent')
        if (!allSourceAbsent) {
          continue
        }

        const menu = allMenus.find((entry) => entry.menuId === mapping.menuId)
        if (menu && menu.isManaged !== 0) {
          this.deps.menuRepository.upsert({
            ...menu,
            isManaged: 0
          })
        }
      }
    }
  }

  private refreshCatalogReviewItems(workspaceId: string) {
    const generatedItems = analyzeCatalogExceptions({
      workspaceId,
      menus: this.deps.menuRepository.list(),
      platformMenus: this.deps.platformMenuRepository.listAll(),
      mappings: this.deps.mappingRepository.listAll(),
      logicalOptionGroups: buildLogicalOptionGroups(
        this.deps.platformOptionGroupRepository?.listAll() ?? []
      )
    })
    const itemsWithIntent = applyIntentRules(
      generatedItems,
      this.deps.catalogIntentRuleRepository.listActive(workspaceId)
    )

    this.deps.catalogReviewRepository.replaceOpen(workspaceId, itemsWithIntent)
  }

  private buildSummary(
    platformCode: PlatformCode,
    platformMenus: PlatformMenuSnapshot[],
    optionGroups: PlatformOptionGroupRecord[],
    menuPlan: {
      createdMenuCount: number
      linkedMappingCount: number
      verifiedMappingCount: number
    },
    duplicateMenuCount: number,
    fetchMode?: PlatformImportFetchMode
  ): PlatformImportSummary {
    return {
      platformCode,
      fetchedCount: platformMenus.length,
      ...(optionGroups.length > 0 ? { optionGroupCount: optionGroups.length } : {}),
      ...(duplicateMenuCount > 0 ? { duplicateMenuCount } : {}),
      ...(fetchMode ? { fetchMode } : {}),
      createdMenuCount: menuPlan.createdMenuCount,
      linkedMappingCount: menuPlan.linkedMappingCount,
      verifiedMappingCount: menuPlan.verifiedMappingCount
    }
  }

  private appendResultStep(
    inspection: PlatformInspectionReport | undefined,
    summary: PlatformImportSummary,
    platformMenus: PlatformMenuSnapshot[]
  ) {
    if (!inspection) {
      return undefined
    }

    const sampleMenu = platformMenus[0]
    const fields = [
      { name: 'fetchedCount', value: String(summary.fetchedCount), usage: 'control' as const },
      ...(typeof summary.optionGroupCount === 'number'
        ? [{ name: 'optionGroupCount', value: String(summary.optionGroupCount), usage: 'control' as const }]
        : []),
      ...(typeof summary.duplicateMenuCount === 'number'
        ? [{ name: 'duplicateMenuCount', value: String(summary.duplicateMenuCount), usage: 'control' as const }]
        : []),
      ...(summary.fetchMode
        ? [{ name: 'fetchMode', value: summary.fetchMode, usage: 'control' as const }]
        : []),
      { name: 'createdMenuCount', value: String(summary.createdMenuCount), usage: 'control' as const },
      { name: 'linkedMappingCount', value: String(summary.linkedMappingCount), usage: 'control' as const },
      { name: 'verifiedMappingCount', value: String(summary.verifiedMappingCount), usage: 'control' as const },
      ...(sampleMenu
        ? [
            { name: 'sample.platformMenuId', value: sampleMenu.platformMenuId, usage: 'used' as const },
            { name: 'sample.platformMenuName', value: sampleMenu.platformMenuName, usage: 'used' as const },
            { name: 'sample.currentPrice', value: String(sampleMenu.currentPrice ?? 0), usage: 'used' as const },
            {
              name: 'sample.platformMenuPriceCount',
              value: String(sampleMenu.platformMenuPriceCount ?? 0),
              usage: 'used' as const
            },
            {
              name: 'sample.platformMenuGroupName',
              value: sampleMenu.platformMenuGroupName ?? '-',
              usage: 'used' as const
            },
            {
              name: 'sample.platformMenuStatus',
              value: sampleMenu.platformMenuStatus ?? '-',
              usage: 'used' as const
            },
            {
              name: 'sample.platformMenuPriceSummary',
              value: sampleMenu.platformMenuPriceSummary ?? '-',
              usage: 'used' as const
            },
            {
              name: 'sample.platformMenuPriceVariants',
              value: sampleMenu.platformMenuPriceVariants?.length
                ? JSON.stringify(sampleMenu.platformMenuPriceVariants)
                : '-',
              usage: 'used' as const
            },
            {
              name: 'sample.platformMenuBindingStatus',
              value: sampleMenu.platformMenuBindingStatus ?? '-',
              usage: 'used' as const
            },
            {
              name: 'sample.platformMenuBindingSummary',
              value: sampleMenu.platformMenuBindingSummary ?? '-',
              usage: 'used' as const
            }
          ]
        : [])
    ]

    const step = {
      kind: 'result' as const,
      title: '가져오기 완료',
      recordedAt: new Date().toISOString(),
      detail: this.buildResultDetail(summary),
      fields
    }

    inspection.steps = [...inspection.steps, step]
    return inspection
  }

  private buildResultDetail(summary: PlatformImportSummary) {
    const subject =
      typeof summary.optionGroupCount === 'number'
        ? `메뉴 ${summary.fetchedCount}개와 옵션 그룹 ${summary.optionGroupCount}개`
        : `메뉴 ${summary.fetchedCount}개`
    const detailSuffix = [
      typeof summary.duplicateMenuCount === 'number' && summary.duplicateMenuCount > 0
        ? `중복 ${summary.duplicateMenuCount}건을 정리했습니다.`
        : null,
      summary.fetchMode === 'managed_browser'
        ? '현재 로그인된 전용 크롬 세션에서 읽었습니다.'
        : null
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ')

    if (summary.createdMenuCount > 0 || summary.linkedMappingCount > 0) {
      return `${subject}를 읽고 새 메뉴 ${summary.createdMenuCount}개, 새 연결 ${summary.linkedMappingCount}개를 반영했습니다.${detailSuffix ? ` ${detailSuffix}` : ''}`
    }

    if (summary.verifiedMappingCount > 0) {
      return `${subject}를 다시 확인했고 기존 연결 ${summary.verifiedMappingCount}개를 유지했습니다.${detailSuffix ? ` ${detailSuffix}` : ''}`
    }

    return `${subject}를 읽었습니다.${detailSuffix ? ` ${detailSuffix}` : ''}`
  }

  private buildMenuRows(platformMenus: PlatformMenuSnapshot[]) {
    return platformMenus.map((platformMenu) => ({
      key: platformMenu.platformMenuId,
      name: platformMenu.platformMenuName,
      comparable: {
        platformMenuName: platformMenu.platformMenuName,
        platformMenuCurrentPrice: platformMenu.currentPrice ?? null,
        platformMenuPriceCount: platformMenu.platformMenuPriceCount ?? null,
        platformMenuGroupName: platformMenu.platformMenuGroupName ?? null,
        platformMenuStatus: platformMenu.platformMenuStatus ?? null,
        platformMenuPriceSummary: platformMenu.platformMenuPriceSummary ?? null,
        platformMenuPriceVariants: platformMenu.platformMenuPriceVariants ?? null,
        platformMenuBindingSummary: platformMenu.platformMenuBindingSummary ?? null,
        platformMenuBindingStatus: platformMenu.platformMenuBindingStatus ?? null
      }
    }))
  }

  private buildOptionGroupRows(optionGroups: PlatformOptionGroupRecord[]) {
    return optionGroups.map((optionGroup) => ({
      key: optionGroup.optionGroupId,
      name: optionGroup.optionGroupName,
      comparable: {
        signatureKey: optionGroup.signatureKey ?? buildOptionSignature(optionGroup),
        mappingMenusCount: optionGroup.mappingMenusCount ?? null
      }
    }))
  }

}

export const createCatalogImportOrchestrator = (deps: CatalogImportOrchestratorDependencies) =>
  new CatalogImportOrchestrator(deps)
