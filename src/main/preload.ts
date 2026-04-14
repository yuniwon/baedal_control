import { contextBridge, ipcRenderer } from 'electron'

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
  platformImportRuns: {
    list: () => ipcRenderer.invoke('platformImportRuns:list')
  },
  platformImportChanges: {
    listLatest: (limit?: number) => ipcRenderer.invoke('platformImportChanges:listLatest', limit)
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
      platformCode?: 'baemin' | 'coupangeats' | 'ddangyo'
      autoLogin?: boolean
    }) =>
      ipcRenderer.invoke('browserInspector:launchManagedChrome', payload)
  },
  settings: {
    getPlatformCredentialStatus: () => ipcRenderer.invoke('settings:get-platform-credential-status'),
    listPlatformCredentials: () => ipcRenderer.invoke('settings:list-platform-credentials'),
    savePlatformCredential: (payload: { platformCode: string; username: string; password: string }) =>
      ipcRenderer.invoke('settings:save-platform-credential', payload),
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
