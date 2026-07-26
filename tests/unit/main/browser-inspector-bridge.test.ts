import { describe, expect, it } from 'vitest'

import { browserInspectionSnapshotSchema } from '../../../src/main/services/browser-inspector-bridge'

describe('browser inspection snapshot schema', () => {
  it.each(['yogiyo', 'deliveryspecial', 'naverorder'] as const)(
    'accepts %s browser snapshots',
    (platformCode) => {
      expect(
        browserInspectionSnapshotSchema.parse({
          snapshotId: `${platformCode}-snapshot`,
          platformCode,
          source: 'manual_browser',
          pageUrl: 'https://example.com/menu',
          pageTitle: '메뉴 관리',
          pageKind: 'menu_list',
          captureMode: 'full_scroll',
          host: 'example.com',
          capturedAt: '2026-07-21T00:00:00.000Z',
          menuNames: [],
          menuItems: [],
          optionGroupNames: [],
          buttonLabels: [],
          inputHints: [],
          fields: [],
          apiEvents: [],
          visiblePasswordInputCount: 0,
          loginMarkerDetected: false,
          logoutMarkerDetected: true,
          managementMarkerDetected: true
        })
      ).toMatchObject({
        platformCode,
        visiblePasswordInputCount: 0,
        loginMarkerDetected: false,
        logoutMarkerDetected: true,
        managementMarkerDetected: true
      })
    }
  )

  it('defaults missing auth evidence to a non-authenticated snapshot', () => {
    expect(
      browserInspectionSnapshotSchema.parse({
        snapshotId: 'legacy-snapshot',
        platformCode: 'baemin',
        source: 'browser_extension',
        pageUrl: 'https://self.baemin.com/menu',
        pageTitle: '메뉴 관리',
        host: 'self.baemin.com',
        capturedAt: '2026-07-21T00:00:00.000Z',
        menuNames: [],
        optionGroupNames: [],
        buttonLabels: [],
        inputHints: [],
        fields: [],
        apiEvents: []
      })
    ).toMatchObject({
      visiblePasswordInputCount: 0,
      loginMarkerDetected: false,
      logoutMarkerDetected: false,
      managementMarkerDetected: false
    })
  })
})
