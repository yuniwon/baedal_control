import { createHash } from 'node:crypto'

import type {
  CatalogBootstrapActivationInput,
  CatalogBootstrapPreview,
  CatalogBootstrapPreviewInput,
  CatalogReviewItem,
  CatalogWorkspaceRecord,
  MenuRecord,
  PlatformCode,
  PlatformImportRunRecord,
  PlatformMenuCatalogRecord,
  PlatformMenuMappingRecord
} from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'
import { withSavepoint } from '../db/savepoint'
import { isSafeAutoLinkMatch } from './menu-matcher'

interface CatalogBootstrapServiceDependencies {
  db: DatabaseConnection
  menuRepository: {
    list(): MenuRecord[]
    upsert(record: MenuRecord): void
  }
  mappingRepository: {
    listAll(): PlatformMenuMappingRecord[]
    upsert(record: PlatformMenuMappingRecord): void
  }
  platformMenuRepository: {
    listAll(): PlatformMenuCatalogRecord[]
  }
  platformImportRunRepository: {
    listLatest(limit?: number): PlatformImportRunRecord[]
  }
  workspaceRepository: {
    getDefault(): CatalogWorkspaceRecord
    save(record: CatalogWorkspaceRecord): void
  }
  reviewRepository: {
    replaceOpen(workspaceId: string, items: CatalogReviewItem[]): void
  }
  now?: () => string
}

const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

const sourceKey = (platformCode: PlatformCode, platformMenuId: string) =>
  `${platformCode}:${platformMenuId}`

export class CatalogBootstrapService {
  constructor(private readonly deps: CatalogBootstrapServiceDependencies) {}

  preview(input: CatalogBootstrapPreviewInput): CatalogBootstrapPreview {
    const workspace = this.assertWorkspaceCanBootstrap(input.workspaceId)

    if (input.seedMode === 'blank') {
      if (input.seedPlatformCode !== null) {
        throw new Error('blank_seed_platform_must_be_null')
      }

      return {
        workspaceId: workspace.workspaceId,
        seedMode: 'blank',
        seedPlatformCode: null,
        previewFingerprint: hash([workspace.workspaceId, 'blank']),
        draftMenus: [],
        suggestedMappings: [],
        reviewItems: []
      }
    }

    const seedPlatformCode = input.seedPlatformCode
    if (!seedPlatformCode) {
      throw new Error('seed_platform_required')
    }

    const latestRuns = this.buildLatestRunMap()
    const latestSeedRun = latestRuns.get(seedPlatformCode)
    if (!this.isCompleteMenuRun(latestSeedRun)) {
      throw new Error(`seed_catalog_not_complete:${seedPlatformCode}`)
    }

    const allSourceMenus = this.deps.platformMenuRepository.listAll()
    const seedSourceMenus = this.currentSourceMenus(
      allSourceMenus,
      seedPlatformCode,
      latestSeedRun.importRunId
    )
    const draftMenus = seedSourceMenus.map((source) => ({
      menuId: this.buildDraftMenuId(workspace.workspaceId, source),
      sourcePlatformCode: source.platformCode,
      sourcePlatformMenuId: source.platformMenuId,
      baseName: source.platformMenuName,
      basePrice: source.platformMenuCurrentPrice ?? 0,
      basePriceVariants: source.platformMenuPriceVariants ?? null,
      disposition: 'include' as const
    }))
    const seedMappings = seedSourceMenus.map((source, index) =>
      this.buildMapping(draftMenus[index].menuId, source, 'auto', 1)
    )
    const crossPlatform = this.buildCrossPlatformSuggestions({
      workspaceId: workspace.workspaceId,
      seedPlatformCode,
      draftMenus,
      allSourceMenus,
      latestRuns
    })
    const fingerprintRows = [...latestRuns.entries()]
      .filter(([, run]) => this.isCompleteMenuRun(run))
      .flatMap(([platformCode, run]) =>
        this.currentSourceMenus(allSourceMenus, platformCode, run.importRunId).map((source) => ({
          platformCode,
          platformMenuId: source.platformMenuId,
          platformMenuName: source.platformMenuName,
          platformMenuCurrentPrice: source.platformMenuCurrentPrice ?? null,
          platformMenuPriceVariants: source.platformMenuPriceVariants ?? null,
          presenceStatus: source.presenceStatus ?? 'present'
        }))
      )
      .sort((left, right) =>
        sourceKey(left.platformCode, left.platformMenuId).localeCompare(
          sourceKey(right.platformCode, right.platformMenuId)
        )
      )

    return {
      workspaceId: workspace.workspaceId,
      seedMode: 'platform',
      seedPlatformCode,
      previewFingerprint: hash([
        workspace.workspaceId,
        seedPlatformCode,
        [...latestRuns.entries()].map(([platformCode, run]) => [platformCode, run.importRunId]),
        fingerprintRows
      ]),
      draftMenus,
      suggestedMappings: [...seedMappings, ...crossPlatform.suggestedMappings],
      reviewItems: crossPlatform.reviewItems
    }
  }

  activate(input: CatalogBootstrapActivationInput): CatalogWorkspaceRecord {
    const currentPreview = this.preview({
      workspaceId: input.workspaceId,
      seedMode: input.seedMode,
      seedPlatformCode: input.seedPlatformCode
    })
    if (currentPreview.previewFingerprint !== input.previewFingerprint) {
      throw new Error('catalog_preview_stale')
    }

    this.validateActivation(input, currentPreview)

    return withSavepoint(this.deps.db, () => {
      for (const menu of input.menus) {
        this.deps.menuRepository.upsert(menu)
      }

      for (const mapping of input.confirmedMappings) {
        this.deps.mappingRepository.upsert(mapping)
      }

      this.deps.reviewRepository.replaceOpen(input.workspaceId, input.remainingReviewItems)

      const current = this.deps.workspaceRepository.getDefault()
      const active: CatalogWorkspaceRecord = {
        ...current,
        lifecycleState: 'active',
        seedMode: input.seedMode,
        seedPlatformCode: input.seedPlatformCode,
        canonicalVersion: 1,
        activatedAt: this.deps.now?.() ?? new Date().toISOString()
      }
      this.deps.workspaceRepository.save(active)
      return this.deps.workspaceRepository.getDefault()
    })
  }

  private assertWorkspaceCanBootstrap(workspaceId: string) {
    const workspace = this.deps.workspaceRepository.getDefault()
    if (workspace.workspaceId !== workspaceId) {
      throw new Error(`catalog_workspace_missing:${workspaceId}`)
    }
    if (workspace.lifecycleState === 'active') {
      throw new Error('catalog_already_active')
    }
    return workspace
  }

  private buildLatestRunMap() {
    const latestRuns = new Map<PlatformCode, PlatformImportRunRecord>()
    for (const run of this.deps.platformImportRunRepository.listLatest(200)) {
      if (!latestRuns.has(run.platformCode)) {
        latestRuns.set(run.platformCode, run)
      }
    }
    return latestRuns
  }

  private isCompleteMenuRun(run?: PlatformImportRunRecord): run is PlatformImportRunRecord {
    return Boolean(run && run.status === 'completed' && run.menuFetchCompleted === 1)
  }

  private currentSourceMenus(
    allSourceMenus: PlatformMenuCatalogRecord[],
    platformCode: PlatformCode,
    importRunId: string
  ) {
    return allSourceMenus
      .filter(
        (source) =>
          source.platformCode === platformCode &&
          source.lastSeenImportId === importRunId &&
          source.presenceStatus !== 'absent_confirmed'
      )
      .sort((left, right) =>
        left.platformMenuName.localeCompare(right.platformMenuName, 'ko-KR') ||
        left.platformMenuId.localeCompare(right.platformMenuId)
      )
  }

  private buildDraftMenuId(workspaceId: string, source: PlatformMenuCatalogRecord) {
    return hash([workspaceId, source.platformCode, source.platformMenuId]).slice(0, 32)
  }

  private buildCrossPlatformSuggestions({
    workspaceId,
    seedPlatformCode,
    draftMenus,
    allSourceMenus,
    latestRuns
  }: {
    workspaceId: string
    seedPlatformCode: PlatformCode
    draftMenus: CatalogBootstrapPreview['draftMenus']
    allSourceMenus: PlatformMenuCatalogRecord[]
    latestRuns: Map<PlatformCode, PlatformImportRunRecord>
  }) {
    const rawCandidates: Array<{
      source: PlatformMenuCatalogRecord
      menuId: string | null
    }> = []

    for (const [platformCode, run] of latestRuns) {
      if (platformCode === seedPlatformCode || !this.isCompleteMenuRun(run)) {
        continue
      }
      for (const source of this.currentSourceMenus(allSourceMenus, platformCode, run.importRunId)) {
        const safeMatches = draftMenus.filter((draft) =>
          isSafeAutoLinkMatch(draft.baseName, source.platformMenuName)
        )
        rawCandidates.push({ source, menuId: safeMatches.length === 1 ? safeMatches[0].menuId : null })
      }
    }

    const targetCounts = new Map<string, number>()
    for (const candidate of rawCandidates) {
      if (candidate.menuId) {
        const key = `${candidate.source.platformCode}:${candidate.menuId}`
        targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1)
      }
    }

    const suggestedMappings: PlatformMenuMappingRecord[] = []
    const reviewItems: CatalogReviewItem[] = []
    for (const candidate of rawCandidates) {
      const targetKey = candidate.menuId
        ? `${candidate.source.platformCode}:${candidate.menuId}`
        : null
      if (candidate.menuId && targetKey && targetCounts.get(targetKey) === 1) {
        suggestedMappings.push(this.buildMapping(candidate.menuId, candidate.source, 'auto', 0))
        continue
      }

      const evidence = {
        platformCode: candidate.source.platformCode,
        platformMenuId: candidate.source.platformMenuId,
        platformMenuName: candidate.source.platformMenuName,
        candidateMenuId: candidate.menuId,
        duplicateSafeMatch: Boolean(targetKey && (targetCounts.get(targetKey) ?? 0) > 1)
      }
      reviewItems.push({
        reviewItemId: hash([workspaceId, 'review', evidence]).slice(0, 32),
        workspaceId,
        fingerprint: hash(['unmatched_platform_menu', evidence]),
        kind: 'unmatched_platform_menu',
        state: 'open',
        confidence: candidate.menuId ? 0.8 : 0.5,
        title: `${candidate.source.platformMenuName} 메뉴의 연결을 확인해 주세요`,
        explanation: candidate.menuId
          ? '같은 통합 메뉴에 연결될 수 있는 원본이 중복되어 자동으로 확정하지 않았습니다.'
          : '초기 기준 플랫폼에서 안전하게 일치하는 메뉴를 찾지 못했습니다.',
        recommendation: 'add_to_canonical',
        evidenceJson: JSON.stringify(evidence),
        platformCode: candidate.source.platformCode,
        sourceEntityId: candidate.source.platformMenuId,
        canonicalMenuId: candidate.menuId,
        intentRuleId: null
      })
    }

    return { suggestedMappings, reviewItems }
  }

  private buildMapping(
    menuId: string,
    source: PlatformMenuCatalogRecord,
    matchedBy: PlatformMenuMappingRecord['matchedBy'],
    isConfirmed: number
  ): PlatformMenuMappingRecord {
    return {
      mappingId: `${menuId}:${source.platformCode}`,
      menuId,
      platformCode: source.platformCode,
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
      mappingStatus: 'active',
      matchedBy,
      isConfirmed
    }
  }

  private validateActivation(
    input: CatalogBootstrapActivationInput,
    preview: CatalogBootstrapPreview
  ) {
    const menuIds = new Set(input.menus.map((menu) => menu.menuId))
    if (menuIds.size !== input.menus.length) {
      throw new Error('catalog_duplicate_menu_id')
    }

    const mappingSourceKeys = new Set<string>()
    const mappingTargetKeys = new Set<string>()
    for (const mapping of input.confirmedMappings) {
      if (!menuIds.has(mapping.menuId)) {
        throw new Error(`catalog_mapping_menu_missing:${mapping.menuId}`)
      }
      const source = sourceKey(mapping.platformCode, mapping.platformMenuId)
      const target = `${mapping.platformCode}:${mapping.menuId}`
      if (mappingSourceKeys.has(source) || mappingTargetKeys.has(target)) {
        throw new Error(`catalog_duplicate_mapping:${source}`)
      }
      mappingSourceKeys.add(source)
      mappingTargetKeys.add(target)
    }

    if (preview.seedMode === 'platform' && preview.seedPlatformCode) {
      const ignored = new Set(input.ignoredSourceEntityIds)
      const validSeedIds = new Set(
        preview.draftMenus
          .filter((draft) => draft.sourcePlatformMenuId)
          .map((draft) => draft.sourcePlatformMenuId as string)
      )
      for (const ignoredId of ignored) {
        if (!validSeedIds.has(ignoredId)) {
          throw new Error(`catalog_ignored_source_missing:${ignoredId}`)
        }
      }
      for (const sourceId of validSeedIds) {
        const mapped = input.confirmedMappings.some(
          (mapping) =>
            mapping.platformCode === preview.seedPlatformCode &&
            mapping.platformMenuId === sourceId &&
            mapping.isConfirmed === 1
        )
        if (!mapped && !ignored.has(sourceId)) {
          throw new Error(`catalog_seed_source_undecided:${sourceId}`)
        }
      }
    }
  }
}
