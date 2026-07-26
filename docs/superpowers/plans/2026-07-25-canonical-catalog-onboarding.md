# Canonical Catalog Onboarding and Exception Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate platform collection from canonical catalog creation, let each store choose its initial source, confirm canonical catalog version 1, and show only unresolved menu, price, and option exceptions while remembering operator intent.

**Architecture:** Keep platform snapshots immutable and introduce a single active local catalog workspace for the current release. A bootstrap service creates a reviewed draft from a selected complete platform catalog or a blank catalog; after activation, imports update source snapshots and generate review items instead of silently creating canonical menus. Intent rules suppress or transform repeated exceptions without changing platform source records.

**Tech Stack:** Electron, React, TypeScript, node:sqlite, Zod, Vitest, Testing Library

## Global Constraints

- The initial source is selected per catalog workspace; no platform is a global permanent reference.
- After canonical version 1 activation, the canonical catalog is the source of truth.
- Incomplete platform imports never create drafts, absence transitions, mappings, or review decisions.
- Automatic matching requires a unique safe name match; fuzzy matches remain recommendations.
- No task may delete or rewrite platform source rows.
- No task may write to a delivery platform.
- Existing installations keep their current canonical menus as an active legacy workspace.
- New installations collect platform snapshots without creating canonical menus until onboarding is confirmed.
- Keep the UI single-store for this milestone, but every new workspace, review, and intent record carries `workspaceId`.
- Never stage unrelated files from the existing dirty worktree.

---

## File Map

- `src/shared/contracts.ts`: workspace, bootstrap, review item, and intent rule contracts.
- `src/shared/platforms.ts`: remove the global `referenceCatalog` assumption.
- `src/main/db/migrations.ts`: catalog workspace, review item, and intent rule tables.
- `src/main/repositories/catalog-workspace-repository.ts`: lifecycle and canonical version persistence.
- `src/main/repositories/catalog-review-repository.ts`: fingerprinted review queue persistence.
- `src/main/repositories/catalog-intent-rule-repository.ts`: active operator decision persistence.
- `src/main/services/catalog-bootstrap-service.ts`: seed preview and version 1 activation.
- `src/main/services/catalog-exception-analyzer.ts`: deterministic exception generation.
- `src/main/services/catalog-intent-policy.ts`: apply active decisions to generated exceptions.
- `src/main/services/catalog-import-orchestrator.ts`: source-only import before onboarding and no silent canonical creation afterward.
- `src/main/ipc/register-handlers.ts`: onboarding and review handlers.
- `src/main/preload.ts`: typed renderer bridge methods.
- `src/main/index.ts`: instantiate and connect the new repositories and services.
- `src/renderer/src/App.tsx`: gate the normal workspace behind onboarding state.
- `src/renderer/src/pages/CatalogOnboardingPage.tsx`: initial source and draft confirmation flow.
- `src/renderer/src/components/ReviewInboxPanel.tsx`: grouped operator decisions.
- `src/renderer/src/pages/DashboardPage.tsx`: review summary and action entry.
- `tests/unit/**`: migration, service, handler, and renderer coverage.

### Task 1: Add Catalog Workspace and Review Contracts

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/platforms.ts`
- Modify: `tests/unit/shared/platforms.test.ts`
- Test: `tests/unit/shared/catalog-workspace-contracts.test.ts`

**Interfaces:**
- Consumes: existing `PlatformCode`, `PlatformMenuPriceVariantRecord`.
- Produces: `CatalogWorkspaceRecord`, `CatalogBootstrapPreview`, `CatalogReviewItem`, `CatalogIntentRule`, and request DTOs used by every later task.

- [x] **Step 1: Write the failing shared contract tests**

```ts
import { describe, expect, it } from 'vitest'
import { PLATFORM_METADATA } from '../../../src/shared/platforms'

describe('catalog workspace contracts', () => {
  it('does not encode a global reference platform', () => {
    expect(Object.values(PLATFORM_METADATA).every((item) => !('referenceCatalog' in item))).toBe(true)
  })

  it('allows platform, blank, and migrated legacy seed modes', () => {
    const values = ['platform', 'blank', 'legacy'] as const
    expect(values).toHaveLength(3)
  })
})
```

- [x] **Step 2: Run the test and verify the old global reference fails**

Run: `npx vitest run tests/unit/shared/catalog-workspace-contracts.test.ts`

Expected: FAIL because `PLATFORM_METADATA.baemin.referenceCatalog` exists and the new contracts are missing.

- [x] **Step 3: Add the exact shared types and initial-source eligibility behavior**

```ts
export type CatalogLifecycleState = 'collecting' | 'reviewing' | 'active'
export type CatalogSeedMode = 'platform' | 'blank' | 'legacy'
export type CatalogReviewState = 'open' | 'resolved' | 'deferred' | 'blocked'
export type CatalogReviewRecommendation =
  | 'add_to_platform'
  | 'add_to_canonical'
  | 'align_to_canonical'
  | 'keep_platform_value'
  | 'merge_canonical_only'
  | 'ignore_source'
  | 'manual_review'
export type CatalogReviewKind =
  | 'missing_on_platform'
  | 'unmatched_platform_menu'
  | 'price_outlier'
  | 'price_policy_pattern'
  | 'variant_shape_conflict'
  | 'duplicate_option_group'
  | 'option_shape_conflict'
  | 'legacy_noise_candidate'
  | 'external_drift'
  | 'lossy_projection'
  | 'authentication_required'

export interface CatalogWorkspaceRecord {
  workspaceId: string
  displayName: string
  lifecycleState: CatalogLifecycleState
  seedMode: CatalogSeedMode | null
  seedPlatformCode: PlatformCode | null
  canonicalVersion: number
  activatedAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface CatalogReviewItem {
  reviewItemId: string
  workspaceId: string
  fingerprint: string
  kind: CatalogReviewKind
  state: CatalogReviewState
  confidence: number
  title: string
  explanation: string
  recommendation: CatalogReviewRecommendation | null
  evidenceJson: string
  canonicalMenuId?: string | null
  platformCode?: PlatformCode | null
  sourceEntityId?: string | null
  intentRuleId?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface CatalogIntentRule {
  intentRuleId: string
  workspaceId: string
  kind: CatalogReviewKind
  scope: 'entity' | 'platform' | 'category' | 'field' | 'workspace'
  resolution: 'apply_recommendation' | 'keep_platform_value' | 'exclude_platform' | 'defer' | 'ignore_source' | 'merge_canonical_only'
  platformCode?: PlatformCode | null
  canonicalMenuId?: string | null
  sourceEntityId?: string | null
  fieldKey?: string | null
  reason: string
  expiresAt?: string | null
  isActive: number
  createdAt?: string
  updatedAt?: string
}

export interface CatalogBootstrapDraftMenu {
  menuId: string
  sourcePlatformCode: PlatformCode | null
  sourcePlatformMenuId: string | null
  baseName: string
  basePrice: number
  basePriceVariants: PlatformMenuPriceVariantRecord[] | null
  disposition: 'include' | 'ignore' | 'undecided'
}

export interface CatalogBootstrapPreviewInput {
  workspaceId: string
  seedMode: Exclude<CatalogSeedMode, 'legacy'>
  seedPlatformCode: PlatformCode | null
}

export interface CatalogBootstrapPreview {
  workspaceId: string
  seedMode: Exclude<CatalogSeedMode, 'legacy'>
  seedPlatformCode: PlatformCode | null
  previewFingerprint: string
  draftMenus: CatalogBootstrapDraftMenu[]
  reviewItems: CatalogReviewItem[]
}

export interface CatalogBootstrapActivationInput {
  workspaceId: string
  seedMode: Exclude<CatalogSeedMode, 'legacy'>
  seedPlatformCode: PlatformCode | null
  previewFingerprint: string
  menus: MenuRecord[]
  ignoredSourceEntityIds: string[]
  confirmedMappings: PlatformMenuMappingRecord[]
  remainingReviewItems: CatalogReviewItem[]
}

export interface CatalogReviewResolutionInput {
  reviewItemIds: string[]
  resolution: CatalogIntentRule['resolution']
  remember: boolean
  scope: CatalogIntentRule['scope']
  reason: string
  expiresAt?: string | null
}
```

Remove `referenceCatalog` from `PlatformMetadata` and all six metadata values. Add `getEligibleCatalogSeedPlatforms()` so only complete catalogs are offered without a fixed platform preference. Task 6 adds `catalogWorkspace`, `catalogBootstrap`, and `catalogReviews` to `appApiKeys` together with the matching preload surface so the shared API contract remains green between tasks.

- [x] **Step 4: Run shared tests and type checking**

Run: `npx vitest run tests/unit/shared/platforms.test.ts tests/unit/shared/catalog-workspace-contracts.test.ts`

Expected: PASS.

Run: `npm run lint:types`

Expected: PASS.

- [ ] **Step 5: Commit only Task 1 files**

```bash
git add src/shared/contracts.ts src/shared/platforms.ts tests/unit/shared/platforms.test.ts tests/unit/shared/catalog-workspace-contracts.test.ts
git commit -m "feat: define canonical catalog workspace contracts"
```

### Task 2: Persist Workspace, Review Items, and Intent Rules

**Files:**
- Modify: `src/main/db/migrations.ts`
- Create: `src/main/repositories/catalog-workspace-repository.ts`
- Create: `src/main/repositories/catalog-review-repository.ts`
- Create: `src/main/repositories/catalog-intent-rule-repository.ts`
- Test: `tests/unit/main/catalog-workspace-repository.test.ts`
- Test: `tests/unit/main/catalog-review-repository.test.ts`
- Test: `tests/unit/main/catalog-intent-rule-repository.test.ts`

**Interfaces:**
- Consumes: shared records from Task 1 and `DatabaseConnection`.
- Produces: repositories with `getDefault`, `save`, `replaceOpen`, `resolve`, `listOpen`, `upsert`, and `listActive` methods.

- [x] **Step 1: Write failing repository tests**

```ts
it('creates an empty default workspace on a fresh database', () => {
  const repository = new CatalogWorkspaceRepository(db)
  expect(repository.getDefault()).toMatchObject({
    workspaceId: 'default',
    lifecycleState: 'collecting',
    canonicalVersion: 0
  })
})

it('migrates an existing menu database as an active legacy workspace', () => {
  db.exec(`create table menus (
    menu_id text primary key,
    base_name text not null,
    base_price integer not null,
    is_dirty integer not null default 0
  )`)
  db.prepare('insert into menus (menu_id, base_name, base_price, is_dirty) values (?, ?, ?, 0)')
    .run('m1', '기존 메뉴', 10000)
  migrate(db)
  expect(new CatalogWorkspaceRepository(db).getDefault()).toMatchObject({
    seedMode: 'legacy',
    lifecycleState: 'active',
    canonicalVersion: 1
  })
})

it('deduplicates an open review item by workspace and fingerprint', () => {
  repository.replaceOpen('default', [firstItem, { ...firstItem, explanation: 'new evidence' }])
  expect(repository.listOpen('default')).toHaveLength(1)
})
```

- [x] **Step 2: Run the repository tests and verify missing tables fail**

Run: `npx vitest run tests/unit/main/catalog-workspace-repository.test.ts tests/unit/main/catalog-review-repository.test.ts tests/unit/main/catalog-intent-rule-repository.test.ts`

Expected: FAIL with missing module or missing table errors.

- [x] **Step 3: Add the migrations**

```sql
create table if not exists catalog_workspaces (
  workspace_id text primary key,
  display_name text not null,
  lifecycle_state text not null,
  seed_mode text,
  seed_platform_code text,
  canonical_version integer not null default 0,
  activated_at text,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists catalog_review_items (
  review_item_id text primary key,
  workspace_id text not null,
  fingerprint text not null,
  kind text not null,
  state text not null,
  confidence real not null,
  title text not null,
  explanation text not null,
  recommendation text,
  evidence_json text not null,
  canonical_menu_id text,
  platform_code text,
  source_entity_id text,
  intent_rule_id text,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  unique(workspace_id, fingerprint)
);

create table if not exists catalog_intent_rules (
  intent_rule_id text primary key,
  workspace_id text not null,
  kind text not null,
  scope text not null,
  resolution text not null,
  platform_code text,
  canonical_menu_id text,
  source_entity_id text,
  field_key text,
  reason text not null,
  expires_at text,
  is_active integer not null default 1,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);
```

After the base schema and existing column migrations run, insert `workspace_id = 'default'` once. Use `select count(*) from menus` to choose `collecting/version 0` for a fresh DB and `active/legacy/version 1` for an existing DB.

- [x] **Step 4: Implement focused repositories**

```ts
export class CatalogWorkspaceRepository {
  constructor(private readonly db: DatabaseConnection) {}

  getDefault(): CatalogWorkspaceRecord {
    return this.db.prepare(`select workspace_id as workspaceId, display_name as displayName,
      lifecycle_state as lifecycleState, seed_mode as seedMode,
      seed_platform_code as seedPlatformCode, canonical_version as canonicalVersion,
      activated_at as activatedAt, created_at as createdAt, updated_at as updatedAt
      from catalog_workspaces where workspace_id = 'default'`).get() as CatalogWorkspaceRecord
  }

  save(record: CatalogWorkspaceRecord): void {
    this.db.prepare(`insert into catalog_workspaces (
      workspace_id, display_name, lifecycle_state, seed_mode,
      seed_platform_code, canonical_version, activated_at
    ) values (?, ?, ?, ?, ?, ?, ?)
      on conflict(workspace_id) do update set lifecycle_state = excluded.lifecycle_state,
      display_name = excluded.display_name,
      seed_mode = excluded.seed_mode, seed_platform_code = excluded.seed_platform_code,
      canonical_version = excluded.canonical_version, activated_at = excluded.activated_at,
      updated_at = current_timestamp`).run(
        record.workspaceId,
        record.displayName,
        record.lifecycleState,
        record.seedMode,
        record.seedPlatformCode,
        record.canonicalVersion,
        record.activatedAt ?? null
      )
  }
}
```

Implement review upsert by `(workspace_id, fingerprint)` and intent filtering with `is_active = 1 and (expires_at is null or expires_at > current_timestamp)`.

- [x] **Step 5: Run repository tests and the full migration test group**

Run: `npx vitest run tests/unit/main/catalog-workspace-repository.test.ts tests/unit/main/catalog-review-repository.test.ts tests/unit/main/catalog-intent-rule-repository.test.ts tests/unit/main/db-connection.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit only Task 2 files**

```bash
git add src/main/db/migrations.ts src/main/repositories/catalog-workspace-repository.ts src/main/repositories/catalog-review-repository.ts src/main/repositories/catalog-intent-rule-repository.ts tests/unit/main/catalog-workspace-repository.test.ts tests/unit/main/catalog-review-repository.test.ts tests/unit/main/catalog-intent-rule-repository.test.ts
git commit -m "feat: persist catalog onboarding and intent state"
```

### Task 3: Build Initial Source Preview and Canonical Version 1 Activation

**Files:**
- Create: `src/main/services/catalog-bootstrap-service.ts`
- Test: `tests/unit/main/catalog-bootstrap-service.test.ts`

**Interfaces:**
- Consumes: workspace, menu, mapping, platform menu, platform import run, and review repositories.
- Produces: `preview({ workspaceId, seedMode, seedPlatformCode })` and `activate(input)`.

- [x] **Step 1: Write failing bootstrap tests**

```ts
it('rejects a seed platform without a complete latest import', () => {
  expect(() => service.preview({
    workspaceId: 'default',
    seedMode: 'platform',
    seedPlatformCode: 'yogiyo'
  })).toThrow('seed_catalog_not_complete:yogiyo')
})

it('builds a draft from every present source menu without mutating menus', () => {
  const preview = service.preview({
    workspaceId: 'default',
    seedMode: 'platform',
    seedPlatformCode: 'baemin'
  })
  expect(preview.draftMenus.map((item) => item.baseName)).toEqual(['고구마', '킹쉬림프'])
  expect(menuRepository.list()).toEqual([])
})

it('activates the reviewed draft once and assigns canonical version one', () => {
  service.activate(reviewedInput)
  expect(workspaceRepository.getDefault()).toMatchObject({
    lifecycleState: 'active',
    canonicalVersion: 1,
    seedPlatformCode: 'baemin'
  })
})
```

- [x] **Step 2: Run the service tests and verify they fail**

Run: `npx vitest run tests/unit/main/catalog-bootstrap-service.test.ts`

Expected: FAIL because `CatalogBootstrapService` does not exist.

- [x] **Step 3: Implement preview without side effects**

```ts
preview(input: CatalogBootstrapPreviewInput): CatalogBootstrapPreview {
  const workspace = this.workspaceRepository.getDefault()
  if (workspace.lifecycleState === 'active') throw new Error('catalog_already_active')
  if (input.seedMode === 'blank') return { workspaceId: input.workspaceId, seedMode: 'blank', seedPlatformCode: null, draftMenus: [], reviewItems: [] }
  if (!input.seedPlatformCode || !this.hasCompleteLatestImport(input.seedPlatformCode)) {
    throw new Error(`seed_catalog_not_complete:${input.seedPlatformCode ?? 'missing'}`)
  }
  const sourceMenus = this.platformMenuRepository.listAll().filter((item) =>
    item.platformCode === input.seedPlatformCode && item.presenceStatus !== 'absent_confirmed')
  return this.buildPreview(input, sourceMenus)
}
```

Draft menu IDs must be deterministic for a given preview fingerprint so reloading the screen does not reshuffle decisions. Use a SHA-256 hash of `workspaceId/platformCode/platformMenuId` and keep the first 32 hex characters.

- [x] **Step 4: Implement activation inside one savepoint**

```ts
activate(input: CatalogBootstrapActivationInput): CatalogWorkspaceRecord {
  return withSavepoint(this.db, () => {
    const current = this.workspaceRepository.getDefault()
    if (current.lifecycleState === 'active') throw new Error('catalog_already_active')
    for (const menu of input.menus) this.menuRepository.upsert(menu)
    for (const mapping of input.confirmedMappings) this.mappingRepository.upsert(mapping)
    this.reviewRepository.replaceOpen(input.workspaceId, input.remainingReviewItems)
    const active = { ...current, lifecycleState: 'active' as const, seedMode: input.seedMode,
      seedPlatformCode: input.seedPlatformCode, canonicalVersion: 1, activatedAt: this.now() }
    this.workspaceRepository.save(active)
    return active
  })
}
```

Reject activation when any seed source menu is neither included nor explicitly ignored, or when duplicate source IDs map to two canonical menus.

- [x] **Step 5: Run bootstrap and savepoint tests**

Run: `npx vitest run tests/unit/main/catalog-bootstrap-service.test.ts`

Expected: PASS, including a test that a thrown mapping write leaves zero menus and workspace version 0.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/main/services/catalog-bootstrap-service.ts tests/unit/main/catalog-bootstrap-service.test.ts
git commit -m "feat: activate reviewed canonical catalog drafts"
```

### Task 4: Stop Imports from Silently Creating Canonical Menus

**Files:**
- Modify: `src/main/services/catalog-import-orchestrator.ts`
- Modify: `src/main/index.ts`
- Modify: `tests/unit/main/catalog-import-orchestrator.test.ts`

**Interfaces:**
- Consumes: `CatalogWorkspaceRepository.getDefault()`.
- Produces: source snapshot persistence in all lifecycle states and mapping refresh only for already mapped canonical menus.

- [x] **Step 1: Add failing import behavior tests**

```ts
it('stores source rows but creates no canonical menu while collecting', async () => {
  workspaceRepository.getDefault.mockReturnValue({ lifecycleState: 'collecting', canonicalVersion: 0 })
  await orchestrator.importPlatform('baemin')
  expect(platformMenuRepository.upsertSeenBatch).toHaveBeenCalled()
  expect(menuRepository.upsert).not.toHaveBeenCalled()
  expect(mappingRepository.upsert).not.toHaveBeenCalled()
})

it('does not create a new canonical menu for an unmatched source after activation', async () => {
  workspaceRepository.getDefault.mockReturnValue({ lifecycleState: 'active', canonicalVersion: 1 })
  await orchestrator.importPlatform('coupangeats')
  expect(menuRepository.upsert).not.toHaveBeenCalled()
})
```

- [x] **Step 2: Run the focused tests and confirm current auto-creation fails**

Run: `npx vitest run tests/unit/main/catalog-import-orchestrator.test.ts`

Expected: FAIL because `planMenuImports` currently creates unmatched `MenuRecord` rows.

- [x] **Step 3: Split source persistence from canonical reconciliation**

Replace `planMenuImports` with a method that only refreshes existing safe mappings:

```ts
private planExistingMappingRefresh(platformCode: PlatformCode, mappings: PlatformMenuMappingRecord[], sourceMenus: PlatformMenuSnapshot[]) {
  const bySourceId = new Map(sourceMenus.map((item) => [item.platformMenuId, item]))
  return mappings
    .filter((mapping) => mapping.platformCode === platformCode)
    .flatMap((mapping) => {
      const source = bySourceId.get(mapping.platformMenuId)
      return source ? [{ ...mapping, platformMenuName: source.platformMenuName,
        platformMenuCurrentPrice: source.currentPrice ?? null,
        platformMenuPriceVariants: source.platformMenuPriceVariants ?? null }] : []
    })
}
```

Persist platform source rows for every complete import. Apply mapping refresh only when the workspace is active. Leave unmatched source rows for the exception analyzer.

- [x] **Step 4: Inject the workspace repository in `src/main/index.ts`**

Instantiate `CatalogWorkspaceRepository` after migration and pass it into `createCatalogImportOrchestrator`.

- [x] **Step 5: Run importer regression tests**

Run: `npx vitest run tests/unit/main/catalog-import-orchestrator.test.ts tests/unit/main/catalog-diff-service.test.ts tests/unit/main/absence-state-service.test.ts`

Expected: PASS with no false absence transitions and no new canonical menu side effects.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/main/services/catalog-import-orchestrator.ts src/main/index.ts tests/unit/main/catalog-import-orchestrator.test.ts
git commit -m "refactor: separate source imports from canonical creation"
```

### Task 5: Generate Explainable Exceptions and Apply Intent Rules

**Files:**
- Create: `src/main/services/catalog-exception-analyzer.ts`
- Create: `src/main/services/catalog-intent-policy.ts`
- Modify: `src/main/services/catalog-import-orchestrator.ts`
- Test: `tests/unit/main/catalog-exception-analyzer.test.ts`
- Test: `tests/unit/main/catalog-intent-policy.test.ts`

**Interfaces:**
- Consumes: canonical menus, source menus, mappings, logical option groups, and active intent rules.
- Produces: deterministic `CatalogReviewItem[]` with evidence and recommendations.

- [x] **Step 1: Write failing decision examples**

```ts
it('recommends adding a uniquely missing canonical menu without claiming intent', () => {
  expect(analyze(input).find((item) => item.kind === 'missing_on_platform')).toMatchObject({
    state: 'open',
    recommendation: 'add_to_platform'
  })
})

it('marks a single price ladder outlier as decision required', () => {
  expect(analyze(priceInput)[0]).toMatchObject({ kind: 'price_outlier' })
})

it('groups identical option shapes with different menu links as a merge candidate', () => {
  expect(analyze(optionInput)[0]).toMatchObject({ kind: 'duplicate_option_group' })
})

it('does not reopen an intentional platform exclusion', () => {
  expect(applyIntentRules(items, [excludeRule])).toEqual([])
})
```

- [x] **Step 2: Run analyzer tests and verify missing modules fail**

Run: `npx vitest run tests/unit/main/catalog-exception-analyzer.test.ts tests/unit/main/catalog-intent-policy.test.ts`

Expected: FAIL.

- [x] **Step 3: Implement deterministic fingerprints and conservative matching**

```ts
const fingerprint = (parts: unknown[]) =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex')

const classifyMatch = (canonicalName: string, sourceNames: string[]) => {
  const safe = sourceNames.filter((name) => isSafeAutoLinkMatch(canonicalName, name))
  if (safe.length === 1) return { level: 'unique_safe' as const, confidence: 1 }
  const ranked = sourceNames.map((name) => ({ name, score: scoreMenuMatch(canonicalName, name) }))
    .sort((left, right) => right.score - left.score)
  return { level: 'recommendation' as const, confidence: ranked[0]?.score ?? 0 }
}
```

Do not treat unavailable category, description, image, or option signals as mismatches. Put every used signal and its raw source IDs into `evidenceJson`.

- [x] **Step 4: Implement intent matching from narrowest to broadest scope**

```ts
const scopePriority = { entity: 5, field: 4, category: 3, platform: 2, workspace: 1 }
export const applyIntentRules = (items: CatalogReviewItem[], rules: CatalogIntentRule[]) =>
  items.flatMap((item) => {
    const rule = rules.filter((candidate) => matches(candidate, item))
      .sort((a, b) => scopePriority[b.scope] - scopePriority[a.scope])[0]
    if (!rule) return [item]
    if (rule.resolution === 'defer') return [{ ...item, state: 'deferred', intentRuleId: rule.intentRuleId }]
    return []
  })
```

Expired and inactive rules never match. Conflicting rules of the same priority generate a blocked review item rather than choosing by timestamp.

- [x] **Step 5: Refresh review items after every complete active import**

Call the analyzer only after source persistence and only when `lifecycleState === 'active'`. Upsert by fingerprint, preserve resolved history, and close an old open item when its fingerprint is absent from the new analysis.

- [x] **Step 6: Run exception, import, and option grouping tests**

Run: `npx vitest run tests/unit/main/catalog-exception-analyzer.test.ts tests/unit/main/catalog-intent-policy.test.ts tests/unit/main/catalog-import-orchestrator.test.ts tests/unit/main/logical-option-group-service.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/main/services/catalog-exception-analyzer.ts src/main/services/catalog-intent-policy.ts src/main/services/catalog-import-orchestrator.ts tests/unit/main/catalog-exception-analyzer.test.ts tests/unit/main/catalog-intent-policy.test.ts
git commit -m "feat: generate explainable catalog review items"
```

### Task 6: Expose Onboarding and Review APIs

**Files:**
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/lib/api.ts`
- Test: `tests/unit/main/register-handlers.test.ts`
- Test: `tests/unit/shared/preload-contract.test.ts`

**Interfaces:**
- Consumes: bootstrap, workspace, review, and intent services.
- Produces: renderer APIs for preview, activation, review listing, resolving, and deferring.

- [x] **Step 1: Write failing handler and preload contract tests**

```ts
expect(appApi.catalogWorkspace.get()).toBeDefined()
expect(appApi.catalogBootstrap.preview).toBeDefined()
expect(appApi.catalogBootstrap.activate).toBeDefined()
expect(appApi.catalogReviews.listOpen).toBeDefined()
expect(appApi.catalogReviews.resolve).toBeDefined()
```

- [x] **Step 2: Run the focused tests**

Run: `npx vitest run tests/unit/main/register-handlers.test.ts tests/unit/shared/preload-contract.test.ts`

Expected: FAIL because the channels are absent.

- [x] **Step 3: Add Zod-validated IPC handlers**

```ts
safeHandle('catalogWorkspace:get', () => catalogWorkspaceRepository.getDefault())
safeHandle('catalogBootstrap:preview', (_event, payload) =>
  catalogBootstrapService.preview(catalogBootstrapPreviewSchema.parse(payload)))
safeHandle('catalogBootstrap:activate', (_event, payload) =>
  catalogBootstrapService.activate(catalogBootstrapActivationSchema.parse(payload)))
safeHandle('catalogReviews:listOpen', () => catalogReviewRepository.listOpen('default'))
safeHandle('catalogReviews:resolve', (_event, payload) =>
  catalogReviewService.resolve(catalogReviewResolutionSchema.parse(payload)))
```

Invalid platform codes, empty reasons, unknown resolutions, and out-of-range confidence values must return structured errors.

- [x] **Step 4: Mirror the exact methods through preload and renderer API**

Do not expose raw `ipcRenderer`; add only the five methods verified by the contract test.

- [x] **Step 5: Run handler, preload, and type tests**

Run: `npx vitest run tests/unit/main/register-handlers.test.ts tests/unit/shared/preload-contract.test.ts`

Expected: PASS.

Run: `npm run lint:types`

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/main/ipc/register-handlers.ts src/main/preload.ts src/main/index.ts src/renderer/src/lib/api.ts tests/unit/main/register-handlers.test.ts tests/unit/shared/preload-contract.test.ts
git commit -m "feat: expose catalog onboarding and review APIs"
```

### Task 7: Add the Guided Onboarding and Compact Review Inbox

**Files:**
- Create: `src/renderer/src/pages/CatalogOnboardingPage.tsx`
- Create: `src/renderer/src/components/ReviewInboxPanel.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/pages/DashboardPage.tsx`
- Modify: `src/renderer/src/App.css`
- Test: `tests/unit/renderer/catalog-onboarding-page.test.tsx`
- Test: `tests/unit/renderer/review-inbox-panel.test.tsx`
- Modify: `tests/unit/renderer/app.test.tsx`

**Interfaces:**
- Consumes: Task 6 renderer APIs.
- Produces: a six-step onboarding gate and a grouped review panel with remembered decisions.

- [x] **Step 1: Write failing onboarding UI tests**

```tsx
it('shows only complete connected platforms as initial source choices', async () => {
  render(<CatalogOnboardingPage />)
  expect(await screen.findByRole('radio', { name: '배민' })).toBeEnabled()
  expect(screen.getByRole('radio', { name: '네이버주문' })).toBeDisabled()
})

it('does not activate until every seed row is included or explicitly ignored', async () => {
  render(<CatalogOnboardingPage />)
  fireEvent.click(await screen.findByRole('button', { name: '통합 메뉴 초안 만들기' }))
  expect(screen.getByRole('button', { name: '통합 메뉴 시작' })).toBeDisabled()
})
```

- [x] **Step 2: Write failing review inbox tests**

```tsx
it('groups matching exceptions and keeps evidence collapsed', async () => {
  render(<ReviewInboxPanel />)
  expect(await screen.findByText('쿠팡이츠 누락 메뉴 3개')).toBeTruthy()
  expect(screen.queryByText('원본 메뉴 ID')).toBeNull()
})

it('offers one-time and remembered resolution scopes', async () => {
  render(<ReviewInboxPanel />)
  fireEvent.click(await screen.findByRole('button', { name: '의도적으로 제외' }))
  expect(screen.getByLabelText('앞으로 같은 경우에도 적용')).toBeTruthy()
})
```

- [x] **Step 3: Run renderer tests and verify missing components fail**

Run: `npx vitest run tests/unit/renderer/catalog-onboarding-page.test.tsx tests/unit/renderer/review-inbox-panel.test.tsx tests/unit/renderer/app.test.tsx`

Expected: FAIL.

- [x] **Step 4: Implement the onboarding gate**

```tsx
export default function App() {
  const [workspace, setWorkspace] = useState<CatalogWorkspaceRecord | null>(null)
  useEffect(() => { void appApi.catalogWorkspace.get().then(setWorkspace) }, [])
  if (!workspace) return <div role="status">통합 메뉴 상태 확인 중</div>
  if (workspace.lifecycleState !== 'active') {
    return <CatalogOnboardingPage workspace={workspace} onActivated={setWorkspace} />
  }
  return <WorkspaceShell />
}
```

The page sequence is `플랫폼 연결 확인 -> 초기 기준 선택 -> 초안 -> 다른 플랫폼 후보 -> 결정 요약 -> 버전 1 확정`. Keep raw IDs and evidence collapsed.

- [x] **Step 5: Implement the dashboard review panel**

Show four counts: `자동 정리`, `추천 확인`, `결정 필요`, `실행 차단`. Group open items by `kind + platformCode + recommendation`, allow bulk resolution only when every selected item has the same recommendation, and require a reason for remembered rules.

- [x] **Step 6: Run renderer tests and accessibility assertions**

Run: `npx vitest run tests/unit/renderer/catalog-onboarding-page.test.tsx tests/unit/renderer/review-inbox-panel.test.tsx tests/unit/renderer/app.test.tsx tests/unit/renderer/dashboard-page.test.tsx`

Expected: PASS with keyboard-accessible labels for every decision.

- [ ] **Step 7: Commit Task 7**

```bash
git add src/renderer/src/pages/CatalogOnboardingPage.tsx src/renderer/src/components/ReviewInboxPanel.tsx src/renderer/src/App.tsx src/renderer/src/pages/DashboardPage.tsx src/renderer/src/App.css tests/unit/renderer/catalog-onboarding-page.test.tsx tests/unit/renderer/review-inbox-panel.test.tsx tests/unit/renderer/app.test.tsx
git commit -m "feat: guide canonical catalog onboarding and review"
```

### Task 8: Verify the Milestone Without Platform Writes

**Files:**
- Modify: `README.md`
- Modify: `docs/current-status.md`
- Test: existing full test suite.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a verified read-only onboarding milestone ready for backup work.

- [x] **Step 1: Add an integration test for the fresh-install flow**

Create `tests/unit/main/catalog-onboarding-integration.test.ts` that imports two fake complete platform catalogs, proves `menus` stays empty, previews the first platform, activates version 1, imports the second platform again, and asserts unmatched rows become review items rather than new menus.

- [x] **Step 2: Run the integration test**

Run: `npx vitest run tests/unit/main/catalog-onboarding-integration.test.ts`

Expected: PASS.

- [x] **Step 3: Run all automated verification**

Run: `npm run lint:types`

Expected: PASS.

Run: `npm test`

Expected: PASS with zero failed tests.

Run: `npm run build`

Expected: PASS and Electron bundles produced in `out/`.

- [x] **Step 4: Perform a read-only application smoke test**

Use a temporary user data directory. Import fake or non-production snapshots, select one complete platform, review the draft, activate version 1, reopen the app, and verify the active catalog and decisions persist. Do not invoke `sync:run` or any platform writer.

- [x] **Step 5: Update documentation with exact verified behavior**

Document the new lifecycle, the legacy migration behavior, and the fact that platform writes remain unchanged and disabled during onboarding.

- [ ] **Step 6: Commit Task 8**

```bash
git add tests/unit/main/catalog-onboarding-integration.test.ts README.md docs/current-status.md
git commit -m "docs: record canonical onboarding milestone"
```
