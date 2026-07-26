import { describe, expect, it } from 'vitest'

import type { BrowserInspectionSnapshot } from '../../../src/shared/contracts'
import { ExtensionSessionBroker } from '../../../src/main/services/extension-session-broker'

const capturedAt = '2026-07-26T01:58:00.000Z'

const snapshot = (
  overrides: Partial<BrowserInspectionSnapshot> = {}
): BrowserInspectionSnapshot => ({
  snapshotId: 'extension-session-1',
  platformCode: 'coupangeats',
  source: 'browser_extension',
  pageUrl: 'https://store.coupangeats.com/merchant/menu',
  pageTitle: '메뉴 관리',
  pageKind: 'menu_list',
  captureMode: 'viewport',
  host: 'store.coupangeats.com',
  capturedAt,
  textSnippet: null,
  menuNames: [],
  menuItems: [],
  optionGroupNames: [],
  buttonLabels: [],
  inputHints: [],
  fields: [],
  apiEvents: [],
  screenshotDataUrl: null,
  visiblePasswordInputCount: 0,
  loginMarkerDetected: false,
  logoutMarkerDetected: true,
  managementMarkerDetected: true,
  ...overrides
})

describe('ExtensionSessionBroker', () => {
  const broker = new ExtensionSessionBroker({
    now: () => new Date('2026-07-26T02:00:00.000Z')
  })

  it('accepts a recent management page without visible password fields', () => {
    expect(broker.probe('coupangeats', snapshot())).toEqual({
      state: 'ready',
      detailCode: 'extension_session_ready'
    })
  })

  it('marks a recent login page as expired', () => {
    expect(
      broker.probe(
        'coupangeats',
        snapshot({
          pageUrl: 'https://store.coupangeats.com/merchant/login',
          visiblePasswordInputCount: 1,
          loginMarkerDetected: true,
          logoutMarkerDetected: false,
          managementMarkerDetected: false
        })
      )
    ).toEqual({ state: 'expired', detailCode: 'extension_login_page' })
  })

  it('does not trust stale or cross-platform evidence', () => {
    expect(
      broker.probe(
        'coupangeats',
        snapshot({ capturedAt: '2026-07-26T01:54:59.999Z' })
      )
    ).toEqual({ state: 'unknown', detailCode: 'extension_snapshot_stale' })

    expect(broker.probe('baemin', snapshot())).toEqual({
      state: 'unknown',
      detailCode: 'extension_host_mismatch'
    })
  })

  it('does not trust a snapshot without explicit authenticated markers', () => {
    expect(
      broker.probe(
        'coupangeats',
        snapshot({
          logoutMarkerDetected: false,
          managementMarkerDetected: false
        })
      )
    ).toEqual({ state: 'unknown', detailCode: 'extension_auth_evidence_missing' })
  })
})
