import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserInspectionSnapshot } from '../../shared/contracts'

interface ManagedChromeSnapshotCapturerOptions {
  endpointUrl?: string
  fetch?: typeof fetch
  WebSocketImpl?: new (url: string) => ManagedChromeSocket
  loadSnapshotScript?: () => Promise<string>
  now?: () => Date
  commandTimeoutMs?: number
}

interface ManagedChromeSocket {
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent<string>) => void) | null
  onerror: ((event: Event) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  send: (data: string) => void
  close: () => void
}

interface DevtoolsListEntry {
  id?: string
  title?: string
  type?: string
  url?: string
  webSocketDebuggerUrl?: string
}

interface DevtoolsCommandSuccess {
  id: number
  result?: Record<string, unknown>
}

interface DevtoolsCommandFailure {
  id: number
  error?: { message?: string }
}

const defaultSnapshotScriptLoader = () =>
  readFile(join(process.cwd(), 'browser-extension', 'delivery-menu-inspector', 'dom-snapshot.mjs'), 'utf8')

const sanitizeSnapshotModuleSource = (value: string) => value.replace(/^export\s+/gmu, '')

const buildCaptureExpression = (snapshotModuleSource: string) => `
(async () => {
${sanitizeSnapshotModuleSource(snapshotModuleSource)}

const API_HOOK_FLAG = '__deliveryMenuInspectorHookInstalled'
const API_EVENTS_KEY = '__deliveryMenuInspectorApiEvents'

const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

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

const normalizeApiEvents = (events) => {
  const deduped = new Map()

  for (const event of events) {
    if (!event || typeof event !== 'object') {
      continue
    }

    const key = [
      typeof event.url === 'string' ? event.url : '',
      typeof event.method === 'string' ? event.method : 'GET',
      event.status == null ? '' : String(event.status)
    ].join('|')

    if (!key) {
      continue
    }

    const existing = deduped.get(key)
    if (!existing) {
      deduped.set(key, event)
      continue
    }

    const currentPreview =
      typeof event.responsePreview === 'string' ? event.responsePreview.length : 0
    const existingPreview =
      typeof existing.responsePreview === 'string' ? existing.responsePreview.length : 0

    if (currentPreview >= existingPreview) {
      deduped.set(key, event)
    }
  }

  return [...deduped.values()]
}

const collectKnownPlatformApiEvents = async () => {
  const href = window.location.href
  const host = window.location.host

  if (!host.includes('coupangeats.com')) {
    return []
  }

  const storeIdMatch = window.location.pathname.match(/\\/merchant\\/management\\/menu\\/(\\d+)/)
  if (!storeIdMatch?.[1]) {
    return []
  }

  const storeId = storeIdMatch[1]
  const endpoints = [
    \`/api/v1/merchant/web/stores/\${storeId}/all-menu-dishes\`,
    \`/api/v1/merchant/web/stores/\${storeId}/all-options?fetchDish=true\`
  ]
  const events = []

  for (const endpoint of endpoints) {
    const url = new URL(endpoint, href).toString()

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include'
      })
      const responsePreview = (await response.text()).slice(0, 500000)
      events.push({
        url,
        method: 'GET',
        status: response.status,
        capturedAt: new Date().toISOString(),
        responsePreview
      })
    } catch (error) {
      events.push({
        url,
        method: 'GET',
        status: null,
        capturedAt: new Date().toISOString(),
        requestPreview: error instanceof Error ? error.message : String(error),
        responsePreview: null
      })
    }
  }

  return events
}

const injectApiHook = () => {
  if (document.documentElement.dataset.deliveryMenuInspectorHook === 'installed') {
    return
  }

  const script = document.createElement('script')
  script.textContent = \`
    (() => {
      const FLAG = '__deliveryMenuInspectorHookInstalled'
      const KEY = '__deliveryMenuInspectorApiEvents'
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
  \`
  document.documentElement.appendChild(script)
  script.remove()
  document.documentElement.dataset.deliveryMenuInspectorHook = 'installed'
}

const getScrollContainer = () => {
  const root = getContentRoot(document)
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

injectApiHook()
const knownApiEvents = await collectKnownPlatformApiEvents()

const container = getScrollContainer()
const initialScrollTop = getScrollTop(container)
const maxScrollTop = getMaxScrollTop(container)
const steps = Math.min(
  Math.max(Math.ceil(maxScrollTop / Math.max(window.innerHeight * 0.8, 1)) + 1, 1),
  8
)
const snapshots = []

for (let index = 0; index < steps; index += 1) {
  const nextScrollTop =
    steps === 1 ? initialScrollTop : Math.round((maxScrollTop / Math.max(steps - 1, 1)) * index)
  setScrollTop(container, nextScrollTop)
  await delay(220)
  const apiEvents = await requestApiEvents()
  snapshots.push(
    collectDomSnapshot({
      document,
      href: window.location.href,
      pageTitle: document.title,
      capturedAt: new Date().toISOString(),
      apiEvents,
      screenshotDataUrl: null,
      captureMode: steps > 1 ? 'full_scroll' : 'viewport'
    })
  )
}

setScrollTop(container, initialScrollTop)
await delay(80)

const mergedSnapshot = mergeDomSnapshots(snapshots) ?? snapshots[snapshots.length - 1] ?? null
if (!mergedSnapshot) {
  return JSON.stringify(null)
}

return JSON.stringify({
  ...mergedSnapshot,
  apiEvents: normalizeApiEvents([...(mergedSnapshot.apiEvents || []), ...knownApiEvents])
})
})()
`

class DevtoolsClient {
  private readonly socket: ManagedChromeSocket
  private readonly timeoutMs: number
  private nextCommandId = 1
  private readonly pending = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void
      reject: (error: Error) => void
    }
  >()

  private constructor(socket: ManagedChromeSocket, timeoutMs: number) {
    this.socket = socket
    this.timeoutMs = timeoutMs
    this.socket.onmessage = (event) => {
      this.handleMessage(event)
    }
    this.socket.onerror = () => {
      this.rejectAll(new Error('managed_chrome_socket_error'))
    }
    this.socket.onclose = () => {
      this.rejectAll(new Error('managed_chrome_socket_closed'))
    }
  }

  static async connect(
    WebSocketImpl: new (url: string) => ManagedChromeSocket,
    url: string,
    timeoutMs: number
  ) {
    const socket = await new Promise<ManagedChromeSocket>((resolve, reject) => {
      const nextSocket = new WebSocketImpl(url)
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`managed_chrome_socket_open_timeout:${url}`))
      }, timeoutMs)
      nextSocket.onopen = () => {
        clearTimeout(timeoutHandle)
        resolve(nextSocket)
      }
      nextSocket.onerror = () => {
        clearTimeout(timeoutHandle)
        reject(new Error(`managed_chrome_socket_open_failed:${url}`))
      }
      nextSocket.onclose = () => {
        clearTimeout(timeoutHandle)
        reject(new Error(`managed_chrome_socket_open_closed:${url}`))
      }
    })

    return new DevtoolsClient(socket, timeoutMs)
  }

  async send(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextCommandId
    this.nextCommandId += 1

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null
    const resultPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`managed_chrome_command_timeout:${method}`))
      }, this.timeoutMs)
    })

    this.socket.send(JSON.stringify({ id, method, params }))
    return Promise.race([resultPromise, timeoutPromise]).finally(() => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }
    })
  }

  close() {
    this.socket.close()
  }

  private handleMessage(event: MessageEvent<string>) {
    const payload = JSON.parse(String(event.data)) as DevtoolsCommandSuccess | DevtoolsCommandFailure
    if (typeof payload.id !== 'number') {
      return
    }

    const resolver = this.pending.get(payload.id)
    if (!resolver) {
      return
    }

    this.pending.delete(payload.id)

    if ('error' in payload && payload.error?.message) {
      resolver.reject(new Error(payload.error.message))
      return
    }

    if ('result' in payload && payload.result && typeof payload.result === 'object') {
      resolver.resolve(payload.result)
      return
    }

    resolver.resolve({})
  }

  private rejectAll(error: Error) {
    if (this.pending.size === 0) {
      return
    }

    for (const resolver of this.pending.values()) {
      resolver.reject(error)
    }

    this.pending.clear()
  }
}

export class ManagedChromeSnapshotCapturer {
  private readonly endpointUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly WebSocketImpl: new (url: string) => ManagedChromeSocket
  private readonly loadSnapshotScript: () => Promise<string>
  private readonly now: () => Date
  private readonly commandTimeoutMs: number

  constructor(options: ManagedChromeSnapshotCapturerOptions = {}) {
    this.endpointUrl = options.endpointUrl ?? 'http://127.0.0.1:39482'
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.WebSocketImpl =
      options.WebSocketImpl ?? (globalThis.WebSocket as unknown as new (url: string) => ManagedChromeSocket)
    this.loadSnapshotScript = options.loadSnapshotScript ?? defaultSnapshotScriptLoader
    this.now = options.now ?? (() => new Date())
    this.commandTimeoutMs = options.commandTimeoutMs ?? 15000
  }

  async captureTab(tabId: string): Promise<BrowserInspectionSnapshot> {
    const normalizedTabId = tabId.trim()
    if (!normalizedTabId) {
      throw new Error('managed_chrome_tab_id_required')
    }

    const target = await this.findTarget(normalizedTabId)
    if (!target.webSocketDebuggerUrl) {
      throw new Error(`managed_chrome_debugger_url_missing:${normalizedTabId}`)
    }

    const snapshotModuleSource = await this.loadSnapshotScript()
    const client = await DevtoolsClient.connect(
      this.WebSocketImpl,
      target.webSocketDebuggerUrl,
      this.commandTimeoutMs
    )

    try {
      const evaluateResult = await client.send('Runtime.evaluate', {
        expression: buildCaptureExpression(snapshotModuleSource),
        awaitPromise: true,
        returnByValue: true
      })

      const jsonPayload = this.readStringResult(evaluateResult)
      const parsedSnapshot = JSON.parse(jsonPayload) as Omit<
        BrowserInspectionSnapshot,
        'snapshotId' | 'source' | 'screenshotDataUrl'
      > | null

      if (!parsedSnapshot) {
        throw new Error(`managed_chrome_capture_empty:${normalizedTabId}`)
      }

      let screenshotDataUrl: string | null = null
      try {
        const screenshotResult = await client.send('Page.captureScreenshot', {
          format: 'png'
        })
        const screenshotBase64 =
          typeof screenshotResult.data === 'string' && screenshotResult.data.length > 0
            ? screenshotResult.data
            : null
        screenshotDataUrl = screenshotBase64 ? `data:image/png;base64,${screenshotBase64}` : null
      } catch {
        screenshotDataUrl = null
      }

      return {
        ...parsedSnapshot,
        snapshotId: `managed-${normalizedTabId}-${this.now().toISOString()}`,
        source: 'manual_browser',
        screenshotDataUrl
      }
    } finally {
      client.close()
    }
  }

  private async findTarget(tabId: string) {
    const response = await this.fetchImpl(`${this.endpointUrl}/json/list`)
    if (!response.ok) {
      throw new Error(`managed_chrome_devtools_http_${response.status}`)
    }

    const payload = (await response.json()) as DevtoolsListEntry[]
    const target = payload.find((entry) => entry.id === tabId && entry.type === 'page')
    if (!target) {
      throw new Error(`managed_chrome_tab_not_found:${tabId}`)
    }

    return target
  }

  private readStringResult(result: Record<string, unknown>) {
    const nestedResult =
      result.result && typeof result.result === 'object' ? (result.result as Record<string, unknown>) : null
    const value = nestedResult?.value

    if (typeof value !== 'string') {
      throw new Error('managed_chrome_capture_invalid_payload')
    }

    return value
  }
}
