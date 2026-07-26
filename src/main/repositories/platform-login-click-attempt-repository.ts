import type { PlatformCode } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'

export type PlatformLoginClickAttemptState =
  | 'claimed'
  | 'submitted'
  | 'succeeded'
  | 'handed_off'

export interface PlatformLoginClickAttemptRecord {
  attemptId: string
  workspaceId: string
  platformCode: PlatformCode
  documentKeyHash: string
  state: PlatformLoginClickAttemptState
  attemptedAt: string
  resolvedAt: string | null
}

export interface PlatformLoginClickAttemptClaim {
  attemptId: string
  workspaceId: string
  platformCode: PlatformCode
  documentKeyHash: string
  attemptedAt: string
}

const selectColumns = `
  attempt_id as attemptId,
  workspace_id as workspaceId,
  platform_code as platformCode,
  document_key_hash as documentKeyHash,
  state,
  attempted_at as attemptedAt,
  resolved_at as resolvedAt
`

export class PlatformLoginClickAttemptRepository {
  constructor(private readonly db: DatabaseConnection) {}

  claim(input: PlatformLoginClickAttemptClaim): boolean {
    const result = this.db.prepare(`
      insert or ignore into platform_login_click_attempts (
        attempt_id,
        workspace_id,
        platform_code,
        document_key_hash,
        state,
        attempted_at
      ) values (?, ?, ?, ?, 'claimed', ?)
    `).run(
      input.attemptId,
      input.workspaceId,
      input.platformCode,
      input.documentKeyHash,
      input.attemptedAt
    )

    return result.changes === 1
  }

  markState(
    attemptId: string,
    state: Exclude<PlatformLoginClickAttemptState, 'claimed'>,
    at: string
  ): void {
    this.db.prepare(`
      update platform_login_click_attempts
      set state = ?, resolved_at = case when ? = 'succeeded' then ? else null end
      where attempt_id = ?
    `).run(state, state, at, attemptId)
  }

  markPlatformReady(workspaceId: string, platformCode: PlatformCode, at: string): void {
    this.db.prepare(`
      update platform_login_click_attempts
      set state = 'succeeded', resolved_at = ?
      where workspace_id = ?
        and platform_code = ?
        and state in ('claimed', 'submitted', 'handed_off')
    `).run(at, workspaceId, platformCode)
  }

  getUnresolved(
    workspaceId: string,
    platformCode: PlatformCode
  ): PlatformLoginClickAttemptRecord | null {
    return (this.db.prepare(`
      select ${selectColumns}
      from platform_login_click_attempts
      where workspace_id = ?
        and platform_code = ?
        and state in ('claimed', 'submitted', 'handed_off')
      order by attempted_at desc, rowid desc
      limit 1
    `).get(workspaceId, platformCode) as PlatformLoginClickAttemptRecord | undefined) ?? null
  }
}
