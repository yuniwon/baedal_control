# Agent Operations Reporting Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only CLI/JSON reporting layer so an agent can inspect menu state, review queues, options, platform health, and recent failures through official app services instead of ad hoc DB queries.

**Architecture:** Keep the Electron app as the single source of truth. Add shared report DTOs, a main-process `AgentOperationsReportService` that composes existing repositories plus the sync preview engine and managed Chrome session probe, then expose that service through new `CliTaskRunner` tasks. The first pass is read-only and JSON-first so future write automation and UI panels can reuse the same report service.

**Tech Stack:** Electron, electron-vite, TypeScript, SQLite via `node:sqlite`, Vitest, existing repository/service layer

---

## File Map

- `src/shared/contracts.ts`: shared report envelopes, filter DTOs, and typed report payloads
- `src/main/services/agent-operations-report-service.ts`: read-only report composition service
- `src/main/services/cli-task-runner.ts`: CLI filters and report task routing
- `src/main/index.ts`: service construction and CLI injection
- `tests/unit/main/agent-operations-report-service.test.ts`: report service coverage
- `tests/unit/main/cli-task-runner.test.ts`: CLI routing and argument parsing coverage
- `docs/current-status.md`: current capability snapshot
- `docs/agent-handoff.md`: handoff notes for the next agent

## Task 1: Add Shared Agent Report Contracts

**Files:**
- Modify: `src/shared/contracts.ts`
- Test: `tests/unit/main/agent-operations-report-service.test.ts`

- [ ] **Step 1: Write the failing service contract test**

Create `tests/unit/main/agent-operations-report-service.test.ts` with a first contract assertion that locks the overview envelope:

```ts
import { describe, expect, it } from 'vitest'
import { AgentOperationsReportService } from '../../../src/main/services/agent-operations-report-service'

describe('AgentOperationsReportService', () => {
  it('returns a typed overview envelope', async () => {
    const service = new AgentOperationsReportService({
      menuRepository: { list: () => [] },
      mappingRepository: { listAll: () => [] },
      platformMenuRepository: { listAll: () => [] },
      platformOptionGroupRepository: { listAll: () => [] },
      platformImportRunRepository: { listLatest: () => [] },
      platformImportChangeRepository: { listLatest: () => [] },
      syncRunRepository: { list: () => [] },
      syncRunItemRepository: { listForRunIds: () => [] },
      getSyncPreview: async () => ({ items: [], needsReview: [] }),
      getManagedChromeSession: async () => ({ endpointUrl: '', connected: false, tabs: [] })
    })

    const report = await service.getOverviewReport({})

    expect(report).toMatchObject({
      task: 'agent-report-overview',
      summary: expect.any(String),
      data: {
        menuCounts: {
          total: 0,
          managed: 0,
          unmanaged: 0,
          dirty: 0
        }
      }
    })
  })
})
```

- [ ] **Step 2: Run the new test and confirm failure**

Run:

```bash
npm run test -- tests/unit/main/agent-operations-report-service.test.ts
```

Expected: FAIL because the service and report DTOs do not exist yet.

- [ ] **Step 3: Add shared report DTOs**

Update `src/shared/contracts.ts` with these report shapes:

```ts
export interface AgentReportFilterInput {
  platformCode?: PlatformCode | null
  menuId?: string | null
  platformMenuId?: string | null
  reason?: SyncPreviewNeedsReview['reason'] | null
  limit?: number | null
}

export interface AgentReportEnvelope<TData> {
  task:
    | 'agent-report-overview'
    | 'agent-report-review-queue'
    | 'agent-report-menu'
    | 'agent-report-options'
    | 'agent-report-platform'
  generatedAt: string
  summary: string
  data: TData
}

export interface AgentOverviewReport {
  menuCounts: {
    total: number
    managed: number
    unmanaged: number
    dirty: number
  }
  previewCounts: {
    executable: number
    needsReview: number
    byPlatform: Record<PlatformCode, { executable: number; needsReview: number }>
  }
  latestImports: PlatformImportRunRecord[]
  recentFailures: Array<{
    syncRunId: string
    syncRunItemId: string
    startedAt: string
    platformCode: PlatformCode
    menuId: string
    errorCode?: string | null
    errorMessage?: string | null
    message: string
    action?: string | null
    retryable: boolean
  }>
  managedChrome: ManagedChromeSessionStatus | null
}

export interface AgentReviewQueueItem {
  menuId: string
  menuName: string
  menuBasePrice: number
  platformCode?: PlatformCode
  platformMenuId?: string
  reason: SyncPreviewNeedsReview['reason']
  detail?: string
  platformMenuName?: string | null
  platformMenuPriceSummary?: string | null
}

export interface AgentReviewQueueReport {
  total: number
  items: AgentReviewQueueItem[]
}

export interface AgentMenuReport {
  menu: MenuRecord
  mappings: PlatformMenuMappingRecord[]
  preview: {
    executable: SyncPreviewItem[]
    needsReview: SyncPreviewNeedsReview[]
  }
  logicalOptionGroups: LogicalOptionGroupRecord[]
  recentRuns: Array<SyncRunRecord & { items: SyncRunItemRecord[] }>
}

export interface AgentOptionsReport {
  total: number
  byStatus: Record<LogicalOptionGroupRecord['status'], number>
  groups: LogicalOptionGroupRecord[]
}

export interface AgentPlatformReport {
  platformCode: PlatformCode
  menuCount: number
  optionGroupCount: number
  latestImport: PlatformImportRunRecord | null
  latestChanges: PlatformImportChangeRecord[]
  reviewQueue: AgentReviewQueueItem[]
  recentFailures: AgentOverviewReport['recentFailures']
  managedChrome: ManagedChromeSessionStatus | null
}
```

- [ ] **Step 4: Run the contract test again**

Run:

```bash
npm run test -- tests/unit/main/agent-operations-report-service.test.ts
npm run lint:types
```

Expected: the service test still fails because the implementation is missing, but TypeScript accepts the shared DTOs.

- [ ] **Step 5: Commit the shared contracts**

Run:

```bash
git add src/shared/contracts.ts tests/unit/main/agent-operations-report-service.test.ts
git commit -m "feat: add agent reporting contracts"
```

Expected: one commit containing only shared DTO groundwork and the initial failing test scaffold if implementing with TDD commits.

## Task 2: Build the Agent Report Service Skeleton

**Files:**
- Create: `src/main/services/agent-operations-report-service.ts`
- Test: `tests/unit/main/agent-operations-report-service.test.ts`

- [ ] **Step 1: Define service dependencies with narrow interfaces**

Create the service with explicit constructor dependencies so the tests can stub data without touching SQLite:

```ts
import type {
  AgentMenuReport,
  AgentOptionsReport,
  AgentOverviewReport,
  AgentPlatformReport,
  AgentReportEnvelope,
  AgentReportFilterInput,
  AgentReviewQueueReport,
  LogicalOptionGroupRecord,
  ManagedChromeSessionStatus,
  MenuRecord,
  PlatformImportChangeRecord,
  PlatformImportRunRecord,
  PlatformMenuCatalogRecord,
  PlatformMenuMappingRecord,
  PlatformOptionGroupRecord,
  SyncPreviewResult,
  SyncRunItemRecord,
  SyncRunRecord
} from '../../shared/contracts'

interface AgentOperationsReportDependencies {
  menuRepository: { list: () => MenuRecord[]; get: (menuId: string) => MenuRecord | null }
  mappingRepository: { listAll: () => PlatformMenuMappingRecord[]; listForMenu?: (menuId: string) => PlatformMenuMappingRecord[] }
  platformMenuRepository: { listAll: () => PlatformMenuCatalogRecord[] }
  platformOptionGroupRepository: { listAll: () => PlatformOptionGroupRecord[] }
  platformImportRunRepository: { listLatest: (limit?: number) => PlatformImportRunRecord[] }
  platformImportChangeRepository: { listLatest: (limit?: number) => PlatformImportChangeRecord[] }
  syncRunRepository: { list: () => SyncRunRecord[] }
  syncRunItemRepository: { listForRunIds: (syncRunIds: string[]) => SyncRunItemRecord[] }
  getSyncPreview: () => Promise<SyncPreviewResult> | SyncPreviewResult
  getManagedChromeSession: () => Promise<ManagedChromeSessionStatus> | ManagedChromeSessionStatus
  buildLogicalOptionGroups?: (groups: PlatformOptionGroupRecord[]) => LogicalOptionGroupRecord[]
}
```

- [ ] **Step 2: Add a common envelope helper and filter normalization**

Implement common helpers first:

```ts
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

const clampLimit = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_LIMIT
  }

  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value)))
}

const buildEnvelope = <TData>(
  task: AgentReportEnvelope<TData>['task'],
  summary: string,
  data: TData
): AgentReportEnvelope<TData> => ({
  task,
  generatedAt: new Date().toISOString(),
  summary,
  data
})
```

- [ ] **Step 3: Add placeholders for the five report methods**

Create the public surface now so later tasks only fill in logic:

```ts
export class AgentOperationsReportService {
  constructor(private readonly dependencies: AgentOperationsReportDependencies) {}

  async getOverviewReport(
    filters: AgentReportFilterInput
  ): Promise<AgentReportEnvelope<AgentOverviewReport>> {
    return buildEnvelope('agent-report-overview', '구현 전', {
      menuCounts: { total: 0, managed: 0, unmanaged: 0, dirty: 0 },
      previewCounts: {
        executable: 0,
        needsReview: 0,
        byPlatform: { baemin: { executable: 0, needsReview: 0 }, coupangeats: { executable: 0, needsReview: 0 }, ddangyo: { executable: 0, needsReview: 0 } }
      },
      latestImports: [],
      recentFailures: [],
      managedChrome: null
    })
  }

  async getReviewQueueReport(
    filters: AgentReportFilterInput
  ): Promise<AgentReportEnvelope<AgentReviewQueueReport>> {
    return buildEnvelope('agent-report-review-queue', '구현 전', { total: 0, items: [] })
  }

  async getMenuReport(
    menuId: string,
    filters: AgentReportFilterInput
  ): Promise<AgentReportEnvelope<AgentMenuReport>> {
    throw new Error(`agent_report_menu_not_found:${menuId}`)
  }

  async getOptionsReport(
    filters: AgentReportFilterInput
  ): Promise<AgentReportEnvelope<AgentOptionsReport>> {
    return buildEnvelope('agent-report-options', '구현 전', {
      total: 0,
      byStatus: {
        single: 0,
        merge_candidate: 0,
        shape_conflict: 0,
        missing_suspected: 0,
        absent_confirmed: 0,
        resurfaced: 0
      },
      groups: []
    })
  }

  async getPlatformReport(
    platformCode: PlatformCode,
    filters: AgentReportFilterInput
  ): Promise<AgentReportEnvelope<AgentPlatformReport>> {
    return buildEnvelope('agent-report-platform', '구현 전', {
      platformCode,
      menuCount: 0,
      optionGroupCount: 0,
      latestImport: null,
      latestChanges: [],
      reviewQueue: [],
      recentFailures: [],
      managedChrome: null
    })
  }
}
```

- [ ] **Step 4: Run the service test and keep it red for missing logic**

Run:

```bash
npm run test -- tests/unit/main/agent-operations-report-service.test.ts
```

Expected: FAIL on missing logic, not on missing symbols.

- [ ] **Step 5: Commit the service scaffold**

Run:

```bash
git add src/main/services/agent-operations-report-service.ts tests/unit/main/agent-operations-report-service.test.ts
git commit -m "feat: scaffold agent reporting service"
```

Expected: one commit containing only the service shell and test harness.

## Task 3: Implement Overview and Review Queue Reports

**Files:**
- Modify: `src/main/services/agent-operations-report-service.ts`
- Test: `tests/unit/main/agent-operations-report-service.test.ts`

- [ ] **Step 1: Extend the service test to cover overview and review queue logic**

Add assertions for these cases:

```ts
it('summarizes menu counts, preview counts, imports, failures, and managed chrome state', async () => {
  const report = await service.getOverviewReport({ limit: 3 })

  expect(report.summary).toContain('관리 대상 메뉴')
  expect(report.data.menuCounts).toEqual({
    total: 3,
    managed: 2,
    unmanaged: 1,
    dirty: 1
  })
  expect(report.data.previewCounts.byPlatform.baemin).toEqual({
    executable: 1,
    needsReview: 2
  })
  expect(report.data.latestImports).toHaveLength(2)
  expect(report.data.recentFailures[0]).toMatchObject({
    platformCode: 'baemin',
    errorCode: 'baemin_menu_match_not_found',
    action: expect.any(String),
    retryable: true
  })
  expect(report.data.managedChrome?.connected).toBe(true)
})

it('filters review queue items by platform, reason, menuId, and limit', async () => {
  const report = await service.getReviewQueueReport({
    platformCode: 'baemin',
    reason: 'source_missing_review',
    menuId: 'menu-1',
    limit: 1
  })

  expect(report.data.total).toBe(1)
  expect(report.data.items).toEqual([
    expect.objectContaining({
      menuId: 'menu-1',
      menuName: '왕새우갈비',
      platformCode: 'baemin',
      reason: 'source_missing_review'
    })
  ])
})
```

- [ ] **Step 2: Implement overview aggregation**

Use the existing repositories instead of direct SQL:

```ts
import { describeSyncFailure } from '../../shared/sync-error-catalog'

const menus = this.dependencies.menuRepository.list()
const preview = await this.dependencies.getSyncPreview()
const latestImports = this.dependencies.platformImportRunRepository.listLatest(clampLimit(filters.limit))
const syncRuns = this.dependencies.syncRunRepository.list()
const syncItems = this.dependencies.syncRunItemRepository.listForRunIds(syncRuns.map((run) => run.syncRunId))
const managedChrome = await this.dependencies.getManagedChromeSession()

const recentFailures = syncItems
  .filter((item) => item.status !== 'success' && (item.errorCode || item.errorMessage))
  .map((item) => {
    const run = syncRuns.find((candidate) => candidate.syncRunId === item.syncRunId)
    const descriptor = describeSyncFailure(item.errorCode, item.errorMessage)

    return {
      syncRunId: item.syncRunId,
      syncRunItemId: item.syncRunItemId,
      startedAt: run?.startedAt ?? '',
      platformCode: item.platformCode,
      menuId: item.menuId,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      message: descriptor.message,
      action: descriptor.action ?? null,
      retryable: descriptor.retryable
    }
  })
  .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
  .slice(0, clampLimit(filters.limit))
```

- [ ] **Step 3: Implement review queue enrichment**

Join review items to local menu names and mapped platform catalog details:

```ts
const menuIndex = new Map(menus.map((menu) => [menu.menuId, menu]))
const mappingIndex = new Map(
  this.dependencies.mappingRepository
    .listAll()
    .map((mapping) => [`${mapping.menuId}:${mapping.platformCode}:${mapping.platformMenuId}`, mapping] as const)
)

const items = preview.needsReview
  .filter((item) => !filters.platformCode || item.platformCode === filters.platformCode)
  .filter((item) => !filters.menuId || item.menuId === filters.menuId)
  .filter((item) => !filters.platformMenuId || item.platformMenuId === filters.platformMenuId)
  .filter((item) => !filters.reason || item.reason === filters.reason)
  .slice(0, clampLimit(filters.limit))
  .map((item) => {
    const menu = menuIndex.get(item.menuId)
    const mappingKey = `${item.menuId}:${item.platformCode ?? ''}:${item.platformMenuId ?? ''}`
    const mapping = mappingIndex.get(mappingKey)

    return {
      menuId: item.menuId,
      menuName: menu?.baseName ?? '(삭제된 기준 메뉴)',
      menuBasePrice: menu?.basePrice ?? 0,
      platformCode: item.platformCode,
      platformMenuId: item.platformMenuId,
      reason: item.reason,
      detail: item.detail,
      platformMenuName: mapping?.platformMenuName ?? null,
      platformMenuPriceSummary: mapping?.platformMenuPriceSummary ?? null
    }
  })
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
npm run test -- tests/unit/main/agent-operations-report-service.test.ts
```

Expected: PASS on overview and review queue assertions.

- [ ] **Step 5: Commit the overview layer**

Run:

```bash
git add src/main/services/agent-operations-report-service.ts tests/unit/main/agent-operations-report-service.test.ts
git commit -m "feat: add overview and review queue reports"
```

Expected: one commit covering only overview and review queue logic.

## Task 4: Implement Menu, Options, and Platform Reports

**Files:**
- Modify: `src/main/services/agent-operations-report-service.ts`
- Test: `tests/unit/main/agent-operations-report-service.test.ts`

- [ ] **Step 1: Add failing tests for detailed reports**

Extend the service tests with these cases:

```ts
it('returns menu detail with mappings, preview subsets, logical option groups, and recent runs', async () => {
  const report = await service.getMenuReport('menu-1', { limit: 2 })

  expect(report.data.menu.baseName).toBe('왕새우갈비')
  expect(report.data.mappings).toHaveLength(2)
  expect(report.data.preview.executable).toHaveLength(1)
  expect(report.data.preview.needsReview).toHaveLength(1)
  expect(report.data.logicalOptionGroups[0].displayName).toBe('피자 선택')
  expect(report.data.recentRuns[0].items).toEqual(
    expect.arrayContaining([expect.objectContaining({ menuId: 'menu-1' })])
  )
})

it('summarizes logical option groups with status counts', async () => {
  const report = await service.getOptionsReport({ limit: 2 })

  expect(report.data.total).toBe(3)
  expect(report.data.byStatus.merge_candidate).toBe(1)
  expect(report.data.groups).toHaveLength(2)
})

it('returns platform detail with import history, review queue, failures, and managed chrome tabs', async () => {
  const report = await service.getPlatformReport('baemin', { limit: 3 })

  expect(report.data.platformCode).toBe('baemin')
  expect(report.data.latestImport?.platformCode).toBe('baemin')
  expect(report.data.latestChanges.every((item) => item.platformCode === 'baemin')).toBe(true)
  expect(report.data.reviewQueue.every((item) => item.platformCode === 'baemin')).toBe(true)
  expect(report.data.recentFailures.every((item) => item.platformCode === 'baemin')).toBe(true)
})
```

- [ ] **Step 2: Implement `getMenuReport`**

The menu report should reuse the existing preview output and logical option grouping:

```ts
const menu = this.dependencies.menuRepository.get(menuId)
if (!menu) {
  throw new Error(`agent_report_menu_not_found:${menuId}`)
}

const preview = await this.dependencies.getSyncPreview()
const mappings = this.dependencies.mappingRepository.listAll().filter((item) => item.menuId === menuId)
const linkedSourceKeys = new Set(mappings.map((item) => `${item.platformCode}:${item.platformMenuId}`))
const logicalGroups = (this.dependencies.buildLogicalOptionGroups ?? buildLogicalOptionGroups)(
  this.dependencies.platformOptionGroupRepository.listAll()
).filter((group) =>
  group.sourceGroups.some((sourceGroup) =>
    sourceGroup.linkedMenuNames.some((linkedName) =>
      mappings.some((mapping) => mapping.platformMenuName === linkedName)
    )
  )
)

const runs = this.dependencies.syncRunRepository.list()
const items = this.dependencies.syncRunItemRepository.listForRunIds(runs.map((run) => run.syncRunId))
const recentRuns = runs
  .map((run) => ({
    ...run,
    items: items.filter((item) => item.syncRunId === run.syncRunId && item.menuId === menuId)
  }))
  .filter((run) => run.items.length > 0)
  .slice(0, clampLimit(filters.limit))
```

- [ ] **Step 3: Implement `getOptionsReport` and `getPlatformReport`**

Use shared helpers instead of copy-pasting counts:

```ts
const logicalGroups = (this.dependencies.buildLogicalOptionGroups ?? buildLogicalOptionGroups)(
  this.dependencies.platformOptionGroupRepository.listAll()
)
const filteredGroups = logicalGroups
  .filter((group) => !filters.platformCode || group.platformCode === filters.platformCode)
  .slice(0, clampLimit(filters.limit))

const byStatus = {
  single: logicalGroups.filter((group) => group.status === 'single').length,
  merge_candidate: logicalGroups.filter((group) => group.status === 'merge_candidate').length,
  shape_conflict: logicalGroups.filter((group) => group.status === 'shape_conflict').length,
  missing_suspected: logicalGroups.filter((group) => group.status === 'missing_suspected').length,
  absent_confirmed: logicalGroups.filter((group) => group.status === 'absent_confirmed').length,
  resurfaced: logicalGroups.filter((group) => group.status === 'resurfaced').length
}
```

```ts
const latestImport =
  this.dependencies.platformImportRunRepository
    .listLatest(clampLimit(filters.limit))
    .find((item) => item.platformCode === platformCode) ?? null

const latestChanges = this.dependencies.platformImportChangeRepository
  .listLatest(clampLimit(filters.limit))
  .filter((item) => item.platformCode === platformCode)

const reviewQueue = (await this.getReviewQueueReport({ ...filters, platformCode })).data.items
const recentFailures = (await this.getOverviewReport(filters)).data.recentFailures.filter(
  (item) => item.platformCode === platformCode
)
const managedChrome = await this.dependencies.getManagedChromeSession()
const scopedManagedChrome =
  managedChrome.connected
    ? {
        ...managedChrome,
        tabs: managedChrome.tabs.filter((tab) => tab.platformCode === platformCode)
      }
    : managedChrome
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
npm run test -- tests/unit/main/agent-operations-report-service.test.ts
```

Expected: PASS with all detailed report cases green.

- [ ] **Step 5: Commit the detailed reports**

Run:

```bash
git add src/main/services/agent-operations-report-service.ts tests/unit/main/agent-operations-report-service.test.ts
git commit -m "feat: add detailed agent reports"
```

Expected: one commit covering menu, options, and platform report logic.

## Task 5: Expose Agent Reports Through the CLI Task Runner

**Files:**
- Modify: `src/main/services/cli-task-runner.ts`
- Test: `tests/unit/main/cli-task-runner.test.ts`

- [ ] **Step 1: Add failing CLI tests for report routing**

Extend `tests/unit/main/cli-task-runner.test.ts` with these assertions:

```ts
it('parses reason and limit filters for agent reports', async () => {
  const service = {
    getOverviewReport: vi.fn().mockResolvedValue({ task: 'agent-report-overview', generatedAt: '2026-04-14T00:00:00.000Z', summary: 'ok', data: {} })
  }
  const runner = new CliTaskRunner({
    getSyncPreview: async () => ({ items: [], needsReview: [] }),
    agentOperationsReportService: service as never
  })

  const result = await runner.run([
    '--task=agent-report-overview',
    '--platformCode=baemin',
    '--reason=source_missing_review',
    '--limit=3'
  ])

  expect(service.getOverviewReport).toHaveBeenCalledWith({
    platformCode: 'baemin',
    menuId: null,
    platformMenuId: null,
    reason: 'source_missing_review',
    limit: 3
  })
  expect(result?.exitCode).toBe(0)
})

it('requires menuId for agent-report-menu', async () => {
  const runner = new CliTaskRunner({
    getSyncPreview: async () => ({ items: [], needsReview: [] }),
    agentOperationsReportService: {} as never
  })

  const result = await runner.run(['--task=agent-report-menu'])

  expect(result).toEqual({
    exitCode: 1,
    payload: { task: 'agent-report-menu', error: 'menu_id_required' }
  })
})
```

- [ ] **Step 2: Extend argument parsing**

Update `ParsedCliArgs` and `parseCliArgs()`:

```ts
interface ParsedCliArgs {
  task: string | null
  platformCode: PlatformCode | null
  menuId: string | null
  platformMenuId: string | null
  reason: SyncPreviewNeedsReview['reason'] | null
  limit: number | null
}

const parseLimit = (value: string | undefined) => {
  if (!value) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}
```

- [ ] **Step 3: Add the report service dependency and route the five tasks**

Inject and dispatch like this:

```ts
interface CliTaskRunnerDependencies {
  getSyncPreview: () => Promise<SyncPreviewResult> | SyncPreviewResult
  agentOperationsReportService?: {
    getOverviewReport: (filters: AgentReportFilterInput) => Promise<AgentReportEnvelope<AgentOverviewReport>>
    getReviewQueueReport: (filters: AgentReportFilterInput) => Promise<AgentReportEnvelope<AgentReviewQueueReport>>
    getMenuReport: (menuId: string, filters: AgentReportFilterInput) => Promise<AgentReportEnvelope<AgentMenuReport>>
    getOptionsReport: (filters: AgentReportFilterInput) => Promise<AgentReportEnvelope<AgentOptionsReport>>
    getPlatformReport: (platformCode: PlatformCode, filters: AgentReportFilterInput) => Promise<AgentReportEnvelope<AgentPlatformReport>>
  }
  // existing dependencies unchanged
}
```

```ts
const reportFilters = {
  platformCode: parsed.platformCode,
  menuId: parsed.menuId,
  platformMenuId: parsed.platformMenuId,
  reason: parsed.reason,
  limit: parsed.limit
}

if (parsed.task === 'agent-report-overview') {
  if (!this.dependencies.agentOperationsReportService) {
    return { exitCode: 1, payload: { task: parsed.task, error: 'agent_report_service_unavailable' } }
  }

  return {
    exitCode: 0,
    payload: await this.dependencies.agentOperationsReportService.getOverviewReport(reportFilters)
  }
}

if (parsed.task === 'agent-report-review-queue') { ... }
if (parsed.task === 'agent-report-menu') { ...menu_id_required... }
if (parsed.task === 'agent-report-options') { ... }
if (parsed.task === 'agent-report-platform') { ...platform_code_required... }
```

- [ ] **Step 4: Run the CLI task tests**

Run:

```bash
npm run test -- tests/unit/main/cli-task-runner.test.ts
```

Expected: PASS with new parsing and task routing coverage, while existing CLI tasks still pass unchanged.

- [ ] **Step 5: Commit the CLI report tasks**

Run:

```bash
git add src/main/services/cli-task-runner.ts tests/unit/main/cli-task-runner.test.ts
git commit -m "feat: expose agent reports via cli"
```

Expected: one commit covering only CLI parsing and routing.

## Task 6: Wire the Report Service in the Main Process

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Construct the report service with existing repositories**

Update `src/main/index.ts` right after `getSyncPreview`:

```ts
import { AgentOperationsReportService } from './services/agent-operations-report-service'

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
```

- [ ] **Step 2: Inject the service into `CliTaskRunner`**

Update the runner construction:

```ts
const cliTaskRunner = new CliTaskRunner({
  getSyncPreview,
  agentOperationsReportService,
  syncEngine,
  platformMenuImporter: catalogImportOrchestrator,
  platformFlowInspector: { ... },
  hasCredential: (platformCode) => Boolean(credentialVault.get(platformCode))
})
```

- [ ] **Step 3: Run a focused smoke build**

Run:

```bash
npm run lint:types
npm run test -- tests/unit/main/agent-operations-report-service.test.ts tests/unit/main/cli-task-runner.test.ts
npm run build
```

Expected: PASS with the report service compiled into the main process.

- [ ] **Step 4: Commit the main-process wiring**

Run:

```bash
git add src/main/index.ts
git commit -m "feat: wire agent report service"
```

Expected: one commit containing only construction and dependency injection.

## Task 7: Document the New Report Commands and Verify Them End to End

**Files:**
- Modify: `docs/current-status.md`
- Modify: `docs/agent-handoff.md`

- [ ] **Step 1: Update status and handoff docs**

Add a concise section to both docs with the new commands:

```md
## 에이전트 운영 리포트

- `electron out/main/index.js --task=agent-report-overview`
- `electron out/main/index.js --task=agent-report-review-queue --platformCode=baemin --reason=source_missing_review --limit=10`
- `electron out/main/index.js --task=agent-report-menu --menuId=<menuId>`
- `electron out/main/index.js --task=agent-report-options --platformCode=baemin --limit=20`
- `electron out/main/index.js --task=agent-report-platform --platformCode=baemin --limit=10`

용도:
- 에이전트가 DB를 직접 뒤지지 않고 현재 상태를 읽는다.
- 실행 전 검토 큐와 최근 실패를 먼저 확인한다.
- 특정 메뉴나 플랫폼 단위로 전략을 세운다.
```

- [ ] **Step 2: Run the full automated verification**

Run:

```bash
npm run lint:types
npm run test
npm run build
```

Expected: all three commands PASS.

- [ ] **Step 3: Run CLI smoke checks against the built main process**

Run:

```bash
npx electron out/main/index.js --task=agent-report-overview
npx electron out/main/index.js --task=agent-report-review-queue --limit=5
npx electron out/main/index.js --task=agent-report-options --platformCode=baemin --limit=5
npx electron out/main/index.js --task=agent-report-platform --platformCode=baemin --limit=5
```

Expected:
- all commands exit with code `0`
- each command prints a JSON envelope with `task`, `generatedAt`, `summary`, and `data`
- review queue and platform reports honor the provided filters

- [ ] **Step 4: Record the verification result**

Append this exact shape to `docs/current-status.md` after verification:

```md
### 에이전트 운영 리포트 검증 메모

- 검증일: 2026-04-14
- lint:types: 통과
- test: 통과
- build: 통과
- agent-report-overview: 통과
- agent-report-review-queue: 통과
- agent-report-options: 통과
- agent-report-platform: 통과
```

- [ ] **Step 5: Commit the docs and verification evidence**

Run:

```bash
git add docs/current-status.md docs/agent-handoff.md
git commit -m "docs: add agent report command reference"
```

Expected: final documentation commit with verification notes only.

## Final Verification Gate

- [ ] `npm run lint:types`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npx electron out/main/index.js --task=agent-report-overview`
- [ ] `npx electron out/main/index.js --task=agent-report-review-queue --limit=5`
- [ ] `npx electron out/main/index.js --task=agent-report-options --platformCode=baemin --limit=5`
- [ ] `npx electron out/main/index.js --task=agent-report-platform --platformCode=baemin --limit=5`

## Notes

- This plan intentionally stays read-only. No write automation or UI panel is part of this slice.
- The report service must use existing repositories and preview logic, not direct SQL or ad hoc JSON files.
- The report envelopes should preserve stable identifiers such as `menuId`, `platformCode`, `platformMenuId`, `mappingId`, and `logicalGroupKey` so later execution commands can target the same entities without re-discovery.
