import type { BrowserInspectionSnapshot, SyncPreviewItem } from '../../../shared/contracts'
import type { PlatformAdapter } from '../base/types'
import { BrowserCatalogSnapshotAdapter } from '../browser-catalog/snapshot-adapter'
import {
  isNaverOrderFullMenuCollectionEvent,
  isNaverOrderFullOptionCollectionEvent
} from './parser'

interface NaverOrderAdapterOptions {
  captureManagedBrowserSnapshots?: () => Promise<BrowserInspectionSnapshot[]>
}

export class NaverOrderAdapter implements PlatformAdapter {
  readonly platformCode = 'naverorder' as const
  readonly capabilities = { optionCatalog: true } as const
  private readonly delegate: BrowserCatalogSnapshotAdapter

  constructor(
    _credentials: { username: string; password: string },
    options: NaverOrderAdapterOptions = {}
  ) {
    this.delegate = new BrowserCatalogSnapshotAdapter({
      platformCode: this.platformCode,
      captureSnapshots: options.captureManagedBrowserSnapshots ?? (async () => []),
      isFullMenuCollectionEvent: isNaverOrderFullMenuCollectionEvent,
      isFullOptionCollectionEvent: isNaverOrderFullOptionCollectionEvent
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
