import { describe, expect, it, vi } from 'vitest'

describe('capture-client', () => {
  it('injects the content script and retries when the receiver does not exist', async () => {
    const module = await import(
      '../../../browser-extension/delivery-menu-inspector/capture-client.js'
    ).catch(() => null)

    expect(module?.requestCapture).toBeTypeOf('function')

    if (!module?.requestCapture) {
      return
    }

    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
      .mockResolvedValueOnce({ ok: true, menuNames: ['왕새우갈비'] })
    const executeScript = vi.fn().mockResolvedValue(undefined)

    const result = await module.requestCapture({
      tabId: 321,
      sendMessage,
      executeScript
    })

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 321 },
      files: ['content.js']
    })
    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ ok: true, menuNames: ['왕새우갈비'] })
  })

  it('does not inject for unrelated sendMessage errors', async () => {
    const module = await import(
      '../../../browser-extension/delivery-menu-inspector/capture-client.js'
    ).catch(() => null)

    expect(module?.requestCapture).toBeTypeOf('function')

    if (!module?.requestCapture) {
      return
    }

    const sendMessage = vi.fn().mockRejectedValueOnce(new Error('The tab was closed.'))
    const executeScript = vi.fn().mockResolvedValue(undefined)

    await expect(
      module.requestCapture({
        tabId: 654,
        sendMessage,
        executeScript
      })
    ).rejects.toThrow('The tab was closed.')

    expect(executeScript).not.toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })
})
