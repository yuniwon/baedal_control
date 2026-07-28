const DDANGYO_HEADING_BADGE = /\s*\d+\s*성인식권아이콘메뉴할인아이콘\s*$/u
const TRAILING_CAPTURED_COUNT = /\s+\d+\s*$/u

export const cleanCatalogCategoryName = (value: string | null | undefined) =>
  (value ?? '').replace(DDANGYO_HEADING_BADGE, '').trim()

export const catalogCategoryIdentity = (value: string | null | undefined) =>
  cleanCatalogCategoryName(value)
    .replace(TRAILING_CAPTURED_COUNT, '')
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^\p{L}\p{N}]/gu, '')

export const catalogMenuIdentity = (value: string) => value
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
