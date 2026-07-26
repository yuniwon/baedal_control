export const dismissSafeNoticeDialogsInDocument = (documentRef: Document) => {
  const normalize = (value: string | null | undefined) =>
    value?.replace(/\s+/g, ' ').trim() ?? ''
  const isVisible = (element: Element) => {
    if (!(element instanceof documentRef.defaultView!.HTMLElement)) return false
    const style = documentRef.defaultView!.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return (
      !element.hasAttribute('hidden') &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    )
  }
  const modalSelector = [
    '[role="dialog"]',
    '[aria-modal="true"]',
    '[class*="modal" i]',
    '[class*="popup" i]',
    '[class*="notice" i]'
  ].join(', ')
  const safeLabelPattern = /^(?:오늘\s*(?:하루\s*)?보지\s*않기|일주일\s*보지\s*않기|다시\s*보지\s*않기|나중에|닫기)$/u
  const doNotShowPattern = /보지\s*않기/u
  const dismissedLabels: string[] = []
  const dismissedRoots = new Set<Element>()
  const controls = Array.from(
    documentRef.querySelectorAll('button, a, [role="button"], input[type="button"]')
  )
    .filter(isVisible)
    .map((element) => {
      const inputValue =
        element instanceof documentRef.defaultView!.HTMLInputElement ? element.value : ''
      const label = normalize(
        element.getAttribute('aria-label') || element.textContent || inputValue
      )
      return { element, label, root: element.closest(modalSelector) ?? element }
    })
    .filter(({ element, label }) => {
      if (!safeLabelPattern.test(label)) return false
      return doNotShowPattern.test(label) || Boolean(element.closest(modalSelector))
    })
    .sort((left, right) => {
      const leftPreferred = doNotShowPattern.test(left.label) ? 1 : 0
      const rightPreferred = doNotShowPattern.test(right.label) ? 1 : 0
      return rightPreferred - leftPreferred
    })

  for (const target of controls) {
    if (dismissedRoots.has(target.root)) continue
    dismissedRoots.add(target.root)
    ;(target.element as HTMLElement).click()
    dismissedLabels.push(target.label)
  }

  return dismissedLabels
}

export const buildSafeNoticeDialogDismissalExpression = () => `
(() => {
  const dismissSafeNoticeDialogsInDocument = ${dismissSafeNoticeDialogsInDocument.toString()}
  return dismissSafeNoticeDialogsInDocument(document)
})()
`.trim()
