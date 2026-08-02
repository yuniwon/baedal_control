import type {
  CatalogPublicationPreview,
  CatalogPublicationPreviewInput,
  PlatformMenuMappingRecord
} from '../../shared/contracts'
import { buildCatalogPublicationPreview } from '../../shared/catalog-publication'

interface CatalogPublicationServiceDependencies {
  mappingRepository: { listAll: () => PlatformMenuMappingRecord[] }
}

export class CatalogPublicationService {
  constructor(private readonly deps: CatalogPublicationServiceDependencies) {}

  preview(input: CatalogPublicationPreviewInput): CatalogPublicationPreview {
    return buildCatalogPublicationPreview({
      ...input,
      mappings: this.deps.mappingRepository.listAll()
    })
  }
}
