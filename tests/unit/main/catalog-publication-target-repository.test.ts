import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryConnection, type DatabaseConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { CatalogPublicationTargetRepository } from '../../../src/main/repositories/catalog-publication-target-repository'

describe('CatalogPublicationTargetRepository', () => {
  let db: DatabaseConnection
  let repository: CatalogPublicationTargetRepository

  beforeEach(() => {
    db = createInMemoryConnection()
    migrate(db)
    db.prepare(`insert into menus (menu_id, base_name, base_price, is_dirty, is_managed) values (?, ?, ?, ?, ?)`)
      .run('menu-1', '새 메뉴', 12000, 1, 1)
    repository = new CatalogPublicationTargetRepository(db)
  })

  it('persists the selected publish and exclude intent per platform', () => {
    repository.replaceForMenu('menu-1', [
      { platformCode: 'baemin', intent: 'publish' },
      { platformCode: 'yogiyo', intent: 'exclude' }
    ])

    expect(repository.listForMenu('menu-1')).toEqual([
      expect.objectContaining({ menuId: 'menu-1', platformCode: 'baemin', intent: 'publish' }),
      expect.objectContaining({ menuId: 'menu-1', platformCode: 'yogiyo', intent: 'exclude' })
    ])
  })

  it('replaces a previous target decision without leaving stale platforms', () => {
    repository.replaceForMenu('menu-1', [{ platformCode: 'baemin', intent: 'publish' }])
    repository.replaceForMenu('menu-1', [{ platformCode: 'coupangeats', intent: 'publish' }])

    expect(repository.listForMenu('menu-1')).toEqual([
      expect.objectContaining({ platformCode: 'coupangeats', intent: 'publish' })
    ])
  })
})
