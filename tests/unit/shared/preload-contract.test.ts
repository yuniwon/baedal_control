import { describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: electronMock.exposeInMainWorld
  },
  ipcRenderer: {
    invoke: electronMock.invoke
  }
}))

import { appApi } from '../../../src/main/preload'
import { appApiKeys } from '../../../src/shared/contracts'

describe('preload contract', () => {
  it('declares browser inspection APIs in the shared contract', () => {
    expect(appApiKeys).toEqual([
      'menus',
      'mappings',
      'platformOptionGroups',
      'logicalOptionGroups',
      'platformMenus',
      'platformSessions',
      'platformAuthPreferences',
      'platformImportRuns',
      'platformImportChanges',
      'catalogWorkspace',
      'catalogBootstrap',
      'catalogReviews',
      'catalogMaintenance',
      'catalogPublication',
      'agentReports',
      'browserInspectionSnapshots',
      'browserInspector',
      'settings',
      'syncRuns',
      'sync'
    ])
  })

  it('exposes the expected renderer API keys', () => {
    expect(Object.keys(appApi)).toEqual(appApiKeys)
  })

  it('exposes only the guided catalog workspace methods', async () => {
    expect(Object.keys(appApi.catalogWorkspace)).toEqual(['get'])
    expect(Object.keys(appApi.catalogBootstrap)).toEqual(['preview', 'activate'])
    expect(Object.keys(appApi.catalogReviews)).toEqual(['listOpen', 'link', 'mergeCanonical', 'resolve'])
    expect(Object.keys(appApi.catalogMaintenance)).toEqual(['preview', 'apply', 'projectionPreview'])
    expect(Object.keys(appApi.catalogPublication)).toEqual(['preview', 'setTargets'])

    await appApi.catalogWorkspace.get()
    await appApi.catalogBootstrap.preview({
      workspaceId: 'default',
      seedMode: 'blank',
      seedPlatformCode: null
    })
    await appApi.catalogBootstrap.activate({
      workspaceId: 'default',
      seedMode: 'blank',
      seedPlatformCode: null,
      previewFingerprint: 'fingerprint',
      menus: [],
      ignoredSourceEntityIds: [],
      confirmedMappings: [],
      remainingReviewItems: []
    })
    await appApi.catalogReviews.listOpen()
    await appApi.catalogReviews.resolve({
      reviewItemIds: ['review-1'],
      resolution: 'defer',
      remember: false,
      scope: 'entity',
      reason: '나중에 확인'
    })

    expect(electronMock.invoke.mock.calls.slice(-5)).toEqual([
      ['catalogWorkspace:get'],
      ['catalogBootstrap:preview', {
        workspaceId: 'default',
        seedMode: 'blank',
        seedPlatformCode: null
      }],
      ['catalogBootstrap:activate', {
        workspaceId: 'default',
        seedMode: 'blank',
        seedPlatformCode: null,
        previewFingerprint: 'fingerprint',
        menus: [],
        ignoredSourceEntityIds: [],
        confirmedMappings: [],
        remainingReviewItems: []
      }],
      ['catalogReviews:listOpen'],
      ['catalogReviews:resolve', {
        reviewItemIds: ['review-1'],
        resolution: 'defer',
        remember: false,
        scope: 'entity',
        reason: '나중에 확인'
      }]
    ])
  })

  it('exposes the bounded platform session actions', async () => {
    expect(Object.keys(appApi.platformSessions)).toEqual([
      'list',
      'check',
      'connect',
      'resumeAfterUserAction'
    ])

    await appApi.platformSessions.list()
    await appApi.platformSessions.check('baemin')
    await appApi.platformSessions.connect('baemin')
    await appApi.platformSessions.resumeAfterUserAction('baemin')

    expect(electronMock.invoke.mock.calls.slice(-4)).toEqual([
      ['platformSessions:list'],
      ['platformSessions:check', { platformCode: 'baemin' }],
      ['platformSessions:connect', { platformCode: 'baemin' }],
      ['platformSessions:resumeAfterUserAction', { platformCode: 'baemin' }]
    ])
  })

  it('exposes explicit platform auth preference and legacy cleanup actions', async () => {
    expect(Object.keys(appApi.platformAuthPreferences)).toEqual([
      'list',
      'setAutoClickConsent'
    ])

    await appApi.platformAuthPreferences.list()
    await appApi.platformAuthPreferences.setAutoClickConsent('coupangeats', true)
    await appApi.settings.getLegacyPlatformCredentialStatus('coupangeats')
    await appApi.settings.clearLegacyPlatformCredential('coupangeats')

    expect(electronMock.invoke.mock.calls.slice(-4)).toEqual([
      ['platformAuthPreferences:list'],
      ['platformAuthPreferences:setAutoClickConsent', {
        platformCode: 'coupangeats',
        consented: true
      }],
      ['settings:get-legacy-platform-credential-status', { platformCode: 'coupangeats' }],
      ['settings:clear-legacy-platform-credential', { platformCode: 'coupangeats' }]
    ])
  })
})
