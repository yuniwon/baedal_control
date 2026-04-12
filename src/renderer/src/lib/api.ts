declare global {
  interface Window {
    appApi?: {
      menus: {
        list: () => Promise<unknown[]>
        save: (payload: unknown) => Promise<void>
      }
      settings: {
        getPlatformCredentialStatus: () => Promise<unknown[]>
        savePlatformCredential: (payload: {
          platformCode: string
          username: string
          password: string
        }) => Promise<{ ok: true }>
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

const noopPromise = async <T,>(value: T) => value

export const appApi = window.appApi ?? {
  menus: {
    list: () => noopPromise([] as unknown[]),
    save: () => noopPromise(undefined)
  },
  settings: {
    getPlatformCredentialStatus: () => noopPromise([] as unknown[]),
    savePlatformCredential: () => noopPromise({ ok: true as const })
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
