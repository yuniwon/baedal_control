import { catalogMenuIdentity } from '../../shared/catalog-normalization'

export const normalizeMenuName = (value: string) =>
  value.toLowerCase().replace(/[\s().\-_/]/g, '')

const stripTrailingParentheticalDetail = (value: string) => {
  let next = value.trim()

  while (/\([^()]*\)\s*$/.test(next)) {
    next = next.replace(/\([^()]*\)\s*$/, '').trim()
  }

  return next
}

const stripTrailingCountOrUnit = (value: string) => {
  let next = value.trim()

  while (true) {
    const updated = next
      .replace(/\d+(?:\.\d+)?\s*(?:개|팩|병|캔|인분|조각|쪽|ml|l|kg|g|oz)\s*$/i, '')
      .trim()

    if (updated === next) {
      return updated
    }

    next = updated
  }
}

export const buildAutoLinkKey = (value: string) =>
  normalizeMenuName(stripTrailingCountOrUnit(stripTrailingParentheticalDetail(value)))

export const isSafeAutoLinkMatch = (left: string, right: string) => {
  const normalizedLeft = normalizeMenuName(left)
  const normalizedRight = normalizeMenuName(right)

  if (normalizedLeft.length > 0 && normalizedLeft === normalizedRight) {
    return true
  }

  const leftKey = buildAutoLinkKey(left)
  const rightKey = buildAutoLinkKey(right)

  if (leftKey.length > 0 && leftKey === rightKey) {
    return true
  }

  const leftCatalogIdentity = catalogMenuIdentity(left)
  const rightCatalogIdentity = catalogMenuIdentity(right)
  return leftCatalogIdentity.length > 0 && leftCatalogIdentity === rightCatalogIdentity
}

export const scoreMenuMatch = (left: string, right: string) => {
  const normalizedLeft = normalizeMenuName(left)
  const normalizedRight = normalizeMenuName(right)

  if (normalizedLeft === normalizedRight) {
    return 1
  }

  if (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  ) {
    return 0.9
  }

  const overlap = [...new Set(normalizedLeft)].filter((character) =>
    normalizedRight.includes(character)
  ).length

  return overlap / Math.max(normalizedLeft.length, normalizedRight.length, 1)
}
