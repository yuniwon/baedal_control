import type { BrowserInspectionSnapshot, SyncPreviewItem } from '../../../shared/contracts'
import type { PlatformAdapter } from '../base/types'
import { BrowserCatalogSnapshotAdapter } from '../browser-catalog/snapshot-adapter'
import {
  isDeliverySpecialFullMenuCollectionEvent,
  isDeliverySpecialFullOptionCollectionEvent
} from './parser'

interface DeliverySpecialAdapterOptions {
  captureManagedBrowserSnapshots?: () => Promise<BrowserInspectionSnapshot[]>
}

export class DeliverySpecialAdapter implements PlatformAdapter {
  readonly platformCode = 'deliveryspecial' as const
  readonly capabilities = { optionCatalog: true } as const
  private readonly delegate: BrowserCatalogSnapshotAdapter

  constructor(
    _credentials: { username: string; password: string },
    options: DeliverySpecialAdapterOptions = {}
  ) {
    this.delegate = new BrowserCatalogSnapshotAdapter({
      platformCode: this.platformCode,
      captureSnapshots: options.captureManagedBrowserSnapshots ?? (async () => []),
      isFullMenuCollectionEvent: isDeliverySpecialFullMenuCollectionEvent,
      isFullOptionCollectionEvent: isDeliverySpecialFullOptionCollectionEvent
    })
  }

  fetchMenus() {
    return this.delegate.fetchMenus()
  }

  fetchMenusWithInspection() {
    return this.delegate.fetchMenusWithInspection()
  }

  applyMenuUpdate(item: SyncPreviewItem) {
    return this.delegate.applyMenuUpdate(item)
  }
}
