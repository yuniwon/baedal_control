import type {
  LogicalOptionGroupRecord,
  PlatformImportChangeRecord,
  PlatformImportRunRecord,
  PlatformMenuCatalogRecord,
  PlatformOptionGroupRecord,
  PlatformImportSummary,
  PlatformInspectionReport,
  SyncRunRecord
} from '../../../shared/contracts'

declare global {
  interface Window {
    appApi?: {
      menus: {
        list: () => Promise<unknown[]>
        save: (payload: unknown) => Promise<void>
        delete: (menuId: string) => Promise<{ ok: boolean; error?: string }>
      }
      settings: {
        getPlatformCredentialStatus: () => Promise<unknown[]>
        listPlatformCredentials: () => Promise<unknown[]>
        savePlatformCredential: (payload: {
          platformCode: string
          username: string
          password: string
        }) => Promise<{
          ok: true
          importSummary?: PlatformImportSummary
          importInspection?: PlatformInspectionReport
          importError?: string
        }>
        importPlatformMenus: (payload: { platformCode: string }) => Promise<{
          ok: true
          importSummary?: PlatformImportSummary
          importInspection?: PlatformInspectionReport
          importError?: string
        }>
      }
      syncRuns: {
        list: () => Promise<SyncRunRecord[]>
      }
      sync: {
        preview: () => Promise<unknown>
        run: () => Promise<unknown>
        runItems: (payload: unknown) => Promise<unknown>
      }
      mappings: {
        list: () => Promise<unknown[]>
        save: (payload: unknown) => Promise<void>
        delete: (mappingId: string) => Promise<void>
      }
      platformOptionGroups: {
        list: () => Promise<PlatformOptionGroupRecord[]>
      }
      logicalOptionGroups: {
        list: () => Promise<LogicalOptionGroupRecord[]>
      }
      platformMenus: {
        list: () => Promise<PlatformMenuCatalogRecord[]>
      }
      platformImportRuns: {
        list: () => Promise<PlatformImportRunRecord[]>
      }
      platformImportChanges: {
        listLatest: (limit?: number) => Promise<PlatformImportChangeRecord[]>
      }
    }
  }
}

type AppApi = NonNullable<Window['appApi']>

const noopPromise = async <T,>(value: T) => value

export const appApi: AppApi = window.appApi ?? {
  menus: {
    list: () => noopPromise([] as unknown[]),
    save: () => noopPromise(undefined),
    delete: () => noopPromise({ ok: true })
  },
  settings: {
    getPlatformCredentialStatus: () => noopPromise([] as unknown[]),
    listPlatformCredentials: () => noopPromise([] as unknown[]),
    savePlatformCredential: () =>
      noopPromise({
        ok: true as const,
        importSummary: undefined,
        importError: undefined
      }),
    importPlatformMenus: () =>
      noopPromise({
        ok: true as const,
        importSummary: undefined,
        importError: undefined
      })
  },
  syncRuns: {
    list: () => noopPromise([] as SyncRunRecord[])
  },
  sync: {
    preview: () => noopPromise({ items: [], needsReview: [] }),
    run: () => noopPromise({ summary: '0 succeeded, 0 failed' }),
    runItems: () => noopPromise({ summary: '0 succeeded, 0 failed' })
  },
  mappings: {
    list: () => noopPromise([] as unknown[]),
    save: () => noopPromise(undefined),
    delete: () => noopPromise(undefined)
  },
  platformOptionGroups: {
    list: () => noopPromise([] as PlatformOptionGroupRecord[])
  },
  logicalOptionGroups: {
    list: () => noopPromise([] as LogicalOptionGroupRecord[])
  },
  platformMenus: {
    list: () => noopPromise([] as PlatformMenuCatalogRecord[])
  },
  platformImportRuns: {
    list: () => noopPromise([] as PlatformImportRunRecord[])
  },
  platformImportChanges: {
    listLatest: () => noopPromise([] as PlatformImportChangeRecord[])
  }
}
