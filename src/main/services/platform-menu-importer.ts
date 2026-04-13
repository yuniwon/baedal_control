import type { PlatformCode, PlatformImportResult } from '../../shared/contracts'

export interface CatalogImportOrchestratorLike {
  importPlatform(platformCode: PlatformCode): Promise<PlatformImportResult>
}

export class PlatformMenuImporter {
  constructor(private readonly orchestrator: CatalogImportOrchestratorLike) {}

  async importPlatform(platformCode: PlatformCode): Promise<PlatformImportResult> {
    return this.orchestrator.importPlatform(platformCode)
  }
}
