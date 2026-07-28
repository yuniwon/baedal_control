import type { ManagedChromeSessionStatus, PlatformCode } from '../../shared/contracts'
import { baeminSelectors } from '../platforms/baemin/selectors'
import { ddangyoSelectors } from '../platforms/ddangyo/selectors'

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
    clickSelector?: (tabId: string, selector: string) => Promise<void>
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
  submitSelector: string
}

const sleepWithTimeout = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

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

  return JSON.stringify({
    status: 'submitted',
    message: '저장된 배민 계정으로 로그인을 시도했습니다.'
  })
})()
`.trim()
}

const buildDeepFormLoginExpression = ({
  credential,
  platformLabel,
  usernameSelector,
  passwordSelector,
  submitSelector
}: {
  credential: PlatformCredential
  platformLabel: string
  usernameSelector: string
  passwordSelector: string
  submitSelector: string
}) => {
  const payload = JSON.stringify({
    username: credential.username,
    password: credential.password,
    platformLabel,
    selectors: {
      username: usernameSelector,
      password: passwordSelector,
      loginButton: submitSelector
    }
  })

  return `
(() => {
  const payload = ${payload}
  const deepQuery = (selector, root = document) => {
    const direct = root.querySelector?.(selector)
    if (direct) return direct
    for (const element of root.querySelectorAll?.('*') ?? []) {
      if (element.shadowRoot) {
        const nested = deepQuery(selector, element.shadowRoot)
        if (nested) return nested
      }
    }
    return null
  }
  const setInputValue = (element, value) => {
    if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
      return
    }
    const component = element.id
      ? element.ownerDocument?.defaultView?.[element.id]
      : null
    component?.setValue?.(value)
    const descriptor =
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value') ??
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ??
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
    descriptor?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }
  const usernameInput = deepQuery(payload.selectors.username)
  const passwordInput = deepQuery(payload.selectors.password)
  const submitButton = deepQuery(payload.selectors.loginButton)
  if (!usernameInput || !passwordInput || !submitButton) {
    return JSON.stringify({
      status: 'login_form_not_found',
      message: payload.platformLabel + ' 로그인 폼을 찾지 못했습니다.'
    })
  }
  setInputValue(usernameInput, payload.username)
  setInputValue(passwordInput, payload.password)
  return JSON.stringify({
    status: 'submitted',
    message: '저장된 ' + payload.platformLabel + ' 계정으로 로그인을 시도했습니다.'
  })
})()
`.trim()
}

const hasAuthenticatedTab = (
  session: ManagedChromeSessionStatus,
  platformCode: PlatformCode
) =>
  session.tabs.some(
    (tab) =>
      tab.platformCode === platformCode &&
      (tab.pageKind === 'menu_list' || tab.pageKind === 'option_list')
  )

const hasDeliverySpecialAuthenticatedTab = (session: ManagedChromeSessionStatus) =>
  session.tabs.some(
    (tab) =>
      tab.platformCode === 'deliveryspecial' &&
      /partner\.payco\.kr\/(?:shop|product|info|order|custom)(?:[/?#]|$)/i.test(tab.url)
  )

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
    buildLoginExpression: buildBaeminLoginExpression,
    submitSelector: baeminSelectors.loginButton
  },
  yogiyo: {
    loginUrl: 'https://ceo.yogiyo.co.kr/login/',
    alreadyAuthenticatedMessage: '이미 요기요 로그인 세션이 열려 있습니다.',
    credentialMissingMessage: '저장된 요기요 계정이 없어 자동 로그인을 건너뛰었습니다.',
    loginTabNotFoundMessage: '요기요 로그인 화면을 찾지 못했습니다.',
    submittedMessage: '저장된 요기요 계정으로 로그인을 시도했습니다.',
    isAuthenticatedSession: (session) => hasAuthenticatedTab(session, 'yogiyo'),
    resolveLoginTabId: (session) =>
      session.tabs.find(
        (tab) =>
          /(?:ceo|owner)\.yogiyo\.co\.kr/i.test(tab.host) &&
          (tab.pageKind === 'unknown' || /login/i.test(tab.url))
      )?.tabId ?? null,
    buildLoginExpression: (credential) =>
      buildDeepFormLoginExpression({
        credential,
        platformLabel: '요기요',
        usernameSelector: 'input[name="username"]',
        passwordSelector: 'input[type="password"]',
        submitSelector: 'button[type="submit"]'
      }),
    submitSelector: 'button[type="submit"]'
  },
  ddangyo: {
    loginUrl: 'https://boss.ddangyo.com/',
    alreadyAuthenticatedMessage: '이미 땡겨요 로그인 세션이 열려 있습니다.',
    credentialMissingMessage: '저장된 땡겨요 계정이 없어 자동 로그인을 건너뛰었습니다.',
    loginTabNotFoundMessage: '땡겨요 로그인 화면을 찾지 못했습니다.',
    submittedMessage: '저장된 땡겨요 계정으로 로그인을 시도했습니다.',
    isAuthenticatedSession: (session) => hasAuthenticatedTab(session, 'ddangyo'),
    resolveLoginTabId: (session) =>
      session.tabs.find(
        (tab) => tab.platformCode === 'ddangyo' && tab.pageKind === 'unknown'
      )?.tabId ?? null,
    buildLoginExpression: (credential) =>
      buildDeepFormLoginExpression({
        credential,
        platformLabel: '땡겨요',
        usernameSelector: ddangyoSelectors.username,
        passwordSelector: ddangyoSelectors.password,
        submitSelector: ddangyoSelectors.loginButton
      }),
    submitSelector: ddangyoSelectors.loginButton
  },
  deliveryspecial: {
    loginUrl: 'https://partner.payco.kr/user/login',
    alreadyAuthenticatedMessage: '이미 배달특급 로그인 세션이 열려 있습니다.',
    credentialMissingMessage: '저장된 배달특급 계정이 없어 자동 로그인을 건너뛰었습니다.',
    loginTabNotFoundMessage: '배달특급 로그인 화면을 찾지 못했습니다.',
    submittedMessage: '저장된 배달특급 계정으로 로그인을 시도했습니다.',
    isAuthenticatedSession: hasDeliverySpecialAuthenticatedTab,
    resolveLoginTabId: (session) =>
      session.tabs.find(
        (tab) =>
          tab.platformCode === 'deliveryspecial' && /\/user\/login\/?(?:[?#]|$)/i.test(tab.url)
      )?.tabId ?? null,
    buildLoginExpression: (credential) =>
      buildDeepFormLoginExpression({
        credential,
        platformLabel: '배달특급',
        usernameSelector: '#id',
        passwordSelector: '#password',
        submitSelector: 'button#loginButton[type="submit"]'
      }),
    submitSelector: 'button#loginButton[type="submit"]'
  },
  naverorder: {
    loginUrl:
      'https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fnew.smartplace.naver.com%2F',
    alreadyAuthenticatedMessage: '이미 네이버주문 로그인 세션이 열려 있습니다.',
    credentialMissingMessage: '저장된 네이버 계정이 없어 기존 세션만 확인했습니다.',
    loginTabNotFoundMessage: '네이버 로그인 화면을 찾지 못했습니다.',
    submittedMessage: '저장된 네이버 계정으로 로그인을 시도했습니다.',
    isAuthenticatedSession: (session) => hasAuthenticatedTab(session, 'naverorder'),
    resolveLoginTabId: (session) =>
      session.tabs.find((tab) => /nid\.naver\.com\/nidlogin\.login/i.test(tab.url))?.tabId ?? null,
    buildLoginExpression: (credential) =>
      buildDeepFormLoginExpression({
        credential,
        platformLabel: '네이버',
        usernameSelector: '#id',
        passwordSelector: '#pw',
        submitSelector: '#log\\.login, #loginBtn_row'
      }),
    submitSelector: '#log\\.login, #loginBtn_row'
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

          if (!credential?.username?.trim() || !credential.password?.trim()) {
            return {
              platformCode,
              status: 'credential_missing',
              message: descriptor.credentialMissingMessage
            }
          }

          const loginTabId = descriptor.resolveLoginTabId(session)
          if (loginTabId) {
            const result = await this.options.managedChromeScriptRunner.evaluateJson<{
              status?: string
              message?: string
            }>(loginTabId, descriptor.buildLoginExpression(credential))

            if (result?.status === 'submitted') {
              await this.options.managedChromeScriptRunner.clickSelector?.(
                loginTabId,
                descriptor.submitSelector
              )
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

        if (!credential?.username?.trim() || !credential.password?.trim()) {
          return {
            platformCode,
            status: 'credential_missing',
            message: descriptor.credentialMissingMessage
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
