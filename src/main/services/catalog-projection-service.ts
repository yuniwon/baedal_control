import type {
  CatalogProjectionPreview,
  MenuRecord,
  PlatformMenuCatalogRecord,
  PlatformMenuMappingRecord,
  PlatformOptionGroupRecord,
  PlatformCode
} from '../../shared/contracts'
import { buildCatalogProjectionPreview } from '../../shared/catalog-projection'

interface CatalogProjectionServiceDependencies {
  menuRepository: { list: () => MenuRecord[] }
  mappingRepository: { listAll: () => PlatformMenuMappingRecord[] }
  platformMenuRepository: { listAll: () => PlatformMenuCatalogRecord[] }
  platformOptionGroupRepository: { listAll: () => PlatformOptionGroupRecord[] }
}

export class CatalogProjectionService {
  constructor(private readonly deps: CatalogProjectionServiceDependencies) {}

  preview(referencePlatformCode: PlatformCode): CatalogProjectionPreview {
    return buildCatalogProjectionPreview({
      referencePlatformCode,
      menus: this.deps.menuRepository.list(),
      mappings: this.deps.mappingRepository.listAll(),
      platformMenus: this.deps.platformMenuRepository.listAll(),
      optionGroups: this.deps.platformOptionGroupRepository.listAll()
    })
  }
}
