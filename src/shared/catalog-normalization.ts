const DDANGYO_HEADING_BADGE = /\s*\d+\s*성인식권아이콘메뉴할인아이콘\s*$/u
const TRAILING_CAPTURED_COUNT = /\s+\d+\s*$/u

// These are confirmed store-level aliases, not fuzzy matching rules. Keep this
// list intentionally small so a new platform name cannot silently collapse two
// genuinely different products into one canonical menu.
const MENU_IDENTITY_ALIASES: Record<string, string> = {
  갈릭소스: '갈릭디핑',
  수제요거트소스: '요거트소스',
  일반피자미디움두판: '일반피자미디엄두판'
}

export type CatalogMenuSize = 'M' | 'L'

interface CatalogMenuSizeMatch {
  size: CatalogMenuSize
  index: number
}

const CATALOG_SIZE_MARKER = /(?:^|[\s(（])([ML])(?=\s*(?:$|[)）]|[（(]))/giu

const findCatalogMenuSize = (value: string): CatalogMenuSizeMatch | null => {
  // A two-pizza expression such as M＋M or L＋L is a product shape, not a
  // terminal size marker. Leave it intact for the separate set/duo identity.
  if (/[+＋]|두판/iu.test(value)) {
    return null
  }

  const matches = [...value.matchAll(CATALOG_SIZE_MARKER)]
  if (matches.length !== 1) {
    return null
  }

  const match = matches[0]
  const raw = match[0]
  const markerOffset = raw.search(/[ML]/iu)
  if (match.index == null || markerOffset < 0) {
    return null
  }

  return {
    size: raw[markerOffset].toUpperCase() as CatalogMenuSize,
    index: match.index + markerOffset
  }
}

export const parseCatalogMenuSize = (value: string): CatalogMenuSize | null =>
  findCatalogMenuSize(value)?.size ?? null

export const stripCatalogMenuSize = (value: string) => {
  const match = findCatalogMenuSize(value)
  if (!match) {
    return value.trim()
  }

  return `${value.slice(0, match.index)}${value.slice(match.index + 1)}`
    .replace(/\s+([（(])/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim()
}

export const cleanCatalogCategoryName = (value: string | null | undefined) =>
  (value ?? '').replace(DDANGYO_HEADING_BADGE, '').trim()

export const catalogCategoryIdentity = (value: string | null | undefined) =>
  cleanCatalogCategoryName(value)
    .replace(TRAILING_CAPTURED_COUNT, '')
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^\p{L}\p{N}]/gu, '')

export const catalogMenuIdentity = (value: string) => {
  const normalized = stripCatalogMenuSize(value)
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/^\(추천\)\s*/u, '')
    .replace(/페페로니/gu, '페퍼로니')
    .replace(/l\s*\+\s*l/giu, '라지두판')
    .replace(/m\s*\+\s*m/giu, '미디움두판')
    .replace(/[（(](?:f|f사이즈)[）)]/giu, '')
    .replace(/\s+[ml]\s*$/iu, '')
    .replace(/(\d+)\s*(?:개|조각)/gu, '$1')
    .replace(/한마리\s*$/u, '')
    .replace(/추가\s*$/u, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/피자$/u, '')

  return MENU_IDENTITY_ALIASES[normalized] ?? normalized
}
