export interface ManagedChromeAuthEvidence {
  visiblePasswordInputCount: number
  loginMarkerDetected: boolean
  credentialRejectionMarkerDetected: boolean
  logoutMarkerDetected: boolean
  managementMarkerDetected: boolean
}

export const collectManagedChromeAuthEvidence = (
  document: Document,
  href: string
): ManagedChromeAuthEvidence => {
  const view = document.defaultView
  const isVisible = (element: Element) => {
    if (!view || !(element instanceof view.HTMLElement)) return false
    const style = view.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    )
  }
  const normalizeText = (text: string | null | undefined) =>
    String(text ?? '').replace(/\s+/g, ' ').trim()
  const visiblePasswordInputCount = Array.from(
    document.querySelectorAll('input[type="password"]')
  ).filter(isVisible).length
  const controlLabels = Array.from(
    document.querySelectorAll('button, a, [role="button"]')
  )
    .filter(isVisible)
    .map((element) =>
      normalizeText(element.textContent || element.getAttribute('aria-label'))
    )
    .filter(Boolean)
  const bodyText = normalizeText(document.body?.textContent)
  const loginMarkerDetected =
    visiblePasswordInputCount > 0 ||
    /\/(?:login|signin|sign-in)(?:[/?#]|$)/i.test(href) ||
    controlLabels.some((label) => /^(?:로그인|log in|sign in)$/i.test(label))
  const logoutMarkerDetected = controlLabels.some((label) =>
    /(?:로그아웃|log out|sign out)/i.test(label)
  )
  const credentialRejectionMarkerDetected =
    /\/(?:login|signin|sign-in)\/error(?:[/?#]|$)/i.test(href) &&
    /(?:로그인|인증).{0,60}(?:실패|오류)/u.test(bodyText) &&
    /(?:아이디|비밀번호|계정|credential|password)/i.test(bodyText)
  const managementMarkerDetected =
    !loginMarkerDetected &&
    /(?:메뉴|옵션|가게|매장|주문|영업|상품)\s*(?:관리|설정)|(?:관리|설정)\s*(?:메뉴|옵션|가게|매장|주문|영업|상품)/i.test(
      bodyText
    )

  return {
    visiblePasswordInputCount,
    loginMarkerDetected,
    credentialRejectionMarkerDetected,
    logoutMarkerDetected,
    managementMarkerDetected
  }
}

const buildManagedChromeAuthEvidenceExpression = () =>
  `JSON.stringify((${collectManagedChromeAuthEvidence.toString()})(document, window.location.href))`

export class ManagedChromeAuthEvidenceProbe {
  constructor(
    private readonly scriptRunner: {
      evaluateJson: <T>(tabId: string, expression: string) => Promise<T>
    }
  ) {}

  inspect(tabId: string) {
    return this.scriptRunner.evaluateJson<ManagedChromeAuthEvidence>(
      tabId,
      buildManagedChromeAuthEvidenceExpression()
    )
  }
}
