import { describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: electronMock.exposeInMainWorld
  },
  ipcRenderer: {
    invoke: electronMock.invoke
  }
}))

import { appApi } from '../../../src/main/preload'
import { appApiKeys } from '../../../src/shared/contracts'

describe('preload contract', () => {
  it('exposes the expected renderer API keys', () => {
    expect(Object.keys(appApi)).toEqual(appApiKeys)
  })
})
