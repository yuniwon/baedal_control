import type {
  AgentActionPlanReport,
  AgentReportEnvelope,
  BrowserInspectionSnapshot,
  BrowserInspectorStatus,
  CatalogBootstrapActivationInput,
  CatalogBootstrapPreview,
  CatalogBootstrapPreviewInput,
  CatalogReviewCanonicalMergeInput,
  CatalogReviewItem,
  CatalogReviewLinkInput,
  CatalogReviewResolutionInput,
  CatalogMaintenanceApplyInput,
  CatalogMaintenancePreview,
  CatalogMaintenanceResult,
  CatalogProjectionPreview,
  CatalogWorkspaceRecord,
  LogicalOptionGroupRecord,
  ManagedChromeSessionStatus,
  PlatformImportChangeRecord,
  PlatformImportRunRecord,
  PlatformAuthPreferenceRecord,
  PlatformCode,
  PlatformMenuCatalogRecord,
  PlatformOptionGroupRecord,
  PlatformSessionStateRecord,
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
        getLegacyPlatformCredentialStatus: (
          platformCode: PlatformCode
        ) => Promise<{ stored: boolean }>
        clearLegacyPlatformCredential: (platformCode: PlatformCode) => Promise<{ ok: true }>
        savePlatformCredential: (payload: {
          platformCode: string
          username: string
          password: string
        }) => Promise<{
          ok: true
          sessionState?: PlatformSessionStateRecord
          importSummary?: PlatformImportSummary
          importInspection?: PlatformInspectionReport
          importError?: string
        }>
        importPlatformMenus: (payload: { platformCode: string }) => Promise<{
          ok: true
          sessionState?: PlatformSessionStateRecord
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
      platformSessions: {
        list: () => Promise<PlatformSessionStateRecord[]>
        check: (platformCode: PlatformCode) => Promise<PlatformSessionStateRecord>
        connect: (platformCode: PlatformCode) => Promise<PlatformSessionStateRecord>
        resumeAfterUserAction: (platformCode: PlatformCode) => Promise<PlatformSessionStateRecord>
      }
      platformAuthPreferences: {
        list: () => Promise<PlatformAuthPreferenceRecord[]>
        setAutoClickConsent: (
          platformCode: PlatformCode,
          consented: boolean
        ) => Promise<PlatformAuthPreferenceRecord>
      }
      platformImportRuns: {
        list: () => Promise<PlatformImportRunRecord[]>
      }
      platformImportChanges: {
        listLatest: (limit?: number) => Promise<PlatformImportChangeRecord[]>
      }
      catalogWorkspace: {
        get: () => Promise<CatalogWorkspaceRecord>
      }
      catalogBootstrap: {
        preview: (payload: CatalogBootstrapPreviewInput) => Promise<CatalogBootstrapPreview>
        activate: (payload: CatalogBootstrapActivationInput) => Promise<CatalogWorkspaceRecord>
      }
      catalogReviews: {
        listOpen: () => Promise<CatalogReviewItem[]>
        link: (payload: CatalogReviewLinkInput) => Promise<{
          ok: true
          mappingId: string
          resolvedCount: number
        }>
        mergeCanonical: (payload: CatalogReviewCanonicalMergeInput) => Promise<{
          ok: true
          backupPath: string | null
          sourceMenuId: string
          targetMenuId: string
          resolvedCount: number
        }>
        resolve: (payload: CatalogReviewResolutionInput) => Promise<{
          ok: true
          resolvedCount: number
        }>
      }
      catalogMaintenance: {
        preview: (referencePlatformCode: PlatformCode) => Promise<CatalogMaintenancePreview>
        apply: (payload: CatalogMaintenanceApplyInput) => Promise<CatalogMaintenanceResult>
        projectionPreview: (referencePlatformCode: PlatformCode) => Promise<CatalogProjectionPreview>
      }
      agentReports: {
        getNextActionPlan: (filters?: unknown) => Promise<AgentReportEnvelope<AgentActionPlanReport>>
      }
      browserInspectionSnapshots: {
        listLatest: (limit?: number) => Promise<BrowserInspectionSnapshot[]>
      }
      browserInspector: {
        getStatus: () => Promise<BrowserInspectorStatus>
        getManagedChromeSession: () => Promise<ManagedChromeSessionStatus>
        captureManagedChromeTab: (payload: { tabId: string }) => Promise<BrowserInspectionSnapshot>
        launchManagedChrome: (payload?: {
          url?: string
          platformCode?: PlatformCode
          autoLogin?: boolean
        }) => Promise<BrowserInspectorStatus>
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
    getLegacyPlatformCredentialStatus: () => noopPromise({ stored: false }),
    clearLegacyPlatformCredential: () => noopPromise({ ok: true as const }),
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
  platformSessions: {
    list: () => noopPromise([] as PlatformSessionStateRecord[]),
    check: (platformCode) =>
      noopPromise({ workspaceId: 'default', platformCode, state: 'unknown' } as PlatformSessionStateRecord),
    connect: (platformCode) =>
      noopPromise({ workspaceId: 'default', platformCode, state: 'unknown' } as PlatformSessionStateRecord),
    resumeAfterUserAction: (platformCode) =>
      noopPromise({ workspaceId: 'default', platformCode, state: 'unknown' } as PlatformSessionStateRecord)
  },
  platformAuthPreferences: {
    list: () => noopPromise([] as PlatformAuthPreferenceRecord[]),
    setAutoClickConsent: (platformCode, consented) =>
      noopPromise({
        workspaceId: 'default',
        platformCode,
        autoClickLoginButtonConsented: consented,
        consentUpdatedAt: null
      } as PlatformAuthPreferenceRecord)
  },
  platformImportRuns: {
    list: () => noopPromise([] as PlatformImportRunRecord[])
  },
  platformImportChanges: {
    listLatest: () => noopPromise([] as PlatformImportChangeRecord[])
  },
  catalogWorkspace: {
    get: () =>
      noopPromise({
        workspaceId: 'default',
        displayName: '기본 매장',
        lifecycleState: 'collecting',
        seedMode: null,
        seedPlatformCode: null,
        canonicalVersion: 0
      } as CatalogWorkspaceRecord)
  },
  catalogBootstrap: {
    preview: (payload) =>
      noopPromise({
        workspaceId: payload.workspaceId,
        seedMode: payload.seedMode,
        seedPlatformCode: payload.seedPlatformCode,
        previewFingerprint: '',
        draftMenus: [],
        suggestedMappings: [],
        reviewItems: []
      } as CatalogBootstrapPreview),
    activate: (payload) =>
      noopPromise({
        workspaceId: payload.workspaceId,
        displayName: '기본 매장',
        lifecycleState: 'active',
        seedMode: payload.seedMode,
        seedPlatformCode: payload.seedPlatformCode,
        canonicalVersion: 1
      } as CatalogWorkspaceRecord)
  },
  catalogReviews: {
    listOpen: () => noopPromise([] as CatalogReviewItem[]),
    link: (payload) => noopPromise({
      ok: true as const,
      mappingId: `${payload.reviewItemId}:${payload.sourceEntityId}`,
      resolvedCount: 1
    }),
    mergeCanonical: (payload) => noopPromise({
      ok: true as const,
      backupPath: null,
      sourceMenuId: payload.reviewItemId,
      targetMenuId: payload.targetCanonicalMenuId,
      resolvedCount: 1
    }),
    resolve: (payload) => noopPromise({ ok: true as const, resolvedCount: payload.reviewItemIds.length })
  },
  catalogMaintenance: {
    preview: (referencePlatformCode) =>
      globalThis.window?.appApi?.catalogMaintenance.preview(referencePlatformCode)
      ?? noopPromise({
        referencePlatformCode,
        menuCount: 0,
        safeMerges: [],
        hiddenMenuIds: []
      } as CatalogMaintenancePreview),
    apply: (payload) =>
      globalThis.window?.appApi?.catalogMaintenance.apply(payload)
      ?? noopPromise({
        backupPath: null,
        mergedMenuCount: 0,
        excludedMenuCount: 0,
        normalizedCategoryCount: 0,
        refreshedReferencePriceCount: 0,
        remainingMenuCount: 0
      } as CatalogMaintenanceResult),
    projectionPreview: (referencePlatformCode) =>
      globalThis.window?.appApi?.catalogMaintenance.projectionPreview(referencePlatformCode)
      ?? noopPromise({
        referencePlatformCode,
        generatedAt: '',
        menuCount: 0,
        items: [],
        platforms: []
      } as CatalogProjectionPreview)
  },
  agentReports: {
    getNextActionPlan: () =>
      noopPromise({
        task: 'agent-plan-next-actions',
        generatedAt: '',
        summary: '',
        data: {
          total: 0,
          byPriority: { high: 0, medium: 0, low: 0 },
          items: []
        }
      } as AgentReportEnvelope<AgentActionPlanReport>)
  },
  browserInspectionSnapshots: {
    listLatest: () => noopPromise([] as BrowserInspectionSnapshot[])
  },
  browserInspector: {
    getStatus: () =>
      noopPromise({
        receiverUrl: '',
        extensionPath: '',
        isRunning: false
      } as BrowserInspectorStatus),
    getManagedChromeSession: () =>
      noopPromise({
        endpointUrl: 'http://127.0.0.1:39482',
        connected: false,
        error: null,
        tabs: []
      } as ManagedChromeSessionStatus),
    captureManagedChromeTab: () =>
      noopPromise({
        snapshotId: '',
        platformCode: 'coupangeats',
        source: 'manual_browser',
        pageUrl: '',
        pageTitle: '',
        pageKind: 'unknown',
        captureMode: 'viewport',
        host: '',
        capturedAt: '',
        textSnippet: null,
        menuNames: [],
        menuItems: [],
        optionGroupNames: [],
        buttonLabels: [],
        inputHints: [],
        fields: [],
        apiEvents: [],
        screenshotDataUrl: null
      } as BrowserInspectionSnapshot),
    launchManagedChrome: () =>
      noopPromise({
        receiverUrl: '',
        extensionPath: '',
        isRunning: false,
        chromeAvailable: false,
        chromePath: null,
        chromeProfilePath: null,
        managedChromeRunning: false,
        lastLaunchUrl: null,
        chromeError: null
      } as BrowserInspectorStatus)
  }
}
