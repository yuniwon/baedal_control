import type { MenuRecord } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'

export class MenuRepository {
  constructor(private readonly db: DatabaseConnection) {}

  remove(menuId: string) {
    this.db.prepare(`
      delete from menus
      where menu_id = ?
    `).run(menuId)
  }

  upsert(record: MenuRecord) {
    this.db.prepare(`
      insert into menus (menu_id, base_name, base_price, is_dirty, is_managed)
      values (?, ?, ?, ?, ?)
      on conflict(menu_id) do update set
        base_name = excluded.base_name,
        base_price = excluded.base_price,
        is_dirty = excluded.is_dirty,
        is_managed = excluded.is_managed,
        updated_at = current_timestamp
    `).run(
      record.menuId,
      record.baseName,
      record.basePrice,
      record.isDirty,
      record.isManaged ?? 1
    )
  }

  list(): MenuRecord[] {
    return this.db.prepare(`
      select
        menu_id as menuId,
        base_name as baseName,
        base_price as basePrice,
        is_dirty as isDirty,
        is_managed as isManaged,
        created_at as createdAt,
        updated_at as updatedAt
      from menus
      order by base_name asc
    `).all() as unknown as MenuRecord[]
  }
}
