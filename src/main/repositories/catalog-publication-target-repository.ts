import type {
  CatalogPublicationIntent,
  CatalogPublicationTargetRecord,
  PlatformCode
} from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'

export class CatalogPublicationTargetRepository {
  constructor(private readonly db: DatabaseConnection) {}

  replaceForMenu(
    menuId: string,
    targets: Array<{ platformCode: PlatformCode; intent: CatalogPublicationIntent }>
  ) {
    this.db.prepare('delete from catalog_publication_targets where menu_id = ?').run(menuId)
    const insert = this.db.prepare(`
      insert into catalog_publication_targets (menu_id, platform_code, intent)
      values (?, ?, ?)
    `)
    for (const target of targets) {
      insert.run(menuId, target.platformCode, target.intent)
    }
  }

  listForMenu(menuId: string): CatalogPublicationTargetRecord[] {
    return this.db.prepare(`
      select menu_id as menuId, platform_code as platformCode, intent,
             updated_at as updatedAt
      from catalog_publication_targets
      where menu_id = ?
      order by platform_code asc
    `).all(menuId) as unknown as CatalogPublicationTargetRecord[]
  }
}
