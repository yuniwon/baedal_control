const PRICE_TEXT_PATTERN = /\d{1,3}(?:,\d{3})*원/
const SECTION_NOISE_PATTERN = /(메뉴 사진은|메뉴 추가|순서 변경)/

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim()

const isVisible = (element) => {
  if (!element) {
    return false
  }

  const style = window.getComputedStyle(element)
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    element.getAttribute('aria-hidden') !== 'true'
  )
}

const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

const formatPriceText = (value) => `${value.toLocaleString('ko-KR')}원`

const formatPriceInput = (value) => value.toLocaleString('ko-KR')

const buildResultMessage = (base, context = {}) => {
  const parts = Object.entries(context)
    .filter(([, value]) => value != null && normalizeText(String(value)) !== '')
    .map(([key, value]) => `${key}=${normalizeText(String(value))}`)

  return parts.length > 0 ? `${base};${parts.join(';')}` : base
}

const parsePriceText = (value) => {
  const match = normalizeText(value).match(/\d{1,3}(?:,\d{3})*/)
  if (!match) {
    return null
  }

  const parsed = Number(match[0].replaceAll(',', ''))
  return Number.isFinite(parsed) ? parsed : null
}

const extractGroupName = (row) => {
  const list = row.closest('ul')
  const raw = normalizeText(list?.previousElementSibling?.textContent || '')
  if (!raw) {
    return null
  }

  return normalizeText(raw.split(SECTION_NOISE_PATTERN)[0] || '') || null
}

const buildRowCandidate = (row, explicitGroupName = null) => {
  const name = normalizeText(row.querySelector('.dish-name')?.textContent || '')
  const priceText = normalizeText(row.querySelector('.sale-price')?.textContent || '')
  const editButton = row.querySelector('.edit')

  if (!name || !priceText || !PRICE_TEXT_PATTERN.test(priceText) || !editButton) {
    return null
  }

  return {
    row,
    name,
    priceText,
    price: parsePriceText(priceText),
    groupName: explicitGroupName || extractGroupName(row),
    editButton
  }
}

const collectMenuSections = () => {
  const sections = Array.from(document.querySelectorAll('[data-testid^="menu-content-"]'))
    .map((section) => {
      const groupName = normalizeText(section.querySelector('.menu-name')?.textContent || '') || null
      const rows = Array.from(section.querySelectorAll('li'))
        .map((row) => buildRowCandidate(row, groupName))
        .filter(Boolean)

      return {
        groupName,
        rows
      }
    })
    .filter((section) => section.rows.length > 0)

  if (sections.length > 0) {
    return sections
  }

  return [
    {
      groupName: null,
      rows: Array.from(document.querySelectorAll('li'))
        .map((row) => buildRowCandidate(row))
        .filter(Boolean)
    }
  ].filter((section) => section.rows.length > 0)
}

const collectMenuRows = () => collectMenuSections().flatMap((section) => section.rows)

const getStoreId = () =>
  window.location.pathname.match(/\/merchant\/management\/(?:oos\/)?menu\/(\d+)/)?.[1] || null

const fetchMenuCatalogEntries = async () => {
  const storeId = getStoreId()
  if (!storeId || typeof fetch !== 'function') {
    return []
  }

  try {
    const response = await fetch(`/api/v1/merchant/web/stores/${storeId}/all-menu-dishes`, {
      method: 'GET',
      credentials: 'include'
    })
    if (!response.ok) {
      return []
    }

    const payload = await response.json()
    const menus = Array.isArray(payload?.data?.menus) ? payload.data.menus : []

    return menus.flatMap((menu) => {
      const groupName = normalizeText(menu?.menuName || '') || null

      return Array.isArray(menu?.dishes)
        ? menu.dishes.flatMap((dish, indexWithinGroup) => {
            const platformMenuId =
              dish?.dishId == null ? '' : normalizeText(String(dish.dishId))
            const name = normalizeText(dish?.dishName || '')
            const price =
              typeof dish?.salePrice === 'number' && Number.isFinite(dish.salePrice)
                ? dish.salePrice
                : null

            if (!platformMenuId || !name) {
              return []
            }

            return [
              {
                platformMenuId,
                name,
                price,
                groupName,
                indexWithinGroup
              }
            ]
          })
        : []
    })
  } catch {
    return []
  }
}

const findMatchingRows = ({ previousName, previousPrice, platformMenuGroupName, rows = collectMenuRows() }) =>
  rows.filter((candidate) => {
    if (candidate.name !== normalizeText(previousName)) {
      return false
    }

    if (typeof previousPrice === 'number' && candidate.price !== previousPrice) {
      return false
    }

    if (
      platformMenuGroupName &&
      candidate.groupName &&
      candidate.groupName !== normalizeText(platformMenuGroupName)
    ) {
      return false
    }

    return true
  })

const findMatchingRowByPlatformMenuId = async ({
  platformMenuId,
  previousName,
  previousPrice,
  platformMenuGroupName
}) => {
  const normalizedPlatformMenuId = normalizeText(platformMenuId || '')
  if (!normalizedPlatformMenuId) {
    return null
  }

  const catalogEntries = await fetchMenuCatalogEntries()
  const targetEntry = catalogEntries.find(
    (entry) => entry.platformMenuId === normalizedPlatformMenuId
  )

  if (!targetEntry) {
    return null
  }

  const sections = collectMenuSections()
  const matchingSection = sections.find((section) => {
    if (targetEntry.groupName && section.groupName) {
      return section.groupName === targetEntry.groupName
    }

    if (platformMenuGroupName && section.groupName) {
      return section.groupName === normalizeText(platformMenuGroupName)
    }

    return true
  })

  if (!matchingSection) {
    return null
  }

  const duplicateEntries = catalogEntries.filter(
    (entry) =>
      entry.groupName === targetEntry.groupName &&
      entry.name === targetEntry.name &&
      (targetEntry.price == null || entry.price === targetEntry.price)
  )
  const duplicateIndex = duplicateEntries.findIndex(
    (entry) => entry.platformMenuId === normalizedPlatformMenuId
  )
  const sectionMatches = findMatchingRows({
    previousName,
    previousPrice,
    platformMenuGroupName: matchingSection.groupName || platformMenuGroupName,
    rows: matchingSection.rows
  })

  if (duplicateIndex >= 0 && sectionMatches.length > duplicateIndex) {
    return sectionMatches[duplicateIndex]
  }

  if (matchingSection.rows.length > targetEntry.indexWithinGroup) {
    const candidate = matchingSection.rows[targetEntry.indexWithinGroup]
    const candidateMatchesName =
      !targetEntry.name ||
      candidate.name === targetEntry.name ||
      candidate.name === normalizeText(previousName)
    const candidateMatchesPrice =
      targetEntry.price == null ||
      candidate.price == null ||
      candidate.price === targetEntry.price ||
      (typeof previousPrice === 'number' && candidate.price === previousPrice)

    if (candidateMatchesName && candidateMatchesPrice) {
      return candidate
    }
  }

  return null
}

const findEditorControls = () => {
  const nameInput = Array.from(document.querySelectorAll('input[type="text"], textarea')).find(
    (input) =>
      isVisible(input) &&
      normalizeText(input.getAttribute('placeholder') || '').includes('치즈버거')
  )
  const priceInput = Array.from(document.querySelectorAll('input[type="text"]')).find(
    (input) =>
      isVisible(input) && normalizeText(input.getAttribute('placeholder') || '') === '0'
  )
  const saveButton = Array.from(document.querySelectorAll('button, [role="button"]')).find(
    (button) => isVisible(button) && normalizeText(button.textContent) === '저장'
  )

  return {
    nameInput: nameInput || null,
    priceInput: priceInput || null,
    saveButton: saveButton || null
  }
}

const setInputValue = (input, value) => {
  const prototype =
    input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

const waitFor = async (resolver, timeoutMs = 5000, intervalMs = 100) => {
  const startedAt = Date.now()

  while (Date.now() - startedAt <= timeoutMs) {
    const value = resolver()
    if (value) {
      return value
    }

    await delay(intervalMs)
  }

  return null
}

export const applyManagedBrowserMenuUpdate = async ({
  platformMenuId,
  previousName,
  previousPrice,
  nextName,
  nextPrice,
  platformMenuGroupName
}) => {
  const exactRow = await findMatchingRowByPlatformMenuId({
    platformMenuId,
    previousName,
    previousPrice,
    platformMenuGroupName
  })
  const matchingRows = exactRow
    ? [exactRow]
    : findMatchingRows({
        previousName,
        previousPrice,
        platformMenuGroupName
      })

  if (matchingRows.length === 0) {
    return {
      status: 'target_not_found',
      message: buildResultMessage('matching_menu_row_not_found', {
        id: platformMenuId,
        name: previousName,
        price: previousPrice,
        group: platformMenuGroupName
      })
    }
  }

  if (matchingRows.length > 1) {
    return {
      status: 'ambiguous_target',
      message: buildResultMessage('matching_menu_row_ambiguous', {
        id: platformMenuId,
        name: previousName,
        price: previousPrice,
        group: platformMenuGroupName,
        count: matchingRows.length
      })
    }
  }

  const target = matchingRows[0]
  const alreadyMatches =
    target.name === normalizeText(nextName) && target.price === Number(nextPrice)

  if (alreadyMatches) {
    return {
      status: 'no_change',
      message: 'target_already_matches'
    }
  }

  target.editButton.click()

  const controls = await waitFor(() => {
    const nextControls = findEditorControls()
    return nextControls.nameInput && nextControls.priceInput && nextControls.saveButton
      ? nextControls
      : null
  })

  if (!controls) {
    return {
      status: 'editor_not_opened',
      message: buildResultMessage('menu_editor_controls_not_found', {
        id: platformMenuId,
        name: previousName,
        nextName,
        group: platformMenuGroupName
      })
    }
  }

  setInputValue(controls.nameInput, nextName)
  setInputValue(controls.priceInput, formatPriceInput(nextPrice))

  await delay(50)
  controls.saveButton.click()

  const saved = await waitFor(() => {
    const nextRows = findMatchingRows({
      previousName: nextName,
      previousPrice: nextPrice,
      platformMenuGroupName
    })

    return nextRows.length === 1 &&
      nextRows[0].name === normalizeText(nextName) &&
      nextRows[0].priceText === formatPriceText(nextPrice)
      ? nextRows[0]
      : null
  }, 8000, 150)

  if (!saved) {
    return {
      status: 'save_not_observed',
      message: buildResultMessage('menu_update_not_observed_in_list', {
        id: platformMenuId,
        previousName,
        nextName,
        nextPrice,
        group: platformMenuGroupName
      })
    }
  }

  return {
    status: 'saved',
    message: 'menu_updated'
  }
}
