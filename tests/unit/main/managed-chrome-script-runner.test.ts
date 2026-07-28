import { describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'

import {
  buildClickTargetExpression,
  ManagedChromeScriptRunner
} from '../../../src/main/services/managed-chrome-script-runner'

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

    const payload = JSON.parse(message) as {
      id: number
      method: string
      params?: { expression?: string; type?: string }
    }
    if (payload.method === 'Input.dispatchMouseEvent') {
      this.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ id: payload.id, result: {} })
        })
      )
      return
    }
    if (payload.method === 'Page.getFrameTree') {
      this.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            id: payload.id,
            result: {
              frameTree: {
                frame: { id: 'frame-1', loaderId: 'loader-7' }
              }
            }
          })
        })
      )
      return
    }
    if (payload.method !== 'Runtime.evaluate') {
      return
    }

    const value = payload.params?.expression?.includes('getBoundingClientRect')
      ? JSON.stringify({ found: true, x: 320, y: 240 })
      : JSON.stringify({ status: 'saved' })

    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({
          id: payload.id,
          result: {
            result: {
              type: 'string',
              value
            }
          }
        })
      })
    )
  }

  close() {
    this.onclose?.(new Event('close') as CloseEvent)
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
    this.onclose?.(new Event('close') as CloseEvent)
  }
}

describe('ManagedChromeScriptRunner', () => {
  it('selects the visible unobstructed submit control when a hidden duplicate comes first', () => {
    const dom = new JSDOM(
      '<button id="loginButton" style="display:none">숨은 로그인</button>' +
        '<button id="loginButton" type="submit">로그인</button>',
      { runScripts: 'dangerously' }
    )
    const [hiddenButton, visibleButton] = Array.from(
      dom.window.document.querySelectorAll<HTMLButtonElement>('#loginButton')
    )
    hiddenButton.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 }) as DOMRect
    visibleButton.getBoundingClientRect = () =>
      ({
        left: 120,
        top: 80,
        width: 100,
        height: 40,
        right: 220,
        bottom: 120,
        x: 120,
        y: 80
      }) as DOMRect
    Object.defineProperty(dom.window.document, 'elementFromPoint', {
      value: () => visibleButton
    })
    Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollIntoView', {
      value: vi.fn()
    })

    const result = JSON.parse(
      dom.window.eval(buildClickTargetExpression('#loginButton')) as string
    )

    expect(result).toEqual({ found: true, x: 170, y: 100 })
  })

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

  it('dispatches trusted pointer input at the selected control center', async () => {
    MockWebSocket.instances = []
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

    await runner.clickSelector('tab-1', '#loginButton')

    const commands = MockWebSocket.instances[0]?.messages.map(
      (message) => JSON.parse(message) as { method: string; params?: Record<string, unknown> }
    )
    expect(commands?.filter((command) => command.method === 'Input.dispatchMouseEvent')).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ type: 'mouseMoved', x: 320, y: 240 }) }),
      expect.objectContaining({ params: expect.objectContaining({ type: 'mousePressed', button: 'left' }) }),
      expect.objectContaining({ params: expect.objectContaining({ type: 'mouseReleased', button: 'left' }) })
    ])
    const runtimeExpressions = commands
      ?.filter((command) => command.method === 'Runtime.evaluate')
      .map((command) => String(command.params?.expression ?? ''))
      .join('\n')
    expect(runtimeExpressions).not.toMatch(/\.click\s*\(|dispatchEvent|requestSubmit|\.submit\s*\(/)
  })

  it('returns the top-frame loader id without evaluating page fields', async () => {
    MockWebSocket.instances = []
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

    await expect(runner.getDocumentIdentity('tab-1')).resolves.toEqual({
      tabId: 'tab-1',
      loaderId: 'loader-7'
    })
    const commands = MockWebSocket.instances[0]?.messages.map(
      (message) => JSON.parse(message) as { method: string }
    )
    expect(commands).toEqual([expect.objectContaining({ method: 'Page.getFrameTree' })])
  })
})
