interface ManagedChromeScriptRunnerOptions {
  endpointUrl?: string
  fetch?: typeof fetch
  WebSocketImpl?: new (url: string) => ManagedChromeSocket
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
  type?: string
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

class DevtoolsClient {
  private readonly timeoutMs: number
  private nextCommandId = 1
  private readonly pending = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void
      reject: (error: Error) => void
    }
  >()

  private constructor(private readonly socket: ManagedChromeSocket, timeoutMs: number) {
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

export class ManagedChromeScriptRunner {
  private readonly endpointUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly WebSocketImpl: new (url: string) => ManagedChromeSocket
  private readonly commandTimeoutMs: number

  constructor(options: ManagedChromeScriptRunnerOptions = {}) {
    this.endpointUrl = options.endpointUrl ?? 'http://127.0.0.1:39482'
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.WebSocketImpl =
      options.WebSocketImpl ??
      (globalThis.WebSocket as unknown as new (url: string) => ManagedChromeSocket)
    this.commandTimeoutMs = options.commandTimeoutMs ?? 15000
  }

  async evaluateJson<T>(tabId: string, expression: string): Promise<T> {
    const normalizedTabId = tabId.trim()
    if (!normalizedTabId) {
      throw new Error('managed_chrome_tab_id_required')
    }

    const target = await this.findTarget(normalizedTabId)
    if (!target.webSocketDebuggerUrl) {
      throw new Error(`managed_chrome_debugger_url_missing:${normalizedTabId}`)
    }

    const client = await DevtoolsClient.connect(
      this.WebSocketImpl,
      target.webSocketDebuggerUrl,
      this.commandTimeoutMs
    )

    try {
      const result = await client.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      })

      const jsonPayload = this.readStringResult(result)
      return JSON.parse(jsonPayload) as T
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
      result.result && typeof result.result === 'object'
        ? (result.result as Record<string, unknown>)
        : null
    const value = nestedResult?.value

    if (typeof value !== 'string') {
      throw new Error('managed_chrome_script_invalid_payload')
    }

    return value
  }
}
