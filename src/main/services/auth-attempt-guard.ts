import type {
  PlatformCode,
  PlatformSessionStateRecord
} from '../../shared/contracts'

interface SessionStateRepositoryLike {
  get(workspaceId: string, platformCode: PlatformCode): PlatformSessionStateRecord | null
  save(record: PlatformSessionStateRecord): void
}

export class AuthAttemptGuard {
  constructor(
    private readonly states: SessionStateRepositoryLike,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  assertAttemptAllowed(
    workspaceId: string,
    platformCode: PlatformCode,
    credentialRevision: string
  ) {
    const current = this.states.get(workspaceId, platformCode)
    const sameRejectedRevision =
      current?.state === 'credential_rejected' &&
      current.credentialRevision === credentialRevision

    if (current?.state === 'locked_out_risk' || sameRejectedRevision) {
      throw new Error(`credential_retry_blocked:${platformCode}`)
    }
  }

  markRejected(
    workspaceId: string,
    platformCode: PlatformCode,
    credentialRevision: string
  ) {
    const current = this.states.get(workspaceId, platformCode)
    this.states.save({
      workspaceId,
      platformCode,
      state: 'credential_rejected',
      detailCode: 'credential_rejected',
      credentialRevision,
      lastAttemptAt: this.now(),
      lastReadyAt: current?.lastReadyAt ?? null
    })
  }

  markReady(
    workspaceId: string,
    platformCode: PlatformCode,
    credentialRevision: string | null
  ) {
    const current = this.states.get(workspaceId, platformCode)
    this.states.save({
      workspaceId,
      platformCode,
      state: 'ready',
      detailCode: null,
      credentialRevision,
      lastAttemptAt: current?.lastAttemptAt ?? null,
      lastReadyAt: this.now()
    })
  }
}
