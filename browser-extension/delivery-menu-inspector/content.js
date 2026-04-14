(() => {
  const API_HOOK_FLAG = '__deliveryMenuInspectorHookInstalled'
  const API_EVENTS_KEY = '__deliveryMenuInspectorApiEvents'
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
  const CONTROL_TEXTS = new Set([
    '그룹 추가',
    '메뉴 추가',
    '옵션 추가',
    '옵션 그룹 추가',
    '순서 변경',
    'POS 설치',
    '휴대폰 앱 설치',
    '약관 및 정책',
    'FAQ 보기',
    '검색'
  ])
  const NOISE_TEXTS = new Set(['FAQ', '메뉴', '옵션', '리뷰이벤트', '대표 사진', '검색'])

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

  const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

  const findLabelText = (element) => {
    const label = element.closest('label')
    if (label) {
      return normalizeText(label.textContent || '')
    }

    const labelId = element.getAttribute('aria-labelledby')
    if (labelId) {
      return normalizeText(document.getElementById(labelId)?.textContent || '')
    }

    return ''
  }

  const resolvePlatformCode = (href) => {
    const host = new URL(href).host
    if (host.includes('coupangeats')) {
      return 'coupangeats'
    }
    if (host.includes('ddangyo')) {
      return 'ddangyo'
    }
    return 'baemin'
  }

  const getHeadingRoot = () => {
    const heading = Array.from(document.querySelectorAll('h1, h2')).find((element) =>
      PAGE_HEADING_PATTERN.test(normalizeText(element.textContent || ''))
    )

    return heading?.closest('main, [role="main"], section, article, div') ?? null
  }

  const getContentRoot = () =>
    getHeadingRoot() ?? document.querySelector('main, [role="main"]') ?? document.body

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
      .map((child) => normalizeText(child.textContent || ''))
      .filter(Boolean)

    if (childElementTexts.length > 0) {
      return uniqueStrings(childElementTexts.flatMap((text) => tokenizeText(text)))
    }

    const nodeTexts = Array.from(element.childNodes)
      .map((node) => normalizeText(node.textContent || ''))
      .filter(Boolean)

    if (nodeTexts.length > 0) {
      return uniqueStrings(nodeTexts.flatMap((text) => tokenizeText(text)))
    }

    return uniqueStrings(
      Array.from(element.querySelectorAll('*'))
      .filter((child) => child.children.length === 0)
      .map((child) => normalizeText(child.textContent || ''))
      .filter(Boolean)
      .flatMap((text) => tokenizeText(text))
    )
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
          sanitizeText(previous.textContent || ''),
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
        if (!priceText || texts.length > 8) {
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

  const isHiddenInput = (element) =>
    element.hasAttribute('hidden') ||
    element.getAttribute('aria-hidden') === 'true' ||
    element.getAttribute('type') === 'hidden'

  const getInputPayload = (root) => {
    const inputs = Array.from(root.querySelectorAll('input, textarea, select')).filter(
      (element) => !isHiddenInput(element)
    )

    const inputHints = uniqueStrings(
      inputs
        .map((element) =>
          normalizeText(
            element.getAttribute('aria-label') ||
              element.getAttribute('placeholder') ||
              findLabelText(element) ||
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
            findLabelText(element) ||
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

    return { inputHints, fields }
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

  const buildSnapshot = ({ apiEvents, captureMode }) => {
    const root = getContentRoot()
    const pageHint = getPageHint(window.location.href)
    const optionGroupNames = pageHint === 'option_list' ? getOptionGroupNames(root) : []
    const menuItems =
      pageHint === 'option_list' || REVIEW_EVENT_PAGE_PATTERN.test(window.location.href)
        ? []
        : getMenuItems(root)
    const menuNames = uniqueStrings(menuItems.map((item) => item.name)).slice(0, 80)
    const categoryNames = uniqueStrings(
      menuItems.map((item) => item.categoryName).filter(Boolean)
    )
    const buttonLabels = uniqueStrings(
      Array.from(root.querySelectorAll('button, [role="button"]'))
        .map((element) => normalizeText(element.textContent || ''))
        .filter(
          (label) =>
            label &&
            label.length <= 20 &&
            !menuNames.includes(label) &&
            !categoryNames.includes(label)
        )
    ).slice(0, 20)
    const { inputHints, fields: inputFields } = getInputPayload(root)
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

    return {
      platformCode: resolvePlatformCode(window.location.href),
      pageUrl: window.location.href,
      pageTitle: document.title || '사장님 사이트',
      pageKind:
        pageHint !== 'unknown'
          ? pageHint
          : getPageKind({ menuItems, optionGroupNames, inputHints, buttonLabels }),
      captureMode,
      host: window.location.host,
      capturedAt: new Date().toISOString(),
      textSnippet: normalizeText(root.innerText || root.textContent || '').slice(0, 800),
      menuNames,
      menuItems,
      optionGroupNames,
      buttonLabels,
      inputHints,
      fields: [...menuFields, ...inputFields],
      apiEvents,
      screenshotDataUrl: null
    }
  }

  const mergeSnapshots = (snapshots) => {
    const firstSnapshot = snapshots[0]
    if (!firstSnapshot) {
      return null
    }

    const menuItems = Array.from(
      snapshots
        .flatMap((snapshot) => snapshot.menuItems || [])
        .reduce((groups, item) => {
          const key = `${item.name}|${item.priceText || ''}`
          const existing = groups.get(key) || []
          existing.push(item)
          groups.set(key, existing)
          return groups
        }, new Map())
    ).flatMap(([, items]) => {
      const recommendationItems = items.filter((item) => isRecommendationCategory(item.categoryName))
      const regularItems = items.filter((item) => !isRecommendationCategory(item.categoryName))
      const recommendationItem =
        [...recommendationItems].reverse().find((item) => item.categoryName) || recommendationItems.at(-1) || null
      const regularItem =
        [...regularItems].reverse().find((item) => item.categoryName) || regularItems.at(-1) || null
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
      ...snapshots.flatMap((snapshot) => snapshot.menuNames || []),
      ...menuItems.map((item) => item.name)
    ])

    return {
      ...firstSnapshot,
      pageKind:
        snapshots.find((snapshot) => snapshot.pageKind && snapshot.pageKind !== 'unknown')?.pageKind ??
        firstSnapshot.pageKind ??
        'unknown',
      captureMode: 'full_scroll',
      capturedAt: snapshots[snapshots.length - 1]?.capturedAt ?? firstSnapshot.capturedAt,
      textSnippet:
        snapshots
          .map((snapshot) => snapshot.textSnippet || '')
          .sort((left, right) => right.length - left.length)[0] || '',
      menuNames,
      menuItems,
      optionGroupNames: uniqueStrings(snapshots.flatMap((snapshot) => snapshot.optionGroupNames || [])),
      buttonLabels: uniqueStrings(snapshots.flatMap((snapshot) => snapshot.buttonLabels || [])),
      inputHints: uniqueStrings(snapshots.flatMap((snapshot) => snapshot.inputHints || [])),
      fields: uniqueBy(
        [
          ...menuItems.flatMap((item, index) => [
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
          ]),
          ...snapshots
            .flatMap((snapshot) => snapshot.fields || [])
            .filter((field) => !/^menu\[\d+\]\.(?:name|price|category)$/.test(field.name))
        ],
        (field) => `${field.name}|${field.value}|${field.source}`
      ),
      apiEvents: uniqueBy(
        snapshots.flatMap((snapshot) => snapshot.apiEvents || []),
        (event) => `${event.url}|${event.method}|${event.status || ''}|${event.capturedAt}`
      )
    }
  }

  const requestApiEvents = () =>
    new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve([]), 400)
      const handleMessage = (event) => {
        if (event.source !== window) {
          return
        }

        if (event.data?.type !== 'delivery-menu-inspector:response-api-events') {
          return
        }

        window.clearTimeout(timeout)
        window.removeEventListener('message', handleMessage)
        resolve(Array.isArray(event.data.events) ? event.data.events : [])
      }

      window.addEventListener('message', handleMessage)
      window.postMessage({ type: 'delivery-menu-inspector:request-api-events' }, '*')
    })

  const injectApiHook = () => {
    if (document.documentElement.dataset.deliveryMenuInspectorHook === 'installed') {
      return
    }

    const script = document.createElement('script')
    script.textContent = `
      (() => {
        const FLAG = '${API_HOOK_FLAG}'
        const KEY = '${API_EVENTS_KEY}'
        if (window[FLAG]) {
          return
        }

        window[FLAG] = true
        window[KEY] = window[KEY] || []

        const pushEvent = (event) => {
          window[KEY].push(event)
          if (window[KEY].length > 60) {
            window[KEY] = window[KEY].slice(-60)
          }
        }

        const cloneText = async (response) => {
          try {
            return (await response.clone().text()).slice(0, 2000)
          } catch {
            return null
          }
        }

        const originalFetch = window.fetch.bind(window)
        window.fetch = async (...args) => {
          const [input, init] = args
          const startedAt = new Date().toISOString()
          const response = await originalFetch(...args)
          pushEvent({
            url: typeof input === 'string' ? input : input?.url || '',
            method: init?.method || 'GET',
            status: response.status,
            capturedAt: startedAt,
            responsePreview: await cloneText(response)
          })
          return response
        }

        const originalOpen = XMLHttpRequest.prototype.open
        const originalSend = XMLHttpRequest.prototype.send

        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
          this.__deliveryMenuInspectorMeta = { method, url }
          return originalOpen.call(this, method, url, ...rest)
        }

        XMLHttpRequest.prototype.send = function(body) {
          this.addEventListener('loadend', () => {
            const meta = this.__deliveryMenuInspectorMeta || {}
            pushEvent({
              url: meta.url || '',
              method: meta.method || 'GET',
              status: Number.isFinite(this.status) ? this.status : null,
              capturedAt: new Date().toISOString(),
              requestPreview: typeof body === 'string' ? body.slice(0, 1200) : null,
              responsePreview: typeof this.responseText === 'string' ? this.responseText.slice(0, 2000) : null
            })
          })

          return originalSend.call(this, body)
        }

        window.addEventListener('message', (event) => {
          if (event.source !== window) {
            return
          }

          if (event.data?.type !== 'delivery-menu-inspector:request-api-events') {
            return
          }

          window.postMessage({
            type: 'delivery-menu-inspector:response-api-events',
            events: (window[KEY] || []).slice(-30)
          }, '*')
        })
      })();
    `
    document.documentElement.appendChild(script)
    script.remove()
    document.documentElement.dataset.deliveryMenuInspectorHook = 'installed'
  }

  const getScrollContainer = () => {
    const root = getContentRoot()
    const candidates = [
      document.scrollingElement,
      ...Array.from(root.querySelectorAll('main, section, article, div'))
    ].filter(Boolean)

    const scored = candidates
      .map((element) => ({
        element,
        score: Math.max(
          (element.scrollHeight || 0) - (element.clientHeight || window.innerHeight || 0),
          0
        )
      }))
      .sort((left, right) => right.score - left.score)

    return scored[0]?.element ?? document.scrollingElement ?? document.documentElement
  }

  const getScrollTop = (container) =>
    container === document.scrollingElement || container === document.documentElement
      ? window.scrollY
      : container.scrollTop

  const setScrollTop = (container, value) => {
    if (container === document.scrollingElement || container === document.documentElement) {
      window.scrollTo({ top: value, left: 0, behavior: 'auto' })
      return
    }

    container.scrollTop = value
  }

  const getMaxScrollTop = (container) => {
    const clientHeight =
      container === document.scrollingElement || container === document.documentElement
        ? window.innerHeight
        : container.clientHeight

    return Math.max((container.scrollHeight || 0) - clientHeight, 0)
  }

  const collectSnapshot = async () => {
    const container = getScrollContainer()
    const initialScrollTop = getScrollTop(container)
    const maxScrollTop = getMaxScrollTop(container)
    const steps = Math.min(Math.max(Math.ceil(maxScrollTop / Math.max(window.innerHeight * 0.8, 1)) + 1, 1), 8)
    const snapshots = []

    for (let index = 0; index < steps; index += 1) {
      const nextScrollTop = steps === 1 ? initialScrollTop : Math.round((maxScrollTop / Math.max(steps - 1, 1)) * index)
      setScrollTop(container, nextScrollTop)
      await delay(220)
      const apiEvents = await requestApiEvents()
      snapshots.push(
        buildSnapshot({
          apiEvents,
          captureMode: steps > 1 ? 'full_scroll' : 'viewport'
        })
      )
    }

    setScrollTop(container, initialScrollTop)
    await delay(80)

    return mergeSnapshots(snapshots)
  }

  injectApiHook()

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'delivery-menu-inspector:capture') {
      return undefined
    }

    void collectSnapshot()
      .then((snapshot) => sendResponse(snapshot))
      .catch((error) =>
        sendResponse({
          error: error instanceof Error ? error.message : 'capture_failed'
        })
      )

    return true
  })
})()
