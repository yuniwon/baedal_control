import { describe, expect, it } from 'vitest'
import { appApiKeys } from '../../../src/shared/contracts'

describe('preload contract', () => {
  it('exposes the expected renderer API keys', () => {
    expect(appApiKeys).toEqual([
      'menus',
      'mappings',
      'settings',
      'syncRuns',
      'sync'
    ])
  })
})
