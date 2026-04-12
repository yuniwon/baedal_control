import { contextBridge, ipcRenderer } from 'electron'

const appApi = {
  menus: {
    list: () => ipcRenderer.invoke('menus:list'),
    save: (payload: unknown) => ipcRenderer.invoke('menus:save', payload)
  },
  mappings: {
    list: () => ipcRenderer.invoke('mappings:list'),
    save: (payload: unknown) => ipcRenderer.invoke('mappings:save', payload)
  },
  settings: {
    getPlatformCredentialStatus: () => ipcRenderer.invoke('settings:get-platform-credential-status'),
    listPlatformCredentials: () => ipcRenderer.invoke('settings:list-platform-credentials'),
    savePlatformCredential: (payload: { platformCode: string; username: string; password: string }) =>
      ipcRenderer.invoke('settings:save-platform-credential', payload)
  },
  syncRuns: {
    list: () => ipcRenderer.invoke('syncRuns:list')
  },
  sync: {
    preview: () => ipcRenderer.invoke('sync:preview'),
    run: () => ipcRenderer.invoke('sync:run')
  }
}

contextBridge.exposeInMainWorld('appApi', appApi)
