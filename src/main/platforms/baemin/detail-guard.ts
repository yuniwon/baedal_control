const defaultBlockedCharacters = ['!']

const explicitTextFields = [
  { key: 'menuComposition', label: '구성' },
  { key: 'menuCompositionDescription', label: '구성' },
  { key: 'composition', label: '구성' },
  { key: 'menuDesc', label: '설명' },
  { key: 'menuDescription', label: '설명' }
] as const

type DetailFieldLabel = '구성' | '설명'

const descriptionKeyPattern = /(desc|description|intro|guide|comment|explain)/i
const compositionKeyPattern = /(composition|recipe|ingredient|material)/i

export const getBaeminNameChangeBlockerMessage = (
  payload: unknown,
  blockedCharacters: string[] = defaultBlockedCharacters
) => {
  const normalizedBlockedCharacters = normalizeBlockedCharacters(blockedCharacters)
  if (normalizedBlockedCharacters.length === 0) {
    return null
  }

  const data = getRecord(getRecord(payload)?.data)
  if (!data) {
    return null
  }

  for (const field of explicitTextFields) {
    const value = data[field.key]
    if (typeof value !== 'string') {
      continue
    }

    const matchedCharacters = matchBlockedCharacters(value, normalizedBlockedCharacters)
    if (matchedCharacters.length === 0) {
      continue
    }

    return `기존 메뉴 ${field.label}에 금칙어 '${matchedCharacters.join(', ')}'가 있어 이름 변경 저장이 막힙니다.`
  }

  const nestedEntries = collectNestedTextEntries(data)
  for (const entry of nestedEntries) {
    const matchedCharacters = matchBlockedCharacters(entry.value, normalizedBlockedCharacters)
    if (matchedCharacters.length === 0) {
      continue
    }

    return `기존 메뉴 ${entry.label}에 금칙어 '${matchedCharacters.join(', ')}'가 있어 이름 변경 저장이 막힙니다.`
  }

  return null
}

export const getBaeminNameChangeBlockerMessageFromVisibleText = (
  visibleText: string,
  blockedCharacters: string[] = defaultBlockedCharacters
) => {
  const normalizedBlockedCharacters = normalizeBlockedCharacters(blockedCharacters)
  if (normalizedBlockedCharacters.length === 0) {
    return null
  }

  const normalizedText = visibleText.replace(/\s+/g, ' ').trim()
  if (!normalizedText) {
    return null
  }

  const sectionDefinitions = [
    {
      label: '구성',
      match: extractVisibleSection(normalizedText, ['구성', '메뉴 구성'], [
        '설명',
        '메뉴 설명',
        '상세 설명',
        '옵션 변경',
        '이 메뉴를 판매하는 가게 변경',
        '가격 변경',
        '오늘만 품절',
        '숨김'
      ])
    },
    {
      label: '설명',
      match: extractVisibleSection(normalizedText, ['설명', '메뉴 설명', '상세 설명'], [
        '옵션 변경',
        '이 메뉴를 판매하는 가게 변경',
        '가격 변경',
        '오늘만 품절',
        '숨김'
      ])
    }
  ] as const

  for (const section of sectionDefinitions) {
    const sectionText = section.match
    if (!sectionText) {
      continue
    }

    const matchedCharacters = matchBlockedCharacters(sectionText, normalizedBlockedCharacters)
    if (matchedCharacters.length === 0) {
      continue
    }

    return `기존 메뉴 ${section.label}에 금칙어 '${matchedCharacters.join(', ')}'가 있어 이름 변경 저장이 막힙니다.`
  }

  return null
}

export const extractBaeminForbiddenCharacters = (errorMessage: string) => {
  if (!errorMessage.includes('금칙어')) {
    return []
  }

  const matches = [...errorMessage.matchAll(/금칙어\s+'([^']+)'/gu)]
    .map((match) => match[1]?.trim() ?? '')
    .filter((value) => value.length > 0)

  return [...new Set(matches)]
}

export const refineBaeminNameApplyFailureMessage = (
  errorMessage: string,
  detailPayload: unknown,
  visibleText: string
) => {
  const forbiddenCharacters = extractBaeminForbiddenCharacters(errorMessage)
  if (forbiddenCharacters.length === 0) {
    return errorMessage
  }

  return (
    getBaeminNameChangeBlockerMessage(detailPayload, forbiddenCharacters) ??
    getBaeminNameChangeBlockerMessageFromVisibleText(visibleText, forbiddenCharacters) ??
    errorMessage
  )
}

const getRecord = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

const normalizeBlockedCharacters = (blockedCharacters: string[]) =>
  [...new Set(blockedCharacters.map((character) => character.trim()).filter((character) => character.length > 0))]

const matchBlockedCharacters = (value: string, blockedCharacters: string[]) =>
  blockedCharacters.filter((character) => value.includes(character))

const classifyTextLabel = (key: string): DetailFieldLabel | null => {
  if (compositionKeyPattern.test(key)) {
    return '구성'
  }

  if (descriptionKeyPattern.test(key)) {
    return '설명'
  }

  return null
}

const collectNestedTextEntries = (value: unknown, inheritedLabel?: DetailFieldLabel | null) => {
  const entries: Array<{ label: DetailFieldLabel; value: string }> = []

  if (typeof value === 'string') {
    const normalizedValue = value.trim()
    if (normalizedValue && inheritedLabel) {
      entries.push({ label: inheritedLabel, value: normalizedValue })
    }

    return entries
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      entries.push(...collectNestedTextEntries(item, inheritedLabel))
    }

    return entries
  }

  if (!value || typeof value !== 'object') {
    return entries
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const nextLabel = classifyTextLabel(key) ?? inheritedLabel ?? null
    entries.push(...collectNestedTextEntries(nestedValue, nextLabel))
  }

  return entries
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const extractVisibleSection = (source: string, labels: string[], stopLabels: string[]) => {
  for (const label of labels) {
    const stopPattern = stopLabels.map(escapeRegExp).join('|')
    const pattern = new RegExp(
      `${escapeRegExp(label)}\\s+(.+?)(?:\\s+(?:${stopPattern})|$)`,
      'u'
    )

    const match = source.match(pattern)?.[1]?.trim()
    if (match) {
      return match
    }
  }

  return null
}
