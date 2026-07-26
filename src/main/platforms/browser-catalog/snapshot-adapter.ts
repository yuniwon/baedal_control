import type {
  BrowserInspectionApiEvent,
  BrowserInspectionSnapshot,
  PlatformCode,
  PlatformInspectionReport,
  SyncPreviewItem
} from '../../../shared/contracts'
import type { PlatformAdapter, PlatformMenuFetchResult, PlatformMenuSnapshot } from '../base/types'
import { parseBrowserCatalogApiEvents } from './api-event-parser'
import { buildBrowserCatalogCompleteness } from './completeness'

interface BrowserCatalogSnapshotAdapterOptions {
  platformCode: PlatformCode
  captureSnapshots: () => Promise<BrowserInspectionSnapshot[]>
  isFullMenuCollectionEvent: (event: BrowserInspectionApiEvent) => boolean
  isFullOptionCollectionEvent: (event: BrowserInspectionApiEvent) => boolean
}

const readExpectedCount = (events: BrowserInspectionApiEvent[]): number | undefined => {
  for (const event of events) {
    const preview = event.responsePreview?.trim()
    if (!preview) continue

    try {
      const payload = JSON.parse(preview) as unknown
      const queue: unknown[] = [payload]
      while (queue.length) {
        const value = queue.shift()
        if (Array.isArray(value)) {
          queue.push(...value)
          continue
        }
        if (!value || typeof value !== 'object') continue

        const record = value as Record<string, unknown>
        for (const key of ['totalCount', 'totalElements', 'total']) {
          if (typeof record[key] === 'number' && Number.isFinite(record[key])) {
            return record[key]
          }
        }
        queue.push(...Object.values(record))
      }
    } catch {
      // The shared parser records invalid JSON as a structured completeness issue.
    }
  }
  return undefined
}

const parsePriceText = (value?: string | null): number | undefined => {
  if (!value) return undefined
  const match = value.replaceAll(',', '').match(/-?\d+/)
  if (!match) return undefined
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : undefined
}

const normalizeDomKey = (value: string) =>
  encodeURIComponent(value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' '))

const parseDomMenus = (snapshots: BrowserInspectionSnapshot[]): PlatformMenuSnapshot[] => {
  const menus = new Map<string, PlatformMenuSnapshot>()

  for (const snapshot of snapshots) {
    for (const item of snapshot.menuItems) {
      const platformMenuName = item.name.trim()
      if (!platformMenuName) continue
      const categoryName = item.categoryName?.trim() || ''
      const key = `${categoryName}\u0000${platformMenuName}`
      if (menus.has(key)) continue

      const currentPrice = parsePriceText(item.priceText)
      menus.set(key, {
        platformMenuId: `dom:${normalizeDomKey(key)}`,
        platformMenuName,
        ...(currentPrice === undefined ? {} : { currentPrice }),
        ...(categoryName ? { platformMenuGroupName: categoryName } : {})
      })
    }
  }

  return [...menus.values()]
}

export class BrowserCatalogSnapshotAdapter implements PlatformAdapter {
  readonly platformCode: PlatformCode
  readonly capabilities = { optionCatalog: true } as const

  constructor(private readonly options: BrowserCatalogSnapshotAdapterOptions) {
    this.platformCode = options.platformCode
  }

  async fetchMenus() {
    const result = await this.fetchMenusWithInspection()
    return result.menus
  }

  async fetchMenusWithInspection(): Promise<PlatformMenuFetchResult> {
    const snapshots = (await this.options.captureSnapshots()).filter(
      (snapshot) => snapshot.platformCode === this.platformCode
    )
    if (snapshots.length === 0) {
      throw new Error(`${this.platformCode}_managed_session_snapshot_missing`)
    }

    const apiEvents = snapshots.flatMap((snapshot) => snapshot.apiEvents)
    const catalogApiEvents = apiEvents.filter((event) => {
      const preview = event.responsePreview?.trim() ?? ''
      return (
        /(?:menu|dish|product|item|option)/i.test(event.url) &&
        (preview.startsWith('{') || preview.startsWith('['))
      )
    })
    const parsed = parseBrowserCatalogApiEvents(catalogApiEvents)
    const menus = parsed.menus.length ? parsed.menus : parseDomMenus(snapshots)
    const fullMenuEvents = apiEvents.filter(
      (event) => event.status === 200 && this.options.isFullMenuCollectionEvent(event)
    )
    const fullOptionEvents = apiEvents.filter(
      (event) => event.status === 200 && this.options.isFullOptionCollectionEvent(event)
    )
    const completeness = buildBrowserCatalogCompleteness({
      menus,
      optionGroups: parsed.optionGroups,
      menuCollectionProven: fullMenuEvents.length > 0,
      optionCollectionProven: fullOptionEvents.length > 0,
      expectedMenuCount: readExpectedCount(fullMenuEvents),
      expectedOptionGroupCount: readExpectedCount(fullOptionEvents),
      parseIssues: parsed.issues
    })
    const inspection: PlatformInspectionReport = {
      platformCode: this.platformCode,
      steps: [
        {
          kind: 'result',
          title: '관리 브라우저 카탈로그 수집',
          detail: `스냅샷 ${snapshots.length}개에서 메뉴 ${menus.length}개와 옵션 그룹 ${parsed.optionGroups.length}개를 읽었습니다.`,
          recordedAt: new Date().toISOString()
        }
      ]
    }

    return {
      menus,
      optionGroups: parsed.optionGroups,
      optionCatalogFetched: fullOptionEvents.length > 0 || parsed.optionGroups.length > 0,
      rawMenuCount: menus.length,
      fetchMode: parsed.parsedResponseCount > 0 ? 'api_capture' : 'dom_fallback',
      completeness,
      inspection
    }
  }

  async applyMenuUpdate(_item: SyncPreviewItem): Promise<void> {
    throw new Error(`${this.platformCode}_menu_update_read_only`)
  }
}
