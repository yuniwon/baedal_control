import type { PlatformCode } from '../../shared/contracts'

export type ManagedChromeLoginBlocker =
  | 'login_error'
  | 'captcha'
  | 'otp'
  | 'account_selection'

export interface ManagedPasswordManagerLoginDescriptor {
  platformCode: PlatformCode
  loginUrl: string
  loginPathPattern: string
  managementPathPattern: string
  usernameSelector: string
  passwordSelector: string
  submitSelector: string
}

export interface ManagedChromeLoginPageEvidence {
  loginFormVisible: boolean
  usernameFilled: boolean
  passwordFilled: boolean
  submitVisible: boolean
  submitEnabled: boolean
  blocker: ManagedChromeLoginBlocker | null
  managementMarkerDetected: boolean
  logoutMarkerDetected: boolean
  visiblePasswordInputCount: number
}

export const collectManagedChromeLoginPageEvidence = (
  document: Document,
  href: string,
  descriptor: ManagedPasswordManagerLoginDescriptor
): ManagedChromeLoginPageEvidence => {
  const view = document.defaultView
  const isVisible = (element: Element | null) => {
    if (!view || !element || !(element instanceof view.HTMLElement)) return false
    const style = view.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    )
  }
  const normalizeText = (value: string | null | undefined) =>
    String(value ?? '').replace(/\s+/g, ' ').trim()
  const isFilled = (element: Element | null) => {
    if (!view || !element || !(element instanceof view.HTMLInputElement)) return false
    let browserAutofilled = false
    try {
      browserAutofilled = element.matches(':-webkit-autofill')
    } catch {
      browserAutofilled = false
    }
    return Boolean(browserAutofilled || element.value !== '')
  }

  const usernameInput = document.querySelector(descriptor.usernameSelector)
  const passwordInput = document.querySelector(descriptor.passwordSelector)
  const submitControl = document.querySelector(descriptor.submitSelector)
  const usernameVisible = isVisible(usernameInput)
  const passwordVisible = isVisible(passwordInput)
  const submitVisible = isVisible(submitControl)
  const submitEnabled = Boolean(
    submitVisible &&
    submitControl &&
    !submitControl.hasAttribute('disabled') &&
    submitControl.getAttribute('aria-disabled') !== 'true'
  )
  const bodyText = normalizeText(document.body?.textContent)
  const controlLabels = Array.from(document.querySelectorAll('button, a, [role="button"]'))
    .filter(isVisible)
    .map((element) => normalizeText(element.textContent || element.getAttribute('aria-label')))
    .filter(Boolean)
  const visiblePasswordInputCount = Array.from(
    document.querySelectorAll('input[type="password"]')
  ).filter(isVisible).length

  let pathname = ''
  try {
    pathname = new URL(href).pathname
  } catch {
    pathname = href
  }

  const loginErrorDetected =
    /\/merchant\/login\/error(?:[/?#]|$)/i.test(pathname) ||
    (/(?:로그인|인증).{0,60}(?:실패|오류)/u.test(bodyText) &&
      /(?:아이디|비밀번호|계정|credential|password)/i.test(bodyText))
  const captchaDetected =
    Boolean(document.querySelector('iframe[src*="captcha" i], [data-sitekey], [class*="captcha" i]')) ||
    /(?:보안문자|자동입력방지|captcha)/i.test(bodyText)
  const otpDetected =
    Boolean(document.querySelector('input[autocomplete="one-time-code"]')) &&
    /(?:인증번호|일회용|otp|one[- ]time)/i.test(bodyText)
  const accountSelectionDetected =
    /(?:계정 선택|로그인할 계정|choose an account)/i.test(bodyText) ||
    controlLabels.some((label) => /(?:계정 선택|로그인할 계정|choose an account)/i.test(label))
  const blocker: ManagedChromeLoginBlocker | null = loginErrorDetected
    ? 'login_error'
    : captchaDetected
      ? 'captcha'
      : otpDetected
        ? 'otp'
        : accountSelectionDetected
          ? 'account_selection'
          : null
  const logoutMarkerDetected = controlLabels.some((label) =>
    /(?:로그아웃|log out|sign out)/i.test(label)
  )
  const managementMarkerDetected =
    visiblePasswordInputCount === 0 &&
    /(?:메뉴|옵션|가게|매장|주문|영업|상품)\s*(?:관리|설정)|(?:관리|설정)\s*(?:메뉴|옵션|가게|매장|주문|영업|상품)/i.test(
      bodyText
    )

  return {
    loginFormVisible: usernameVisible && passwordVisible && submitVisible,
    usernameFilled: usernameVisible && isFilled(usernameInput),
    passwordFilled: passwordVisible && isFilled(passwordInput),
    submitVisible,
    submitEnabled,
    blocker,
    managementMarkerDetected,
    logoutMarkerDetected,
    visiblePasswordInputCount
  }
}

const buildManagedChromeLoginPageEvidenceExpression = (
  descriptor: ManagedPasswordManagerLoginDescriptor
) => `JSON.stringify((${collectManagedChromeLoginPageEvidence.toString()})(document, window.location.href, ${JSON.stringify(descriptor)}))`

export class ManagedChromeLoginPageProbe {
  constructor(
    private readonly scriptRunner: {
      evaluateJson: <T>(tabId: string, expression: string) => Promise<T>
    }
  ) {}

  inspect(tabId: string, descriptor: ManagedPasswordManagerLoginDescriptor) {
    return this.scriptRunner.evaluateJson<ManagedChromeLoginPageEvidence>(
      tabId,
      buildManagedChromeLoginPageEvidenceExpression(descriptor)
    )
  }
}
