const PLATFORM_HEADING_NOISE = /\d+\s*성인식권아이콘메뉴할인아이콘\s*$/u

export const cleanCatalogCategoryName = (name: string) =>
  name.replace(PLATFORM_HEADING_NOISE, '').trim()

const categoryKey = (name: string) => cleanCatalogCategoryName(name)
  .normalize('NFKC')
  .toLocaleLowerCase('ko-KR')
  .replace(/[^\p{L}\p{N}]/gu, '')

export type ReferenceCategoryIndex = ReadonlyMap<string, string>

export const buildReferenceCategoryIndex = (names: Array<string | null | undefined>): ReferenceCategoryIndex => {
  const index = new Map<string, string>()
  for (const rawName of names) {
    const name = cleanCatalogCategoryName(rawName ?? '')
    const key = categoryKey(name)
    if (name && key && !index.has(key)) index.set(key, name)
  }
  return index
}

export const resolveCatalogCategory = (
  candidates: Array<string | null | undefined>,
  referenceCategories: ReferenceCategoryIndex
) => {
  for (const rawCandidate of candidates) {
    const candidate = cleanCatalogCategoryName(rawCandidate ?? '')
    if (!candidate) continue
    return referenceCategories.get(categoryKey(candidate)) ?? candidate
  }
  return '미분류'
}
