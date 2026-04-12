import type { DatabaseConnection } from '../db/connection'

export class SettingsRepository {
  constructor(private readonly db: DatabaseConnection) {}

  setValue(key: string, value: string) {
    this.ensureTable()
    this.db.prepare(`
      insert into settings (key, value)
      values (?, ?)
      on conflict(key) do update set value = excluded.value
    `).run(key, value)
  }

  getValue(key: string) {
    this.ensureTable()
    const row = this.db.prepare(`
      select value
      from settings
      where key = ?
    `).get(key) as { value: string } | undefined

    return row?.value ?? null
  }

  private ensureTable() {
    this.db.exec(`
      create table if not exists settings (
        key text primary key,
        value text not null
      )
    `)
  }
}
