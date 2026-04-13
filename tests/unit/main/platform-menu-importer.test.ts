import { describe, expect, it, vi } from 'vitest'
import { PlatformMenuImporter } from '../../../src/main/services/platform-menu-importer'

describe('PlatformMenuImporter', () => {
  it('delegates imports to the catalog orchestrator', async () => {
    const importPlatform = vi.fn().mockResolvedValue({
      summary: {
        platformCode: 'baemin',
        fetchedCount: 0,
        createdMenuCount: 0,
        linkedMappingCount: 0,
        verifiedMappingCount: 0
      },
      inspection: undefined
    })

    const importer = new PlatformMenuImporter({
      importPlatform
    })

    await expect(importer.importPlatform('baemin')).resolves.toEqual({
      summary: {
        platformCode: 'baemin',
        fetchedCount: 0,
        createdMenuCount: 0,
        linkedMappingCount: 0,
        verifiedMappingCount: 0
      },
      inspection: undefined
    })

    expect(importPlatform).toHaveBeenCalledWith('baemin')
  })
})
