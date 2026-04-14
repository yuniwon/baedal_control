import type { ManagedChromeSessionStatus, PlatformCode } from '../../shared/contracts'
import { baeminSelectors } from '../platforms/baemin/selectors'
import { coupangEatsSelectors } from '../platforms/coupangeats/selectors'

type PlatformCredential = {
  username: string
  password: string
}

type ManagedChromeAutoLoginStatus =
  | 'submitted'
  | 'already_authenticated'
  | 'credential_missing'
  | 'login_tab_not_found'
  | 'unsupported'
  | 'failed'

export interface ManagedChromeAutoLoginResult {
  platformCode: PlatformCode
  status: ManagedChromeAutoLoginStatus
  message: string
}

interface ManagedChromeLoginAutomatorOptions {
  managedChromeSessionProbe: {
    inspect: () => Promise<ManagedChromeSessionStatus> | ManagedChromeSessionStatus
  }
  managedChromeScriptRunner: {
    evaluateJson: <T>(tabId: string, expression: string) => Promise<T>
  }
  maxAttempts?: number
  retryDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

interface ManagedChromeLoginDescriptor {
  loginUrl: string
  alreadyAuthenticatedMessage: string
  credentialMissingMessage: string
  loginTabNotFoundMessage: string
  submittedMessage: string
  isAuthenticatedSession: (session: ManagedChromeSessionStatus) => boolean
  resolveLoginTabId: (session: ManagedChromeSessionStatus) => string | null
  buildLoginExpression: (credential: PlatformCredential) => string
}

const sleepWithTimeout = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

const buildCoupangEatsLoginExpression = (credential: PlatformCredential) => {
  const payload = JSON.stringify({
    username: credential.username,
    password: credential.password,
    selectors: {
      username: coupangEatsSelectors.username,
      password: coupangEatsSelectors.password,
      loginButton: coupangEatsSelectors.loginButton
    }
  })

  return `
(() => {
  const payload = ${payload}
  const setInputValue = (element, value) => {
    if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
      return
    }

    const prototype = Object.getPrototypeOf(element)
    const descriptor =
      Object.getOwnPropertyDescriptor(prototype, 'value') ??
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ??
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')

    descriptor?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const usernameInput = document.querySelector(payload.selectors.username)
  const passwordInput = document.querySelector(payload.selectors.password)
  const submitButton = document.querySelector(payload.selectors.loginButton)

  if (!usernameInput || !passwordInput || !submitButton) {
    return JSON.stringify({
      status: 'login_form_not_found',
      message: '쿠팡이츠 로그인 폼을 찾지 못했습니다.'
    })
  }

  setInputValue(usernameInput, payload.username)
  setInputValue(passwordInput, payload.password)

  if (submitButton instanceof HTMLElement) {
    submitButton.click()
  }

  return JSON.stringify({
    status: 'submitted',
    message: '저장된 쿠팡이츠 계정으로 로그인을 시도했습니다.'
  })
})()
`.trim()
}

const buildBaeminLoginExpression = (credential: PlatformCredential) => {
  const payload = JSON.stringify({
    username: credential.username,
    password: credential.password,
    selectors: {
      username: baeminSelectors.username,
      password: baeminSelectors.password,
      loginButton: baeminSelectors.loginButton
    }
  })

  return `
(() => {
  const payload = ${payload}
  const setInputValue = (element, value) => {
    if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
      return
    }

    const prototype = Object.getPrototypeOf(element)
    const descriptor =
      Object.getOwnPropertyDescriptor(prototype, 'value') ??
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ??
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')

    descriptor?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const usernameInput = document.querySelector(payload.selectors.username)
  const passwordInput = document.querySelector(payload.selectors.password)
  const submitButton = document.querySelector(payload.selectors.loginButton)

  if (!usernameInput || !passwordInput || !submitButton) {
    return JSON.stringify({
      status: 'login_form_not_found',
      message: '배민 로그인 폼을 찾지 못했습니다.'
    })
  }

  setInputValue(usernameInput, payload.username)
  setInputValue(passwordInput, payload.password)

  if (submitButton instanceof HTMLElement) {
    submitButton.click()
  }

  return JSON.stringify({
    status: 'submitted',
    message: '저장된 배민 계정으로 로그인을 시도했습니다.'
  })
})()
`.trim()
}

const loginDescriptors: Partial<Record<PlatformCode, ManagedChromeLoginDescriptor>> = {
  baemin: {
    loginUrl: 'https://biz-member.baemin.com/login?returnUrl=https%3A%2F%2Fself.baemin.com%2Fmenu',
    alreadyAuthenticatedMessage: '이미 배민 로그인 세션이 열려 있습니다.',
    credentialMissingMessage: '저장된 배민 계정이 없어 자동 로그인을 건너뛰었습니다.',
    loginTabNotFoundMessage:
      '배민 로그인 화면을 찾지 못했습니다. 전용 크롬이 완전히 열린 뒤 다시 시도해 주세요.',
    submittedMessage: '저장된 배민 계정으로 로그인을 시도했습니다.',
    isAuthenticatedSession: (session) =>
      session.tabs.some(
        (tab) =>
          tab.platformCode === 'baemin' &&
          (tab.pageKind === 'menu_list' || tab.pageKind === 'option_list')
      ),
    resolveLoginTabId: (session) =>
      session.tabs.find(
        (tab) =>
          tab.platformCode === 'baemin' &&
          /biz-member\.baemin\.com\/login(?:[/?#]|$)/i.test(tab.url)
      )?.tabId ?? null,
    buildLoginExpression: buildBaeminLoginExpression
  },
  coupangeats: {
    loginUrl: 'https://store.coupangeats.com/merchant/login',
    alreadyAuthenticatedMessage: '이미 쿠팡이츠 로그인 세션이 열려 있습니다.',
    credentialMissingMessage: '저장된 쿠팡이츠 계정이 없어 자동 로그인을 건너뛰었습니다.',
    loginTabNotFoundMessage:
      '쿠팡이츠 로그인 화면을 찾지 못했습니다. 전용 크롬이 완전히 열린 뒤 다시 시도해 주세요.',
    submittedMessage: '저장된 쿠팡이츠 계정으로 로그인을 시도했습니다.',
    isAuthenticatedSession: (session) =>
      session.tabs.some(
        (tab) =>
          tab.platformCode === 'coupangeats' &&
          (tab.pageKind === 'menu_list' || tab.pageKind === 'option_list')
      ),
    resolveLoginTabId: (session) =>
      session.tabs.find(
        (tab) =>
          tab.platformCode === 'coupangeats' &&
          /\/merchant\/login(?:[/?#]|$)/i.test(tab.url)
      )?.tabId ?? null,
    buildLoginExpression: buildCoupangEatsLoginExpression
  }
}

export class ManagedChromeLoginAutomator {
  private readonly maxAttempts: number
  private readonly retryDelayMs: number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(private readonly options: ManagedChromeLoginAutomatorOptions) {
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 10)
    this.retryDelayMs = Math.max(0, options.retryDelayMs ?? 500)
    this.sleep = options.sleep ?? sleepWithTimeout
  }

  getLaunchUrl(platformCode: PlatformCode) {
    return loginDescriptors[platformCode]?.loginUrl ?? null
  }

  async autoLogin(
    platformCode: PlatformCode,
    credential?: PlatformCredential | null
  ): Promise<ManagedChromeAutoLoginResult> {
    const descriptor = loginDescriptors[platformCode]

    if (!descriptor) {
      return {
        platformCode,
        status: 'unsupported',
        message: '아직 이 플랫폼의 자동 로그인을 지원하지 않습니다.'
      }
    }

    if (!credential?.username?.trim() || !credential.password?.trim()) {
      return {
        platformCode,
        status: 'credential_missing',
        message: descriptor.credentialMissingMessage
      }
    }

    try {
      for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
        const session = await this.options.managedChromeSessionProbe.inspect()

        if (session.connected) {
          if (descriptor.isAuthenticatedSession(session)) {
            return {
              platformCode,
              status: 'already_authenticated',
              message: descriptor.alreadyAuthenticatedMessage
            }
          }

          const loginTabId = descriptor.resolveLoginTabId(session)
          if (loginTabId) {
            const result = await this.options.managedChromeScriptRunner.evaluateJson<{
              status?: string
              message?: string
            }>(loginTabId, descriptor.buildLoginExpression(credential))

            if (result?.status === 'submitted') {
              return {
                platformCode,
                status: 'submitted',
                message: result.message?.trim() || descriptor.submittedMessage
              }
            }

            if (result?.status === 'already_authenticated') {
              return {
                platformCode,
                status: 'already_authenticated',
                message: result.message?.trim() || descriptor.alreadyAuthenticatedMessage
              }
            }
          }
        }

        if (attempt < this.maxAttempts - 1 && this.retryDelayMs > 0) {
          await this.sleep(this.retryDelayMs)
        }
      }

      return {
        platformCode,
        status: 'login_tab_not_found',
        message: descriptor.loginTabNotFoundMessage
      }
    } catch (error) {
      return {
        platformCode,
        status: 'failed',
        message: `자동 로그인 중 오류가 발생했습니다. ${error instanceof Error ? error.message : 'unknown_error'}`
      }
    }
  }
}
