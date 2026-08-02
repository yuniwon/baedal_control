import type {
  CatalogProjectionItem,
  CatalogProjectionPreview,
  CatalogProjectionPlatformSummary,
  CatalogProjectionStatus,
  CatalogProjectionVariant,
  MenuRecord,
  PlatformMenuCatalogRecord,
  PlatformMenuMappingRecord,
  PlatformOptionGroupRecord,
  PlatformCode
} from './contracts'
import { parseCatalogMenuSize } from './catalog-normalization'
import { PLATFORM_CODES } from './platforms'

export interface CatalogProjectionInput {
  referencePlatformCode: PlatformCode
  menus: MenuRecord[]
  mappings: PlatformMenuMappingRecord[]
  platformMenus: PlatformMenuCatalogRecord[]
  optionGroups: PlatformOptionGroupRecord[]
  generatedAt?: string
}

type ProjectionLabel = 'M' | 'L' | 'F'

const normalizeText = (value: string | null | undefined) =>
  (value ?? '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/gu, '')

const normalizeProjectionLabel = (value: string | null | undefined): ProjectionLabel | null => {
  const normalized = normalizeText(value)
  if (!normalized || /[+＋]|두판|반반|하프/iu.test(normalized)) return null
  if (/^(?:m|미디움|미디엄|m사이즈|미디움사이즈)$/iu.test(normalized)) return 'M'
  if (/^(?:l|라지|l사이즈|라지사이즈)$/iu.test(normalized)) return 'L'
  if (/^(?:f|패밀리|f사이즈|패밀리사이즈)$/iu.test(normalized)) return 'F'
  return null
}

const firstVariantAmount = (variants?: PlatformMenuCatalogRecord['platformMenuPriceVariants']) => {
  for (const variant of variants ?? []) {
    for (const channel of variant.channels) {
      if (typeof channel.amount === 'number' && Number.isFinite(channel.amount)) return channel.amount
    }
  }
  return null
}

const sourceAmount = (menu: PlatformMenuCatalogRecord) =>
  typeof menu.platformMenuCurrentPrice === 'number' && Number.isFinite(menu.platformMenuCurrentPrice)
    ? menu.platformMenuCurrentPrice
    : firstVariantAmount(menu.platformMenuPriceVariants)

const canonicalAmounts = (menu: MenuRecord) => {
  const result = new Map<ProjectionLabel, number>()
  for (const variant of menu.basePriceVariants ?? []) {
    const label = normalizeProjectionLabel(variant.variantLabel)
    if (!label) continue
    const amount = variant.channels.find((channel) => channel.channelCode === 'base')?.amount
      ?? variant.channels.find((channel) => typeof channel.amount === 'number')?.amount
    if (typeof amount === 'number' && Number.isFinite(amount)) result.set(label, amount)
  }
  if (!result.has('M') && menu.basePrice > 0) result.set('M', menu.basePrice)
  return result
}

const sourceVariantRows = (sourceRows: PlatformMenuCatalogRecord[]) => {
  const result = new Map<ProjectionLabel, PlatformMenuCatalogRecord>()
  for (const row of sourceRows) {
    const label = normalizeProjectionLabel(parseCatalogMenuSize(row.platformMenuName))
    if (label && !result.has(label)) result.set(label, row)
    for (const variant of row.platformMenuPriceVariants ?? []) {
      const variantLabel = normalizeProjectionLabel(variant.variantLabel)
      if (variantLabel && !result.has(variantLabel)) result.set(variantLabel, row)
    }
  }
  return result
}

const optionLabelMap = (group: PlatformOptionGroupRecord) => {
  const labels = new Map<ProjectionLabel, { optionName: string; optionPrice: number }>()
  for (const option of group.options) {
    const label = normalizeProjectionLabel(option.optionName)
    if (!label || labels.has(label)) continue
    labels.set(label, {
      optionName: option.optionName,
      optionPrice: typeof option.optionPrice === 'number' && Number.isFinite(option.optionPrice)
        ? option.optionPrice
        : 0
    })
  }
  return labels
}

const findRequiredSizeGroup = (
  platformCode: PlatformCode,
  sourceRows: PlatformMenuCatalogRecord[],
  groups: PlatformOptionGroupRecord[]
) => {
  const sourceIds = new Set(sourceRows.map((row) => row.platformMenuId))
  const candidates = groups.filter((group) =>
    group.platformCode === platformCode
    && group.presenceStatus !== 'absent_confirmed'
    && group.minOrderQuantity === 1
    && group.maxOrderQuantity === 1
    && group.menus.some((menu) => sourceIds.has(menu.platformMenuId))
  )
  const matches = candidates
    .map((group) => ({ group, labels: optionLabelMap(group) }))
    .filter(({ labels }) => labels.size === 2 && labels.has('M') && labels.has('L'))
  return matches[0] ?? null
}

const getSourceRows = (
  platformCode: PlatformCode,
  menu: MenuRecord,
  mappings: PlatformMenuMappingRecord[],
  sourceByKey: Map<string, PlatformMenuCatalogRecord>
) => mappings
  .filter((mapping) => mapping.menuId === menu.menuId
    && mapping.platformCode === platformCode
    && mapping.mappingStatus !== 'source_absent')
  .map((mapping) => sourceByKey.get(`${platformCode}:${mapping.platformMenuId}`))
  .filter((source): source is PlatformMenuCatalogRecord => Boolean(source && source.presenceStatus !== 'absent_confirmed'))

const isFamilyLike = (value: string) => /패밀리|콰트로|15\s*["”]|f사이즈/iu.test(value)

const isCandidate = (
  menu: MenuRecord,
  sourceRows: PlatformMenuCatalogRecord[],
  optionGroup: PlatformOptionGroupRecord | null
) => {
  if (optionGroup) return true
  if ((menu.basePriceVariants ?? []).some((variant) => normalizeProjectionLabel(variant.variantLabel))) return true
  if (sourceRows.some((row) => parseCatalogMenuSize(row.platformMenuName) || isFamilyLike(row.platformMenuName))) return true
  return sourceRows.some((row) => (row.platformMenuPriceVariants?.length ?? 0) > 1)
}

const amountMatches = (left: number | null, right: number | null) =>
  left !== null && right !== null && left === right

const makeVariant = (
  label: ProjectionLabel,
  canonicalAmount: number | null,
  sourceAmountValue: number | null,
  priceDelta: number | null,
  derived: boolean
): CatalogProjectionVariant => ({
  label,
  canonicalAmount,
  sourceAmount: sourceAmountValue,
  priceDelta,
  derived
})

const buildRequiredOptionItem = (
  menu: MenuRecord,
  platformCode: PlatformCode,
  sourceRows: PlatformMenuCatalogRecord[],
  group: PlatformOptionGroupRecord,
  labels: Map<ProjectionLabel, { optionName: string; optionPrice: number }>
): CatalogProjectionItem => {
  const canonical = canonicalAmounts(menu)
  const medium = canonical.get('M') ?? menu.basePrice
  const largeCanonical = canonical.get('L') ?? null
  const largeOption = labels.get('L')?.optionPrice ?? null
  const mediumSource = sourceAmount(sourceRows[0])
  const derivedLarge = largeCanonical === null && largeOption !== null
  const large = largeCanonical ?? (largeOption === null ? null : medium + largeOption)
  const expectedDelta = largeCanonical === null ? null : largeCanonical - medium
  const warnings: string[] = []
  if (sourceRows.some((row) => row.platformMenuStatus?.trim() === '숨김')) {
    warnings.push('플랫폼 원본 중 숨김 상태인 메뉴가 있어 노출 여부를 확인해야 합니다.')
  }
  if (derivedLarge) warnings.push('통합메뉴에 L 가격이 없어 현재 필수 옵션 증액으로 계산했습니다.')
  if (largeCanonical !== null && largeOption !== null && expectedDelta !== null && expectedDelta !== largeOption) {
    warnings.push(`통합 L 증액 ${expectedDelta.toLocaleString()}원과 플랫폼 옵션 ${largeOption.toLocaleString()}원이 다릅니다.`)
  }
  if (/^가격$/iu.test(group.optionGroupName.trim())) {
    warnings.push('옵션 그룹명이 일반적인 가격이라 다른 메뉴의 가격 그룹과 합치지 않습니다.')
  }
  const status: CatalogProjectionStatus = warnings.length > 0 ? 'review' : 'ready'
  return {
    menuId: menu.menuId,
    menuName: menu.baseName,
    platformCode,
    mode: 'required_size_option',
    status,
    summary: `필수 옵션 '${group.optionGroupName}'으로 M/L을 표현합니다.`,
    variants: [
      makeVariant('M', medium, mediumSource, 0, false),
      makeVariant('L', large, mediumSource === null || largeOption === null ? null : mediumSource + largeOption, largeOption, derivedLarge)
    ],
    sourceMenuIds: sourceRows.map((row) => row.platformMenuId),
    sourceOptionGroupIds: [group.optionGroupId],
    warnings
  }
}

const buildSeparateMenuItem = (
  menu: MenuRecord,
  platformCode: PlatformCode,
  sourceRows: PlatformMenuCatalogRecord[],
  variantRows: Map<ProjectionLabel, PlatformMenuCatalogRecord>
): CatalogProjectionItem => {
  const canonical = canonicalAmounts(menu)
  const variants = (['M', 'L'] as const)
    .filter((label) => variantRows.has(label))
    .map((label) => {
      const source = variantRows.get(label)!
      const actual = sourceAmount(source)
      return makeVariant(label, canonical.get(label) ?? null, actual, label === 'L' && canonical.has('M') && canonical.has('L') ? canonical.get('L')! - canonical.get('M')! : null, false)
    })
  const warnings: string[] = []
  if (!canonical.has('L')) warnings.push('통합메뉴에 L 가격이 없어 요기요 원본 가격을 검토해야 합니다.')
  for (const variant of variants) {
    if (variant.canonicalAmount !== null && variant.sourceAmount !== null && !amountMatches(variant.canonicalAmount, variant.sourceAmount ?? null)) {
      warnings.push(`${variant.label} 가격이 통합 기준과 다릅니다.`)
    }
  }
  return {
    menuId: menu.menuId,
    menuName: menu.baseName,
    platformCode,
    mode: 'separate_menus',
    status: warnings.length > 0 ? 'review' : 'ready',
    summary: '플랫폼에서 M/L을 별도 메뉴로 관리합니다.',
    variants,
    sourceMenuIds: sourceRows.map((row) => row.platformMenuId),
    sourceOptionGroupIds: [],
    warnings
  }
}

const buildPriceRowsItem = (
  menu: MenuRecord,
  platformCode: PlatformCode,
  sourceRows: PlatformMenuCatalogRecord[]
): CatalogProjectionItem => {
  const canonical = canonicalAmounts(menu)
  const rows = sourceRows.flatMap((row) => (row.platformMenuPriceVariants ?? []).map((variant) => ({
    label: normalizeProjectionLabel(variant.variantLabel),
    amount: variant.channels.find((channel) => channel.channelCode === 'base')?.amount
      ?? variant.channels.find((channel) => typeof channel.amount === 'number')?.amount
      ?? null
  }))).filter((row): row is { label: ProjectionLabel; amount: number | null } => Boolean(row.label))
  const variants = [...new Map(rows.map((row) => [row.label, row])).values()]
    .map((row) => makeVariant(row.label, canonical.get(row.label) ?? null, row.amount, row.label === 'L' && canonical.has('M') && canonical.has('L') ? canonical.get('L')! - canonical.get('M')! : null, false))
  const warnings = variants.some((variant) => variant.canonicalAmount === null)
    ? ['플랫폼 가격행의 일부 변형이 통합메뉴에 명시되어 있지 않습니다.']
    : variants.some((variant) => variant.canonicalAmount !== variant.sourceAmount)
      ? ['플랫폼 가격행과 통합 기준 가격이 다릅니다.']
      : []
  return {
    menuId: menu.menuId,
    menuName: menu.baseName,
    platformCode,
    mode: 'price_rows',
    status: warnings.length > 0 ? 'review' : 'ready',
    summary: '한 메뉴 안의 가격행으로 사이즈를 표현합니다.',
    variants,
    sourceMenuIds: sourceRows.map((row) => row.platformMenuId),
    sourceOptionGroupIds: [],
    warnings
  }
}

const buildSingleMenuItem = (
  menu: MenuRecord,
  platformCode: PlatformCode,
  sourceRows: PlatformMenuCatalogRecord[]
): CatalogProjectionItem => {
  const canonical = canonicalAmounts(menu)
  const source = sourceRows[0]
  const label: ProjectionLabel = canonical.has('F') || isFamilyLike(menu.baseName) || isFamilyLike(source.platformMenuName) ? 'F' : 'M'
  const actual = sourceAmount(source)
  const expected = canonical.get(label) ?? (label === 'M' ? menu.basePrice : null)
  const warnings = expected === null ? ['통합 기준 가격을 찾지 못했습니다.'] : !amountMatches(expected, actual) ? ['플랫폼 메뉴 가격과 통합 기준 가격이 다릅니다.'] : []
  return {
    menuId: menu.menuId,
    menuName: menu.baseName,
    platformCode,
    mode: 'single_menu',
    status: warnings.length > 0 ? 'review' : 'ready',
    summary: label === 'F' ? '패밀리/대형 메뉴를 별도 메뉴로 관리합니다.' : '하나의 메뉴 가격으로 관리합니다.',
    variants: [makeVariant(label, expected, actual, 0, false)],
    sourceMenuIds: sourceRows.map((row) => row.platformMenuId),
    sourceOptionGroupIds: [],
    warnings
  }
}

export const buildCatalogProjectionPreview = (input: CatalogProjectionInput): CatalogProjectionPreview => {
  const sourceByKey = new Map(input.platformMenus.map((source) => [`${source.platformCode}:${source.platformMenuId}`, source]))
  const items: CatalogProjectionItem[] = []

  for (const platformCode of PLATFORM_CODES) {
    for (const menu of input.menus.filter((candidate) => (candidate.isManaged ?? 1) !== 0)) {
      const sourceRows = getSourceRows(platformCode, menu, input.mappings, sourceByKey)
      if (sourceRows.length === 0) continue
      const requiredGroup = findRequiredSizeGroup(platformCode, sourceRows, input.optionGroups)
      if (!isCandidate(menu, sourceRows, requiredGroup?.group ?? null)) continue

      if (requiredGroup) {
        items.push(buildRequiredOptionItem(menu, platformCode, sourceRows, requiredGroup.group, requiredGroup.labels))
        continue
      }

      const variants = sourceVariantRows(sourceRows)
      if (platformCode === 'yogiyo' && variants.has('M') && variants.has('L')) {
        items.push(buildSeparateMenuItem(menu, platformCode, sourceRows, variants))
      } else if ([...variants.keys()].length >= 2) {
        items.push(buildPriceRowsItem(menu, platformCode, sourceRows))
      } else if (isFamilyLike(menu.baseName) || sourceRows.some((row) => isFamilyLike(row.platformMenuName)) || canonicalAmounts(menu).has('F')) {
        items.push(buildSingleMenuItem(menu, platformCode, sourceRows))
      }
    }
  }

  const platforms: CatalogProjectionPlatformSummary[] = PLATFORM_CODES.map((platformCode) => {
    const platformItems = items.filter((item) => item.platformCode === platformCode)
    const hasSource = input.platformMenus.some((menu) => menu.platformCode === platformCode && menu.presenceStatus !== 'absent_confirmed')
    return {
      platformCode,
      itemCount: platformItems.length,
      readyCount: platformItems.filter((item) => item.status === 'ready').length,
      reviewCount: platformItems.filter((item) => item.status === 'review').length,
      blockedCount: platformItems.filter((item) => item.status === 'blocked').length,
      note: hasSource
        ? platformItems.length > 0 ? '확인 가능한 사이즈·가격 변형을 찾았습니다.' : '수집된 메뉴에서 투영 대상이 발견되지 않았습니다.'
        : '수집된 메뉴 원본이 없어 구조를 판정할 수 없습니다.'
    }
  })

  return {
    referencePlatformCode: input.referencePlatformCode,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    menuCount: input.menus.filter((menu) => (menu.isManaged ?? 1) !== 0).length,
    items,
    platforms
  }
}
