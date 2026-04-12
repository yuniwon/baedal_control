import { randomUUID } from 'node:crypto'
import type { PlatformCode, SyncPreviewItem } from '../../shared/contracts'

interface SyncRunLogger {
  create: (record: {
    syncRunId: string
    startedAt: string
    triggerType: 'manual'
  }) => void
  finish: (record: { syncRunId: string; finishedAt: string; resultSummary: string }) => void
  addItem: (record: {
    syncRunItemId: string
    syncRunId: string
    platformCode: string
    menuId: string
    fieldType: string
    beforeValue: string | null
    afterValue: string
    status: string
    errorCode: string | null
    errorMessage: string | null
  }) => void
}

interface AdapterRegistryLike {
  get: (
    platformCode: PlatformCode
  ) => { applyMenuUpdate: (item: SyncPreviewItem) => Promise<void> | void }
}

export class SyncEngine {
  constructor(
    private readonly adapterRegistry: AdapterRegistryLike,
    private readonly runLogger: SyncRunLogger
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
        successCount += 1
        this.runLogger.addItem({
          syncRunItemId: randomUUID(),
          syncRunId,
          platformCode: item.platformCode,
          menuId: item.menuId,
          fieldType: 'menu',
          beforeValue: item.previousName ?? null,
          afterValue: JSON.stringify({ name: item.nextName, price: item.nextPrice }),
          status: 'success',
          errorCode: null,
          errorMessage: null
        })
      } catch (error) {
        failureCount += 1
        this.runLogger.addItem({
          syncRunItemId: randomUUID(),
          syncRunId,
          platformCode: item.platformCode,
          menuId: item.menuId,
          fieldType: 'menu',
          beforeValue: item.previousName ?? null,
          afterValue: JSON.stringify({ name: item.nextName, price: item.nextPrice }),
          status: 'failed',
          errorCode: 'apply_failed',
          errorMessage: error instanceof Error ? error.message : 'unknown_error'
        })
      }
    }

    const summary = `${successCount} succeeded, ${failureCount} failed`
    this.runLogger.finish({
      syncRunId,
      finishedAt: new Date().toISOString(),
      resultSummary: summary
    })

    return { syncRunId, summary }
  }
}
