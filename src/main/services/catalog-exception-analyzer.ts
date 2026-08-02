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
  cleanCatalogCategoryName,
  catalogMenuIdentity,
  parseCatalogMenuSize
} from '../../shared/catalog-normalization'
import { isSafeAutoLinkMatch, scoreMenuMatch } from './menu-matcher'

type OptionPresenceRole =
  | 'paid_add_on'
  | 'bundle_selection'
  | 'included_selection'
  | 'free_optional'
  | 'mixed_selection'

type OptionPresenceMatch = {
  group: LogicalOptionGroupRecord
  optionName: string
  optionPrice: number
  role: OptionPresenceRole
  minOrderQuantity: number | null
  maxOrderQuantity: number | null
  linkedMenuNames: string[]
}

const OPTION_NAME_ALIASES: Record<string, string> = {
  갈릭디핑: '갈릭소스',
  국산피클: '피클',
  '파마산 치즈가루': '치즈가루',
  요거트소스: '요거트'
}

const GENERAL_MENU_ALIAS_PAIRS: Array<[string, string]> = [
  ['국산피클', '피클'],
  ['파마산치즈가루', '치즈가루'],
  ['달콤고구마', '고구마'],
  ['꾸버스반반', '반반'],
  ['고르곤졸라씬도우', '고르곤졸라씬'],
  // This store's reference menu uses branded names while some platforms
  // collapse the same drink into a size-bundled generic name.
  ['코카콜라', '콜라500ml125l'],
  ['코카콜라', '콜라500ml'],
  ['코카콜라', '콜라125l'],
  ['칠성사이다', '사이다500ml125l'],
  ['칠성사이다', '사이다500ml'],
  ['칠성사이다', '사이다125l'],
  ['치즈오븐스파게티', '스파게티']
]

// These are deliberately suggestions, not confirmed aliases. A generic
// platform option such as "콜라" may represent a different brand or package,
// so it must remain a manual-review candidate.
const OPTION_NAME_SUGGESTION_PAIRS: Array<[string, string]> = [
  ['코카콜라', '콜라'],
  ['코카콜라제로', '제로콜라'],
  ['칠성사이다', '사이다']
]

const normalizeOptionName = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/\s+/g, '')
    .replace(/\d+(?:\.\d+)?\s*(?:개|조각|ml|m|l|kg|g)\s*$/iu, '')

const normalizeGeneralName = (value: string) => catalogMenuIdentity(value)

const isEquivalentGeneralMenuName = (left: string, right: string) => {
  if (isSafeAutoLinkMatch(left, right)) {
    return true
  }

  const leftKey = normalizeGeneralName(left)
  const rightKey = normalizeGeneralName(right)
  return GENERAL_MENU_ALIAS_PAIRS.some(([first, second]) =>
    (leftKey === first && rightKey === second) ||
    (leftKey === second && rightKey === first)
  )
}

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

const isSuggestedOptionName = (canonicalName: string, optionName: string) => {
  const canonicalKey = normalizeOptionName(canonicalName)
  const optionKey = normalizeOptionName(optionName)
  return OPTION_NAME_SUGGESTION_PAIRS.some(([first, second]) =>
    (canonicalKey === first && optionKey === second) ||
    (canonicalKey === second && optionKey === first)
  )
}

const resolveOptionPresenceRole = (
  group: LogicalOptionGroupRecord,
  optionPrice: number
): Exclude<OptionPresenceRole, 'mixed_selection'> => {
  if (/(?:세트|반반|피자|메뉴)\s*선택/iu.test(group.displayName)) {
    return 'bundle_selection'
  }

  if (optionPrice > 0) {
    return 'paid_add_on'
  }

  if (
    group.minOrderQuantity === 0 &&
    (group.maxOrderQuantity == null || group.maxOrderQuantity > 1)
  ) {
    return 'free_optional'
  }

  return 'included_selection'
}

const findOptionPresenceMatches = (
  canonicalName: string,
  platformCode: PlatformCode,
  logicalOptionGroups: LogicalOptionGroupRecord[],
  matcher: (canonicalName: string, optionName: string) => boolean
): OptionPresenceMatch[] => logicalOptionGroups
  .filter(
    (group) =>
      group.platformCode === platformCode &&
      group.status !== 'absent_confirmed' &&
      group.status !== 'missing_suspected'
  )
  .flatMap((group) => {
    return group.logicalOptions
      .filter((option) => matcher(canonicalName, option.optionName))
      .map((option) => ({
        group,
        optionName: option.optionName,
        optionPrice: option.optionPrice,
        role: resolveOptionPresenceRole(group, option.optionPrice),
        minOrderQuantity: group.minOrderQuantity ?? null,
        maxOrderQuantity: group.maxOrderQuantity ?? null,
        linkedMenuNames: [...new Set(
          group.sourceGroups.flatMap((sourceGroup) => sourceGroup.linkedMenuNames)
        )].sort((left, right) => left.localeCompare(right, 'ko-KR'))
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
  const safe = canonicalMenus.filter((menu) => isEquivalentGeneralMenuName(menu.baseName, sourceName))
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

const buildReferenceMenuIds = (input: CatalogExceptionAnalysisInput) =>
  input.referencePlatformCode
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

const analyzeCanonicalPlatformOnly = (
  input: CatalogExceptionAnalysisInput,
  referenceMenuIds: Set<string> | null
): CatalogReviewItem[] => {
  if (!referenceMenuIds) {
    return []
  }

  const referenceMenus = input.menus.filter(
    (menu) => (menu.isManaged ?? 1) === 1 && referenceMenuIds.has(menu.menuId)
  )
  const platformOnlyMenus = input.menus.filter(
    (menu) => (menu.isManaged ?? 1) === 1 && !referenceMenuIds.has(menu.menuId)
  )
  const activeMappings = input.mappings.filter(
    (mapping) => mapping.mappingStatus !== 'source_absent'
  )

  return platformOnlyMenus.flatMap((menu) => {
    const mappings = activeMappings.filter((mapping) => mapping.menuId === menu.menuId)
    if (mappings.length === 0) {
      return []
    }

    const canonicalCandidates = referenceMenus
      .filter((candidate) => candidate.menuId !== menu.menuId)
      .filter((candidate) => isEquivalentGeneralMenuName(candidate.baseName, menu.baseName))
      .map((candidate) => ({
        canonicalMenuId: candidate.menuId,
        canonicalName: candidate.baseName,
        basePrice: candidate.basePrice
      }))

    return [createReviewItem({
      workspaceId: input.workspaceId,
      kind: 'canonical_platform_only',
      confidence: canonicalCandidates.length > 0 ? 0.9 : 0.75,
      title: `${menu.baseName} 통합메뉴가 기준 플랫폼에는 없습니다`,
      explanation: canonicalCandidates.length > 0
        ? '기준 플랫폼의 기존 통합 메뉴와 이름이 같거나 비슷합니다. 별칭인지 플랫폼 전용인지 결정해야 합니다.'
        : '다른 플랫폼에서만 확인된 통합 메뉴입니다. 기준 플랫폼에 추가할지, 플랫폼 전용으로 유지할지 결정해야 합니다.',
      recommendation: 'manual_review',
      canonicalMenuId: menu.menuId,
      evidence: {
        canonicalMenuId: menu.menuId,
        canonicalName: menu.baseName,
        canonicalPrice: menu.basePrice,
        fieldKey: 'presence',
        surface: 'general',
        signals: {
          referencePlatformMissing: true,
          canonicalCandidateCount: canonicalCandidates.length,
          activePlatformMappingCount: mappings.length
        },
        canonicalCandidates,
        platformMappings: mappings.map((mapping) => ({
          platformCode: mapping.platformCode,
          platformMenuId: mapping.platformMenuId,
          platformMenuName: mapping.platformMenuName,
          platformPrice: mapping.platformMenuCurrentPrice ?? null
        }))
      }
    })]
  })
}

const analyzeMissingAndUnmatched = (
  input: CatalogExceptionAnalysisInput
): CatalogReviewItem[] => {
  const items: CatalogReviewItem[] = []
  const referenceMenuIds = buildReferenceMenuIds(input)
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
        source.platformCode === platformCode &&
        source.presenceStatus !== 'absent_confirmed' &&
        source.presenceStatus !== 'missing_suspected'
    )

    for (const canonicalMenu of managedMenus) {
      if (activeMappingKeys.has(`${canonicalMenu.menuId}:${platformCode}`)) {
        continue
      }

      const generalCandidates = platformSources.filter((source) =>
        isEquivalentGeneralMenuName(canonicalMenu.baseName, source.platformMenuName)
      )
      const safeCandidates = generalCandidates.filter(
        (source) => !mappedSourceKeys.has(`${platformCode}:${source.platformMenuId}`)
      )
      if (safeCandidates.length === 1) {
        continue
      }

      const optionMatches = generalCandidates.length === 0
        ? findOptionPresenceMatches(
          canonicalMenu.baseName,
          platformCode,
          input.logicalOptionGroups,
          isEquivalentOptionName
        )
        : []
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
              : optionRole === 'free_optional'
                ? '해당 플랫폼에서는 무료 선택 옵션으로 제공되며, 별도 일반 메뉴는 확인되지 않았습니다.'
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
              optionRole: match.role,
              minOrderQuantity: match.minOrderQuantity,
              maxOrderQuantity: match.maxOrderQuantity,
              linkedMenuNames: match.linkedMenuNames
            }))
          }
        }))
        continue
      }

      const optionCandidates = generalCandidates.length === 0
        ? findOptionPresenceMatches(
          canonicalMenu.baseName,
          platformCode,
          input.logicalOptionGroups,
          isSuggestedOptionName
        )
        : []
      if (optionCandidates.length > 0) {
        const optionRoles = [...new Set(optionCandidates.map((match) => match.role))]
        const optionRole = optionRoles.length === 1 ? optionRoles[0] : 'mixed_selection'
        const firstMatch = optionCandidates[0]

        items.push(createReviewItem({
          workspaceId: input.workspaceId,
          kind: 'option_candidate_on_platform',
          confidence: 0.7,
          title: `${canonicalMenu.baseName}와 비슷한 옵션이 플랫폼에 있습니다`,
          explanation: '옵션 이름은 비슷하지만 브랜드·용량·판매 단위가 다를 수 있어 일반 메뉴와 같은 상품인지 확인이 필요합니다.',
          recommendation: 'manual_review',
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
              confirmedGeneralMenuMissing: false,
              optionCandidatePresence: true,
              optionMatchCount: optionCandidates.length
            },
            optionMatches: optionCandidates.map((match) => ({
              optionGroupKey: match.group.logicalGroupKey,
              optionGroupName: match.group.displayName,
              optionName: match.optionName,
              optionPrice: match.optionPrice,
              optionRole: match.role,
              minOrderQuantity: match.minOrderQuantity,
              maxOrderQuantity: match.maxOrderQuantity,
              linkedMenuNames: match.linkedMenuNames
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
        explanation: generalCandidates.length > 0
          ? '이름이 다른 일반 메뉴 후보가 있지만 다른 통합 메뉴에 연결되어 있습니다.'
          : '일반 메뉴가 없습니다. 누락인지, 이 플랫폼에서 판매하지 않는 메뉴인지 결정합니다.',
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
            uniqueSafeUnmappedSourceCount: safeCandidates.length,
            generalMenuCandidateCount: generalCandidates.length
          },
          sourceEntityIds: generalCandidates.map((source) => source.platformMenuId).sort(),
          generalCandidates: generalCandidates.map((source) => ({
            platformMenuId: source.platformMenuId,
            platformMenuName: source.platformMenuName,
            platformMenuCurrentPrice: source.platformMenuCurrentPrice ?? null,
            platformMenuGroupName: source.platformMenuGroupName ?? null,
            presenceStatus: source.presenceStatus ?? null
          })).sort((left, right) => left.platformMenuId.localeCompare(right.platformMenuId))
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
        const size = parseCatalogMenuSize(name)
        return size ? [size] : []
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

const analyzeOptionPrices = (input: CatalogExceptionAnalysisInput): CatalogReviewItem[] => {
  const occurrencesByPlatform = new Map<PlatformCode, Map<string, Array<{
    group: LogicalOptionGroupRecord
    optionName: string
    optionPrice: number
    linkedMenuNames: string[]
  }>>>()

  for (const group of input.logicalOptionGroups) {
    if (group.status === 'absent_confirmed' || group.status === 'missing_suspected') {
      continue
    }

    const byOption = occurrencesByPlatform.get(group.platformCode) ?? new Map()
    const linkedMenuNames = [...new Set(
      group.sourceGroups.flatMap((sourceGroup) => sourceGroup.linkedMenuNames)
    )].sort((left, right) => left.localeCompare(right, 'ko-KR'))
    for (const option of group.logicalOptions) {
      const optionKey = normalizeOptionName(option.optionName)
      if (!optionKey) continue
      const occurrences = byOption.get(optionKey) ?? []
      occurrences.push({
        group,
        optionName: option.optionName,
        optionPrice: option.optionPrice,
        linkedMenuNames
      })
      byOption.set(optionKey, occurrences)
    }
    occurrencesByPlatform.set(group.platformCode, byOption)
  }

  return [...occurrencesByPlatform.entries()].flatMap(([platformCode, byOption]) =>
    [...byOption.entries()].flatMap(([optionKey, occurrences]) => {
      const distinctPrices = [...new Set(occurrences.map((occurrence) => occurrence.optionPrice))]
      if (distinctPrices.length < 2) return []

      const hasSharedMenuPriceDifference = occurrences.some((occurrence, index) =>
        occurrences.slice(index + 1).some((other) =>
          occurrence.optionPrice !== other.optionPrice &&
          occurrence.linkedMenuNames.some((menuName) => other.linkedMenuNames.includes(menuName))
        )
      )
      if (!hasSharedMenuPriceDifference) return []

      const first = occurrences[0]
      return [createReviewItem({
        workspaceId: input.workspaceId,
        kind: 'option_price_outlier',
        confidence: 1,
        title: `${first.optionName} 옵션 가격이 같은 메뉴에서 다릅니다`,
        explanation: '같은 플랫폼·같은 메뉴에 연결된 동일 옵션의 가격이 다릅니다. 사이즈·전략 차이인지 확인해야 합니다.',
        recommendation: 'manual_review',
        platformCode,
        sourceEntityId: first.group.logicalGroupKey,
        evidence: {
          platformCode,
          fieldKey: 'option_price',
          optionKey,
          optionNames: [...new Set(occurrences.map((occurrence) => occurrence.optionName))].sort(),
          distinctPrices: distinctPrices.sort((left, right) => left - right),
          optionOccurrences: occurrences.map((occurrence) => ({
            optionGroupKey: occurrence.group.logicalGroupKey,
            optionGroupName: occurrence.group.displayName,
            optionName: occurrence.optionName,
            optionPrice: occurrence.optionPrice,
            minOrderQuantity: occurrence.group.minOrderQuantity ?? null,
            maxOrderQuantity: occurrence.group.maxOrderQuantity ?? null,
            linkedMenuNames: occurrence.linkedMenuNames
          })).sort((left, right) =>
            left.optionGroupKey.localeCompare(right.optionGroupKey) || left.optionPrice - right.optionPrice
          )
        }
      })]
    })
  )
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
    ...analyzeCanonicalPlatformOnly(input, buildReferenceMenuIds(input)),
    ...analyzeMissingAndUnmatched(input),
    ...analyzePrices(input),
    ...analyzeOptionPrices(input),
    ...analyzeOptionGroups(input)
  ].sort(compareItems)
