import { describe, expect, it } from 'vitest'

import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { CatalogWorkspaceRepository } from '../../../src/main/repositories/catalog-workspace-repository'

describe('CatalogWorkspaceRepository', () => {
  it('creates a collecting default workspace on a fresh database', () => {
    const db = createInMemoryConnection()
    migrate(db)

    expect(new CatalogWorkspaceRepository(db).getDefault()).toMatchObject({
      workspaceId: 'default',
      displayName: '기본 매장',
      lifecycleState: 'collecting',
      seedMode: null,
      seedPlatformCode: null,
      canonicalVersion: 0,
      activatedAt: null
    })
  })

  it('preserves existing canonical menus as an active legacy workspace', () => {
    const db = createInMemoryConnection()
    db.exec(`
      create table menus (
        menu_id text primary key,
        base_name text not null,
        base_price integer not null,
        is_dirty integer not null default 0
      )
    `)
    db.prepare(`
      insert into menus (menu_id, base_name, base_price, is_dirty)
      values (?, ?, ?, 0)
    `).run('legacy-menu', '기존 메뉴', 10000)

    migrate(db)

    expect(new CatalogWorkspaceRepository(db).getDefault()).toMatchObject({
      lifecycleState: 'active',
      seedMode: 'legacy',
      seedPlatformCode: null,
      canonicalVersion: 1,
      activatedAt: expect.any(String)
    })
  })

  it('updates the lifecycle without replacing the workspace identity', () => {
    const db = createInMemoryConnection()
    migrate(db)
    const repository = new CatalogWorkspaceRepository(db)

    repository.save({
      ...repository.getDefault(),
      lifecycleState: 'active',
      seedMode: 'platform',
      seedPlatformCode: 'yogiyo',
      canonicalVersion: 1,
      activatedAt: '2026-07-25T10:00:00.000Z'
    })

    expect(repository.getDefault()).toMatchObject({
      workspaceId: 'default',
      lifecycleState: 'active',
      seedMode: 'platform',
      seedPlatformCode: 'yogiyo',
      canonicalVersion: 1,
      activatedAt: '2026-07-25T10:00:00.000Z'
    })
  })
})
