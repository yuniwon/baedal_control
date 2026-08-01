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

export const cleanCatalogCategoryName = (value: string | null | undefined) =>
  (value ?? '').replace(DDANGYO_HEADING_BADGE, '').trim()

export const catalogCategoryIdentity = (value: string | null | undefined) =>
  cleanCatalogCategoryName(value)
    .replace(TRAILING_CAPTURED_COUNT, '')
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^\p{L}\p{N}]/gu, '')

export const catalogMenuIdentity = (value: string) => {
  const normalized = value
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
