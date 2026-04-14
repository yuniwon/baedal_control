import { describe, expect, it, vi } from 'vitest'

import { ManagedChromeScriptRunner } from '../../../src/main/services/managed-chrome-script-runner'

class MockWebSocket {
  static instances: MockWebSocket[] = []

  readonly messages: string[] = []
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.onopen?.(new Event('open'))
    })
  }

  send(message: string) {
    this.messages.push(message)

    const payload = JSON.parse(message) as { id: number; method: string }
    if (payload.method !== 'Runtime.evaluate') {
      return
    }

    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({
          id: payload.id,
          result: {
            result: {
              type: 'string',
              value: JSON.stringify({ status: 'saved' })
            }
          }
        })
      })
    )
  }

  close() {
    this.onclose?.(new CloseEvent('close'))
  }
}

class HangingWebSocket {
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  constructor(_url: string) {
    queueMicrotask(() => {
      this.onopen?.(new Event('open'))
    })
  }

  send(_message: string) {}

  close() {
    this.onclose?.(new CloseEvent('close'))
  }
}

describe('ManagedChromeScriptRunner', () => {
  it('evaluates a script in the requested tab and parses the returned JSON payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          id: 'tab-1',
          type: 'page',
          webSocketDebuggerUrl: 'ws://127.0.0.1:39482/devtools/page/tab-1'
        }
      ])
    })

    const runner = new ManagedChromeScriptRunner({
      fetch: fetchMock as typeof fetch,
      WebSocketImpl: MockWebSocket as unknown as typeof WebSocket
    })

    await expect(runner.evaluateJson('tab-1', 'JSON.stringify({ status: "saved" })')).resolves.toEqual({
      status: 'saved'
    })
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:39482/json/list')
    expect(MockWebSocket.instances[0]?.url).toBe('ws://127.0.0.1:39482/devtools/page/tab-1')
  })

  it('fails fast when the devtools runtime evaluation never responds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          id: 'tab-1',
          type: 'page',
          webSocketDebuggerUrl: 'ws://127.0.0.1:39482/devtools/page/tab-1'
        }
      ])
    })

    const runner = new ManagedChromeScriptRunner({
      fetch: fetchMock as typeof fetch,
      WebSocketImpl: HangingWebSocket as unknown as typeof WebSocket,
      commandTimeoutMs: 10
    })

    await expect(runner.evaluateJson('tab-1', 'JSON.stringify({ status: "saved" })')).rejects.toThrow(
      'managed_chrome_command_timeout:Runtime.evaluate'
    )
  })
})
