import { randomUUID } from 'node:crypto'
import type {
  MenuRecord,
  PlatformCode,
  PlatformImportSummary,
  PlatformMenuMappingRecord
} from '../../shared/contracts'
import type { PlatformAdapterRegistry } from '../platforms/base/registry'
import { scoreMenuMatch } from './menu-matcher'

interface MenuRepositoryLike {
  list(): MenuRecord[]
  upsert(payload: MenuRecord): void
}

interface MappingRepositoryLike {
  listAll(): PlatformMenuMappingRecord[]
  upsert(payload: PlatformMenuMappingRecord): void
}

export class PlatformMenuImporter {
  constructor(
    private readonly menuRepository: MenuRepositoryLike,
    private readonly mappingRepository: MappingRepositoryLike,
    private readonly adapterRegistry: Pick<PlatformAdapterRegistry, 'get'>,
    private readonly createId: () => string = randomUUID
  ) {}

  async importPlatform(platformCode: PlatformCode): Promise<PlatformImportSummary> {
    const adapter = this.adapterRegistry.get(platformCode)
    const platformMenus = (await adapter.fetchMenus()).filter(
      (menu) => menu.platformMenuId.trim() && menu.platformMenuName.trim()
    )
    const menus = this.menuRepository.list()
    const mappings = this.mappingRepository.listAll()
    const usedMenuIds = new Set(
      mappings
        .filter((mapping) => mapping.platformCode === platformCode)
        .map((mapping) => mapping.menuId)
    )
    const mappingsByPlatformMenuId = new Map(
      mappings
        .filter((mapping) => mapping.platformCode === platformCode)
        .map((mapping) => [mapping.platformMenuId, mapping])
    )

    let createdMenuCount = 0
    let linkedMappingCount = 0

    for (const platformMenu of platformMenus) {
      const existingMapping = mappingsByPlatformMenuId.get(platformMenu.platformMenuId)
      if (existingMapping) {
        this.mappingRepository.upsert({
          ...existingMapping,
          platformMenuName: platformMenu.platformMenuName
        })
        continue
      }

      const matchedMenu = this.findBestAvailableMenu(
        menus,
        usedMenuIds,
        platformMenu.platformMenuName
      )

      const menuId = matchedMenu?.menuId ?? this.createId()
      if (!matchedMenu) {
        const nextMenu: MenuRecord = {
          menuId,
          baseName: platformMenu.platformMenuName,
          basePrice: platformMenu.currentPrice ?? 0,
          isDirty: 0
        }

        this.menuRepository.upsert(nextMenu)
        menus.push(nextMenu)
        createdMenuCount += 1
      }

      this.mappingRepository.upsert({
        mappingId: `${menuId}:${platformCode}`,
        menuId,
        platformCode,
        platformMenuId: platformMenu.platformMenuId,
        platformMenuName: platformMenu.platformMenuName,
        matchedBy: 'auto',
        isConfirmed: 1
      })
      usedMenuIds.add(menuId)
      linkedMappingCount += 1
    }

    return {
      platformCode,
      fetchedCount: platformMenus.length,
      createdMenuCount,
      linkedMappingCount
    }
  }

  private findBestAvailableMenu(
    menus: MenuRecord[],
    usedMenuIds: Set<string>,
    platformMenuName: string
  ) {
    const candidates = menus
      .filter((menu) => !usedMenuIds.has(menu.menuId))
      .map((menu) => ({
        menu,
        score: scoreMenuMatch(menu.baseName, platformMenuName)
      }))
      .sort((left, right) => right.score - left.score)

    return candidates[0] && candidates[0].score >= 0.9 ? candidates[0].menu : null
  }
}
