import type { BrowserInspectionApiEvent } from '../../../shared/contracts'

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const containsNamedArray = (value: unknown, collectionKeys: readonly string[]): boolean => {
  if (Array.isArray(value)) {
    return value.some((item) => containsNamedArray(item, collectionKeys))
  }
  if (!isRecord(value)) return false

  for (const [key, child] of Object.entries(value)) {
    if (collectionKeys.includes(key) && Array.isArray(child)) return true
    if (containsNamedArray(child, collectionKeys)) return true
  }
  return false
}

const containsCountEvidence = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsCountEvidence)
  if (!isRecord(value)) return false

  for (const [key, child] of Object.entries(value)) {
    if (
      ['totalCount', 'totalElements', 'total'].includes(key) &&
      typeof child === 'number' &&
      Number.isFinite(child)
    ) {
      return true
    }
    if (containsCountEvidence(child)) return true
  }
  return false
}

export const isProvenFullCollectionEvent = (
  event: BrowserInspectionApiEvent,
  options: {
    urlTerms: readonly string[]
    collectionKeys: readonly string[]
  }
): boolean => {
  if (event.status !== 200 || !event.responsePreview?.trim()) return false
  const url = event.url.toLowerCase()
  if (!options.urlTerms.some((term) => url.includes(term))) return false

  try {
    const payload = JSON.parse(event.responsePreview) as unknown
    if (!containsNamedArray(payload, options.collectionKeys)) return false
    return /(?:^|[\/_-])(all|list)(?:[\/?_-]|$)/i.test(url) || containsCountEvidence(payload)
  } catch {
    return false
  }
}
