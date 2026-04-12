import { app, BrowserWindow, safeStorage } from 'electron'
import { join } from 'node:path'
import type { PlatformCode } from '../shared/contracts'
import { createConnection } from './db/connection'
import { migrate } from './db/migrations'
import { registerHandlers } from './ipc/register-handlers'
import { MappingRepository } from './repositories/mapping-repository'
import { MenuRepository } from './repositories/menu-repository'
import { SyncRunItemRepository } from './repositories/sync-run-item-repository'
import { SyncRunRepository } from './repositories/sync-run-repository'
import { PlatformAdapterRegistry } from './platforms/base/registry'
import { BaeminAdapter } from './platforms/baemin/adapter'
import { CoupangEatsAdapter } from './platforms/coupangeats/adapter'
import { DdangyoAdapter } from './platforms/ddangyo/adapter'
import { CredentialVault } from './services/credential-vault'
import { PlatformMenuImporter } from './services/platform-menu-importer'
import { SyncEngine } from './services/sync-engine'

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const db = createConnection(join(app.getPath('userData'), 'delivery-menu-sync.db'))
  migrate(db)

  const menuRepository = new MenuRepository(db)
  const mappingRepository = new MappingRepository(db)
  const syncRunRepository = new SyncRunRepository(db)
  const syncRunItemRepository = new SyncRunItemRepository(db)
  const credentialVault = new CredentialVault(join(app.getPath('userData'), 'credentials.json'), safeStorage)
  const adapterRegistry = new PlatformAdapterRegistry()

  const registerPlatformAdapter = (platformCode: PlatformCode) => {
    const credential = credentialVault.get(platformCode)
    if (!credential) {
      return
    }

    if (platformCode === 'baemin') {
      adapterRegistry.register(platformCode, new BaeminAdapter(credential))
      return
    }

    if (platformCode === 'coupangeats') {
      adapterRegistry.register(platformCode, new CoupangEatsAdapter(credential))
      return
    }

    adapterRegistry.register(platformCode, new DdangyoAdapter(credential))
  }

  const syncEngine = new SyncEngine(adapterRegistry, {
    create: (record) => syncRunRepository.create(record),
    finish: (record) => syncRunRepository.update(record),
    addItem: (record) => syncRunItemRepository.addItem(record)
  })
  const platformMenuImporter = new PlatformMenuImporter(
    menuRepository,
    mappingRepository,
    adapterRegistry
  )

  ;(['baemin', 'coupangeats', 'ddangyo'] as const).forEach(registerPlatformAdapter)

  registerHandlers({
    menuRepository,
    mappingRepository,
    syncRunRepository,
    credentialVault,
    platformMenuImporter,
    syncEngine,
    onCredentialSaved: registerPlatformAdapter
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
