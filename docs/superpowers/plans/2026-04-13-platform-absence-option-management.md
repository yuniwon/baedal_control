# Platform Absence and Option Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect platform-side menu and option removal safely, reflect that state inside the app, and add a separate option-management workflow built on reusable multi-platform catalog services.

**Architecture:** Keep platform adapters responsible only for reading remote catalog data, then move comparison, absence detection, import-run tracking, mapping deactivation, and logical option grouping into common main-process services. Preserve raw platform catalog rows instead of deleting and replacing them, expose typed IPC endpoints for import changes and logical option bundles, and render dashboard/menu/option views from those common records without showing internal IDs by default.

**Tech Stack:** Electron, electron-vite, React, TypeScript, SQLite via `node:sqlite`, Electron `safeStorage`, Playwright, Zod, Vitest, React Testing Library, jsdom

---

## File Map

- `src/shared/contracts.ts`: shared DTOs, enums, IPC surface keys, import/change/status models
- `src/main/db/migrations.ts`: schema upgrades for import runs, import changes, mapping status, and catalog presence columns
- `src/main/repositories/platform-menu-repository.ts`: non-destructive menu catalog upsert and presence updates
- `src/main/repositories/platform-option-group-repository.ts`: non-destructive option catalog upsert, signature storage, and presence updates
- `src/main/repositories/mapping-repository.ts`: mapping status persistence and source-absent transitions
- `src/main/repositories/platform-import-run-repository.ts`: import-run lifecycle persistence
- `src/main/repositories/platform-import-change-repository.ts`: import-change persistence and latest-change queries
- `src/main/services/absence-state-service.ts`: missing streak and presence-state transitions
- `src/main/services/catalog-diff-service.ts`: compare previous/current catalog rows and emit change records
- `src/main/services/option-signature.ts`: stable option-group normalization key generator
- `src/main/services/logical-option-group-service.ts`: combine platform option groups into user-facing logical bundles
- `src/main/services/import-summary-service.ts`: summarize latest import changes for dashboard cards
- `src/main/services/catalog-import-orchestrator.ts`: import-run lifecycle, snapshot upsert, diff, presence updates, mapping deactivation, and auto-exclude behavior
- `src/main/services/platform-menu-importer.ts`: thin facade that delegates to the orchestrator and preserves inspection reporting
- `src/main/platforms/base/types.ts`: adapter capability flags for option-catalog support
- `src/main/ipc/register-handlers.ts`: new IPC handlers for import runs, import changes, and logical option groups
- `src/main/preload.ts`: safe preload bridge for the new IPC endpoints
- `src/renderer/src/lib/api.ts`: typed renderer wrapper for the new preload methods
- `src/main/services/sync-planner.ts`: skip absent/deactivated sources during preview
- `src/renderer/src/App.tsx`: add `옵션 관리` navigation tab
- `src/renderer/src/pages/DashboardPage.tsx`: show latest import-change summary
- `src/renderer/src/pages/MenuPage.tsx`: filter and render menu presence states from platform catalog rows
- `src/renderer/src/components/MenuTable.tsx`: hide raw IDs, show absence badges, and clarify source status
- `src/renderer/src/pages/OptionPage.tsx`: option-management screen for logical bundles
- `src/renderer/src/components/OptionGroupTable.tsx`: option bundle list with status filters and expand/collapse details
- `src/renderer/src/styles/app.css`: layout and state styling for the new dashboard/menu/option UI
- `tests/unit/shared/preload-contract.test.ts`: IPC surface contract
- `tests/unit/main/*.test.ts`: repository/service/orchestrator/sync tests
- `tests/unit/renderer/*.test.tsx`: dashboard/menu/option view tests
- `docs/current-status.md`: development status snapshot
- `README.md`: operator usage and manual verification notes

## Task 1: Expand Shared Contracts for Presence, Import Runs, and Option Bundles

**Files:**
- Modify: `src/shared/contracts.ts`
- Test: `tests/unit/shared/preload-contract.test.ts`

- [ ] **Step 1: Write the failing preload contract test**

Update `tests/unit/shared/preload-contract.test.ts` to lock the new preload surface:

```ts
import { describe, expect, it } from 'vitest'
import { appApiKeys } from '../../../src/shared/contracts'

describe('preload contract', () => {
  it('exposes the expected renderer API keys', () => {
    expect(appApiKeys).toEqual([
      'menus',
      'mappings',
      'platformOptionGroups',
      'logicalOptionGroups',
      'platformMenus',
      'platformImportRuns',
      'platformImportChanges',
      'settings',
      'syncRuns',
      'sync'
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/unit/shared/preload-contract.test.ts
```

Expected: FAIL because `appApiKeys` does not include `logicalOptionGroups`, `platformImportRuns`, and `platformImportChanges`.

- [ ] **Step 3: Add the shared presence/import/option models**

Update `src/shared/contracts.ts` to this target shape:

```ts
export const appApiKeys = [
  'menus',
  'mappings',
  'platformOptionGroups',
  'logicalOptionGroups',
  'platformMenus',
  'platformImportRuns',
  'platformImportChanges',
  'settings',
  'syncRuns',
  'sync'
] as const

export type CatalogPresenceStatus =
  | 'present'
  | 'missing_suspected'
  | 'absent_confirmed'
  | 'resurfaced'

export type CatalogEntityType = 'menu' | 'option_group'
export type PlatformImportRunStatus = 'running' | 'completed' | 'partial_failed'
export type PlatformImportChangeType =
  | 'created'
  | 'missing_suspected'
  | 'absent_confirmed'
  | 'resurfaced'
  | 'name_changed'
  | 'price_changed'
  | 'option_signature_changed'

export type PlatformMappingStatus = 'active' | 'source_absent'

export interface PlatformImportRunRecord {
  importRunId: string
  platformCode: PlatformCode
  startedAt: string
  finishedAt?: string | null
  status: PlatformImportRunStatus
  menuFetchCompleted: number
  optionFetchCompleted: number
  summaryJson?: string | null
}

export interface PlatformImportChangeRecord {
  changeId: string
  importRunId: string
  platformCode: PlatformCode
  entityType: CatalogEntityType
  entityKey: string
  entityName: string
  changeType: PlatformImportChangeType
  presenceStatus?: CatalogPresenceStatus | null
  beforeJson?: string | null
  afterJson?: string | null
  createdAt?: string
}

export interface LogicalOptionGroupRecord {
  logicalGroupKey: string
  platformCode: PlatformCode
  displayName: string
  minOrderQuantity?: number | null
  maxOrderQuantity?: number | null
  optionCount: number
  connectedMenuCount: number
  sourceGroupCount: number
  sampleOptionNames: string[]
  status:
    | 'single'
    | 'merge_candidate'
    | 'shape_conflict'
    | 'missing_suspected'
    | 'absent_confirmed'
    | 'resurfaced'
  sourceGroups: Array<{
    optionGroupId: string
    optionGroupName: string
    presenceStatus: CatalogPresenceStatus
    lastSeenAt?: string | null
    linkedMenuNames: string[]
  }>
}

export interface PlatformMenuCatalogRecord {
  platformCode: PlatformCode
  platformMenuId: string
  platformMenuName: string
  platformMenuCurrentPrice?: number | null
  platformMenuPriceCount?: number | null
  platformMenuGroupName?: string | null
  platformMenuStatus?: string | null
  platformMenuPriceSummary?: string | null
  platformMenuBindingSummary?: string | null
  platformMenuBindingStatus?: PlatformMenuBindingStatus | null
  lastSeenImportId?: string | null
  lastSeenAt?: string | null
  missingStreak?: number
  presenceStatus?: CatalogPresenceStatus
  presenceChangedAt?: string | null
}

export interface PlatformOptionGroupRecord {
  platformCode: PlatformCode
  optionGroupId: string
  optionGroupName: string
  minOrderQuantity?: number | null
  maxOrderQuantity?: number | null
  mappingMenusCount?: number | null
  options: PlatformOptionItemRecord[]
  menus: PlatformOptionGroupMenuRecord[]
  signatureKey?: string | null
  lastSeenImportId?: string | null
  lastSeenAt?: string | null
  missingStreak?: number
  presenceStatus?: CatalogPresenceStatus
  presenceChangedAt?: string | null
}

export interface PlatformMenuMappingRecord {
  mappingId: string
  menuId: string
  platformCode: PlatformCode
  platformMenuId: string
  platformMenuName: string
  mappingStatus?: PlatformMappingStatus
  platformMenuCurrentPrice?: number | null
  platformMenuPriceCount?: number | null
  platformMenuGroupName?: string | null
  platformMenuStatus?: string | null
  platformMenuPriceSummary?: string | null
  platformMenuBindingSummary?: string | null
  platformMenuBindingStatus?: PlatformMenuBindingStatus | null
  matchedBy: 'auto' | 'manual'
  isConfirmed: number
  lastVerifiedAt?: string | null
}
```

- [ ] **Step 4: Run the shared contract checks**

Run:

```bash
npm run test -- tests/unit/shared/preload-contract.test.ts
npm run lint:types
```

Expected: PASS on the preload-contract test and no TypeScript errors from the new shared types.

- [ ] **Step 5: Commit the contract expansion**

Run:

```bash
git add src/shared/contracts.ts tests/unit/shared/preload-contract.test.ts
git commit -m "feat: add shared catalog presence contracts"
```

Expected: one commit containing only the shared contract surface change.

## Task 2: Add Schema Upgrades and Non-Destructive Catalog Repositories

**Files:**
- Modify: `src/main/db/migrations.ts`
- Modify: `src/main/repositories/platform-menu-repository.ts`
- Modify: `src/main/repositories/platform-option-group-repository.ts`
- Modify: `src/main/repositories/mapping-repository.ts`
- Create: `src/main/repositories/platform-import-run-repository.ts`
- Create: `src/main/repositories/platform-import-change-repository.ts`
- Test: `tests/unit/main/platform-menu-repository.test.ts`
- Test: `tests/unit/main/platform-option-group-repository.test.ts`
- Test: `tests/unit/main/mapping-repository.test.ts`
- Test: `tests/unit/main/platform-import-run-repository.test.ts`
- Test: `tests/unit/main/platform-import-change-repository.test.ts`

- [ ] **Step 1: Write the failing repository tests**

Create or update the tests with these assertions:

```ts
import { describe, expect, it } from 'vitest'
import { PlatformImportRunRepository } from '../../../src/main/repositories/platform-import-run-repository'
import { PlatformImportChangeRepository } from '../../../src/main/repositories/platform-import-change-repository'
import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'

describe('PlatformImportRunRepository', () => {
  it('stores and finishes an import run', () => {
    const db = createInMemoryConnection()
    migrate(db)
    const repository = new PlatformImportRunRepository(db)

    repository.start({
      importRunId: 'run-1',
      platformCode: 'baemin'
    })
    repository.finish('run-1', {
      status: 'completed',
      menuFetchCompleted: 1,
      optionFetchCompleted: 1,
      summaryJson: JSON.stringify({ fetchedCount: 3 })
    })

    expect(repository.listLatest(1)[0]).toMatchObject({
      importRunId: 'run-1',
      platformCode: 'baemin',
      status: 'completed'
    })
  })
})

describe('PlatformMenuRepository', () => {
  it('keeps previously seen rows instead of deleting the whole platform catalog', () => {
    const db = createInMemoryConnection()
    migrate(db)
    const repository = new PlatformMenuRepository(db)

    repository.upsertSeenBatch('baemin', 'run-1', [
      { platformCode: 'baemin', platformMenuId: 'a', platformMenuName: '감자피자' }
    ])
    repository.upsertSeenBatch('baemin', 'run-2', [
      { platformCode: 'baemin', platformMenuId: 'b', platformMenuName: '불고기피자' }
    ])

    expect(repository.listAll().map((row) => row.platformMenuId)).toEqual(['a', 'b'])
  })
})

describe('MappingRepository', () => {
  it('persists source_absent mappings without deleting the row', () => {
    const db = createInMemoryConnection()
    migrate(db)
    const repository = new MappingRepository(db)

    repository.upsert({
      mappingId: 'menu-1:baemin',
      menuId: 'menu-1',
      platformCode: 'baemin',
      platformMenuId: 'a',
      platformMenuName: '감자피자',
      matchedBy: 'manual',
      isConfirmed: 1,
      mappingStatus: 'active'
    })

    repository.setMappingStatus('menu-1:baemin', 'source_absent')

    expect(repository.listAll()[0].mappingStatus).toBe('source_absent')
  })
})
```

- [ ] **Step 2: Run the repository tests to verify they fail**

Run:

```bash
npm run test -- tests/unit/main/platform-menu-repository.test.ts tests/unit/main/platform-option-group-repository.test.ts tests/unit/main/mapping-repository.test.ts tests/unit/main/platform-import-run-repository.test.ts tests/unit/main/platform-import-change-repository.test.ts
```

Expected: FAIL because the new repositories and methods do not exist, and the current catalog repositories still delete by platform.

- [ ] **Step 3: Implement the migration and repository layer**

Update `src/main/db/migrations.ts` and the repository files to this target shape:

```ts
// src/main/db/migrations.ts
db.exec(`
  create table if not exists platform_import_runs (
    import_run_id text primary key,
    platform_code text not null,
    started_at text not null default current_timestamp,
    finished_at text,
    status text not null,
    menu_fetch_completed integer not null default 0,
    option_fetch_completed integer not null default 0,
    summary_json text
  );

  create table if not exists platform_import_changes (
    change_id text primary key,
    import_run_id text not null,
    platform_code text not null,
    entity_type text not null,
    entity_key text not null,
    entity_name text not null,
    change_type text not null,
    presence_status text,
    before_json text,
    after_json text,
    created_at text not null default current_timestamp
  );
`)

const missingPlatformMenuColumns = [
  ['last_seen_import_id', 'text'],
  ['missing_streak', 'integer not null default 0'],
  ['presence_status', "text not null default 'present'"],
  ['presence_changed_at', 'text']
]

const missingOptionGroupColumns = [
  ['signature_key', 'text'],
  ['last_seen_import_id', 'text'],
  ['missing_streak', 'integer not null default 0'],
  ['presence_status', "text not null default 'present'"],
  ['presence_changed_at', 'text']
]

const missingMappingColumns = [
  ['mapping_status', "text not null default 'active'"]
]
```

```ts
// src/main/repositories/platform-menu-repository.ts
upsertSeenBatch(platformCode: PlatformCode, importRunId: string, records: PlatformMenuCatalogRecord[]) {
  const statement = this.db.prepare(`
    insert into platform_menus (
      platform_code,
      platform_menu_id,
      platform_menu_name,
      platform_menu_current_price,
      platform_menu_price_count,
      platform_menu_group_name,
      platform_menu_status,
      platform_menu_price_summary,
      platform_menu_binding_summary,
      platform_menu_binding_status,
      last_seen_import_id,
      last_seen_at,
      missing_streak,
      presence_status,
      presence_changed_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, current_timestamp, 0, 'present', current_timestamp)
    on conflict(platform_code, platform_menu_id) do update set
      platform_menu_name = excluded.platform_menu_name,
      platform_menu_current_price = excluded.platform_menu_current_price,
      platform_menu_price_count = excluded.platform_menu_price_count,
      platform_menu_group_name = excluded.platform_menu_group_name,
      platform_menu_status = excluded.platform_menu_status,
      platform_menu_price_summary = excluded.platform_menu_price_summary,
      platform_menu_binding_summary = excluded.platform_menu_binding_summary,
      platform_menu_binding_status = excluded.platform_menu_binding_status,
      last_seen_import_id = excluded.last_seen_import_id,
      last_seen_at = current_timestamp
  `)
}

applyPresenceUpdates(
  updates: Array<{
    platformCode: PlatformCode
    platformMenuId: string
    missingStreak: number
    presenceStatus: CatalogPresenceStatus
  }>
) {
  const statement = this.db.prepare(`
    update platform_menus
    set missing_streak = ?,
        presence_status = ?,
        presence_changed_at = current_timestamp
    where platform_code = ? and platform_menu_id = ?
  `)
}
```

```ts
// src/main/repositories/mapping-repository.ts
setMappingStatus(mappingId: string, mappingStatus: PlatformMappingStatus) {
  this.db.prepare(`
    update platform_menu_mappings
    set mapping_status = ?
    where mapping_id = ?
  `).run(mappingStatus, mappingId)
}
```

```ts
// src/main/repositories/platform-import-run-repository.ts
export class PlatformImportRunRepository {
  constructor(private readonly db: DatabaseConnection) {}

  start(payload: { importRunId: string; platformCode: PlatformCode }) {
    this.db.prepare(`
      insert into platform_import_runs (
        import_run_id,
        platform_code,
        status
      ) values (?, ?, 'running')
    `).run(payload.importRunId, payload.platformCode)
  }

  finish(
    importRunId: string,
    payload: {
      status: PlatformImportRunStatus
      menuFetchCompleted: number
      optionFetchCompleted: number
      summaryJson?: string | null
    }
  ) {
    this.db.prepare(`
      update platform_import_runs
      set status = ?,
          menu_fetch_completed = ?,
          option_fetch_completed = ?,
          summary_json = ?,
          finished_at = current_timestamp
      where import_run_id = ?
    `).run(
      payload.status,
      payload.menuFetchCompleted,
      payload.optionFetchCompleted,
      payload.summaryJson ?? null,
      importRunId
    )
  }

  listLatest(limit = 20) {
    return this.db.prepare(`
      select
        import_run_id as importRunId,
        platform_code as platformCode,
        started_at as startedAt,
        finished_at as finishedAt,
        status,
        menu_fetch_completed as menuFetchCompleted,
        option_fetch_completed as optionFetchCompleted,
        summary_json as summaryJson
      from platform_import_runs
      order by started_at desc
      limit ?
    `).all(limit) as PlatformImportRunRecord[]
  }
}
```

- [ ] **Step 4: Run the repository test suite**

Run:

```bash
npm run test -- tests/unit/main/platform-menu-repository.test.ts tests/unit/main/platform-option-group-repository.test.ts tests/unit/main/mapping-repository.test.ts tests/unit/main/platform-import-run-repository.test.ts tests/unit/main/platform-import-change-repository.test.ts
```

Expected: PASS with no row-deleting behavior and working import-run/import-change persistence.

- [ ] **Step 5: Commit the persistence layer**

Run:

```bash
git add src/main/db/migrations.ts src/main/repositories/platform-menu-repository.ts src/main/repositories/platform-option-group-repository.ts src/main/repositories/mapping-repository.ts src/main/repositories/platform-import-run-repository.ts src/main/repositories/platform-import-change-repository.ts tests/unit/main/platform-menu-repository.test.ts tests/unit/main/platform-option-group-repository.test.ts tests/unit/main/mapping-repository.test.ts tests/unit/main/platform-import-run-repository.test.ts tests/unit/main/platform-import-change-repository.test.ts
git commit -m "feat: persist catalog presence and import runs"
```

Expected: one commit with the schema and repository groundwork.

## Task 3: Build Common Presence, Diff, and Import Summary Services

**Files:**
- Create: `src/main/services/absence-state-service.ts`
- Create: `src/main/services/catalog-diff-service.ts`
- Create: `src/main/services/import-summary-service.ts`
- Test: `tests/unit/main/absence-state-service.test.ts`
- Test: `tests/unit/main/catalog-diff-service.test.ts`
- Test: `tests/unit/main/import-summary-service.test.ts`

- [ ] **Step 1: Write the failing service tests**

Create the service tests with these cases:

```ts
import { describe, expect, it } from 'vitest'
import { nextPresenceState } from '../../../src/main/services/absence-state-service'
import { diffCatalogRows } from '../../../src/main/services/catalog-diff-service'
import { summarizeImportChanges } from '../../../src/main/services/import-summary-service'

describe('nextPresenceState', () => {
  it('marks the first miss as missing_suspected', () => {
    expect(
      nextPresenceState({
        previousStatus: 'present',
        previousMissingStreak: 0,
        isSeenInCurrentImport: false
      })
    ).toEqual({
      missingStreak: 1,
      presenceStatus: 'missing_suspected'
    })
  })

  it('marks the second consecutive miss as absent_confirmed', () => {
    expect(
      nextPresenceState({
        previousStatus: 'missing_suspected',
        previousMissingStreak: 1,
        isSeenInCurrentImport: false
      })
    ).toEqual({
      missingStreak: 2,
      presenceStatus: 'absent_confirmed'
    })
  })

  it('marks a reappearance as resurfaced', () => {
    expect(
      nextPresenceState({
        previousStatus: 'absent_confirmed',
        previousMissingStreak: 2,
        isSeenInCurrentImport: true
      })
    ).toEqual({
      missingStreak: 0,
      presenceStatus: 'resurfaced'
    })
  })
})

describe('diffCatalogRows', () => {
  it('emits created, price_changed, and missing_suspected changes', () => {
    const changes = diffCatalogRows({
      entityType: 'menu',
      previousRows: [
        { key: 'menu-a', name: '감자피자', comparable: { price: 19900 }, missingStreak: 0, presenceStatus: 'present' },
        { key: 'menu-b', name: '불고기피자', comparable: { price: 20900 }, missingStreak: 0, presenceStatus: 'present' }
      ],
      currentRows: [
        { key: 'menu-a', name: '감자피자', comparable: { price: 20900 } },
        { key: 'menu-c', name: '새우피자', comparable: { price: 23900 } }
      ]
    })

    expect(changes.map((change) => change.changeType)).toEqual([
      'price_changed',
      'created',
      'missing_suspected'
    ])
  })
})

describe('summarizeImportChanges', () => {
  it('counts menu and option changes for dashboard cards', () => {
    const summary = summarizeImportChanges([
      { changeType: 'created', entityType: 'menu' },
      { changeType: 'missing_suspected', entityType: 'menu' },
      { changeType: 'absent_confirmed', entityType: 'option_group' }
    ])

    expect(summary).toEqual({
      createdMenus: 1,
      missingMenus: 1,
      absentMenus: 0,
      mergeCandidateOptionBundles: 0,
      missingOptionGroups: 0,
      absentOptionGroups: 1,
      resurfacedEntities: 0
    })
  })
})
```

- [ ] **Step 2: Run the new service tests and verify they fail**

Run:

```bash
npm run test -- tests/unit/main/absence-state-service.test.ts tests/unit/main/catalog-diff-service.test.ts tests/unit/main/import-summary-service.test.ts
```

Expected: FAIL because the new services do not exist yet.

- [ ] **Step 3: Implement the common catalog services**

Create the services with this target shape:

```ts
// src/main/services/absence-state-service.ts
export const nextPresenceState = ({
  previousStatus,
  previousMissingStreak,
  isSeenInCurrentImport
}: {
  previousStatus: CatalogPresenceStatus
  previousMissingStreak: number
  isSeenInCurrentImport: boolean
}) => {
  if (isSeenInCurrentImport) {
    return {
      missingStreak: 0,
      presenceStatus:
        previousStatus === 'missing_suspected' || previousStatus === 'absent_confirmed'
          ? 'resurfaced'
          : 'present'
    } as const
  }

  const nextMissingStreak = previousMissingStreak + 1
  return {
    missingStreak: nextMissingStreak,
    presenceStatus: nextMissingStreak >= 2 ? 'absent_confirmed' : 'missing_suspected'
  } as const
}
```

```ts
// src/main/services/catalog-diff-service.ts
export const diffCatalogRows = ({
  entityType,
  previousRows,
  currentRows
}: {
  entityType: CatalogEntityType
  previousRows: Array<{
    key: string
    name: string
    comparable: Record<string, unknown>
    missingStreak: number
    presenceStatus: CatalogPresenceStatus
  }>
  currentRows: Array<{
    key: string
    name: string
    comparable: Record<string, unknown>
  }>
}) => {
  const previousByKey = new Map(previousRows.map((row) => [row.key, row]))
  const currentByKey = new Map(currentRows.map((row) => [row.key, row]))
  const changes: PlatformImportChangeRecord[] = []
  const presenceUpdates: Array<{ key: string; missingStreak: number; presenceStatus: CatalogPresenceStatus }> = []

  for (const row of currentRows) {
    const previous = previousByKey.get(row.key)

    if (!previous) {
      changes.push({
        changeId: `${entityType}:${row.key}:created`,
        importRunId: 'current-run',
        platformCode: 'baemin',
        entityType,
        entityKey: row.key,
        entityName: row.name,
        changeType: 'created',
        afterJson: JSON.stringify(row.comparable)
      })
      presenceUpdates.push({ key: row.key, missingStreak: 0, presenceStatus: 'present' })
      continue
    }

    const comparableChanged =
      JSON.stringify(previous.comparable) !== JSON.stringify(row.comparable)
    const nextPresence =
      previous.presenceStatus === 'missing_suspected' || previous.presenceStatus === 'absent_confirmed'
        ? 'resurfaced'
        : 'present'

    presenceUpdates.push({ key: row.key, missingStreak: 0, presenceStatus: nextPresence })

    if (nextPresence === 'resurfaced') {
      changes.push({
        changeId: `${entityType}:${row.key}:resurfaced`,
        importRunId: 'current-run',
        platformCode: 'baemin',
        entityType,
        entityKey: row.key,
        entityName: row.name,
        changeType: 'resurfaced',
        presenceStatus: 'resurfaced',
        afterJson: JSON.stringify(row.comparable)
      })
    }

    if (comparableChanged) {
      changes.push({
        changeId: `${entityType}:${row.key}:changed`,
        importRunId: 'current-run',
        platformCode: 'baemin',
        entityType,
        entityKey: row.key,
        entityName: row.name,
        changeType: entityType === 'menu' ? 'price_changed' : 'option_signature_changed',
        beforeJson: JSON.stringify(previous.comparable),
        afterJson: JSON.stringify(row.comparable)
      })
    }
  }

  for (const previous of previousRows) {
    if (currentByKey.has(previous.key)) continue

    const nextState = nextPresenceState({
      previousStatus: previous.presenceStatus,
      previousMissingStreak: previous.missingStreak,
      isSeenInCurrentImport: false
    })

    presenceUpdates.push({
      key: previous.key,
      missingStreak: nextState.missingStreak,
      presenceStatus: nextState.presenceStatus
    })
    changes.push({
      changeId: `${entityType}:${previous.key}:${nextState.presenceStatus}`,
      importRunId: 'current-run',
      platformCode: 'baemin',
      entityType,
      entityKey: previous.key,
      entityName: previous.name,
      changeType: nextState.presenceStatus,
      presenceStatus: nextState.presenceStatus,
      beforeJson: JSON.stringify(previous.comparable)
    })
  }

  return { changes, presenceUpdates }
}
```

```ts
// src/main/services/import-summary-service.ts
export const summarizeImportChanges = (changes: PlatformImportChangeRecord[]) => {
  return changes.reduce(
    (summary, change) => {
      if (change.entityType === 'menu' && change.changeType === 'created') summary.createdMenus += 1
      if (change.entityType === 'menu' && change.changeType === 'missing_suspected') summary.missingMenus += 1
      if (change.entityType === 'menu' && change.changeType === 'absent_confirmed') summary.absentMenus += 1
      if (change.entityType === 'option_group' && change.changeType === 'missing_suspected') summary.missingOptionGroups += 1
      if (change.entityType === 'option_group' && change.changeType === 'absent_confirmed') summary.absentOptionGroups += 1
      if (change.changeType === 'resurfaced') summary.resurfacedEntities += 1
      return summary
    },
    {
      createdMenus: 0,
      missingMenus: 0,
      absentMenus: 0,
      mergeCandidateOptionBundles: 0,
      missingOptionGroups: 0,
      absentOptionGroups: 0,
      resurfacedEntities: 0
    }
  )
}
```

- [ ] **Step 4: Run the service tests**

Run:

```bash
npm run test -- tests/unit/main/absence-state-service.test.ts tests/unit/main/catalog-diff-service.test.ts tests/unit/main/import-summary-service.test.ts
```

Expected: PASS with deterministic status transitions and dashboard summary counts.

- [ ] **Step 5: Commit the common services**

Run:

```bash
git add src/main/services/absence-state-service.ts src/main/services/catalog-diff-service.ts src/main/services/import-summary-service.ts tests/unit/main/absence-state-service.test.ts tests/unit/main/catalog-diff-service.test.ts tests/unit/main/import-summary-service.test.ts
git commit -m "feat: add reusable catalog diff services"
```

Expected: one commit containing only the reusable service layer.

## Task 4: Add Stable Option Signatures and Logical Option Bundles

**Files:**
- Create: `src/main/services/option-signature.ts`
- Create: `src/main/services/logical-option-group-service.ts`
- Test: `tests/unit/main/option-signature.test.ts`
- Test: `tests/unit/main/logical-option-group-service.test.ts`

- [ ] **Step 1: Write the failing option-group tests**

Create the tests with these assertions:

```ts
import { describe, expect, it } from 'vitest'
import { buildOptionSignature } from '../../../src/main/services/option-signature'
import { buildLogicalOptionGroups } from '../../../src/main/services/logical-option-group-service'

describe('buildOptionSignature', () => {
  it('ignores linked menus and option item order', () => {
    const first = buildOptionSignature({
      optionGroupName: '사이즈 선택',
      minOrderQuantity: 1,
      maxOrderQuantity: 1,
      options: [
        { optionId: 'b', optionName: 'L', optionPrice: 3000 },
        { optionId: 'a', optionName: 'M', optionPrice: 0 }
      ]
    })

    const second = buildOptionSignature({
      optionGroupName: '사이즈 선택',
      minOrderQuantity: 1,
      maxOrderQuantity: 1,
      options: [
        { optionId: 'x', optionName: 'M', optionPrice: 0 },
        { optionId: 'y', optionName: 'L', optionPrice: 3000 }
      ]
    })

    expect(first).toBe(second)
  })
})

describe('buildLogicalOptionGroups', () => {
  it('marks same-shape groups linked to different menus as merge candidates', () => {
    const groups = buildLogicalOptionGroups([
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '사이즈 선택',
        minOrderQuantity: 1,
        maxOrderQuantity: 1,
        options: [
          { optionId: 'm', optionName: 'M', optionPrice: 0 },
          { optionId: 'l', optionName: 'L', optionPrice: 3000 }
        ],
        menus: [{ platformMenuId: 'menu-a', platformMenuName: '불고기피자' }],
        signatureKey: 'same',
        presenceStatus: 'present'
      },
      {
        platformCode: 'baemin',
        optionGroupId: 'g-2',
        optionGroupName: '사이즈 선택',
        minOrderQuantity: 1,
        maxOrderQuantity: 1,
        options: [
          { optionId: 'm2', optionName: 'M', optionPrice: 0 },
          { optionId: 'l2', optionName: 'L', optionPrice: 3000 }
        ],
        menus: [{ platformMenuId: 'menu-b', platformMenuName: '새우피자' }],
        signatureKey: 'same',
        presenceStatus: 'present'
      }
    ])

    expect(groups[0]).toMatchObject({
      status: 'merge_candidate',
      sourceGroupCount: 2,
      connectedMenuCount: 2
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm run test -- tests/unit/main/option-signature.test.ts tests/unit/main/logical-option-group-service.test.ts
```

Expected: FAIL because the option-signature and logical-group services do not exist.

- [ ] **Step 3: Implement the option normalization and grouping services**

Create the services to this target shape:

```ts
// src/main/services/option-signature.ts
const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ')

export const buildOptionSignature = (group: {
  optionGroupName: string
  minOrderQuantity?: number | null
  maxOrderQuantity?: number | null
  options: Array<{ optionName: string; optionPrice?: number | null }>
}) => {
  const normalizedOptions = group.options
    .map((option) => ({
      optionName: normalizeName(option.optionName),
      optionPrice: option.optionPrice ?? 0
    }))
    .sort((left, right) =>
      `${left.optionName}:${left.optionPrice}`.localeCompare(
        `${right.optionName}:${right.optionPrice}`,
        'ko-KR'
      )
    )

  return JSON.stringify({
    optionGroupName: normalizeName(group.optionGroupName),
    minOrderQuantity: group.minOrderQuantity ?? null,
    maxOrderQuantity: group.maxOrderQuantity ?? null,
    options: normalizedOptions
  })
}
```

```ts
// src/main/services/logical-option-group-service.ts
export const buildLogicalOptionGroups = (
  platformGroups: PlatformOptionGroupRecord[]
): LogicalOptionGroupRecord[] => {
  const groupsByKey = new Map<string, PlatformOptionGroupRecord[]>()

  for (const group of platformGroups) {
    const signatureKey = group.signatureKey ?? buildOptionSignature(group)
    const bucketKey = `${group.platformCode}:${signatureKey}`
    groupsByKey.set(bucketKey, [...(groupsByKey.get(bucketKey) ?? []), { ...group, signatureKey }])
  }

  return [...groupsByKey.entries()].map(([logicalGroupKey, sourceGroups]) => {
    const sourceMenuNames = new Set(
      sourceGroups.flatMap((group) => group.menus.map((menu) => menu.platformMenuName))
    )
    const mostSevereStatus =
      sourceGroups.find((group) => group.presenceStatus === 'absent_confirmed')?.presenceStatus
      ?? sourceGroups.find((group) => group.presenceStatus === 'missing_suspected')?.presenceStatus
      ?? sourceGroups.find((group) => group.presenceStatus === 'resurfaced')?.presenceStatus
      ?? 'present'

    return {
      logicalGroupKey,
      platformCode: sourceGroups[0].platformCode,
      displayName: sourceGroups[0].optionGroupName,
      minOrderQuantity: sourceGroups[0].minOrderQuantity ?? null,
      maxOrderQuantity: sourceGroups[0].maxOrderQuantity ?? null,
      optionCount: sourceGroups[0].options.length,
      connectedMenuCount: sourceMenuNames.size,
      sourceGroupCount: sourceGroups.length,
      sampleOptionNames: sourceGroups[0].options.slice(0, 3).map((item) => item.optionName),
      status:
        mostSevereStatus === 'absent_confirmed'
          ? 'absent_confirmed'
          : mostSevereStatus === 'missing_suspected'
            ? 'missing_suspected'
            : mostSevereStatus === 'resurfaced'
              ? 'resurfaced'
              : sourceGroups.length > 1
                ? 'merge_candidate'
                : 'single',
      sourceGroups: sourceGroups.map((group) => ({
        optionGroupId: group.optionGroupId,
        optionGroupName: group.optionGroupName,
        presenceStatus: group.presenceStatus ?? 'present',
        lastSeenAt: group.lastSeenAt ?? null,
        linkedMenuNames: group.menus.map((menu) => menu.platformMenuName)
      }))
    }
  })
}
```

- [ ] **Step 4: Run the option tests**

Run:

```bash
npm run test -- tests/unit/main/option-signature.test.ts tests/unit/main/logical-option-group-service.test.ts
```

Expected: PASS with stable signatures and merge-candidate grouping.

- [ ] **Step 5: Commit the option grouping layer**

Run:

```bash
git add src/main/services/option-signature.ts src/main/services/logical-option-group-service.ts tests/unit/main/option-signature.test.ts tests/unit/main/logical-option-group-service.test.ts
git commit -m "feat: add logical option bundle grouping"
```

Expected: one commit containing only the option grouping logic.

## Task 5: Introduce a Common Catalog Import Orchestrator and Safe Absence Handling

**Files:**
- Create: `src/main/services/catalog-import-orchestrator.ts`
- Modify: `src/main/services/platform-menu-importer.ts`
- Modify: `src/main/platforms/base/types.ts`
- Test: `tests/unit/main/platform-menu-importer.test.ts`
- Test: `tests/unit/main/catalog-import-orchestrator.test.ts`

- [ ] **Step 1: Write the failing orchestrator tests**

Create or update the orchestrator tests with these cases:

```ts
import { describe, expect, it, vi } from 'vitest'
import { CatalogImportOrchestrator } from '../../../src/main/services/catalog-import-orchestrator'

const createOrchestratorFixture = ({
  previousMenus = [],
  currentMenus = [],
  optionFetchError
}: {
  previousMenus?: Array<{ platformMenuId: string; platformMenuName: string; presenceStatus: 'present' | 'missing_suspected' | 'absent_confirmed' | 'resurfaced'; missingStreak: number }>
  currentMenus?: Array<{ platformMenuId: string; platformMenuName: string }>
  optionFetchError?: Error
}) => {
  const platformMenuRepository = {
    upsertSeenBatch: vi.fn(),
    applyPresenceUpdates: vi.fn(),
    listAll: vi.fn().mockReturnValue(previousMenus)
  }
  const platformOptionGroupRepository = {
    upsertSeenBatch: vi.fn(),
    applyPresenceUpdates: vi.fn(),
    listAll: vi.fn().mockReturnValue([])
  }
  const mappingRepository = {
    listAll: vi.fn().mockReturnValue([
      {
        mappingId: 'menu-1:baemin',
        menuId: 'menu-1',
        platformCode: 'baemin',
        platformMenuId: 'a',
        platformMenuName: '감자피자',
        matchedBy: 'manual',
        isConfirmed: 1,
        mappingStatus: 'active'
      }
    ]),
    setMappingStatus: vi.fn()
  }
  const platformImportRunRepository = {
    start: vi.fn(),
    finish: vi.fn(),
    findPreviousCompleted: vi.fn().mockReturnValue({ importRunId: 'run-prev' })
  }

  const orchestrator = new CatalogImportOrchestrator(
    {
      get: vi.fn().mockReturnValue({
        fetchMenus: vi.fn().mockResolvedValue(currentMenus),
        fetchOptionGroups: optionFetchError
          ? vi.fn().mockRejectedValue(optionFetchError)
          : vi.fn().mockResolvedValue([])
      })
    } as never,
    platformMenuRepository as never,
    platformOptionGroupRepository as never,
    mappingRepository as never,
    platformImportRunRepository as never,
    { replaceForRun: vi.fn() } as never,
    { diffMenus: vi.fn().mockReturnValue({ changes: [], presenceUpdates: [] }), diffOptionGroups: vi.fn().mockReturnValue({ changes: [], presenceUpdates: [] }), seedCreatedMenus: vi.fn().mockReturnValue({ changes: [], presenceUpdates: [] }), seedCreatedOptionGroups: vi.fn().mockReturnValue({ changes: [], presenceUpdates: [] }) } as never,
    { list: vi.fn().mockReturnValue([{ menuId: 'menu-1', baseName: '감자피자', basePrice: 19900, isDirty: 0, isManaged: 1 }]), upsert: vi.fn() } as never,
    vi.fn(() => 'run-current')
  )

  return {
    orchestrator,
    platformMenuRepository,
    platformImportRunRepository,
    mappingRepository
  }
}

describe('CatalogImportOrchestrator', () => {
  it('marks the first missing menu as missing_suspected without disabling the mapping', async () => {
    const orchestrator = createOrchestratorFixture({
      previousMenus: [{ platformMenuId: 'a', platformMenuName: '감자피자', presenceStatus: 'present', missingStreak: 0 }],
      currentMenus: []
    })

    await orchestrator.importPlatform('baemin')

    expect(orchestrator.platformMenuRepository.applyPresenceUpdates).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          platformMenuId: 'a',
          presenceStatus: 'missing_suspected',
          missingStreak: 1
        })
      ])
    )
    expect(orchestrator.mappingRepository.setMappingStatus).not.toHaveBeenCalled()
  })

  it('marks the second missing menu as absent_confirmed and deactivates the mapping', async () => {
    const orchestrator = createOrchestratorFixture({
      previousMenus: [{ platformMenuId: 'a', platformMenuName: '감자피자', presenceStatus: 'missing_suspected', missingStreak: 1 }],
      currentMenus: []
    })

    await orchestrator.importPlatform('baemin')

    expect(orchestrator.mappingRepository.setMappingStatus).toHaveBeenCalledWith(
      'menu-1:baemin',
      'source_absent'
    )
  })

  it('does not update absence state from a partial option-fetch failure', async () => {
    const orchestrator = createOrchestratorFixture({
      currentMenus: [{ platformMenuId: 'a', platformMenuName: '감자피자' }],
      optionFetchError: new Error('timeout')
    })

    await expect(orchestrator.importPlatform('baemin')).rejects.toThrow('timeout')
    expect(orchestrator.platformMenuRepository.applyPresenceUpdates).not.toHaveBeenCalled()
    expect(orchestrator.platformImportRunRepository.finish).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'partial_failed' })
    )
  })
})
```

- [ ] **Step 2: Run the orchestrator tests to verify they fail**

Run:

```bash
npm run test -- tests/unit/main/platform-menu-importer.test.ts tests/unit/main/catalog-import-orchestrator.test.ts
```

Expected: FAIL because no orchestrator exists and the importer still uses destructive `replaceForPlatform`.

- [ ] **Step 3: Implement the orchestrator and delegate the importer**

Create `src/main/services/catalog-import-orchestrator.ts` and slim `src/main/services/platform-menu-importer.ts` to this target shape:

```ts
// src/main/platforms/base/types.ts
export interface PlatformAdapterCapabilities {
  optionCatalog: boolean
}

export interface PlatformAdapter {
  capabilities?: PlatformAdapterCapabilities
  fetchMenus(): Promise<PlatformMenuSnapshot[]>
  fetchMenusWithInspection?(): Promise<{
    menus: PlatformMenuSnapshot[]
    inspection?: PlatformInspectionReport
  }>
  fetchOptionGroups?(): Promise<PlatformOptionGroupSnapshot[]>
}
```

```ts
// src/main/services/catalog-import-orchestrator.ts
export class CatalogImportOrchestrator {
  async importPlatform(platformCode: PlatformCode): Promise<PlatformImportResult> {
    const adapter = this.adapterRegistry.get(platformCode)
    const importRunId = this.createId()
    this.platformImportRunRepository.start({ importRunId, platformCode })

    try {
      const fetchResult = adapter.fetchMenusWithInspection
        ? await adapter.fetchMenusWithInspection()
        : { menus: await adapter.fetchMenus(), inspection: undefined }

      const optionCatalogSupported = Boolean(adapter.fetchOptionGroups || adapter.capabilities?.optionCatalog)
      const optionGroups = adapter.fetchOptionGroups ? await adapter.fetchOptionGroups() : []

      const platformMenus = this.normalizeMenus(platformCode, fetchResult.menus)
      const normalizedOptionGroups = this.normalizeOptionGroups(platformCode, optionGroups)

      this.platformMenuRepository.upsertSeenBatch(platformCode, importRunId, platformMenus)
      this.platformOptionGroupRepository.upsertSeenBatch(platformCode, importRunId, normalizedOptionGroups)

      const previousCompletedRun = this.platformImportRunRepository.findPreviousCompleted(platformCode, importRunId)
      const menuDiff = previousCompletedRun
        ? this.catalogDiffService.diffMenus(platformCode, previousCompletedRun.importRunId, platformMenus)
        : this.catalogDiffService.seedCreatedMenus(platformCode, importRunId, platformMenus)
      const optionDiff = previousCompletedRun && optionCatalogSupported
        ? this.catalogDiffService.diffOptionGroups(platformCode, previousCompletedRun.importRunId, normalizedOptionGroups)
        : this.catalogDiffService.seedCreatedOptionGroups(platformCode, importRunId, normalizedOptionGroups)

      this.platformMenuRepository.applyPresenceUpdates(menuDiff.presenceUpdates)
      this.platformOptionGroupRepository.applyPresenceUpdates(optionDiff.presenceUpdates)
      this.platformImportChangeRepository.replaceForRun(importRunId, [...menuDiff.changes, ...optionDiff.changes])
      this.deactivateAbsentMappings(platformCode, menuDiff.changes)
      this.autoExcludeMenusWithoutActiveMappings()

      const summary = this.buildSummary(platformCode, platformMenus, [...menuDiff.changes, ...optionDiff.changes])
      this.platformImportRunRepository.finish(importRunId, {
        status: 'completed',
        menuFetchCompleted: 1,
        optionFetchCompleted: optionCatalogSupported ? 1 : 0,
        summaryJson: JSON.stringify(summary)
      })

      return { summary, inspection: fetchResult.inspection, importRunId, changes: [...menuDiff.changes, ...optionDiff.changes] }
    } catch (error) {
      this.platformImportRunRepository.finish(importRunId, {
        status: 'partial_failed',
        menuFetchCompleted: 0,
        optionFetchCompleted: 0,
        summaryJson: null
      })
      throw error
    }
  }
}
```

```ts
// src/main/services/platform-menu-importer.ts
export class PlatformMenuImporter {
  constructor(private readonly orchestrator: { importPlatform: (platformCode: PlatformCode) => Promise<PlatformImportResult> }) {}

  async importPlatform(platformCode: PlatformCode) {
    return this.orchestrator.importPlatform(platformCode)
  }
}
```

- [ ] **Step 4: Run the importer/orchestrator tests**

Run:

```bash
npm run test -- tests/unit/main/platform-menu-importer.test.ts tests/unit/main/catalog-import-orchestrator.test.ts
```

Expected: PASS with first-miss, second-miss, and partial-failure behavior covered.

- [ ] **Step 5: Commit the import orchestration**

Run:

```bash
git add src/main/services/catalog-import-orchestrator.ts src/main/services/platform-menu-importer.ts src/main/platforms/base/types.ts tests/unit/main/platform-menu-importer.test.ts tests/unit/main/catalog-import-orchestrator.test.ts
git commit -m "feat: orchestrate catalog imports with absence tracking"
```

Expected: one commit that moves catalog import behavior behind the new orchestrator.

## Task 6: Expose Import Changes to the Renderer and Protect Sync Preview from Missing Sources

**Files:**
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/src/lib/api.ts`
- Modify: `src/main/services/sync-planner.ts`
- Test: `tests/unit/main/register-handlers.test.ts`
- Test: `tests/unit/main/sync-planner.test.ts`
- Test: `tests/unit/shared/preload-contract.test.ts`

- [ ] **Step 1: Write the failing IPC and sync-planner tests**

Update the tests to assert the new handlers and sync guard:

```ts
import { describe, expect, it } from 'vitest'
import { buildSyncPreview } from '../../../src/main/services/sync-planner'

describe('buildSyncPreview', () => {
  it('skips mappings whose source has been deactivated or is missing', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'menu-1', baseName: '감자피자', basePrice: 19900, isDirty: 1, isManaged: 1 }],
      mappings: [
        {
          mappingId: 'menu-1:baemin',
          menuId: 'menu-1',
          platformCode: 'baemin',
          platformMenuId: 'platform-1',
          platformMenuName: '감자피자',
          matchedBy: 'manual',
          isConfirmed: 1,
          mappingStatus: 'source_absent'
        }
      ],
      platformMenus: [
        {
          platformCode: 'baemin',
          platformMenuId: 'platform-1',
          platformMenuName: '감자피자',
          presenceStatus: 'absent_confirmed'
        }
      ]
    })

    expect(preview.items).toEqual([])
    expect(preview.needsReview).toEqual([
      expect.objectContaining({
        menuId: 'menu-1',
        platformCode: 'baemin',
        reason: 'source_missing_review'
      })
    ])
  })
})
```

```ts
import { ipcMain } from 'electron'
import { registerHandlers } from '../../../src/main/ipc/register-handlers'

describe('registerHandlers', () => {
  it('registers import change and logical option group handlers', () => {
    registerHandlers({
      menuRepository: { list: () => [], upsert: () => {} },
      mappingRepository: { listAll: () => [], upsert: () => {} },
      platformMenuRepository: { listAll: () => [] },
      platformOptionGroupRepository: { listAll: () => [] },
      platformImportRunRepository: { listLatest: () => [] },
      platformImportChangeRepository: { listLatest: () => [] },
      logicalOptionGroupService: { build: () => [] },
      syncRunRepository: { list: () => [] },
      credentialVault: { get: () => undefined, set: () => {} } as never
    } as never)

    expect(ipcMain.removeHandler).toHaveBeenCalledWith('platformImportChanges:listLatest')
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('logicalOptionGroups:list')
  })
})
```

- [ ] **Step 2: Run the failing IPC and sync tests**

Run:

```bash
npm run test -- tests/unit/main/register-handlers.test.ts tests/unit/main/sync-planner.test.ts tests/unit/shared/preload-contract.test.ts
```

Expected: FAIL because the new IPC channels do not exist and `buildSyncPreview` does not inspect mapping/catalog status.

- [ ] **Step 3: Implement the preload bridge, handlers, and preview guard**

Update the files to this target shape:

```ts
// src/main/preload.ts
contextBridge.exposeInMainWorld('appApi', {
  menus: {
    list: () => ipcRenderer.invoke('menus:list')
  },
  platformImportRuns: {
    list: () => ipcRenderer.invoke('platformImportRuns:list')
  },
  platformImportChanges: {
    listLatest: (limit = 50) => ipcRenderer.invoke('platformImportChanges:listLatest', limit)
  },
  logicalOptionGroups: {
    list: () => ipcRenderer.invoke('logicalOptionGroups:list')
  }
})
```

```ts
// src/renderer/src/lib/api.ts
platformImportRuns: {
  list: () => Promise<PlatformImportRunRecord[]>
},
platformImportChanges: {
  listLatest: (limit?: number) => Promise<PlatformImportChangeRecord[]>
},
logicalOptionGroups: {
  list: () => Promise<LogicalOptionGroupRecord[]>
}
```

```ts
// src/main/ipc/register-handlers.ts
register('platformImportRuns:list', async () => platformImportRunRepository?.listLatest() ?? [])
register('platformImportChanges:listLatest', async (_event, limit) =>
  platformImportChangeRepository?.listLatest(typeof limit === 'number' ? limit : 50) ?? []
)
register('logicalOptionGroups:list', async () =>
  logicalOptionGroupService?.build(platformOptionGroupRepository?.listAll() ?? []) ?? []
)

register('sync:preview', async () =>
  buildSyncPreview({
    menus: menuRepository.list(),
    mappings: mappingRepository.listAll(),
    platformMenus: platformMenuRepository.listAll()
  })
)
```

```ts
// src/main/services/sync-planner.ts
export const buildSyncPreview = ({
  menus,
  mappings,
  platformMenus
}: {
  menus: MenuRecord[]
  mappings: PlatformMenuMappingRecord[]
  platformMenus: PlatformMenuCatalogRecord[]
}): SyncPreviewResult => {
  const platformMenuIndex = new Map(
    platformMenus.map((menu) => [`${menu.platformCode}:${menu.platformMenuId}`, menu])
  )

  for (const mapping of mappings) {
    const menu = menus.find((item) => item.menuId === mapping.menuId)
    if (!menu || (menu.isManaged ?? 1) === 0) {
      continue
    }

    const source = platformMenuIndex.get(`${mapping.platformCode}:${mapping.platformMenuId}`)

    if (mapping.mappingStatus === 'source_absent' || source?.presenceStatus === 'absent_confirmed' || source?.presenceStatus === 'missing_suspected') {
      needsReview.push({
        menuId: mapping.menuId,
        platformCode: mapping.platformCode,
        platformMenuId: mapping.platformMenuId,
        reason: 'source_missing_review',
        detail: '플랫폼 원본 메뉴가 다시 확인될 때까지 반영을 보류합니다.'
      })
      continue
    }

    items.push({
      platformCode: mapping.platformCode,
      menuId: mapping.menuId,
      platformMenuId: mapping.platformMenuId,
      previousName: mapping.platformMenuName,
      previousPrice: mapping.platformMenuCurrentPrice ?? null,
      nextName: menu.baseName,
      nextPrice: menu.basePrice
    })
  }
}
```

- [ ] **Step 4: Run the IPC and sync tests**

Run:

```bash
npm run test -- tests/unit/main/register-handlers.test.ts tests/unit/main/sync-planner.test.ts tests/unit/shared/preload-contract.test.ts
```

Expected: PASS with the new IPC channels and a preview that refuses missing sources.

- [ ] **Step 5: Commit the renderer bridge and preview protection**

Run:

```bash
git add src/main/ipc/register-handlers.ts src/main/preload.ts src/renderer/src/lib/api.ts src/main/services/sync-planner.ts tests/unit/main/register-handlers.test.ts tests/unit/main/sync-planner.test.ts tests/unit/shared/preload-contract.test.ts
git commit -m "feat: expose import changes and guard sync preview"
```

Expected: one commit for the IPC surface and sync guard only.

## Task 7: Update Dashboard and Menu Management for Presence States and Hidden IDs

**Files:**
- Modify: `src/renderer/src/pages/DashboardPage.tsx`
- Modify: `src/renderer/src/pages/MenuPage.tsx`
- Modify: `src/renderer/src/components/MenuTable.tsx`
- Modify: `src/renderer/src/styles/app.css`
- Test: `tests/unit/renderer/dashboard-page.test.tsx`
- Test: `tests/unit/renderer/menu-page.test.tsx`
- Test: `tests/unit/renderer/menu-table.test.tsx`

- [ ] **Step 1: Write the failing renderer tests**

Update the dashboard and menu tests to assert the new UI:

```tsx
import { render, screen } from '@testing-library/react'
import { DashboardPage } from '../../../src/renderer/src/pages/DashboardPage'

describe('DashboardPage', () => {
  it('renders the latest import change summary card', async () => {
    window.appApi = {
      ...window.appApi,
      platformImportChanges: {
        listLatest: async () => [
          {
            changeId: 'c-1',
            importRunId: 'run-1',
            platformCode: 'baemin',
            entityType: 'menu',
            entityKey: 'platform-1',
            entityName: '감자피자',
            changeType: 'missing_suspected'
          }
        ]
      }
    } as never

    render(<DashboardPage />)

    expect(await screen.findByText('이번 가져오기 변경점')).toBeInTheDocument()
    expect(screen.getByText('누락 의심 메뉴 1개')).toBeInTheDocument()
  })
})
```

```tsx
import { render, screen } from '@testing-library/react'
import { MenuPage } from '../../../src/renderer/src/pages/MenuPage'

const mockMenuPageApi = (payload: {
  menus: unknown[]
  mappings: unknown[]
  platformMenus: unknown[]
  platformOptionGroups: unknown[]
}) => {
  vi.doMock('../../../src/renderer/src/lib/api', () => ({
    appApi: {
      menus: { list: vi.fn().mockResolvedValue(payload.menus), save: vi.fn(), delete: vi.fn() },
      mappings: { list: vi.fn().mockResolvedValue(payload.mappings), save: vi.fn(), delete: vi.fn() },
      platformMenus: { list: vi.fn().mockResolvedValue(payload.platformMenus) },
      platformOptionGroups: { list: vi.fn().mockResolvedValue(payload.platformOptionGroups) },
      platformImportChanges: { listLatest: vi.fn().mockResolvedValue([]) },
      settings: { getPlatformCredentialStatus: vi.fn() },
      syncRuns: { list: vi.fn().mockResolvedValue([]) },
      sync: { preview: vi.fn().mockResolvedValue({ items: [], needsReview: [] }), run: vi.fn() }
    }
  }))
}

describe('MenuPage', () => {
  it('filters platform-absent menus and hides raw IDs from the source card', async () => {
    mockMenuPageApi({
      menus: [{ menuId: 'menu-1', baseName: '감자피자', basePrice: 19900, isDirty: 0, isManaged: 1 }],
      mappings: [{ mappingId: 'menu-1:baemin', menuId: 'menu-1', platformCode: 'baemin', platformMenuId: 'platform-1', platformMenuName: '감자피자', matchedBy: 'manual', isConfirmed: 1 }],
      platformMenus: [{ platformCode: 'baemin', platformMenuId: 'platform-1', platformMenuName: '감자피자', presenceStatus: 'absent_confirmed', lastSeenAt: '2026-04-13T11:00:00.000Z' }],
      platformOptionGroups: []
    })

    render(<MenuPage />)

    expect(await screen.findByRole('button', { name: /플랫폼에 없음 1/i })).toBeInTheDocument()
    expect(screen.queryByText(/ID platform-1/i)).not.toBeInTheDocument()
    expect(screen.getByText('플랫폼에 없음')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the renderer tests and verify they fail**

Run:

```bash
npm run test -- tests/unit/renderer/dashboard-page.test.tsx tests/unit/renderer/menu-page.test.tsx tests/unit/renderer/menu-table.test.tsx
```

Expected: FAIL because the dashboard does not read import changes, the menu screen has no absence filters, and the source card still shows raw IDs.

- [ ] **Step 3: Implement the dashboard and menu UI updates**

Update the renderer files to this target shape:

```tsx
// src/renderer/src/pages/DashboardPage.tsx
const [latestImportChanges, setLatestImportChanges] = useState<PlatformImportChangeRecord[]>([])

useEffect(() => {
  void appApi.platformImportChanges.listLatest(50).then((value) => {
    setLatestImportChanges(Array.isArray(value) ? value : [])
  })
}, [])

const importSummaryLines = summarizeImportChangesForView(latestImportChanges)

<section className="panel">
  <div className="page-header">
    <h2>이번 가져오기 변경점</h2>
    <p>최근 정상 수집에서 바뀐 메뉴와 옵션만 모아서 보여줍니다.</p>
  </div>
  <div className="import-summary-list">
    {importSummaryLines.length ? importSummaryLines.map((line) => <span key={line}>{line}</span>) : <span>최근 변경점이 없습니다.</span>}
  </div>
</section>
```

```tsx
// src/renderer/src/pages/MenuPage.tsx
type MenuFilter =
  | 'all'
  | 'managed'
  | 'excluded'
  | 'binding-review'
  | 'missing-suspected'
  | 'platform-absent'
  | 'resurfaced'

const buildPlatformMenuIndex = (platformMenus: PlatformMenuCatalogRecord[]) =>
  new Map(platformMenus.map((menu) => [`${menu.platformCode}:${menu.platformMenuId}`, menu]))

const buildMenuRows = (
  menus: MenuRow[],
  mappings: PlatformMenuMappingRecord[],
  platformMenus: PlatformMenuCatalogRecord[],
  platformOptionGroups: PlatformOptionGroupRecord[]
): MenuRow[] => {
  const platformMenuIndex = buildPlatformMenuIndex(platformMenus)

  return menus.map((menu) => ({
    ...menu,
    sources: mappings
      .filter((mapping) => mapping.menuId === menu.menuId)
      .map((mapping) => {
        const sourceCatalog = platformMenuIndex.get(`${mapping.platformCode}:${mapping.platformMenuId}`)
        return {
          platformCode: mapping.platformCode,
          platformMenuId: mapping.platformMenuId,
          platformMenuName: mapping.platformMenuName,
          mappingStatus: mapping.mappingStatus ?? 'active',
          presenceStatus: sourceCatalog?.presenceStatus ?? 'present',
          lastSeenAt: sourceCatalog?.lastSeenAt ?? null,
          platformMenuGroupName: mapping.platformMenuGroupName ?? undefined,
          platformMenuStatus: mapping.platformMenuStatus ?? undefined,
          platformMenuPriceSummary: mapping.platformMenuPriceSummary ?? undefined,
          platformMenuBindingSummary: mapping.platformMenuBindingSummary ?? undefined,
          platformMenuBindingStatus: mapping.platformMenuBindingStatus ?? undefined,
          optionGroups: optionGroupsBySourceKey.get(`${mapping.platformCode}:${mapping.platformMenuId}`) ?? []
        }
      })
  }))
}
```

```tsx
// src/renderer/src/components/MenuTable.tsx
<p className="source-line">{getPlatformLabel(source.platformCode)}</p>
<p className="source-title">{source.platformMenuName}</p>
<div className="meta-chip-list">
  <span className={`meta-chip presence-${source.presenceStatus ?? 'present'}`}>
    {getPresenceLabel(source.presenceStatus, source.mappingStatus)}
  </span>
  {metaItems.map((item) => (
    <span className="meta-chip" key={item}>{item}</span>
  ))}
</div>
{source.lastSeenAt ? <p className="source-note">{`마지막 확인 ${formatDateTime(source.lastSeenAt)}`}</p> : null}
```

- [ ] **Step 4: Run the renderer tests**

Run:

```bash
npm run test -- tests/unit/renderer/dashboard-page.test.tsx tests/unit/renderer/menu-page.test.tsx tests/unit/renderer/menu-table.test.tsx
```

Expected: PASS with the import summary panel, new menu filters, and no raw source IDs in the default menu UI.

- [ ] **Step 5: Commit the dashboard and menu UI**

Run:

```bash
git add src/renderer/src/pages/DashboardPage.tsx src/renderer/src/pages/MenuPage.tsx src/renderer/src/components/MenuTable.tsx src/renderer/src/styles/app.css tests/unit/renderer/dashboard-page.test.tsx tests/unit/renderer/menu-page.test.tsx tests/unit/renderer/menu-table.test.tsx
git commit -m "feat: surface import change states in dashboard and menus"
```

Expected: one commit containing only the dashboard/menu renderer changes.

## Task 8: Add the Option Management Tab Backed by Logical Option Bundles

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/pages/OptionPage.tsx`
- Create: `src/renderer/src/components/OptionGroupTable.tsx`
- Modify: `src/renderer/src/styles/app.css`
- Test: `tests/unit/renderer/option-page.test.tsx`
- Test: `tests/unit/renderer/app.test.tsx`

- [ ] **Step 1: Write the failing option-management renderer tests**

Create the option tests with these assertions:

```tsx
import { render, screen } from '@testing-library/react'
import App from '../../../src/renderer/src/App'
import { OptionPage } from '../../../src/renderer/src/pages/OptionPage'

const mockOptionPageApi = (payload: { logicalOptionGroups: unknown[] }) => {
  vi.doMock('../../../src/renderer/src/lib/api', () => ({
    appApi: {
      logicalOptionGroups: { list: vi.fn().mockResolvedValue(payload.logicalOptionGroups) },
      platformImportChanges: { listLatest: vi.fn().mockResolvedValue([]) },
      menus: { list: vi.fn().mockResolvedValue([]), save: vi.fn(), delete: vi.fn() },
      mappings: { list: vi.fn().mockResolvedValue([]), save: vi.fn(), delete: vi.fn() },
      platformMenus: { list: vi.fn().mockResolvedValue([]) },
      platformOptionGroups: { list: vi.fn().mockResolvedValue([]) },
      settings: { getPlatformCredentialStatus: vi.fn() },
      syncRuns: { list: vi.fn().mockResolvedValue([]) },
      sync: { preview: vi.fn().mockResolvedValue({ items: [], needsReview: [] }), run: vi.fn() }
    }
  }))
}

describe('App navigation', () => {
  it('shows the option management tab', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: '옵션 관리' })).toBeInTheDocument()
  })
})

describe('OptionPage', () => {
  it('renders logical option bundles without exposing raw IDs', async () => {
    mockOptionPageApi({
      logicalOptionGroups: [
        {
          logicalGroupKey: 'baemin:same',
          platformCode: 'baemin',
          displayName: '사이즈 선택',
          minOrderQuantity: 1,
          maxOrderQuantity: 1,
          optionCount: 2,
          connectedMenuCount: 2,
          sourceGroupCount: 2,
          sampleOptionNames: ['M', 'L'],
          status: 'merge_candidate',
          sourceGroups: [
            {
              optionGroupId: 'g-1',
              optionGroupName: '사이즈 선택',
              presenceStatus: 'present',
              linkedMenuNames: ['불고기피자']
            },
            {
              optionGroupId: 'g-2',
              optionGroupName: '사이즈 선택',
              presenceStatus: 'present',
              linkedMenuNames: ['새우피자']
            }
          ]
        }
      ]
    })

    render(<OptionPage />)

    expect(await screen.findByText('사이즈 선택')).toBeInTheDocument()
    expect(screen.getByText('통합 가능')).toBeInTheDocument()
    expect(screen.queryByText(/g-1/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the new renderer tests and verify they fail**

Run:

```bash
npm run test -- tests/unit/renderer/option-page.test.tsx tests/unit/renderer/app.test.tsx
```

Expected: FAIL because there is no `옵션 관리` tab and no option page.

- [ ] **Step 3: Build the option-management page and table**

Create and update the renderer files to this target shape:

```tsx
// src/renderer/src/App.tsx
type TabKey = 'dashboard' | 'menus' | 'options' | 'mapping' | 'settings' | 'history'

<button className={tab === 'options' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('options')}>
  옵션 관리
</button>

{tab === 'options' && <OptionPage />}
```

```tsx
// src/renderer/src/pages/OptionPage.tsx
export const OptionPage = () => {
  const [groups, setGroups] = useState<LogicalOptionGroupRecord[]>([])
  const [filter, setFilter] = useState<'all' | 'merge-candidate' | 'missing' | 'absent'>('all')

  useEffect(() => {
    void appApi.logicalOptionGroups.list().then((value) => {
      setGroups(Array.isArray(value) ? value : [])
    })
  }, [])

  const filteredGroups = groups.filter((group) => {
    if (filter === 'merge-candidate') return group.status === 'merge_candidate'
    if (filter === 'missing') return group.status === 'missing_suspected'
    if (filter === 'absent') return group.status === 'absent_confirmed'
    return true
  })

  return (
    <section className="page">
      <header className="page-header">
        <h1>옵션 관리</h1>
        <p>같은 구성의 옵션은 한 묶음으로 보고, 사라진 옵션은 따로 추적합니다.</p>
      </header>
      <OptionGroupTable groups={filteredGroups} />
    </section>
  )
}
```

```tsx
// src/renderer/src/components/OptionGroupTable.tsx
export const OptionGroupTable = ({ groups }: { groups: LogicalOptionGroupRecord[] }) => (
  <div className="option-group-list">
    {groups.map((group) => (
      <article className="option-group-card" key={group.logicalGroupKey}>
        <header className="option-group-header">
          <div>
            <h2>{group.displayName}</h2>
            <p>{`${group.optionCount}개 옵션 · 연결 메뉴 ${group.connectedMenuCount}개 · 원본 그룹 ${group.sourceGroupCount}개`}</p>
          </div>
          <span className={`status-pill option-status-${group.status}`}>{getOptionGroupStatusLabel(group.status)}</span>
        </header>
        <div className="option-group-samples">
          {group.sampleOptionNames.map((name) => (
            <span className="meta-chip" key={`${group.logicalGroupKey}:${name}`}>{name}</span>
          ))}
        </div>
        <div className="option-group-source-list">
          {group.sourceGroups.map((sourceGroup, index) => (
            <div className="option-group-source-item" key={`${group.logicalGroupKey}:${index}`}>
              <strong>{sourceGroup.optionGroupName}</strong>
              <span>{sourceGroup.linkedMenuNames.join(', ')}</span>
            </div>
          ))}
        </div>
      </article>
    ))}
  </div>
)
```

- [ ] **Step 4: Run the option-management renderer tests**

Run:

```bash
npm run test -- tests/unit/renderer/option-page.test.tsx tests/unit/renderer/app.test.tsx
```

Expected: PASS with the new navigation tab and logical option bundle page.

- [ ] **Step 5: Commit the option-management UI**

Run:

```bash
git add src/renderer/src/App.tsx src/renderer/src/pages/OptionPage.tsx src/renderer/src/components/OptionGroupTable.tsx src/renderer/src/styles/app.css tests/unit/renderer/option-page.test.tsx tests/unit/renderer/app.test.tsx
git commit -m "feat: add option management screen"
```

Expected: one commit containing only the option-management renderer work.

## Task 9: Update Documentation and Run Safe End-to-End Verification

**Files:**
- Modify: `docs/current-status.md`
- Modify: `README.md`

- [ ] **Step 1: Update the operator and developer docs**

Update `docs/current-status.md` and `README.md` with these facts:

```md
## 2026-04-13 추가 범위

- 플랫폼 원본 메뉴/옵션에 `누락 의심`, `플랫폼에 없음`, `재등장` 상태를 저장한다.
- `플랫폼에 없음`은 정상 가져오기 2회 연속 누락일 때만 확정된다.
- 동기화 미리보기는 `source_absent` 또는 `missing_suspected` 원본에 대해 실행하지 않는다.
- 메뉴 관리는 기본 화면에서 내부 ID를 숨긴다.
- 옵션 관리는 `옵션 관리` 탭에서 논리 옵션 묶음 단위로 본다.
```

- [ ] **Step 2: Run the full automated verification suite**

Run:

```bash
npm run lint:types
npm run test
npm run build
```

Expected: all three commands PASS. Do not continue to manual verification until all three are green.

- [ ] **Step 3: Run the desktop app and perform a safe manual verification**

Run:

```bash
npm run dev
```

Then verify this exact manual checklist in the running app with the already-saved Baemin credentials:

```md
1. 계정 연결에서 배민 가져오기를 실행한다.
2. 대시보드에 `이번 가져오기 변경점` 카드가 보이는지 확인한다.
3. 메뉴 관리에서 `누락 의심`, `플랫폼에 없음` 필터가 보이는지 확인한다.
4. 메뉴 원본 카드에 내부 ID 대신 플랫폼명, 상태, 마지막 확인 시간이 보이는지 확인한다.
5. 옵션 관리 탭에서 `통합 가능` 묶음이 보이고, 연결 메뉴명이 함께 보이는지 확인한다.
6. 반영 미리보기에서 `source_absent` 또는 `missing_suspected` 원본이 실행 대상에 들어가지 않는지 확인한다.
```

Expected: PASS on all six checks with no live platform write actions performed during verification.

- [ ] **Step 4: Record the manual verification result in the docs**

Append the result to `docs/current-status.md` using this exact note shape:

```md
### 수동 검증 메모

- 검증일: 2026-04-13
- 환경: Windows 로컬 Electron 개발 실행
- 배민 가져오기: 성공
- 변경점 카드: 확인
- 메뉴 상태 필터: 확인
- 옵션 관리 탭: 확인
- 반영 미리보기 보호: 확인
- 주의: 실서비스 메뉴 추가/삭제/수정은 수행하지 않았음
```

- [ ] **Step 5: Commit the docs and verification evidence**

Run:

```bash
git add docs/current-status.md README.md
git commit -m "docs: record absence and option management behavior"
```

Expected: final commit for documentation and verification only.
