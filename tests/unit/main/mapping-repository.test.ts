import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { MappingRepository } from '../../../src/main/repositories/mapping-repository'
import { MenuRepository } from '../../../src/main/repositories/menu-repository'

describe('MappingRepository', () => {
  let repository: MappingRepository
  let menuRepository: MenuRepository

  beforeEach(() => {
    const db = createInMemoryConnection()
    migrate(db)
    menuRepository = new MenuRepository(db)
    repository = new MappingRepository(db)
  })

  it('stores confirmed platform mappings', () => {
    menuRepository.upsert({ menuId: 'm1', baseName: '콤비네이션', basePrice: 22900, isDirty: 0 })

    repository.upsert({
      mappingId: 'map-1',
      menuId: 'm1',
      platformCode: 'baemin',
      platformMenuId: 'p-11',
      platformMenuName: '콤비네이션',
      matchedBy: 'manual',
      isConfirmed: 1
    })

    expect(repository.listForMenu('m1')).toEqual([
      expect.objectContaining({ platformCode: 'baemin', platformMenuId: 'p-11', isConfirmed: 1 })
    ])
  })
})
