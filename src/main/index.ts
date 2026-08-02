import { app, BrowserWindow, safeStorage } from 'electron'
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserInspectionSnapshot, PlatformCode } from '../shared/contracts'
import { createConnection } from './db/connection'
import { migrate } from './db/migrations'
import { registerHandlers } from './ipc/register-handlers'
import { BrowserInspectionSnapshotRepository } from './repositories/browser-inspection-snapshot-repository'
import { CatalogWorkspaceRepository } from './repositories/catalog-workspace-repository'
import { CatalogReviewRepository } from './repositories/catalog-review-repository'
import { CatalogIntentRuleRepository } from './repositories/catalog-intent-rule-repository'
import { MappingRepository } from './repositories/mapping-repository'
import { MenuRepository } from './repositories/menu-repository'
import { PlatformImportChangeRepository } from './repositories/platform-import-change-repository'
import { PlatformImportRunRepository } from './repositories/platform-import-run-repository'
import { PlatformAuthPreferenceRepository } from './repositories/platform-auth-preference-repository'
import { PlatformLoginClickAttemptRepository } from './repositories/platform-login-click-attempt-repository'
import { PlatformSessionStateRepository } from './repositories/platform-session-state-repository'
import { PlatformMenuRepository } from './repositories/platform-menu-repository'
import { PlatformOptionGroupRepository } from './repositories/platform-option-group-repository'
import { SyncRunItemRepository } from './repositories/sync-run-item-repository'
import { SyncRunRepository } from './repositories/sync-run-repository'
import { PlatformAdapterRegistry } from './platforms/base/registry'
import { PlatformPluginRegistry } from './platforms/base/plugin-registry'
import { createLegacyAdapterPlugin } from './platforms/base/legacy-adapter-plugin'
import type { PlatformAdapter } from './platforms/base/types'
import { BaeminAdapter } from './platforms/baemin/adapter'
import { CoupangEatsAdapter } from './platforms/coupangeats/adapter'
import { CoupangEatsManagedBrowserUpdater } from './platforms/coupangeats/managed-browser-updater'
import { coupangEatsPasswordManagerLoginDescriptor } from './platforms/coupangeats/password-manager-login-descriptor'
import { DdangyoAdapter } from './platforms/ddangyo/adapter'
import { DdangyoManagedCatalogReader } from './platforms/ddangyo/managed-catalog'
import { DeliverySpecialAdapter } from './platforms/deliveryspecial/adapter'
import { NaverOrderAdapter } from './platforms/naverorder/adapter'
import { YogiyoAdapter } from './platforms/yogiyo/adapter'
import { CredentialVault } from './services/credential-vault'
import { AuthAttemptGuard } from './services/auth-attempt-guard'
import { BrowserPlatformAuthDriver } from './services/browser-platform-auth-driver'
import { BrowserInspectorBridge } from './services/browser-inspector-bridge'
import { createCatalogImportOrchestrator } from './services/catalog-import-orchestrator'
import { CatalogBootstrapService } from './services/catalog-bootstrap-service'
import { CatalogMaintenanceService } from './services/catalog-maintenance-service'
import { CatalogProjectionService } from './services/catalog-projection-service'
import { analyzeCatalogExceptions } from './services/catalog-exception-analyzer'
import { applyIntentRules } from './services/catalog-intent-policy'
import { AgentOperationsReportService } from './services/agent-operations-report-service'
import { CliTaskRunner } from './services/cli-task-runner'
import { buildLogicalOptionGroups } from './services/logical-option-group-service'
import { ManagedChromeLauncher } from './services/managed-chrome-launcher'
import { ManagedChromeLoginAutomator } from './services/managed-chrome-login-automator'
import { ManagedChromeLoginPageProbe } from './services/managed-chrome-login-page-probe'
import { ManagedChromeSessionProbe } from './services/managed-chrome-session-probe'
import { ManagedChromeSnapshotCapturer } from './services/managed-chrome-snapshot-capturer'
import { ManagedChromeScriptRunner } from './services/managed-chrome-script-runner'
import { ManagedChromeAuthEvidenceProbe } from './services/managed-chrome-auth-evidence-probe'
import { ManagedPasswordManagerLoginCoordinator } from './services/managed-password-manager-login-coordinator'
import { ExtensionSessionBroker } from './services/extension-session-broker'
import { PlatformSessionOrchestrator } from './services/platform-session-orchestrator'
import {
  requiresApplicationCredential,
  selectManagedCatalogCaptureTabs
} from './services/platform-session-strategy'
import {
  EmbeddedFailureContextHandler,
  ManagedBrowserFailureContextHandler,
  SyncFailureContextCollector
} from './services/sync-failure-context'
import { SyncEngine } from './services/sync-engine'
import { SyncSuccessReconciler } from './services/sync-success-reconciler'
import { buildSyncPreview } from './services/sync-planner'
import { PLATFORM_CAPABILITIES } from '../shared/platform-capabilities'
import { PLATFORM_METADATA } from '../shared/platforms'

type PlatformCredential = NonNullable<ReturnType<CredentialVault['get']>>
type PlatformAdapterFactory = (credential: PlatformCredential) => PlatformAdapter

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
  const databasePath = join(app.getPath('userData'), 'delivery-menu-sync.db')
  const db = createConnection(databasePath)
  migrate(db)

  const menuRepository = new MenuRepository(db)
  const mappingRepository = new MappingRepository(db)
  const platformMenuRepository = new PlatformMenuRepository(db)
  const platformOptionGroupRepository = new PlatformOptionGroupRepository(db)
  const platformImportRunRepository = new PlatformImportRunRepository(db)
  const platformImportChangeRepository = new PlatformImportChangeRepository(db)
  const catalogWorkspaceRepository = new CatalogWorkspaceRepository(db)
  const catalogReviewRepository = new CatalogReviewRepository(db)
  const catalogIntentRuleRepository = new CatalogIntentRuleRepository(db)
  const browserInspectionSnapshotRepository = new BrowserInspectionSnapshotRepository(db)
  const platformSessionStateRepository = new PlatformSessionStateRepository(db)
  const platformAuthPreferenceRepository = new PlatformAuthPreferenceRepository(db)
  const platformLoginClickAttemptRepository = new PlatformLoginClickAttemptRepository(db)
  const syncRunRepository = new SyncRunRepository(db)
  const syncRunItemRepository = new SyncRunItemRepository(db)
  const credentialVault = new CredentialVault(join(app.getPath('userData'), 'credentials.json'), safeStorage)
  const refreshCatalogReviews = () => {
    const workspaceId = 'default'
    const workspace = catalogWorkspaceRepository.getDefault()
    const generatedItems = analyzeCatalogExceptions({
      workspaceId,
      referencePlatformCode: workspace.seedMode === 'platform'
        ? workspace.seedPlatformCode
        : null,
      menus: menuRepository.list(),
      platformMenus: platformMenuRepository.listAll(),
      mappings: mappingRepository.listAll(),
      logicalOptionGroups: buildLogicalOptionGroups(platformOptionGroupRepository.listAll())
    })
    catalogReviewRepository.replaceOpen(
      workspaceId,
      applyIntentRules(generatedItems, catalogIntentRuleRepository.listActive(workspaceId))
    )
  }
  const catalogMaintenanceService = new CatalogMaintenanceService({
    db,
    backupDatabase: () => {
      db.exec('pragma wal_checkpoint(full)')
      const backupDirectory = join(app.getPath('userData'), 'backups')
      mkdirSync(backupDirectory, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = join(backupDirectory, `delivery-menu-sync-${timestamp}.db`)
      copyFileSync(databasePath, backupPath)
      return backupPath
    },
    refreshReviews: refreshCatalogReviews
  })
  const catalogProjectionService = new CatalogProjectionService({
    menuRepository,
    mappingRepository,
    platformMenuRepository,
    platformOptionGroupRepository
  })
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
  const managedChromeLoginPageProbe = new ManagedChromeLoginPageProbe(
    managedChromeScriptRunner
  )
  const managedPasswordManagerLoginCoordinator = new ManagedPasswordManagerLoginCoordinator({
    descriptors: {
      coupangeats: coupangEatsPasswordManagerLoginDescriptor
    },
    preferences: platformAuthPreferenceRepository,
    clickAttempts: platformLoginClickAttemptRepository,
    managedChromeLauncher,
    managedChromeSessionProbe,
    loginPageProbe: managedChromeLoginPageProbe,
    scriptRunner: managedChromeScriptRunner
  })
  const managedChromeAuthEvidenceProbe = new ManagedChromeAuthEvidenceProbe(
    managedChromeScriptRunner
  )
  const ddangyoManagedCatalogReader = new DdangyoManagedCatalogReader(
    managedChromeSessionProbe,
    managedChromeScriptRunner
  )
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
  const pluginRegistry = new PlatformPluginRegistry()
  const extensionSessionBroker = new ExtensionSessionBroker()
  const captureManagedBrowserSnapshots = async (platformCode: PlatformCode) => {
    const session = await managedChromeSessionProbe.inspect()
    const tabs = selectManagedCatalogCaptureTabs(
      platformCode,
      session.tabs.filter((tab) => tab.platformCode === platformCode)
    )
    const snapshots: BrowserInspectionSnapshot[] = []

    for (const tab of tabs) {
      const snapshot = await managedChromeSnapshotCapturer.captureTab(tab.tabId)
      browserInspectionSnapshotRepository.save(snapshot)
      snapshots.push(snapshot)
    }

    return snapshots
  }
  const syncSuccessReconciler = new SyncSuccessReconciler({
    menuRepository,
    mappingRepository,
    platformMenuRepository,
    platformImportRunRepository,
    managedChromeSessionProvider: () => managedChromeSessionProbe.inspect()
  })
  const adapterFactories: Partial<Record<PlatformCode, PlatformAdapterFactory>> = {
    baemin: (credential) => new BaeminAdapter(credential),
    coupangeats: (credential) =>
      new CoupangEatsAdapter(credential, 'https://store.coupangeats.com/', {
        captureManagedBrowserSnapshots: () => captureManagedBrowserSnapshots('coupangeats'),
        applyManagedBrowserUpdate: (item) => coupangEatsManagedBrowserUpdater.applyMenuUpdate(item)
      }),
    ddangyo: (credential) =>
      new DdangyoAdapter(credential, undefined, {
        readManagedBrowserCatalog: () => ddangyoManagedCatalogReader.readCatalog()
      }),
    yogiyo: (credential) =>
      new YogiyoAdapter(credential, {
        captureManagedBrowserSnapshots: () => captureManagedBrowserSnapshots('yogiyo')
      }),
    deliveryspecial: (credential) =>
      new DeliverySpecialAdapter(credential, {
        captureManagedBrowserSnapshots: () => captureManagedBrowserSnapshots('deliveryspecial')
      }),
    naverorder: (credential) =>
      new NaverOrderAdapter(credential, {
        captureManagedBrowserSnapshots: () => captureManagedBrowserSnapshots('naverorder')
      })
  }

  const registeredPluginCodes = new Set<PlatformCode>()

  const registerPlatformAdapter = (platformCode: PlatformCode) => {
    const factory = adapterFactories[platformCode]
    if (!factory) {
      return
    }

    const strategies = PLATFORM_CAPABILITIES[platformCode].authentication.strategies
    const credential = requiresApplicationCredential(strategies)
      ? credentialVault.get(platformCode) ?? { username: '', password: '' }
      : { username: '', password: '' }
    const adapter = factory(credential)
    const auth = new BrowserPlatformAuthDriver({
      platformCode,
      metadata: PLATFORM_METADATA[platformCode],
      capabilities: PLATFORM_CAPABILITIES[platformCode],
      managedChromeSessionProbe,
      managedChromeAuthEvidenceProbe,
      browserInspectionSnapshots: browserInspectionSnapshotRepository,
      extensionSessionBroker,
      managedChromeLoginAutomator,
      managedChromeLauncher,
      managedPasswordManagerLoginCoordinator
    })
    const plugin = createLegacyAdapterPlugin(
      adapter,
      { code: platformCode, ...PLATFORM_METADATA[platformCode] },
      PLATFORM_CAPABILITIES[platformCode],
      auth
    )

    adapterRegistry.register(platformCode, adapter)
    if (registeredPluginCodes.has(platformCode)) {
      pluginRegistry.replace(plugin)
    } else {
      pluginRegistry.register(plugin)
      registeredPluginCodes.add(platformCode)
    }
  }

  const syncEngine = new SyncEngine(pluginRegistry, {
    create: (record) => syncRunRepository.create(record),
    finish: (record) => syncRunRepository.update(record),
    addItem: (record) => syncRunItemRepository.addItem(record)
  }, syncFailureContextCollector, syncSuccessReconciler)
  const catalogImportOrchestrator = createCatalogImportOrchestrator({
    db,
    adapterRegistry: pluginRegistry,
    menuRepository,
    mappingRepository,
    platformMenuRepository,
    platformOptionGroupRepository,
    platformImportRunRepository,
    platformImportChangeRepository,
    catalogWorkspaceRepository,
    catalogReviewRepository,
    catalogIntentRuleRepository
  });
  const platformSessionOrchestrator = new PlatformSessionOrchestrator({
    plugins: pluginRegistry,
    states: platformSessionStateRepository,
    credentialVault,
    attemptGuard: new AuthAttemptGuard(platformSessionStateRepository),
    passwordManagerLoginCoordinator: managedPasswordManagerLoginCoordinator
  })
  const catalogBootstrapService = new CatalogBootstrapService({
    db,
    menuRepository,
    mappingRepository,
    platformMenuRepository,
    platformImportRunRepository,
    workspaceRepository: catalogWorkspaceRepository,
    reviewRepository: catalogReviewRepository
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

  const agentOperationsReportService = new AgentOperationsReportService({
    menuRepository,
    mappingRepository,
    platformMenuRepository,
    platformOptionGroupRepository,
    platformImportRunRepository,
    platformImportChangeRepository,
    syncRunRepository,
    syncRunItemRepository,
    getSyncPreview,
    getManagedChromeSession: () => managedChromeSessionProbe.inspect(),
    buildLogicalOptionGroups
  })

  const cliTaskRunner = new CliTaskRunner({
    getSyncPreview,
    agentOperationsReportService,
    syncEngine,
    platformMenuImporter: catalogImportOrchestrator,
    platformSessionOrchestrator,
    platformFlowInspector: {
      inspectCreateMenuFlow: async (platformCode) => {
        const adapter = adapterRegistry.get(platformCode)
        if (!adapter.inspectCreateMenuFlow) {
          throw new Error(`platform_create_menu_flow_inspection_unavailable:${platformCode}`)
        }

        return adapter.inspectCreateMenuFlow()
      }
    },
    hasCredential: (platformCode) => Boolean(credentialVault.get(platformCode)),
    requiresApplicationCredential: (platformCode) =>
      requiresApplicationCredential(
        PLATFORM_CAPABILITIES[platformCode].authentication.strategies
      )
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
    agentOperationsReportService,
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
    platformSessionOrchestrator,
    platformAuthPreferenceRepository,
    platformMenuImporter: catalogImportOrchestrator,
    catalogWorkspaceRepository,
    catalogBootstrapService,
    catalogReviewRepository,
    catalogIntentRuleRepository,
    catalogMaintenanceService,
    catalogProjectionService,
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
