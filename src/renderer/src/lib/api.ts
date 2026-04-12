import type { PlatformImportSummary } from '../../../shared/contracts'

declare global {
  interface Window {
    appApi?: {
      menus: {
        list: () => Promise<unknown[]>
        save: (payload: unknown) => Promise<void>
      }
      settings: {
        getPlatformCredentialStatus: () => Promise<unknown[]>
        listPlatformCredentials: () => Promise<unknown[]>
        savePlatformCredential: (payload: {
          platformCode: string
          username: string
          password: string
        }) => Promise<{ ok: true; importSummary?: PlatformImportSummary; importError?: string }>
      }
      syncRuns: {
        list: () => Promise<unknown[]>
      }
      sync: {
        preview: () => Promise<unknown>
        run: () => Promise<unknown>
      }
      mappings: {
        list: () => Promise<unknown[]>
        save: (payload: unknown) => Promise<void>
      }
    }
  }
}

type AppApi = NonNullable<Window['appApi']>

const noopPromise = async <T,>(value: T) => value

export const appApi: AppApi = window.appApi ?? {
  menus: {
    list: () => noopPromise([] as unknown[]),
    save: () => noopPromise(undefined)
  },
  settings: {
    getPlatformCredentialStatus: () => noopPromise([] as unknown[]),
    listPlatformCredentials: () => noopPromise([] as unknown[]),
    savePlatformCredential: () =>
      noopPromise({
        ok: true as const,
        importSummary: undefined,
        importError: undefined
      })
  },
  syncRuns: {
    list: () => noopPromise([] as unknown[])
  },
  sync: {
    preview: () => noopPromise({ items: [], needsReview: [] }),
    run: () => noopPromise({ summary: '0 succeeded, 0 failed' })
  },
  mappings: {
    list: () => noopPromise([] as unknown[]),
    save: () => noopPromise(undefined)
  }
}
