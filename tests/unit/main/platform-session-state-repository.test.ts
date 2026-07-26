import { beforeEach, describe, expect, it } from 'vitest'

import { createInMemoryConnection, type DatabaseConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { PlatformSessionStateRepository } from '../../../src/main/repositories/platform-session-state-repository'

describe('PlatformSessionStateRepository', () => {
  let db: DatabaseConnection
  let repository: PlatformSessionStateRepository

  beforeEach(() => {
    db = createInMemoryConnection()
    migrate(db)
    repository = new PlatformSessionStateRepository(db)
  })

  it('persists a challenge without secret-shaped fields', () => {
    repository.save({
      workspaceId: 'default',
      platformCode: 'naverorder',
      state: 'challenge_required',
      detailCode: 'otp_required',
      credentialRevision: null,
      lastAttemptAt: '2026-07-25T00:00:00.000Z',
      lastReadyAt: null
    })

    const record = repository.get('default', 'naverorder')
    expect(record).toMatchObject({
      platformCode: 'naverorder',
      state: 'challenge_required',
      detailCode: 'otp_required'
    })
    expect(JSON.stringify(record)).not.toMatch(/password|cookie|token|authorization/i)
  })

  it('updates one platform and lists only the requested workspace', () => {
    repository.save({
      workspaceId: 'default',
      platformCode: 'baemin',
      state: 'checking',
      credentialRevision: 'revision-a'
    })
    repository.save({
      workspaceId: 'default',
      platformCode: 'baemin',
      state: 'ready',
      credentialRevision: 'revision-a',
      lastReadyAt: '2026-07-25T00:01:00.000Z'
    })
    repository.save({
      workspaceId: 'other',
      platformCode: 'yogiyo',
      state: 'expired'
    })

    expect(repository.list('default')).toEqual([
      expect.objectContaining({ platformCode: 'baemin', state: 'ready' })
    ])
  })
})
