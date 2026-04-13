import { app, BrowserWindow, safeStorage } from 'electron'
import { join } from 'node:path'
import type { PlatformCode } from '../shared/contracts'
import { createConnection } from './db/connection'
import { migrate } from './db/migrations'
import { registerHandlers } from './ipc/register-handlers'
import { MappingRepository } from './repositories/mapping-repository'
import { MenuRepository } from './repositories/menu-repository'
import { PlatformImportChangeRepository } from './repositories/platform-import-change-repository'
import { PlatformImportRunRepository } from './repositories/platform-import-run-repository'
import { PlatformMenuRepository } from './repositories/platform-menu-repository'
import { PlatformOptionGroupRepository } from './repositories/platform-option-group-repository'
import { SyncRunItemRepository } from './repositories/sync-run-item-repository'
import { SyncRunRepository } from './repositories/sync-run-repository'
import { PlatformAdapterRegistry } from './platforms/base/registry'
import { BaeminAdapter } from './platforms/baemin/adapter'
import { CoupangEatsAdapter } from './platforms/coupangeats/adapter'
import { DdangyoAdapter } from './platforms/ddangyo/adapter'
import { CredentialVault } from './services/credential-vault'
import { createCatalogImportOrchestrator } from './services/catalog-import-orchestrator'
import { SyncEngine } from './services/sync-engine'

type PlatformCredential = NonNullable<ReturnType<CredentialVault['get']>>
type PlatformAdapterFactory = (credential: PlatformCredential) => BaeminAdapter | CoupangEatsAdapter | DdangyoAdapter

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
  const platformMenuRepository = new PlatformMenuRepository(db)
  const platformOptionGroupRepository = new PlatformOptionGroupRepository(db)
  const platformImportRunRepository = new PlatformImportRunRepository(db)
  const platformImportChangeRepository = new PlatformImportChangeRepository(db)
  const syncRunRepository = new SyncRunRepository(db)
  const syncRunItemRepository = new SyncRunItemRepository(db)
  const credentialVault = new CredentialVault(join(app.getPath('userData'), 'credentials.json'), safeStorage)
  const adapterRegistry = new PlatformAdapterRegistry()
  const adapterFactories: Record<PlatformCode, PlatformAdapterFactory> = {
    baemin: (credential) => new BaeminAdapter(credential),
    coupangeats: (credential) => new CoupangEatsAdapter(credential),
    ddangyo: (credential) => new DdangyoAdapter(credential)
  }

  const registerPlatformAdapter = (platformCode: PlatformCode) => {
    const credential = credentialVault.get(platformCode)
    if (!credential) {
      return
    }

    adapterRegistry.register(platformCode, adapterFactories[platformCode](credential))
  }

  const syncEngine = new SyncEngine(adapterRegistry, {
    create: (record) => syncRunRepository.create(record),
    finish: (record) => syncRunRepository.update(record),
    addItem: (record) => syncRunItemRepository.addItem(record)
  })
  // @ts-expect-error -- TS resolves the factory call as the concrete class symbol here.
  const catalogImportOrchestrator = createCatalogImportOrchestrator({
    db,
    adapterRegistry,
    menuRepository,
    mappingRepository,
    platformMenuRepository,
    platformOptionGroupRepository,
    platformImportRunRepository,
    platformImportChangeRepository
  })
  (Object.keys(adapterFactories) as PlatformCode[]).forEach(registerPlatformAdapter)

  registerHandlers({
    menuRepository,
    mappingRepository,
    platformMenuRepository,
    platformOptionGroupRepository,
    syncRunRepository,
    syncRunItemRepository,
    credentialVault,
    platformMenuImporter: catalogImportOrchestrator,
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
