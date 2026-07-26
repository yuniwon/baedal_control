import { beforeEach, describe, expect, it } from 'vitest'

import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { PlatformSessionStateRepository } from '../../../src/main/repositories/platform-session-state-repository'
import { AuthAttemptGuard } from '../../../src/main/services/auth-attempt-guard'

describe('AuthAttemptGuard', () => {
  let repository: PlatformSessionStateRepository
  let guard: AuthAttemptGuard

  beforeEach(() => {
    const db = createInMemoryConnection()
    migrate(db)
    repository = new PlatformSessionStateRepository(db)
    guard = new AuthAttemptGuard(repository, () => '2026-07-25T01:00:00.000Z')
  })

  it('blocks a second submission of the same rejected credential revision', () => {
    guard.markRejected('default', 'deliveryspecial', 'revision-a')

    expect(() => guard.assertAttemptAllowed('default', 'deliveryspecial', 'revision-a'))
      .toThrow('credential_retry_blocked:deliveryspecial')
  })

  it('allows a changed credential revision', () => {
    guard.markRejected('default', 'deliveryspecial', 'revision-a')

    expect(() => guard.assertAttemptAllowed('default', 'deliveryspecial', 'revision-b'))
      .not.toThrow()
  })

  it('never submits credentials while a lockout risk is recorded', () => {
    repository.save({
      workspaceId: 'default',
      platformCode: 'deliveryspecial',
      state: 'locked_out_risk',
      credentialRevision: 'revision-a'
    })

    expect(() => guard.assertAttemptAllowed('default', 'deliveryspecial', 'revision-b'))
      .toThrow('credential_retry_blocked:deliveryspecial')
  })

  it('marks a successful session ready without retaining the rejection detail', () => {
    guard.markRejected('default', 'deliveryspecial', 'revision-a')
    guard.markReady('default', 'deliveryspecial', 'revision-b')

    expect(repository.get('default', 'deliveryspecial')).toMatchObject({
      state: 'ready',
      detailCode: null,
      credentialRevision: 'revision-b',
      lastReadyAt: '2026-07-25T01:00:00.000Z'
    })
  })
})
