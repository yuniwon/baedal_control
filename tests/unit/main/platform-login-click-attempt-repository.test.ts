import { beforeEach, describe, expect, it } from 'vitest'

import { createInMemoryConnection, type DatabaseConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { PlatformLoginClickAttemptRepository } from '../../../src/main/repositories/platform-login-click-attempt-repository'

describe('PlatformLoginClickAttemptRepository', () => {
  let db: DatabaseConnection
  let repository: PlatformLoginClickAttemptRepository

  beforeEach(() => {
    db = createInMemoryConnection()
    migrate(db)
    repository = new PlatformLoginClickAttemptRepository(db)
  })

  it('allows only one unresolved automatic click for a platform', () => {
    expect(repository.claim({
      attemptId: 'attempt-1',
      workspaceId: 'default',
      platformCode: 'coupangeats',
      documentKeyHash: 'document-a',
      attemptedAt: '2026-07-26T10:00:00.000Z'
    })).toBe(true)

    expect(repository.claim({
      attemptId: 'attempt-2',
      workspaceId: 'default',
      platformCode: 'coupangeats',
      documentKeyHash: 'document-a',
      attemptedAt: '2026-07-26T10:00:01.000Z'
    })).toBe(false)

    expect(repository.getUnresolved('default', 'coupangeats')).toMatchObject({
      attemptId: 'attempt-1',
      state: 'claimed'
    })
  })

  it('allows a later genuine expiry after the prior attempt succeeds', () => {
    repository.claim({
      attemptId: 'attempt-1',
      workspaceId: 'default',
      platformCode: 'coupangeats',
      documentKeyHash: 'document-a',
      attemptedAt: '2026-07-26T10:00:00.000Z'
    })
    repository.markState('attempt-1', 'succeeded', '2026-07-26T10:00:05.000Z')

    expect(repository.claim({
      attemptId: 'attempt-2',
      workspaceId: 'default',
      platformCode: 'coupangeats',
      documentKeyHash: 'document-b',
      attemptedAt: '2026-08-26T10:00:00.000Z'
    })).toBe(true)
  })

  it('resolves an outstanding handoff when a manual session becomes ready', () => {
    repository.claim({
      attemptId: 'attempt-1',
      workspaceId: 'default',
      platformCode: 'coupangeats',
      documentKeyHash: 'document-a',
      attemptedAt: '2026-07-26T10:00:00.000Z'
    })
    repository.markState('attempt-1', 'handed_off', '2026-07-26T10:00:02.000Z')

    repository.markPlatformReady('default', 'coupangeats', '2026-07-26T10:05:00.000Z')

    expect(repository.getUnresolved('default', 'coupangeats')).toBeNull()
  })

  it('never persists secret-shaped login fields', () => {
    repository.claim({
      attemptId: 'attempt-1',
      workspaceId: 'default',
      platformCode: 'coupangeats',
      documentKeyHash: 'document-a',
      attemptedAt: '2026-07-26T10:00:00.000Z'
    })

    expect(JSON.stringify(repository.getUnresolved('default', 'coupangeats')))
      .not.toMatch(/username|password|credential|cookie|token|authorization/i)
  })
})
