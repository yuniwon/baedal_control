import { contextBridge, ipcRenderer } from 'electron'
import type {
  CatalogBootstrapActivationInput,
  CatalogBootstrapPreviewInput,
  CatalogMaintenanceApplyInput,
  CatalogReviewResolutionInput,
  PlatformCode
} from '../shared/contracts'

export const appApi = {
  menus: {
    list: () => ipcRenderer.invoke('menus:list'),
    save: (payload: unknown) => ipcRenderer.invoke('menus:save', payload),
    delete: (menuId: string) => ipcRenderer.invoke('menus:delete', menuId)
  },
  mappings: {
    list: () => ipcRenderer.invoke('mappings:list'),
    save: (payload: unknown) => ipcRenderer.invoke('mappings:save', payload),
    delete: (mappingId: string) => ipcRenderer.invoke('mappings:delete', mappingId)
  },
  platformOptionGroups: {
    list: () => ipcRenderer.invoke('platformOptionGroups:list')
  },
  logicalOptionGroups: {
    list: () => ipcRenderer.invoke('logicalOptionGroups:list')
  },
  platformMenus: {
    list: () => ipcRenderer.invoke('platformMenus:list')
  },
  platformSessions: {
    list: () => ipcRenderer.invoke('platformSessions:list'),
    check: (platformCode: PlatformCode) =>
      ipcRenderer.invoke('platformSessions:check', { platformCode }),
    connect: (platformCode: PlatformCode) =>
      ipcRenderer.invoke('platformSessions:connect', { platformCode }),
    resumeAfterUserAction: (platformCode: PlatformCode) =>
      ipcRenderer.invoke('platformSessions:resumeAfterUserAction', { platformCode })
  },
  platformAuthPreferences: {
    list: () => ipcRenderer.invoke('platformAuthPreferences:list'),
    setAutoClickConsent: (platformCode: PlatformCode, consented: boolean) =>
      ipcRenderer.invoke('platformAuthPreferences:setAutoClickConsent', {
        platformCode,
        consented
      })
  },
  platformImportRuns: {
    list: () => ipcRenderer.invoke('platformImportRuns:list')
  },
  platformImportChanges: {
    listLatest: (limit?: number) => ipcRenderer.invoke('platformImportChanges:listLatest', limit)
  },
  catalogWorkspace: {
    get: () => ipcRenderer.invoke('catalogWorkspace:get')
  },
  catalogBootstrap: {
    preview: (payload: CatalogBootstrapPreviewInput) =>
      ipcRenderer.invoke('catalogBootstrap:preview', payload),
    activate: (payload: CatalogBootstrapActivationInput) =>
      ipcRenderer.invoke('catalogBootstrap:activate', payload)
  },
  catalogReviews: {
    listOpen: () => ipcRenderer.invoke('catalogReviews:listOpen'),
    resolve: (payload: CatalogReviewResolutionInput) =>
      ipcRenderer.invoke('catalogReviews:resolve', payload)
  },
  catalogMaintenance: {
    preview: (referencePlatformCode: PlatformCode) =>
      ipcRenderer.invoke('catalogMaintenance:preview', { referencePlatformCode }),
    apply: (payload: CatalogMaintenanceApplyInput) =>
      ipcRenderer.invoke('catalogMaintenance:apply', payload)
  },
  agentReports: {
    getNextActionPlan: (filters?: unknown) =>
      ipcRenderer.invoke('agentReports:getNextActionPlan', filters)
  },
  browserInspectionSnapshots: {
    listLatest: (limit?: number) => ipcRenderer.invoke('browserInspectionSnapshots:listLatest', limit)
  },
  browserInspector: {
    getStatus: () => ipcRenderer.invoke('browserInspector:getStatus'),
    getManagedChromeSession: () => ipcRenderer.invoke('browserInspector:getManagedChromeSession'),
    captureManagedChromeTab: (payload: { tabId: string }) =>
      ipcRenderer.invoke('browserInspector:captureManagedChromeTab', payload),
    launchManagedChrome: (payload?: {
      url?: string
      platformCode?: PlatformCode
      autoLogin?: boolean
    }) =>
      ipcRenderer.invoke('browserInspector:launchManagedChrome', payload)
  },
  settings: {
    getPlatformCredentialStatus: () => ipcRenderer.invoke('settings:get-platform-credential-status'),
    listPlatformCredentials: () => ipcRenderer.invoke('settings:list-platform-credentials'),
    savePlatformCredential: (payload: { platformCode: string; username: string; password: string }) =>
      ipcRenderer.invoke('settings:save-platform-credential', payload),
    getLegacyPlatformCredentialStatus: (platformCode: PlatformCode) =>
      ipcRenderer.invoke('settings:get-legacy-platform-credential-status', { platformCode }),
    clearLegacyPlatformCredential: (platformCode: PlatformCode) =>
      ipcRenderer.invoke('settings:clear-legacy-platform-credential', { platformCode }),
    importPlatformMenus: (payload: { platformCode: string }) =>
      ipcRenderer.invoke('settings:import-platform-menus', payload)
  },
  syncRuns: {
    list: () => ipcRenderer.invoke('syncRuns:list')
  },
  sync: {
    preview: () => ipcRenderer.invoke('sync:preview'),
    run: () => ipcRenderer.invoke('sync:run'),
    runItems: (payload: unknown) => ipcRenderer.invoke('sync:run-items', payload)
  }
}

contextBridge.exposeInMainWorld('appApi', appApi)
