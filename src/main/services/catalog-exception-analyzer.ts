import { createHash } from 'node:crypto'

import type {
  CatalogReviewItem,
  CatalogReviewKind,
  CatalogReviewRecommendation,
  LogicalOptionGroupRecord,
  MenuRecord,
  PlatformCode,
  PlatformMenuCatalogRecord,
  PlatformMenuMappingRecord
} from '../../shared/contracts'
import {
  catalogCategoryIdentity,
  cleanCatalogCategoryName
} from '../../shared/catalog-normalization'
import { isSafeAutoLinkMatch, scoreMenuMatch } from './menu-matcher'

type OptionPresenceRole =
  | 'paid_add_on'
  | 'bundle_selection'
  | 'included_selection'
  | 'mixed_selection'

type OptionPresenceMatch = {
  group: LogicalOptionGroupRecord
  optionName: string
  optionPrice: number
  role: OptionPresenceRole
}

const OPTION_NAME_ALIASES: Record<string, string> = {
  갈릭디핑: '갈릭소스',
  국산피클: '피클',
  '파마산 치즈가루': '치즈가루',
  요거트소스: '요거트'
}

const normalizeOptionName = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/\s+/g, '')
    .replace(/\d+(?:개|조각)\s*$/u, '')

const isEquivalentOptionName = (canonicalName: string, optionName: string) => {
  if (isSafeAutoLinkMatch(canonicalName, optionName)) {
    return true
  }

  const canonicalKey = normalizeOptionName(canonicalName)
  const optionKey = normalizeOptionName(optionName)
  return OPTION_NAME_ALIASES[canonicalName] === optionName ||
    OPTION_NAME_ALIASES[canonicalName] === optionKey ||
    canonicalKey === optionKey
}

const resolveOptionPresenceRole = (
  group: LogicalOptionGroupRecord,
  optionPrice: number
): Exclude<OptionPresenceRole, 'mixed_selection'> => {
  if (/(?:세트|반반|피자|메뉴)\s*선택/iu.test(group.displayName)) {
    return 'bundle_selection'
  }

  return optionPrice > 0 ? 'paid_add_on' : 'included_selection'
}

const findOptionPresenceMatches = (
  canonicalName: string,
  platformCode: PlatformCode,
  logicalOptionGroups: LogicalOptionGroupRecord[]
): OptionPresenceMatch[] => logicalOptionGroups
  .filter(
    (group) =>
      group.platformCode === platformCode &&
      group.status !== 'absent_confirmed' &&
      group.status !== 'missing_suspected'
  )
  .flatMap((group) => {
    return group.logicalOptions
      .filter((option) => isEquivalentOptionName(canonicalName, option.optionName))
      .map((option) => ({
        group,
        optionName: option.optionName,
        optionPrice: option.optionPrice,
        role: resolveOptionPresenceRole(group, option.optionPrice)
      }))
  })
  .sort(
    (left, right) =>
      left.group.logicalGroupKey.localeCompare(right.group.logicalGroupKey) ||
      left.optionName.localeCompare(right.optionName, 'ko-KR') ||
      left.optionPrice - right.optionPrice
  )

export interface CatalogExceptionAnalysisInput {
  workspaceId: string
  referencePlatformCode?: PlatformCode | null
  menus: MenuRecord[]
  platformMenus: PlatformMenuCatalogRecord[]
  mappings: PlatformMenuMappingRecord[]
  logicalOptionGroups: LogicalOptionGroupRecord[]
}

const stableFingerprint = (parts: unknown[]) =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex')

const normalizeReviewEvidence = (evidence: Record<string, unknown>) => {
  const categoryKey = typeof evidence.categoryKey === 'string'
    ? cleanCatalogCategoryName(evidence.categoryKey)
    : evidence.categoryKey
  return { ...evidence, categoryKey }
}

const fingerprintEvidence = (evidence: Record<string, unknown>) => ({
  ...evidence,
  ...(typeof evidence.categoryKey === 'string'
    ? { categoryKey: catalogCategoryIdentity(evidence.categoryKey) }
    : {})
})

const createReviewItem = (input: {
  workspaceId: string
  kind: CatalogReviewKind
  confidence: number
  title: string
  explanation: string
  recommendation: CatalogReviewRecommendation | null
  evidence: Record<string, unknown>
  canonicalMenuId?: string | null
  platformCode?: PlatformCode | null
  sourceEntityId?: string | null
}) => {
  const evidence = normalizeReviewEvidence(input.evidence)
  const fingerprint = stableFingerprint([
    input.workspaceId,
    input.kind,
    input.canonicalMenuId ?? null,
    input.platformCode ?? null,
    input.sourceEntityId ?? null,
    fingerprintEvidence(evidence)
  ])

  return {
    reviewItemId: `review-${fingerprint.slice(0, 24)}`,
    workspaceId: input.workspaceId,
    fingerprint,
    kind: input.kind,
    state: 'open',
    confidence: Math.max(0, Math.min(1, input.confidence)),
    title: input.title,
    explanation: input.explanation,
    recommendation: input.recommendation,
    evidenceJson: JSON.stringify(evidence),
    canonicalMenuId: input.canonicalMenuId ?? null,
    platformCode: input.platformCode ?? null,
    sourceEntityId: input.sourceEntityId ?? null,
    intentRuleId: null
  } satisfies CatalogReviewItem
}

const compareItems = (left: CatalogReviewItem, right: CatalogReviewItem) =>
  left.kind.localeCompare(right.kind) ||
  (left.platformCode ?? '').localeCompare(right.platformCode ?? '') ||
  (left.canonicalMenuId ?? '').localeCompare(right.canonicalMenuId ?? '') ||
  (left.sourceEntityId ?? '').localeCompare(right.sourceEntityId ?? '') ||
  left.fingerprint.localeCompare(right.fingerprint)

const classifyMatch = (canonicalMenus: MenuRecord[], sourceName: string) => {
  const safe = canonicalMenus.filter((menu) => isSafeAutoLinkMatch(menu.baseName, sourceName))
  if (safe.length === 1) {
    return {
      level: 'unique_safe' as const,
      confidence: 1,
      canonicalMenuId: safe[0].menuId,
      canonicalName: safe[0].baseName
    }
  }

  const ranked = canonicalMenus
    .map((menu) => ({
      canonicalMenuId: menu.menuId,
      canonicalName: menu.baseName,
      score: scoreMenuMatch(menu.baseName, sourceName)
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.canonicalMenuId.localeCompare(right.canonicalMenuId)
    )

  return {
    level: safe.length > 1 ? 'ambiguous_safe' as const : 'recommendation' as const,
    confidence: safe.length > 1 ? 0.5 : ranked[0]?.score ?? 0,
    canonicalMenuId: safe.length > 1 ? null : ranked[0]?.canonicalMenuId ?? null,
    canonicalName: safe.length > 1 ? null : ranked[0]?.canonicalName ?? null
  }
}

const analyzeMissingAndUnmatched = (
  input: CatalogExceptionAnalysisInput
): CatalogReviewItem[] => {
  const items: CatalogReviewItem[] = []
  const referenceMenuIds = input.referencePlatformCode
    ? new Set(
        input.mappings
          .filter(
            (mapping) =>
              mapping.platformCode === input.referencePlatformCode &&
              mapping.mappingStatus !== 'source_absent'
          )
          .map((mapping) => mapping.menuId)
      )
    : null
  const managedMenus = input.menus.filter(
    (menu) =>
      (menu.isManaged ?? 1) === 1 &&
      (!referenceMenuIds || referenceMenuIds.has(menu.menuId))
  )
  const platforms = [
    ...new Set([
      ...input.platformMenus.map((menu) => menu.platformCode),
      ...input.logicalOptionGroups.map((group) => group.platformCode)
    ])
  ].sort()
  const activeMappingKeys = new Set(
    input.mappings
      .filter((mapping) => mapping.mappingStatus !== 'source_absent')
      .map((mapping) => `${mapping.menuId}:${mapping.platformCode}`)
  )
  const mappedSourceKeys = new Set(
    input.mappings.map((mapping) => `${mapping.platformCode}:${mapping.platformMenuId}`)
  )

  for (const platformCode of platforms) {
    const platformSources = input.platformMenus.filter(
      (source) =>
        source.platformCode === platformCode && source.presenceStatus !== 'absent_confirmed'
    )

    for (const canonicalMenu of managedMenus) {
      if (activeMappingKeys.has(`${canonicalMenu.menuId}:${platformCode}`)) {
        continue
      }

      const safeCandidates = platformSources.filter(
        (source) =>
          !mappedSourceKeys.has(`${platformCode}:${source.platformMenuId}`) &&
          isSafeAutoLinkMatch(canonicalMenu.baseName, source.platformMenuName)
      )
      if (safeCandidates.length === 1) {
        continue
      }

      const optionMatches = findOptionPresenceMatches(
        canonicalMenu.baseName,
        platformCode,
        input.logicalOptionGroups
      )
      if (optionMatches.length > 0) {
        const optionRoles = [...new Set(optionMatches.map((match) => match.role))]
        const optionRole = optionRoles.length === 1 ? optionRoles[0] : 'mixed_selection'
        const firstMatch = optionMatches[0]

        items.push(createReviewItem({
          workspaceId: input.workspaceId,
          kind: 'option_only_on_platform',
          confidence: 1,
          title: `${canonicalMenu.baseName} 메뉴가 일반 메뉴가 아닌 옵션으로만 있습니다`,
          explanation:
            optionRole === 'paid_add_on'
              ? '해당 플랫폼에서는 유료 옵션으로 제공되며, 별도 사이드·소스 메뉴는 확인되지 않았습니다.'
              : optionRole === 'bundle_selection'
                ? '해당 플랫폼에서는 세트·반반 메뉴의 선택 옵션으로만 제공되며, 별도 메뉴는 확인되지 않았습니다.'
              : optionRole === 'included_selection'
                ? '해당 플랫폼에서는 세트·반반 메뉴의 포함 옵션으로만 제공되며, 별도 메뉴는 확인되지 않았습니다.'
                : '해당 플랫폼에서 유료 옵션과 포함 옵션이 함께 확인되며, 별도 메뉴는 확인되지 않았습니다.',
          recommendation: 'add_to_platform',
          canonicalMenuId: canonicalMenu.menuId,
          platformCode,
          sourceEntityId: firstMatch.group.logicalGroupKey,
          evidence: {
            canonicalMenuId: canonicalMenu.menuId,
            canonicalName: canonicalMenu.baseName,
            platformCode,
            fieldKey: 'presence',
            surface: 'option',
            optionRole,
            signals: {
              confirmedGeneralMenuMissing: true,
              optionOnlyPresence: true,
              optionMatchCount: optionMatches.length
            },
            optionMatches: optionMatches.map((match) => ({
              optionGroupKey: match.group.logicalGroupKey,
              optionGroupName: match.group.displayName,
              optionName: match.optionName,
              optionPrice: match.optionPrice,
              optionRole: match.role
            }))
          }
        }))
        continue
      }

      items.push(createReviewItem({
        workspaceId: input.workspaceId,
        kind: 'missing_on_platform',
        confidence: 1,
        title: `${canonicalMenu.baseName} 메뉴가 플랫폼에 연결되지 않았습니다`,
        explanation: '의도적인 미판매인지 누락인지 결정이 필요합니다.',
        recommendation: 'add_to_platform',
        canonicalMenuId: canonicalMenu.menuId,
        platformCode,
        evidence: {
          canonicalMenuId: canonicalMenu.menuId,
          canonicalName: canonicalMenu.baseName,
          platformCode,
          fieldKey: 'presence',
          signals: {
            confirmedPlatformMappingMissing: true,
            uniqueSafeUnmappedSourceCount: safeCandidates.length
          },
          sourceEntityIds: safeCandidates.map((source) => source.platformMenuId).sort()
        }
      }))
    }
  }

  for (const platformMenu of input.platformMenus) {
    if (
      platformMenu.presenceStatus === 'absent_confirmed' ||
      mappedSourceKeys.has(`${platformMenu.platformCode}:${platformMenu.platformMenuId}`)
    ) {
      continue
    }

    const match = classifyMatch(managedMenus, platformMenu.platformMenuName)
    items.push(createReviewItem({
      workspaceId: input.workspaceId,
      kind: 'unmatched_platform_menu',
      confidence: match.confidence,
      title: `${platformMenu.platformMenuName} 원본 메뉴의 연결을 확인해야 합니다`,
      explanation:
        match.level === 'unique_safe'
          ? '이름이 안전하게 일치하는 통합 메뉴가 하나 있지만 자동으로 연결하지 않았습니다.'
          : '기존 통합 메뉴인지 새 메뉴인지 사람이 결정해야 합니다.',
      recommendation: match.level === 'unique_safe' ? 'align_to_canonical' : 'add_to_canonical',
      canonicalMenuId: match.canonicalMenuId,
      platformCode: platformMenu.platformCode,
      sourceEntityId: platformMenu.platformMenuId,
      evidence: {
        platformCode: platformMenu.platformCode,
        sourceEntityIds: [platformMenu.platformMenuId],
        sourceName: platformMenu.platformMenuName,
        sourcePrice: platformMenu.platformMenuCurrentPrice ?? null,
        categoryKey: platformMenu.platformMenuGroupName ?? null,
        match
      }
    }))
  }

  return items
}

const analyzePrices = (input: CatalogExceptionAnalysisInput): CatalogReviewItem[] => {
  const sourceByKey = new Map(
    input.platformMenus.map((source) => [
      `${source.platformCode}:${source.platformMenuId}`,
      source
    ])
  )
  const menuById = new Map(input.menus.map((menu) => [menu.menuId, menu]))
  const sizeFamilyKeys = new Set<string>()
  const mappingsByMenuPlatform = new Map<string, typeof input.mappings>()
  for (const mapping of input.mappings) {
    if (mapping.mappingStatus === 'source_absent') continue
    const key = `${mapping.menuId}:${mapping.platformCode}`
    const rows = mappingsByMenuPlatform.get(key) ?? []
    rows.push(mapping)
    mappingsByMenuPlatform.set(key, rows)
  }
  for (const [key, mappings] of mappingsByMenuPlatform) {
    const canonicalMenu = menuById.get(mappings[0].menuId)
    if (!canonicalMenu) continue
    const sizes = new Set(
      mappings.flatMap((mapping) => {
        const name = sourceByKey.get(`${mapping.platformCode}:${mapping.platformMenuId}`)
          ?.platformMenuName ?? mapping.platformMenuName
        const match = name.match(/[\s(（]([ML])(?:[)）])?\s*$/iu)
        return match ? [match[1].toUpperCase()] : []
      })
    )
    const hasBasePrice = mappings.some((mapping) => {
      const source = sourceByKey.get(`${mapping.platformCode}:${mapping.platformMenuId}`)
      return (source?.platformMenuCurrentPrice ?? mapping.platformMenuCurrentPrice) === canonicalMenu.basePrice
    })
    if (sizes.size >= 2 && hasBasePrice) sizeFamilyKeys.add(key)
  }

  return input.mappings.flatMap((mapping) => {
    if (mapping.mappingStatus === 'source_absent') {
      return []
    }

    const canonicalMenu = menuById.get(mapping.menuId)
    const source = sourceByKey.get(`${mapping.platformCode}:${mapping.platformMenuId}`)
    const platformPrice = source?.platformMenuCurrentPrice ?? mapping.platformMenuCurrentPrice
    const canonicalVariantPrices = new Set(
      canonicalMenu?.basePriceVariants
        ?.flatMap((variant) => variant.channels)
        .flatMap((channel) => typeof channel.amount === 'number' ? [channel.amount] : [])
      ?? []
    )
    if (
      !canonicalMenu ||
      (canonicalMenu.isManaged ?? 1) !== 1 ||
      platformPrice == null ||
      platformPrice === canonicalMenu.basePrice ||
      canonicalVariantPrices.has(platformPrice) ||
      sizeFamilyKeys.has(`${mapping.menuId}:${mapping.platformCode}`)
    ) {
      return []
    }

    return [createReviewItem({
      workspaceId: input.workspaceId,
      kind: 'price_outlier',
      confidence: 1,
      title: `${canonicalMenu.baseName} 가격이 플랫폼과 다릅니다`,
      explanation: '실수인지 플랫폼별 가격 전략인지 결정이 필요합니다.',
      recommendation: 'manual_review',
      canonicalMenuId: canonicalMenu.menuId,
      platformCode: mapping.platformCode,
      sourceEntityId: mapping.platformMenuId,
      evidence: {
        canonicalMenuId: canonicalMenu.menuId,
        platformCode: mapping.platformCode,
        fieldKey: 'base_price',
        categoryKey: source?.platformMenuGroupName ?? mapping.platformMenuGroupName ?? null,
        canonicalPrice: canonicalMenu.basePrice,
        platformPrice,
        difference: platformPrice - canonicalMenu.basePrice,
        sourceEntityIds: [mapping.platformMenuId]
      }
    })]
  })
}

const analyzeOptionGroups = (input: CatalogExceptionAnalysisInput): CatalogReviewItem[] =>
  input.logicalOptionGroups.flatMap((group) => {
    if (group.status !== 'merge_candidate' && group.status !== 'shape_conflict') {
      return []
    }

    const isMerge = group.status === 'merge_candidate'
    const kind: CatalogReviewKind = isMerge
      ? 'duplicate_option_group'
      : 'option_shape_conflict'

    return [createReviewItem({
      workspaceId: input.workspaceId,
      kind,
      confidence: isMerge ? 1 : 0.8,
      title: isMerge
        ? `${group.displayName} 옵션이 여러 곳에 나뉘어 있습니다`
        : `${group.displayName} 옵션 구성이 서로 다릅니다`,
      explanation: isMerge
        ? '옵션 모양은 같고 연결 메뉴만 달라 통합 메뉴 안에서 합칠 수 있습니다.'
        : '같은 이름의 옵션이 다른 구성을 사용하므로 자동으로 합치지 않습니다.',
      recommendation: isMerge ? 'merge_canonical_only' : 'manual_review',
      platformCode: group.platformCode,
      sourceEntityId: group.logicalGroupKey,
      evidence: {
        platformCode: group.platformCode,
        categoryKey: group.displayName,
        sourceEntityIds: group.sourceGroups
          .map((source) => source.optionGroupId)
          .sort(),
        linkedMenuNames: group.sourceGroups
          .flatMap((source) => source.linkedMenuNames)
          .sort(),
        logicalOptions: group.logicalOptions
      }
    })]
  })

export const analyzeCatalogExceptions = (
  input: CatalogExceptionAnalysisInput
): CatalogReviewItem[] =>
  [
    ...analyzeMissingAndUnmatched(input),
    ...analyzePrices(input),
    ...analyzeOptionGroups(input)
  ].sort(compareItems)
