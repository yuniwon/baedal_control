import type { PlatformAuthPreferenceRecord, PlatformCode } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'

interface StoredPlatformAuthPreference {
  workspaceId: string
  platformCode: PlatformCode
  autoClickLoginButtonConsented: number
  consentUpdatedAt: string | null
  updatedAt: string
}

const selectColumns = `
  workspace_id as workspaceId,
  platform_code as platformCode,
  auto_click_login_button_consented as autoClickLoginButtonConsented,
  consent_updated_at as consentUpdatedAt,
  updated_at as updatedAt
`

const fromStored = (record: StoredPlatformAuthPreference): PlatformAuthPreferenceRecord => ({
  ...record,
  autoClickLoginButtonConsented: record.autoClickLoginButtonConsented === 1
})

export class PlatformAuthPreferenceRepository {
  constructor(private readonly db: DatabaseConnection) {}

  get(workspaceId: string, platformCode: PlatformCode): PlatformAuthPreferenceRecord {
    const stored = this.db.prepare(`
      select ${selectColumns}
      from platform_auth_preferences
      where workspace_id = ? and platform_code = ?
    `).get(workspaceId, platformCode) as StoredPlatformAuthPreference | undefined

    return stored
      ? fromStored(stored)
      : {
          workspaceId,
          platformCode,
          autoClickLoginButtonConsented: false,
          consentUpdatedAt: null
        }
  }

  list(workspaceId: string): PlatformAuthPreferenceRecord[] {
    const records = this.db.prepare(`
      select ${selectColumns}
      from platform_auth_preferences
      where workspace_id = ?
      order by platform_code asc
    `).all(workspaceId) as unknown as StoredPlatformAuthPreference[]

    return records.map(fromStored)
  }

  setAutoClickConsent(
    workspaceId: string,
    platformCode: PlatformCode,
    consented: boolean,
    changedAt: string
  ): PlatformAuthPreferenceRecord {
    this.db.prepare(`
      insert into platform_auth_preferences (
        workspace_id,
        platform_code,
        auto_click_login_button_consented,
        consent_updated_at,
        updated_at
      ) values (?, ?, ?, ?, ?)
      on conflict(workspace_id, platform_code) do update set
        auto_click_login_button_consented = excluded.auto_click_login_button_consented,
        consent_updated_at = excluded.consent_updated_at,
        updated_at = excluded.updated_at
    `).run(workspaceId, platformCode, consented ? 1 : 0, changedAt, changedAt)

    return this.get(workspaceId, platformCode)
  }
}
