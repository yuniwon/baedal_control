import { contextBridge } from 'electron'

const appApi = {
  menus: {},
  mappings: {},
  settings: {},
  syncRuns: {},
  sync: {}
}

contextBridge.exposeInMainWorld('appApi', appApi)
