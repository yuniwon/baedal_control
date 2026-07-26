# Safe Multi-Platform Write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn canonical catalog changes into capability-aware platform plans, block external conflicts and lossy projections, apply only approved items with idempotency, and mark success only after a fresh platform read verifies the result.

**Architecture:** Store a canonical change set and a last-verified platform baseline, then run a three-way comparison among baseline, canonical target, and current platform source. Each plugin projector returns an exact, transformed, lossy, unsupported, or unverified disposition before any write. The execution engine requires a recovery point, applies independently per platform, reimports the affected source, verifies expected values, and retains failed items for targeted retry.

**Tech Stack:** Electron, TypeScript, node:sqlite, Zod, Vitest, existing platform plugins and backup service

## Global Constraints

- This plan starts only after canonical onboarding, platform plugin/session orchestration, and backup/restore plans are complete.
- Every execution starts from a complete fresh source import for the target platform.
- `lossy`, `unsupported`, `unverified`, authentication-required, incomplete-source, and external-conflict items are not executable.
- A success toast or HTTP response is not proof; only a fresh read matching the expected projection marks an item successful.
- Never optimistically rewrite `platform_menus` or mappings before verification.
- A platform failure does not roll back already verified writes on another platform.
- The same idempotency key cannot execute twice after a verified success.
- Retry targets only failed or unknown items and reruns drift detection first.
- Menu deletion, option-group deletion, and option rewiring remain separate destructive plans.
- Do not enable a platform writer until an operating-account round trip has been recorded as `WRITE_VERIFIED`.
- Never stage unrelated files from the existing dirty worktree.

---

## File Map

- `src/shared/contracts.ts`: change set, projection, conflict, and verification DTOs.
- `src/main/db/migrations.ts`: canonical change sets, platform baselines, and execution idempotency.
- `src/main/repositories/canonical-change-set-repository.ts`: pending canonical changes.
- `src/main/repositories/platform-sync-baseline-repository.ts`: last verified values.
- `src/main/repositories/sync-idempotency-repository.ts`: claimed and completed execution keys.
- `src/main/services/platform-projection-service.ts`: plugin projector orchestration.
- `src/main/services/platform-drift-detector.ts`: three-way comparison.
- `src/main/services/safe-sync-planner.ts`: ready, review, and blocked plan construction.
- `src/main/services/safe-sync-engine.ts`: backup, write, reimport, verify, and partial retry.
- `src/main/services/sync-success-reconciler.ts`: remove optimistic source mutation.
- `src/main/ipc/register-handlers.ts`: plan, approve, run, and retry APIs.
- `src/main/preload.ts`: renderer bridge.
- `src/renderer/src/components/SyncPreviewDialog.tsx`: explain projection and blockers.
- `src/renderer/src/pages/HistoryPage.tsx`: verified, failed, unknown, and retry states.
- `tests/unit/**`: projection, drift, planner, idempotency, verification, and renderer tests.

### Task 1: Persist Canonical Change Sets and Verified Platform Baselines

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/main/db/migrations.ts`
- Create: `src/main/repositories/canonical-change-set-repository.ts`
- Create: `src/main/repositories/platform-sync-baseline-repository.ts`
- Test: `tests/unit/main/canonical-change-set-repository.test.ts`
- Test: `tests/unit/main/platform-sync-baseline-repository.test.ts`

**Interfaces:**
- Consumes: `PlatformCode`, canonical menu records, and platform source records.
- Produces: immutable change sets and last-verified baseline rows.

- [ ] **Step 1: Write failing persistence tests**

```ts
it('records the canonical version that produced a change set', () => {
  repository.create(changeSet)
  expect(repository.get(changeSet.changeSetId)).toMatchObject({ canonicalVersion: 2, status: 'pending' })
})

it('stores the exact verified source value and import run', () => {
  baselines.upsert(baseline)
  expect(baselines.get('default', 'coupangeats', 'dish-1')).toMatchObject({
    verifiedImportRunId: 'import-9',
    sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/)
  })
})
```

- [ ] **Step 2: Run repository tests**

Run: `npx vitest run tests/unit/main/canonical-change-set-repository.test.ts tests/unit/main/platform-sync-baseline-repository.test.ts`

Expected: FAIL.

- [ ] **Step 3: Add the exact contracts**

```ts
export interface CanonicalChangeSetRecord {
  changeSetId: string
  workspaceId: string
  canonicalVersion: number
  status: 'pending' | 'planned' | 'partially_applied' | 'applied' | 'cancelled'
  changesJson: string
  createdAt: string
  updatedAt?: string
}

export interface PlatformSyncBaselineRecord {
  workspaceId: string
  platformCode: PlatformCode
  platformMenuId: string
  verifiedImportRunId: string
  sourceHash: string
  sourceJson: string
  verifiedAt: string
}
```

- [ ] **Step 4: Add the tables**

```sql
create table if not exists canonical_change_sets (
  change_set_id text primary key,
  workspace_id text not null,
  canonical_version integer not null,
  status text not null,
  changes_json text not null,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists platform_sync_baselines (
  workspace_id text not null,
  platform_code text not null,
  platform_menu_id text not null,
  verified_import_run_id text not null,
  source_hash text not null,
  source_json text not null,
  verified_at text not null,
  primary key (workspace_id, platform_code, platform_menu_id)
);
```

- [ ] **Step 5: Implement repositories with immutable source JSON**

Canonicalize object keys before hashing. `PlatformSyncBaselineRepository.upsert` replaces a baseline only after the caller supplies a completed import run and verified timestamp.

- [ ] **Step 6: Run persistence tests**

Run: `npx vitest run tests/unit/main/canonical-change-set-repository.test.ts tests/unit/main/platform-sync-baseline-repository.test.ts tests/unit/main/db-connection.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/shared/contracts.ts src/main/db/migrations.ts src/main/repositories/canonical-change-set-repository.ts src/main/repositories/platform-sync-baseline-repository.ts tests/unit/main/canonical-change-set-repository.test.ts tests/unit/main/platform-sync-baseline-repository.test.ts
git commit -m "feat: persist canonical changes and verified baselines"
```

### Task 2: Project Canonical Changes Through Plugin Capabilities

**Files:**
- Create: `src/main/services/platform-projection-service.ts`
- Modify: `src/main/platforms/base/plugin.ts`
- Modify: `src/main/platforms/base/price-variant-projection.ts`
- Modify: `src/main/platforms/base/menu-update-policy.ts`
- Test: `tests/unit/main/platform-projection-service.test.ts`
- Modify: `tests/unit/main/sync-planner.test.ts`

**Interfaces:**
- Consumes: `PlatformPlugin.projector`, canonical change set, mapping, and capability manifest.
- Produces: `PlatformProjectionResult` per target menu and platform.

- [ ] **Step 1: Write failing projection tests**

```ts
it('marks a scalar-only platform projection lossy when canonical variants differ', async () => {
  await expect(service.project(variantInput, scalarOnlyPlugin)).resolves.toMatchObject({
    disposition: 'lossy',
    issues: ['variant_structure_not_supported']
  })
})

it('returns unverified when a plugin declares no verified writer', async () => {
  await expect(service.project(input, readOnlyPlugin)).resolves.toMatchObject({
    disposition: 'unverified',
    projectedMenu: null
  })
})
```

- [ ] **Step 2: Run projection tests**

Run: `npx vitest run tests/unit/main/platform-projection-service.test.ts tests/unit/main/sync-planner.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement generic projection gating**

```ts
async project(input: CanonicalMenuProjectionInput): Promise<PlatformProjectionResult> {
  const plugin = this.plugins.get(input.targetPlatformCode)
  if (!plugin.projector || !plugin.capabilities.operations.project) {
    return { disposition: 'unsupported', projectedMenu: null, issues: ['projection_not_supported'] }
  }
  const result = await plugin.projector.plan(input)
  if (!plugin.writer || !plugin.verifier || !plugin.capabilities.operations.write) {
    return { ...result, disposition: 'unverified', projectedMenu: null,
      issues: [...result.issues, 'write_not_verified'] }
  }
  return result
}
```

- [ ] **Step 4: Move platform price policy behind projectors**

Keep common variant comparison helpers in `price-variant-projection.ts`. Move platform-specific decisions from the global `platformMenuUpdatePolicies` record into each plugin projector or capability manifest so adding a platform does not change the core planner.

- [ ] **Step 5: Run projection regression tests**

Run: `npx vitest run tests/unit/main/platform-projection-service.test.ts tests/unit/main/sync-planner.test.ts tests/unit/main/ddangyo-price-row-snapshots.test.ts tests/unit/main/baemin-price-change.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/main/services/platform-projection-service.ts src/main/platforms/base/plugin.ts src/main/platforms/base/price-variant-projection.ts src/main/platforms/base/menu-update-policy.ts tests/unit/main/platform-projection-service.test.ts tests/unit/main/sync-planner.test.ts
git commit -m "refactor: project canonical changes through plugins"
```

### Task 3: Detect External Changes with a Three-Way Comparison

**Files:**
- Create: `src/main/services/platform-drift-detector.ts`
- Test: `tests/unit/main/platform-drift-detector.test.ts`

**Interfaces:**
- Consumes: verified baseline, canonical target projection, and fresh current source.
- Produces: `unchanged`, `canonical_only`, `platform_only`, `same_change`, or `conflict` per field.

- [ ] **Step 1: Write the full comparison table as failing tests**

```ts
it.each([
  ['A', 'A', 'A', 'unchanged'],
  ['A', 'B', 'A', 'canonical_only'],
  ['A', 'A', 'B', 'platform_only'],
  ['A', 'B', 'B', 'same_change'],
  ['A', 'B', 'C', 'conflict']
] as const)('classifies baseline %s canonical %s platform %s as %s',
  (baseline, canonical, platform, expected) => {
    expect(compareField(baseline, canonical, platform)).toBe(expected)
  })
```

- [ ] **Step 2: Run the drift tests**

Run: `npx vitest run tests/unit/main/platform-drift-detector.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement field-level normalized comparison**

Compare name, scalar price, every variant/channel amount, visibility, and option signature independently. Missing baseline returns `unknown_baseline` and blocks execution rather than treating the current source as trusted.

- [ ] **Step 4: Connect intentional difference rules**

A matching active intent rule may turn `platform_only` into an accepted difference. It may not suppress a `conflict` unless its field, entity, platform, and expected value all match the current source.

- [ ] **Step 5: Run drift and intent tests**

Run: `npx vitest run tests/unit/main/platform-drift-detector.test.ts tests/unit/main/catalog-intent-policy.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/main/services/platform-drift-detector.ts tests/unit/main/platform-drift-detector.test.ts
git commit -m "feat: detect external platform drift"
```

### Task 4: Build a Capability-Aware Safe Sync Plan

**Files:**
- Create: `src/main/services/safe-sync-planner.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/main/services/sync-planner.ts`
- Test: `tests/unit/main/safe-sync-planner.test.ts`

**Interfaces:**
- Consumes: change set, projections, drift results, import completeness, session state, and active intent rules.
- Produces: executable, review, and blocked items with reasons.

- [ ] **Step 1: Write failing planner gate tests**

```ts
it.each(['lossy', 'unsupported', 'unverified'] as const)(
  'blocks a %s projection',
  (disposition) => expect(plan({ ...input, projection: { disposition } }).blocked).toHaveLength(1)
)

it('allows canonical-only exact changes with complete source and ready session', () => {
  expect(plan(executableInput).executable).toHaveLength(1)
})

it('blocks a conflicting external edit', () => {
  expect(plan(conflictInput).blocked[0].reason).toBe('external_conflict')
})
```

- [ ] **Step 2: Run planner tests**

Run: `npx vitest run tests/unit/main/safe-sync-planner.test.ts`

Expected: FAIL.

- [ ] **Step 3: Define the plan result**

```ts
export interface SafeSyncPlan {
  changeSetId: string
  plannedAt: string
  executable: SafeSyncPlanItem[]
  needsReview: SafeSyncPlanItem[]
  blocked: SafeSyncPlanItem[]
}

export interface SafeSyncPlanItem {
  idempotencyKey: string
  platformCode: PlatformCode
  menuId: string
  platformMenuId: string
  disposition: 'exact' | 'transformed' | 'lossy' | 'unsupported' | 'unverified'
  reason: string | null
  expectedSourceJson: string
  syncPreviewItem: SyncPreviewItem | null
}
```

Build `idempotencyKey` from change-set ID, platform code, platform menu ID, expected source hash, and plugin manifest schema version.

- [ ] **Step 4: Implement ordered gates**

The gate order is: complete fresh import, ready session, active mapping, known baseline, no external conflict, supported projection, verified writer, verified post-read capability, and active intent policy. Return the first blocking reason plus all diagnostic evidence.

- [ ] **Step 5: Adapt the existing preview**

Keep `buildSyncPreview` as a compatibility view over `SafeSyncPlan`; remove direct platform policy and managed-browser decisions from it.

- [ ] **Step 6: Run planner regressions**

Run: `npx vitest run tests/unit/main/safe-sync-planner.test.ts tests/unit/main/sync-planner.test.ts tests/unit/renderer/sync-preview-dialog.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/main/services/safe-sync-planner.ts src/shared/contracts.ts src/main/services/sync-planner.ts tests/unit/main/safe-sync-planner.test.ts
git commit -m "feat: gate platform writes with safe sync plans"
```

### Task 5: Enforce Idempotency and Targeted Retry

**Files:**
- Modify: `src/main/db/migrations.ts`
- Create: `src/main/repositories/sync-idempotency-repository.ts`
- Create: `src/main/services/safe-sync-engine.ts`
- Test: `tests/unit/main/sync-idempotency-repository.test.ts`
- Test: `tests/unit/main/safe-sync-engine.test.ts`

**Interfaces:**
- Consumes: approved safe plan, plugin writers, backup hook, reimport callback, and verifier.
- Produces: per-item `verified`, `failed`, `verification_unknown`, or `skipped_duplicate` results.

- [ ] **Step 1: Write failing idempotency tests**

```ts
it('does not execute a previously verified idempotency key', async () => {
  idempotency.markVerified(item.idempotencyKey, 'run-1')
  await engine.run([item])
  expect(writer.apply).not.toHaveBeenCalled()
})

it('replans a failed item before retrying it', async () => {
  await engine.retryFailed('run-1')
  expect(planner.replanItem).toHaveBeenCalledWith(failedItem)
})
```

- [ ] **Step 2: Run engine tests**

Run: `npx vitest run tests/unit/main/sync-idempotency-repository.test.ts tests/unit/main/safe-sync-engine.test.ts`

Expected: FAIL.

- [ ] **Step 3: Add idempotency storage**

```sql
create table if not exists sync_idempotency (
  idempotency_key text primary key,
  sync_run_id text not null,
  status text not null,
  last_error_code text,
  updated_at text not null default current_timestamp
);
```

Claim a key as `running` before the write. A stale running claim becomes retryable only after its sync run is known finished or a bounded timeout is exceeded.

- [ ] **Step 4: Implement the execution sequence**

For every platform group: assert the approved plan is current, create the required `before_sync` recovery point, claim keys, call writers one at a time, trigger a complete fresh import, call plugin verifiers, then mark each key. Continue to other platforms after failures.

- [ ] **Step 5: Implement targeted retry**

Load only `failed` and `verification_unknown` items, rerun session and drift gates, create a new sync run linked to the previous run ID, and never retry `verified` or `skipped_duplicate` items.

- [ ] **Step 6: Run engine and backup-hook tests**

Run: `npx vitest run tests/unit/main/sync-idempotency-repository.test.ts tests/unit/main/safe-sync-engine.test.ts tests/unit/main/catalog-backup-history-repository.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/main/db/migrations.ts src/main/repositories/sync-idempotency-repository.ts src/main/services/safe-sync-engine.ts tests/unit/main/sync-idempotency-repository.test.ts tests/unit/main/safe-sync-engine.test.ts
git commit -m "feat: execute safe sync plans idempotently"
```

### Task 6: Replace Optimistic Success with Fresh-Read Verification

**Files:**
- Modify: `src/main/services/sync-success-reconciler.ts`
- Modify: `src/main/services/sync-engine.ts`
- Modify: `src/main/platforms/base/plugin.ts`
- Test: `tests/unit/main/sync-success-reconciler.test.ts`
- Modify: `tests/unit/main/sync-engine.test.ts`

**Interfaces:**
- Consumes: completed fresh import result and plugin verifier.
- Produces: verified baseline update and canonical dirty-state clearing.

- [ ] **Step 1: Write a failing false-success test**

```ts
it('does not mutate source rows or clear dirty state when the platform readback differs', async () => {
  verifier.verify.mockResolvedValue({ status: 'mismatch', issues: ['price_mismatch'] })
  await reconciler.reconcile(item, completedImport)
  expect(platformMenuRepository.upsert).not.toHaveBeenCalled()
  expect(menuRepository.setDirty).not.toHaveBeenCalledWith(item.menuId, 0)
})
```

- [ ] **Step 2: Run reconciler tests**

Run: `npx vitest run tests/unit/main/sync-success-reconciler.test.ts tests/unit/main/sync-engine.test.ts`

Expected: FAIL because the current reconciler updates mappings and source rows optimistically.

- [ ] **Step 3: Remove optimistic platform source updates**

`SyncSuccessReconciler` receives the fresh imported source row and verification result. It updates the verified baseline only when status is `verified`. Platform catalog rows remain owned exclusively by the import orchestrator.

- [ ] **Step 4: Clear dirty state only after all target plans are verified or intentionally suppressed**

Rebuild the safe plan after baseline update. Keep the menu dirty when any executable, review, blocked, failed, or verification-unknown item remains.

- [ ] **Step 5: Run verification regressions**

Run: `npx vitest run tests/unit/main/sync-success-reconciler.test.ts tests/unit/main/sync-engine.test.ts tests/unit/main/catalog-import-orchestrator.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/main/services/sync-success-reconciler.ts src/main/services/sync-engine.ts src/main/platforms/base/plugin.ts tests/unit/main/sync-success-reconciler.test.ts tests/unit/main/sync-engine.test.ts
git commit -m "fix: require platform readback before sync success"
```

### Task 7: Show One Simple Approval and Recovery Workflow

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/src/lib/api.ts`
- Modify: `src/renderer/src/components/SyncPreviewDialog.tsx`
- Modify: `src/renderer/src/pages/HistoryPage.tsx`
- Test: `tests/unit/main/register-handlers.test.ts`
- Modify: `tests/unit/renderer/sync-preview-dialog.test.tsx`
- Modify: `tests/unit/renderer/history-page.test.tsx`

**Interfaces:**
- Consumes: safe planner and engine.
- Produces: plan preview, approval, execution, verification status, and targeted retry UI.

- [ ] **Step 1: Write failing UI behavior tests**

```tsx
it('shows executable changes first and keeps technical evidence collapsed', async () => {
  render(<SyncPreviewDialog />)
  expect(await screen.findByText('바로 반영 가능 4개')).toBeTruthy()
  expect(screen.getByText('확인 필요 1개')).toBeTruthy()
  expect(screen.getByText('반영 불가 2개')).toBeTruthy()
  expect(screen.queryByText('sourceHash')).toBeNull()
})

it('offers retry only for failed and verification-unknown items', async () => {
  render(<HistoryPage />)
  expect(await screen.findAllByRole('button', { name: '실패 항목 다시 시도' })).toHaveLength(1)
})
```

- [ ] **Step 2: Run handler and renderer tests**

Run: `npx vitest run tests/unit/main/register-handlers.test.ts tests/unit/renderer/sync-preview-dialog.test.tsx tests/unit/renderer/history-page.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Add plan-bound IPC methods**

Expose `sync.plan(changeSetId)`, `sync.runPlan({ changeSetId, approvedItemIds, planFingerprint })`, and `sync.retryFailed(syncRunId)`. Reject execution when the fingerprint differs from a freshly rebuilt plan.

- [ ] **Step 4: Keep approval language operational**

Group rows as `바로 반영 가능`, `확인 필요`, and `반영 불가`. Show the expected user-visible change and platform name first. Put projection disposition, raw evidence, baseline hashes, and internal IDs behind `상세 보기`.

- [ ] **Step 5: Run full automated verification**

Run: `npm run lint:types`

Expected: PASS.

Run: `npm test`

Expected: PASS with zero failed tests.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Verify one platform at a time with reversible hidden test data**

Enable a writer only after a no-op readback, one reversible name or price change, fresh import verification, reverse change, and second fresh import verification succeed. Record evidence in the capability matrix and mark only the tested fields `WRITE_VERIFIED`. Never reuse production-visible data when a hidden test menu is available.

- [ ] **Step 7: Commit Task 7**

```bash
git add src/main/index.ts src/main/ipc/register-handlers.ts src/main/preload.ts src/renderer/src/lib/api.ts src/renderer/src/components/SyncPreviewDialog.tsx src/renderer/src/pages/HistoryPage.tsx tests/unit/main/register-handlers.test.ts tests/unit/renderer/sync-preview-dialog.test.tsx tests/unit/renderer/history-page.test.tsx
git commit -m "feat: approve verify and retry safe platform writes"
```
