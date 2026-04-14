import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { MenuRepository } from '../../../src/main/repositories/menu-repository'

describe('MenuRepository', () => {
  let repository: MenuRepository

  beforeEach(() => {
    const db = createInMemoryConnection()
    migrate(db)
    repository = new MenuRepository(db)
  })

  it('creates and lists menus ordered by name', () => {
    repository.upsert({
      menuId: 'm2',
      baseName: '페퍼로니',
      basePrice: 23900,
      isDirty: 1,
      isManaged: 0
    })
    repository.upsert({
      menuId: 'm1',
      baseName: '콤비네이션',
      basePrice: 22900,
      isDirty: 0,
      isManaged: 1
    })

    expect(repository.list()).toEqual([
      expect.objectContaining({
        menuId: 'm1',
        baseName: '콤비네이션',
        basePrice: 22900,
        isManaged: 1
      }),
      expect.objectContaining({
        menuId: 'm2',
        baseName: '페퍼로니',
        basePrice: 23900,
        isManaged: 0
      })
    ])
  })

  it('removes a menu by id', () => {
    repository.upsert({
      menuId: 'm1',
      baseName: '콤비네이션',
      basePrice: 22900,
      isDirty: 0,
      isManaged: 1
    })

    repository.remove('m1')

    expect(repository.list()).toEqual([])
  })
})
