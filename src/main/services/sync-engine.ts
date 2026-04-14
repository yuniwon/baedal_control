import { randomUUID } from 'node:crypto'
import type { PlatformCode, SyncPreviewItem, SyncRunItemRecord } from '../../shared/contracts'
import { normalizeSyncFailure } from '../../shared/sync-error-catalog'

const buildAfterValue = (item: SyncPreviewItem) =>
  JSON.stringify({
    name: item.nextName,
    price: item.nextPrice,
    priceVariants: item.nextPriceVariants ?? null
  })

interface SyncRunLogger {
  create: (record: {
    syncRunId: string
    startedAt: string
    triggerType: 'manual'
  }) => void
  finish: (record: { syncRunId: string; finishedAt: string; resultSummary: string }) => void
  addItem: (record: SyncRunItemRecord) => void
}

interface AdapterRegistryLike {
  get: (
    platformCode: PlatformCode
  ) => { applyMenuUpdate: (item: SyncPreviewItem) => Promise<void> | void }
}

interface FailureContextCollectorLike {
  capture: (
    item: SyncPreviewItem,
    error: unknown
  ) => Promise<SyncRunItemRecord['failureContext']> | SyncRunItemRecord['failureContext']
}

interface SuccessStateReconcilerLike {
  reconcile: (item: SyncPreviewItem) => Promise<void> | void
}

export class SyncEngine {
  constructor(
    private readonly adapterRegistry: AdapterRegistryLike,
    private readonly runLogger: SyncRunLogger,
    private readonly failureContextCollector?: FailureContextCollectorLike,
    private readonly successStateReconciler?: SuccessStateReconcilerLike
  ) {}

  async run(items: SyncPreviewItem[]) {
    const syncRunId = randomUUID()
    let successCount = 0
    let failureCount = 0

    this.runLogger.create({
      syncRunId,
      startedAt: new Date().toISOString(),
      triggerType: 'manual'
    })

    for (const item of items) {
      try {
        await this.adapterRegistry.get(item.platformCode).applyMenuUpdate(item)
        await this.successStateReconciler?.reconcile(item)
        successCount += 1
        this.runLogger.addItem({
          syncRunItemId: randomUUID(),
          syncRunId,
          platformCode: item.platformCode,
          menuId: item.menuId,
          fieldType: 'menu',
          beforeValue: item.previousName ?? null,
          afterValue: buildAfterValue(item),
          status: 'success',
          errorCode: null,
          errorMessage: null
        })
      } catch (error) {
        const failure = normalizeSyncFailure(error)
        const failureContext = await this.captureFailureContext(item, error)
        failureCount += 1
        this.runLogger.addItem({
          syncRunItemId: randomUUID(),
          syncRunId,
          platformCode: item.platformCode,
          menuId: item.menuId,
          fieldType: 'menu',
          beforeValue: item.previousName ?? null,
          afterValue: buildAfterValue(item),
          status: 'failed',
          errorCode: failure.errorCode,
          errorMessage: failure.errorMessage,
          failureContext
        })
      }
    }

    const summary = `성공 ${successCount}건, 실패 ${failureCount}건`
    this.runLogger.finish({
      syncRunId,
      finishedAt: new Date().toISOString(),
      resultSummary: summary
    })

    return { syncRunId, summary }
  }

  private async captureFailureContext(item: SyncPreviewItem, error: unknown) {
    if (!this.failureContextCollector) {
      return null
    }

    try {
      return (await this.failureContextCollector.capture(item, error)) ?? null
    } catch {
      return null
    }
  }
}
