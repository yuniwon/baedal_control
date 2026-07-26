import type { BrowserInspectionSnapshot, SyncPreviewItem } from '../../../shared/contracts'
import type { PlatformAdapter } from '../base/types'
import { BrowserCatalogSnapshotAdapter } from '../browser-catalog/snapshot-adapter'
import {
  isYogiyoFullMenuCollectionEvent,
  isYogiyoFullOptionCollectionEvent
} from './parser'

interface YogiyoAdapterOptions {
  captureManagedBrowserSnapshots?: () => Promise<BrowserInspectionSnapshot[]>
}

export class YogiyoAdapter implements PlatformAdapter {
  readonly platformCode = 'yogiyo' as const
  readonly capabilities = { optionCatalog: true } as const
  private readonly delegate: BrowserCatalogSnapshotAdapter

  constructor(
    _credentials: { username: string; password: string },
    options: YogiyoAdapterOptions = {}
  ) {
    this.delegate = new BrowserCatalogSnapshotAdapter({
      platformCode: this.platformCode,
      captureSnapshots: options.captureManagedBrowserSnapshots ?? (async () => []),
      isFullMenuCollectionEvent: isYogiyoFullMenuCollectionEvent,
      isFullOptionCollectionEvent: isYogiyoFullOptionCollectionEvent
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
