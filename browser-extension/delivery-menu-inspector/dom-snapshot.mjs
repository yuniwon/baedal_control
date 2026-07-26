const PRICE_PATTERN = /\d{1,3}(?:,\d{3})*원/
const PAGE_HEADING_PATTERN = /(메뉴 편집|메뉴 관리|옵션|옵션 관리)/
const OPTION_META_PATTERN = /(최대|최소|필수 옵션|외 \d+개)/
const MENU_STATE_PATTERN = /(오늘만 품절|품절|숨김|판매중|일시품절)/
const SECTION_HEADER_HINT_PATTERN = /(메뉴 사진은|메뉴 추가|순서 변경)/
const MENU_PAGE_PATTERN = /\/management\/menu\/\d+(?:[/?#]|$)/
const OPTION_PAGE_PATTERN = /\/management\/menu\/\d+\/options(?:[/?#]|$)/
const REVIEW_EVENT_PAGE_PATTERN = /\/management\/menu\/\d+\/review-event(?:[/?#]|$)/
const CONTROL_PATTERN = /(그룹 추가|메뉴 추가|옵션 추가|옵션 그룹 추가|순서 변경|검색|자세히 알아보기|최소주문 없는 메뉴 할인|하나만 담아도 무료배달)/
const BADGE_PATTERN = /리뷰이벤트/g
const NOISE_PATTERN = /(FAQ|대표 사진|메뉴 사진은|연출된 이미지|실제 조리된 음식과 다를 수 있습니다|도움말|로그아웃|정보 변경)/
const INVALID_GROUP_NAME_PATTERN = /^(?:[A-Z]:|\*.*|가격)$/
const MENU_ROW_SELECTOR = 'article, li, tr, [data-menu-card], .menu-item, .menu-row, section > div, div'
const CONTROL_TEXTS = new Set(['POS 설치', '휴대폰 앱 설치', '약관 및 정책', 'FAQ 보기'])
const NOISE_TEXTS = new Set(['FAQ', '메뉴', '옵션', '대표 사진', '검색'])

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim()

const sanitizeText = (value) => normalizeText(String(value || '').replace(BADGE_PATTERN, ' '))

const uniqueBy = (items, keyResolver) => {
  const seen = new Set()
  const result = []

  for (const item of items) {
    const key = keyResolver(item)
    if (!key || seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(item)
  }

  return result
}

const uniqueStrings = (items) => uniqueBy(items.map((item) => sanitizeText(item)), (item) => item)

const resolvePlatformCode = (href) => {
  const host = new URL(href).host
  if (host.includes('yogiyo')) {
    return 'yogiyo'
  }
  if (host.includes('coupangeats')) {
    return 'coupangeats'
  }
  if (host.includes('ddangyo')) {
    return 'ddangyo'
  }
  if (host.includes('partner.payco') || host.includes('specialdelivery')) {
    return 'deliveryspecial'
  }
  if (host.includes('smartplace.naver')) {
    return 'naverorder'
  }
  return 'baemin'
}

const isHiddenInput = (element) =>
  element.hasAttribute('hidden') ||
  element.getAttribute('aria-hidden') === 'true' ||
  element.getAttribute('type') === 'hidden'

const findLabelText = (document, element) => {
  const label = element.closest('label')
  if (label) {
    return normalizeText(label.textContent)
  }

  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy) {
    return normalizeText(document.getElementById(labelledBy)?.textContent || '')
  }

  return ''
}

const getHeadingRoot = (document) => {
  const heading = Array.from(document.querySelectorAll('h1, h2')).find((element) =>
    PAGE_HEADING_PATTERN.test(normalizeText(element.textContent))
  )

  return heading?.closest('main, [role="main"], section, article, div') ?? null
}

const getContentRoot = (document) =>
  getHeadingRoot(document) ?? document.querySelector('main, [role="main"]') ?? document.body

const tokenizeText = (value) => {
    const normalized = sanitizeText(value)
  if (!normalized) {
    return []
  }

  const tokens = []
  let remaining = normalized

  while (remaining) {
    const match = remaining.match(PRICE_PATTERN)

    if (!match || typeof match.index !== 'number') {
      tokens.push(remaining)
      break
    }

    const before = normalizeText(remaining.slice(0, match.index))
    if (before) {
      tokens.push(before)
    }

    tokens.push(match[0])
    remaining = normalizeText(remaining.slice(match.index + match[0].length))
  }

  return tokens.filter(Boolean)
}

const isControlText = (text) => CONTROL_TEXTS.has(text) || CONTROL_PATTERN.test(text)
const isMenuStateText = (text) => MENU_STATE_PATTERN.test(text)
const isNoiseText = (text) =>
  !text || NOISE_TEXTS.has(text) || NOISE_PATTERN.test(text) || isControlText(text) || PAGE_HEADING_PATTERN.test(text)

const isMeaningfulText = (text) =>
  Boolean(text) && !PRICE_PATTERN.test(text) && !isNoiseText(text)

const isCategoryLabelText = (text) =>
  isMeaningfulText(text) &&
  !isMenuStateText(text) &&
  !OPTION_META_PATTERN.test(text) &&
  text.length >= 2 &&
  text.length <= 40

const isRecommendationCategory = (categoryName) =>
  typeof categoryName === 'string' && categoryName.includes('추천')

const getDirectTextCandidates = (element) => {
  const childElementTexts = Array.from(element.children)
    .map((child) => normalizeText(child.textContent))
    .filter(Boolean)

  if (childElementTexts.length > 0) {
    return uniqueStrings(childElementTexts.flatMap((text) => tokenizeText(text)))
  }

  const nodeTexts = Array.from(element.childNodes)
    .map((node) => normalizeText(node.textContent))
    .filter(Boolean)

  if (nodeTexts.length > 0) {
    return uniqueStrings(nodeTexts.flatMap((text) => tokenizeText(text)))
  }

  const leafTexts = Array.from(element.querySelectorAll('*'))
    .filter((child) => child.children.length === 0)
    .map((child) => normalizeText(child.textContent))
    .filter(Boolean)

  return uniqueStrings(leafTexts.flatMap((text) => tokenizeText(text)))
}

const getPageHint = (href) => {
  if (OPTION_PAGE_PATTERN.test(href)) {
    return 'option_list'
  }

  if (REVIEW_EVENT_PAGE_PATTERN.test(href)) {
    return 'unknown'
  }

  if (MENU_PAGE_PATTERN.test(href)) {
    return 'menu_list'
  }

  return 'unknown'
}

const getKnownCategoryLabels = (root) =>
  uniqueStrings(
    Array.from(root.querySelectorAll('section, article, nav, div'))
      .map((element) => uniqueStrings(getDirectTextCandidates(element)))
      .filter(
        (texts) =>
          texts.includes('그룹 추가') &&
          texts.filter((text) => isCategoryLabelText(text) && !isControlText(text)).length >= 2
      )
      .flatMap((texts) => texts.filter((text) => isCategoryLabelText(text) && !isControlText(text)))
  ).slice(0, 20)

const resolveCategoryFromSectionText = (text, knownCategoryLabels) => {
  if (!text || !SECTION_HEADER_HINT_PATTERN.test(text) || knownCategoryLabels.length === 0) {
    return null
  }

  const matches = knownCategoryLabels.filter((label) => text.includes(label))
  if (matches.length === 0) {
    return null
  }

  if (matches.length === 1) {
    return matches[0]
  }

  return matches.sort((left, right) => text.indexOf(left) - text.indexOf(right))[0] ?? null
}

const getCandidateCategoryName = (element, root, knownCategoryLabels) => {
  let current = element
  const body = root.ownerDocument?.body ?? null

  while (current && current !== root && current !== body) {
    let previous = current.previousElementSibling

    while (previous) {
      const sectionCategory = resolveCategoryFromSectionText(
        sanitizeText(previous.textContent),
        knownCategoryLabels
      )
      if (sectionCategory) {
        return sectionCategory
      }

      const previousTexts = getDirectTextCandidates(previous)
      if (previousTexts.some((text) => PRICE_PATTERN.test(text))) {
        previous = previous.previousElementSibling
        continue
      }

      const candidate = previousTexts.find(
        (text) =>
          isMeaningfulText(text) &&
          !isMenuStateText(text) &&
          text.length >= 2 &&
          text.length <= 40 &&
          !OPTION_META_PATTERN.test(text)
      )

      if (candidate) {
        return candidate
      }

      previous = previous.previousElementSibling
    }

    current = current.parentElement
  }

  return null
}

const getMenuItems = (root) => {
  const knownCategoryLabels = getKnownCategoryLabels(root)
  const candidates = Array.from(root.querySelectorAll(MENU_ROW_SELECTOR))
    .map((element) => {
      const texts = uniqueStrings(getDirectTextCandidates(element))
      const priceText = texts.find((text) => PRICE_PATTERN.test(text)) ?? null
      if (!priceText) {
        return null
      }

      if (texts.length > 8) {
        return null
      }

      const name = texts.find(
        (text) =>
          isMeaningfulText(text) &&
          text !== priceText &&
          !PRICE_PATTERN.test(text) &&
          !isMenuStateText(text) &&
          text.length <= 40
      )

      if (!name) {
        return null
      }

      return {
        name,
        priceText,
        categoryName: getCandidateCategoryName(element, root, knownCategoryLabels)
      }
    })
    .filter((item) => item !== null)

  return uniqueBy(candidates, (item) => `${item.name}|${item.priceText || ''}|${item.categoryName || ''}`)
}

const getOptionGroupNames = (root) =>
  uniqueBy(
    Array.from(root.querySelectorAll('section, article, li, div'))
      .map((element) => {
        const texts = uniqueStrings(getDirectTextCandidates(element))
        if (texts.length < 2 || texts.length > 12) {
          return null
        }

        const metaText = texts.find((text) => OPTION_META_PATTERN.test(text))
        if (!metaText) {
          return null
        }

        const metaIndex = texts.indexOf(metaText)
        const name = texts.slice(0, metaIndex).find(
          (text) =>
            isMeaningfulText(text) &&
            !isMenuStateText(text) &&
            !INVALID_GROUP_NAME_PATTERN.test(text) &&
            text.length >= 2 &&
            text.length <= 40
        )

        if (!name) {
          return null
        }

        return name
      })
      .filter(Boolean),
    (name) => name
  ).slice(0, 40)

const getButtonLabels = (root, menuNames, categoryNames) =>
  uniqueStrings(
    Array.from(root.querySelectorAll('button, [role="button"]'))
      .map((element) => normalizeText(element.textContent))
      .filter(
        (label) =>
          label &&
          label.length <= 20 &&
          !menuNames.includes(label) &&
          !categoryNames.includes(label)
      )
  ).slice(0, 20)

const getInputPayload = (document, root) => {
  const inputs = Array.from(root.querySelectorAll('input, textarea, select')).filter(
    (element) => !isHiddenInput(element)
  )

  const inputHints = uniqueStrings(
    inputs
      .map((element) =>
        normalizeText(
          element.getAttribute('aria-label') ||
            element.getAttribute('placeholder') ||
            findLabelText(document, element) ||
            element.getAttribute('name') ||
            ''
        )
      )
      .filter(Boolean)
  ).slice(0, 20)

  const fields = inputs
    .map((element) => {
      const name = normalizeText(
        element.getAttribute('aria-label') ||
          element.getAttribute('placeholder') ||
          findLabelText(document, element) ||
          element.getAttribute('name') ||
          element.id ||
          ''
      )
      const value = normalizeText(element.value || '')

      if (!name || !value) {
        return null
      }

      return {
        name,
        value,
        source: 'input'
      }
    })
    .filter((field) => field !== null)

  return {
    inputHints,
    fields
  }
}

const getPageKind = ({ menuItems, optionGroupNames, inputHints, buttonLabels }) => {
  if (menuItems.length > 0) {
    return 'menu_list'
  }

  if (optionGroupNames.length > 0) {
    return 'option_list'
  }

  if (
    inputHints.some((hint) => hint.includes('메뉴명') || hint.includes('가격')) ||
    buttonLabels.includes('저장')
  ) {
    return 'menu_detail'
  }

  return 'unknown'
}

export const collectDomSnapshot = ({
  document,
  href,
  pageTitle,
  capturedAt,
  apiEvents = [],
  screenshotDataUrl = null,
  captureMode = 'viewport'
}) => {
  const root = getContentRoot(document)
  const pageHint = getPageHint(href)
  const optionGroupNames = pageHint === 'option_list' ? getOptionGroupNames(root) : []
  const menuItems = pageHint === 'option_list' || REVIEW_EVENT_PAGE_PATTERN.test(href) ? [] : getMenuItems(root)
  const menuNames = uniqueStrings(menuItems.map((item) => item.name)).slice(0, 80)
  const categoryNames = uniqueStrings(
    menuItems.map((item) => item.categoryName).filter(Boolean)
  )
  const buttonLabels = getButtonLabels(root, menuNames, categoryNames)
  const { inputHints, fields: inputFields } = getInputPayload(document, root)
  const menuFields = menuItems.flatMap((item, index) => [
    {
      name: `menu[${index}].name`,
      value: item.name,
      source: 'dom'
    },
    ...(item.priceText
      ? [
          {
            name: `menu[${index}].price`,
            value: item.priceText,
            source: 'dom'
          }
        ]
      : []),
    ...(item.categoryName
      ? [
          {
            name: `menu[${index}].category`,
            value: item.categoryName,
            source: 'dom'
          }
        ]
      : [])
  ])
  const fields = [...menuFields, ...inputFields]
  const pageKind =
    pageHint !== 'unknown'
      ? pageHint
      : getPageKind({ menuItems, optionGroupNames, inputHints, buttonLabels })

  return {
    platformCode: resolvePlatformCode(href),
    pageUrl: href,
    pageTitle,
    pageKind,
    captureMode,
    host: new URL(href).host,
    capturedAt,
    textSnippet: normalizeText(root.textContent || '').slice(0, 800),
    menuNames,
    menuItems,
    optionGroupNames,
    buttonLabels,
    inputHints,
    fields,
    apiEvents,
    screenshotDataUrl
  }
}

export const mergeDomSnapshots = (snapshots) => {
  const firstSnapshot = snapshots[0]
  if (!firstSnapshot) {
    return null
  }

  const menuItems = Array.from(
    snapshots
      .flatMap((snapshot) => snapshot.menuItems ?? [])
      .reduce((groups, item) => {
        const key = `${item.name}|${item.priceText || ''}`
        const existing = groups.get(key) ?? []
        existing.push(item)
        groups.set(key, existing)
        return groups
      }, new Map())
  ).flatMap(([, items]) => {
    const recommendationItems = items.filter((item) => isRecommendationCategory(item.categoryName))
    const regularItems = items.filter((item) => !isRecommendationCategory(item.categoryName))
    const recommendationItem =
      [...recommendationItems].reverse().find((item) => item.categoryName) ?? recommendationItems.at(-1) ?? null
    const regularItem =
      [...regularItems].reverse().find((item) => item.categoryName) ?? regularItems.at(-1) ?? null
    const resolved = []

    if (recommendationItem) {
      resolved.push(recommendationItem)
    }

    if (
      regularItem &&
      (!recommendationItem ||
        regularItem.categoryName !== recommendationItem.categoryName ||
        regularItem.name !== recommendationItem.name ||
        regularItem.priceText !== recommendationItem.priceText)
    ) {
      resolved.push(regularItem)
    }

    return resolved.length > 0 ? resolved : items.slice(0, 1)
  })
  const menuNames = uniqueStrings([
    ...snapshots.flatMap((snapshot) => snapshot.menuNames ?? []),
    ...menuItems.map((item) => item.name)
  ])
  const optionGroupNames = uniqueStrings(snapshots.flatMap((snapshot) => snapshot.optionGroupNames ?? []))
  const buttonLabels = uniqueStrings(snapshots.flatMap((snapshot) => snapshot.buttonLabels ?? []))
  const inputHints = uniqueStrings(snapshots.flatMap((snapshot) => snapshot.inputHints ?? []))
  const passthroughFields = snapshots
    .flatMap((snapshot) => snapshot.fields ?? [])
    .filter((field) => !/^menu\[\d+\]\.(?:name|price|category)$/.test(field.name))
  const menuFields = menuItems.flatMap((item, index) => [
    {
      name: `menu[${index}].name`,
      value: item.name,
      source: 'dom'
    },
    ...(item.priceText
      ? [
          {
            name: `menu[${index}].price`,
            value: item.priceText,
            source: 'dom'
          }
        ]
      : []),
    ...(item.categoryName
      ? [
          {
            name: `menu[${index}].category`,
            value: item.categoryName,
            source: 'dom'
          }
        ]
      : [])
  ])
  const fields = uniqueBy([...menuFields, ...passthroughFields], (field) => `${field.name}|${field.value}|${field.source}`)
  const apiEvents = uniqueBy(
    snapshots.flatMap((snapshot) => snapshot.apiEvents ?? []),
    (event) => `${event.url}|${event.method}|${event.status || ''}|${event.capturedAt}`
  )
  const textSnippet =
    snapshots
      .map((snapshot) => snapshot.textSnippet || '')
      .sort((left, right) => right.length - left.length)[0] || ''

  return {
    ...firstSnapshot,
    pageKind:
      snapshots.find((snapshot) => snapshot.pageKind && snapshot.pageKind !== 'unknown')?.pageKind ??
      firstSnapshot.pageKind ??
      'unknown',
    captureMode:
      snapshots.some((snapshot) => snapshot.captureMode === 'full_scroll') ? 'full_scroll' : 'viewport',
    capturedAt: snapshots[snapshots.length - 1]?.capturedAt ?? firstSnapshot.capturedAt,
    textSnippet,
    menuNames,
    menuItems,
    optionGroupNames,
    buttonLabels,
    inputHints,
    fields,
    apiEvents
  }
}
