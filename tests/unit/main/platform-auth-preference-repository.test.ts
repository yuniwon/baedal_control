import { beforeEach, describe, expect, it } from 'vitest'

import { createInMemoryConnection, type DatabaseConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { PlatformAuthPreferenceRepository } from '../../../src/main/repositories/platform-auth-preference-repository'

describe('PlatformAuthPreferenceRepository', () => {
  let db: DatabaseConnection
  let repository: PlatformAuthPreferenceRepository

  beforeEach(() => {
    db = createInMemoryConnection()
    migrate(db)
    repository = new PlatformAuthPreferenceRepository(db)
  })

  it('defaults automatic login-button consent to false', () => {
    expect(repository.get('default', 'coupangeats')).toEqual({
      workspaceId: 'default',
      platformCode: 'coupangeats',
      autoClickLoginButtonConsented: false,
      consentUpdatedAt: null
    })
  })

  it('persists explicit opt-in and opt-out with their change time', () => {
    repository.setAutoClickConsent(
      'default',
      'coupangeats',
      true,
      '2026-07-26T10:00:00.000Z'
    )
    expect(repository.get('default', 'coupangeats')).toMatchObject({
      autoClickLoginButtonConsented: true,
      consentUpdatedAt: '2026-07-26T10:00:00.000Z'
    })

    repository.setAutoClickConsent(
      'default',
      'coupangeats',
      false,
      '2026-07-26T11:00:00.000Z'
    )
    expect(repository.get('default', 'coupangeats')).toMatchObject({
      autoClickLoginButtonConsented: false,
      consentUpdatedAt: '2026-07-26T11:00:00.000Z'
    })
  })

  it('lists only preferences from the requested workspace', () => {
    repository.setAutoClickConsent('default', 'coupangeats', true, '2026-07-26T10:00:00.000Z')
    repository.setAutoClickConsent('other', 'coupangeats', true, '2026-07-26T10:00:00.000Z')

    expect(repository.list('default')).toEqual([
      expect.objectContaining({
        workspaceId: 'default',
        platformCode: 'coupangeats',
        autoClickLoginButtonConsented: true
      })
    ])
  })
})
