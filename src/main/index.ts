import { app, BrowserWindow, safeStorage } from 'electron'
import { join } from 'node:path'
import type { BrowserInspectionSnapshot, PlatformCode } from '../shared/contracts'
import { createConnection } from './db/connection'
import { migrate } from './db/migrations'
import { registerHandlers } from './ipc/register-handlers'
import { BrowserInspectionSnapshotRepository } from './repositories/browser-inspection-snapshot-repository'
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
import { CoupangEatsManagedBrowserUpdater } from './platforms/coupangeats/managed-browser-updater'
import { DdangyoAdapter } from './platforms/ddangyo/adapter'
import { CredentialVault } from './services/credential-vault'
import { BrowserInspectorBridge } from './services/browser-inspector-bridge'
import { createCatalogImportOrchestrator } from './services/catalog-import-orchestrator'
import { CliTaskRunner } from './services/cli-task-runner'
import { buildLogicalOptionGroups } from './services/logical-option-group-service'
import { ManagedChromeLauncher } from './services/managed-chrome-launcher'
import { ManagedChromeLoginAutomator } from './services/managed-chrome-login-automator'
import { ManagedChromeSessionProbe } from './services/managed-chrome-session-probe'
import { ManagedChromeSnapshotCapturer } from './services/managed-chrome-snapshot-capturer'
import { ManagedChromeScriptRunner } from './services/managed-chrome-script-runner'
import {
  EmbeddedFailureContextHandler,
  ManagedBrowserFailureContextHandler,
  SyncFailureContextCollector
} from './services/sync-failure-context'
import { SyncEngine } from './services/sync-engine'
import { SyncSuccessReconciler } from './services/sync-success-reconciler'
import { buildSyncPreview } from './services/sync-planner'

type PlatformCredential = NonNullable<ReturnType<CredentialVault['get']>>
type PlatformAdapterFactory = (credential: PlatformCredential) => BaeminAdapter | CoupangEatsAdapter | DdangyoAdapter

const APP_NAME = 'delivery-menu-sync'

app.setName(APP_NAME)

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

app.whenReady().then(async () => {
  const db = createConnection(join(app.getPath('userData'), 'delivery-menu-sync.db'))
  migrate(db)

  const menuRepository = new MenuRepository(db)
  const mappingRepository = new MappingRepository(db)
  const platformMenuRepository = new PlatformMenuRepository(db)
  const platformOptionGroupRepository = new PlatformOptionGroupRepository(db)
  const platformImportRunRepository = new PlatformImportRunRepository(db)
  const platformImportChangeRepository = new PlatformImportChangeRepository(db)
  const browserInspectionSnapshotRepository = new BrowserInspectionSnapshotRepository(db)
  const syncRunRepository = new SyncRunRepository(db)
  const syncRunItemRepository = new SyncRunItemRepository(db)
  const credentialVault = new CredentialVault(join(app.getPath('userData'), 'credentials.json'), safeStorage)
  const browserInspectorBridge = new BrowserInspectorBridge(browserInspectionSnapshotRepository, {
    extensionPath: join(process.cwd(), 'browser-extension', 'delivery-menu-inspector')
  })
  const managedChromeLauncher = new ManagedChromeLauncher({
    extensionPath: join(process.cwd(), 'browser-extension', 'delivery-menu-inspector'),
    profileDir: join(app.getPath('userData'), 'managed-chrome')
  })
  const managedChromeSessionProbe = new ManagedChromeSessionProbe()
  const managedChromeSnapshotCapturer = new ManagedChromeSnapshotCapturer()
  const managedChromeScriptRunner = new ManagedChromeScriptRunner()
  const managedChromeLoginAutomator = new ManagedChromeLoginAutomator({
    managedChromeSessionProbe,
    managedChromeScriptRunner
  })
  const coupangEatsManagedBrowserUpdater = new CoupangEatsManagedBrowserUpdater({
    managedChromeSessionProbe,
    managedChromeScriptRunner
  })
  const syncFailureContextCollector = new SyncFailureContextCollector([
    new EmbeddedFailureContextHandler(),
    new ManagedBrowserFailureContextHandler({
      platformCode: 'coupangeats',
      managedChromeSessionProbe,
      managedChromeSnapshotCapturer,
      browserInspectionSnapshotRepository
    })
  ])
  const adapterRegistry = new PlatformAdapterRegistry()
  const syncSuccessReconciler = new SyncSuccessReconciler({
    menuRepository,
    mappingRepository,
    platformMenuRepository,
    platformImportRunRepository,
    managedChromeSessionProvider: () => managedChromeSessionProbe.inspect()
  })
  const adapterFactories: Record<PlatformCode, PlatformAdapterFactory> = {
    baemin: (credential) => new BaeminAdapter(credential),
    coupangeats: (credential) =>
      new CoupangEatsAdapter(credential, 'https://store.coupangeats.com/', {
        captureManagedBrowserSnapshots: async () => {
          const session = await managedChromeSessionProbe.inspect()
          const tabs = session.tabs.filter(
            (tab) =>
              tab.platformCode === 'coupangeats' &&
              (tab.pageKind === 'menu_list' || tab.pageKind === 'option_list')
          )

          const snapshots: BrowserInspectionSnapshot[] = []

          for (const tab of tabs) {
            const snapshot = await managedChromeSnapshotCapturer.captureTab(tab.tabId)
            browserInspectionSnapshotRepository.save(snapshot)
            snapshots.push(snapshot)
          }

          return snapshots
        },
        applyManagedBrowserUpdate: (item) => coupangEatsManagedBrowserUpdater.applyMenuUpdate(item)
      }),
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
  }, syncFailureContextCollector, syncSuccessReconciler)
  const catalogImportOrchestrator = createCatalogImportOrchestrator({
    db,
    adapterRegistry,
    menuRepository,
    mappingRepository,
    platformMenuRepository,
    platformOptionGroupRepository,
    platformImportRunRepository,
    platformImportChangeRepository
  });
  (Object.keys(adapterFactories) as PlatformCode[]).forEach(registerPlatformAdapter)

  const getSyncPreview = async () =>
    buildSyncPreview({
      menus: menuRepository.list(),
      mappings: mappingRepository.listAll(),
      platformMenus: platformMenuRepository.listAll(),
      platformImportRuns: platformImportRunRepository.listLatest(50),
      managedChromeSession: await managedChromeSessionProbe.inspect()
    })

  const cliTaskRunner = new CliTaskRunner({
    getSyncPreview,
    syncEngine,
    platformMenuImporter: catalogImportOrchestrator,
    hasCredential: (platformCode) => Boolean(credentialVault.get(platformCode))
  })
  const cliTaskResult = await cliTaskRunner.run(process.argv.slice(2))

  if (cliTaskResult) {
    process.stdout.write(`${JSON.stringify(cliTaskResult.payload, null, 2)}\n`)
    app.exit(cliTaskResult.exitCode)
    return
  }

  void browserInspectorBridge.start().catch((error) => {
    console.error('Failed to start browser inspector bridge', error)
  })

  registerHandlers({
    menuRepository,
    mappingRepository,
    platformMenuRepository,
    platformOptionGroupRepository,
    platformImportRunRepository,
    platformImportChangeRepository,
    browserInspectionSnapshotRepository,
    browserInspectorBridge,
    managedChromeLauncher,
    managedChromeLoginAutomator,
    managedChromeSessionProbe,
    managedChromeSnapshotCapturer,
    logicalOptionGroupService: {
      list: () => buildLogicalOptionGroups(platformOptionGroupRepository.listAll())
    },
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

  app.on('before-quit', () => {
    void browserInspectorBridge.stop()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
