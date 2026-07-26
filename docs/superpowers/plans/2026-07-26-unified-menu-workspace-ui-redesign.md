# Unified Menu Workspace UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dense table-first active catalog UI with a safe, searchable unified-menu workspace while preserving existing catalog, mapping, import, and sync boundaries.

**Architecture:** Keep the Electron main-process repositories and platform plugins as the source of truth. Split renderer responsibilities into a shell, a unified catalog view model, a compact menu list, an explicit draft editor, and a dedicated review page. Legacy reconfiguration creates a separate draft and cannot replace the active catalog until a recovery point exists.

**Tech Stack:** Electron 38, React 19, TypeScript 5.9, SQLite, Vitest, Testing Library, existing CSS design language.

**Design spec:** `docs/superpowers/specs/2026-07-26-unified-menu-workspace-ui-redesign-design.md`

---

## File structure

### Renderer shell and navigation

- Create `src/renderer/src/app/routes.ts`: route names and navigation helpers.
- Create `src/renderer/src/components/AppShell.tsx`: persistent sidebar, store header, content region.
- Create `src/renderer/src/components/WorkspaceStatusBar.tsx`: catalog version, latest import, review count.
- Modify `src/renderer/src/App.tsx`: lifecycle gate and route composition only.
- Modify `src/renderer/src/App.css`: shared layout tokens and responsive rules.

### Unified menu workspace

- Create `src/renderer/src/lib/catalog-workspace-view.ts`: pure menu/category/filter/platform-summary derivation.
- Create `src/renderer/src/pages/UnifiedMenuPage.tsx`: page orchestration and data loading.
- Create `src/renderer/src/components/menu-workspace/MenuWorkspaceToolbar.tsx`.
- Create `src/renderer/src/components/menu-workspace/CategoryRail.tsx`.
- Create `src/renderer/src/components/menu-workspace/MenuListPane.tsx`.
- Create `src/renderer/src/components/menu-workspace/MenuDetailPane.tsx`.
- Create `src/renderer/src/components/menu-workspace/PriceVariantEditor.tsx`.
- Create `src/renderer/src/components/menu-workspace/PlatformComparison.tsx`.
- Create `src/renderer/src/components/menu-workspace/CreateMenuPanel.tsx`.
- Retain `src/renderer/src/pages/MenuPage.tsx` temporarily as a compatibility wrapper, then remove it after navigation tests move.
- Retain `src/renderer/src/components/MenuTable.tsx` for any remaining legacy consumer until the new page reaches parity.

### Review and legacy reconfiguration

- Create `src/renderer/src/pages/ReviewInboxPage.tsx`.
- Reuse and narrow `src/renderer/src/components/ReviewInboxPanel.tsx` as the group-detail component.
- Create `src/renderer/src/components/catalog-reconfiguration/ReconfigurationEntryCard.tsx`.
- Create `src/renderer/src/components/catalog-reconfiguration/ActiveCatalogComparison.tsx`.
- Extend `src/main/services/catalog-bootstrap-service.ts` with side-effect-free legacy draft comparison.
- Extend catalog workspace contracts and IPC only for draft lifecycle; do not invoke platform writers.

### Tests

- Create focused renderer tests for every new page/component under `tests/unit/renderer/`.
- Create `tests/unit/renderer/catalog-workspace-view.test.ts` for all filtering and summary logic.
- Extend `tests/unit/main/catalog-bootstrap-service.test.ts` and `catalog-onboarding-integration.test.ts` for safe legacy reconfiguration.
- Update `tests/unit/shared/preload-contract.test.ts` only when a new IPC contract is introduced.

---

### Task 1: Lock the current UX baseline and route model

**Files:**
- Create: `src/renderer/src/app/routes.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `tests/unit/renderer/app.test.tsx`
- Create: `docs/design/current-ui-baseline/README.md`

- [ ] **Step 1: Capture the current app states**

Launch the merged app with the real local database and save screenshots for `홈`, `메뉴`, `옵션`, `가져오기`, and one expanded menu source-detail state. Record viewport size and the fact that no platform writer was called.

- [ ] **Step 2: Write failing navigation tests**

Test the target primary labels `홈`, `통합메뉴`, `검토함`, `가져오기`, plus collapsed advanced routes. Verify an action from the home review summary can navigate directly to `검토함`.

- [ ] **Step 3: Run the focused test and verify failure**

Run:

```powershell
npx vitest run tests/unit/renderer/app.test.tsx
```

Expected: FAIL because the current shell exposes `메뉴` and `옵션` as separate primary tabs and has no review route.

- [ ] **Step 4: Add the route contract**

Use a narrow union rather than a routing dependency:

```ts
export type AppRoute =
  | 'home'
  | 'catalog'
  | 'reviews'
  | 'imports'
  | 'mappings'
  | 'history'
  | 'backup'
```

Keep navigation state in the app shell and pass `navigate(route)` to pages that need cross-page actions.

- [ ] **Step 5: Run the focused test**

Expected: PASS with advanced routes collapsed by default.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer/src/app/routes.ts src/renderer/src/App.tsx tests/unit/renderer/app.test.tsx docs/design/current-ui-baseline
git commit -m "test: lock unified workspace navigation"
```

### Task 2: Split the persistent application shell

**Files:**
- Create: `src/renderer/src/components/AppShell.tsx`
- Create: `src/renderer/src/components/WorkspaceStatusBar.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.css`
- Create: `tests/unit/renderer/app-shell.test.tsx`

- [ ] **Step 1: Write failing shell tests**

Verify the shell always shows store name, active catalog version, review count, latest successful import time, and the selected route. Verify onboarding uses the same brand language without showing active-only controls.

- [ ] **Step 2: Run the shell tests**

Run:

```powershell
npx vitest run tests/unit/renderer/app-shell.test.tsx tests/unit/renderer/app.test.tsx
```

Expected: FAIL because the current shell only contains brand copy and tab buttons.

- [ ] **Step 3: Implement a presentation-only shell**

`AppShell` must receive data as props. It must not call repositories or import page-specific APIs. Add CSS variables for sidebar width, detail width, spacing, borders, focus ring, success, warning, and danger states by extracting current onboarding values rather than inventing a second theme.

- [ ] **Step 4: Add responsive behavior**

At widths below 1180px, collapse status details and reserve the right detail pane for an overlay. At 1024px, keep all primary navigation and the menu list usable without horizontal scrolling.

- [ ] **Step 5: Verify tests and type checking**

```powershell
npx vitest run tests/unit/renderer/app-shell.test.tsx tests/unit/renderer/app.test.tsx
npm run lint:types
```

- [ ] **Step 6: Commit**

```powershell
git add src/renderer/src/components/AppShell.tsx src/renderer/src/components/WorkspaceStatusBar.tsx src/renderer/src/App.tsx src/renderer/src/App.css tests/unit/renderer/app-shell.test.tsx
git commit -m "feat: add unified catalog application shell"
```

### Task 3: Build a pure unified-menu view model

**Files:**
- Create: `src/renderer/src/lib/catalog-workspace-view.ts`
- Create: `tests/unit/renderer/catalog-workspace-view.test.ts`
- Modify: `src/renderer/src/pages/MenuPage.tsx`

- [ ] **Step 1: Write failing derivation tests**

Cover:

- category order with `미분류` last
- search by canonical name, platform name, option name, and formatted price
- the four primary filters
- compact price variant summary
- platform coverage count
- issue badge priority
- management exclusion

- [ ] **Step 2: Run the test and verify failure**

```powershell
npx vitest run tests/unit/renderer/catalog-workspace-view.test.ts
```

Expected: FAIL because the derivation is embedded inside `MenuPage`.

- [ ] **Step 3: Extract pure functions**

Return one row contract suitable for a compact list:

```ts
export interface CatalogMenuListItem {
  menuId: string
  name: string
  categoryName: string
  priceSummary: string
  connectedPlatformCount: number
  issueCount: number
  issueTone: 'none' | 'info' | 'warning' | 'danger'
  isManaged: boolean
  searchText: string
}
```

Do not add IPC or database calls to this module.

- [ ] **Step 4: Make the legacy page consume the extracted functions**

This is a no-visual-change intermediate step that proves parity before replacing the table.

- [ ] **Step 5: Run menu regressions**

```powershell
npx vitest run tests/unit/renderer/catalog-workspace-view.test.ts tests/unit/renderer/menu-page.test.tsx
```

- [ ] **Step 6: Commit**

```powershell
git add src/renderer/src/lib/catalog-workspace-view.ts src/renderer/src/pages/MenuPage.tsx tests/unit/renderer/catalog-workspace-view.test.ts tests/unit/renderer/menu-page.test.tsx
git commit -m "refactor: extract unified menu view model"
```

### Task 4: Replace the dense menu table with category and list panes

**Files:**
- Create: `src/renderer/src/pages/UnifiedMenuPage.tsx`
- Create: `src/renderer/src/components/menu-workspace/MenuWorkspaceToolbar.tsx`
- Create: `src/renderer/src/components/menu-workspace/CategoryRail.tsx`
- Create: `src/renderer/src/components/menu-workspace/MenuListPane.tsx`
- Create: `tests/unit/renderer/unified-menu-page.test.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.css`

- [ ] **Step 1: Write failing list-workspace tests**

Verify:

- no menu is selected initially
- category selection narrows the list
- one search field searches all indexed menu information
- only four primary filters are visible
- selecting exactly one row opens detail
- raw platform IDs are absent from the list
- 120 synthetic menus render without creating 120 editable text inputs

- [ ] **Step 2: Run the test and verify failure**

```powershell
npx vitest run tests/unit/renderer/unified-menu-page.test.tsx
```

- [ ] **Step 3: Implement list-only orchestration**

Reuse the existing single batch load of menus, mappings, platform menus, and option groups. Keep the data-loading boundary in `UnifiedMenuPage`; child components receive derived props and callbacks only.

- [ ] **Step 4: Add keyboard and empty states**

Arrow keys move list focus, Enter opens detail, Escape clears selection when detail is closed. Show specific empty copy for no menus, no search results, and no items in a filter.

- [ ] **Step 5: Run focused and accessibility tests**

```powershell
npx vitest run tests/unit/renderer/unified-menu-page.test.tsx tests/unit/renderer/app.test.tsx
npm run lint:types
```

- [ ] **Step 6: Commit**

```powershell
git add src/renderer/src/pages/UnifiedMenuPage.tsx src/renderer/src/components/menu-workspace src/renderer/src/App.tsx src/renderer/src/App.css tests/unit/renderer/unified-menu-page.test.tsx
git commit -m "feat: add searchable unified menu workspace"
```

### Task 5: Add explicit draft editing and platform comparison

**Files:**
- Create: `src/renderer/src/components/menu-workspace/MenuDetailPane.tsx`
- Create: `src/renderer/src/components/menu-workspace/PriceVariantEditor.tsx`
- Create: `src/renderer/src/components/menu-workspace/PlatformComparison.tsx`
- Create: `tests/unit/renderer/menu-detail-pane.test.tsx`
- Modify: `src/renderer/src/pages/UnifiedMenuPage.tsx`
- Modify: `src/renderer/src/App.css`

- [ ] **Step 1: Write failing editor safety tests**

Verify typing does not call `appApi.menus.save`, Save calls it exactly once with the full record, Cancel restores the persisted value, selection change prompts when dirty, and a save error keeps the draft available.

- [ ] **Step 2: Run the test and verify current behavior fails**

```powershell
npx vitest run tests/unit/renderer/menu-detail-pane.test.tsx
```

Expected: FAIL because the current page saves on every change.

- [ ] **Step 3: Implement local draft state**

Use one draft object per selected menu and compare normalized fields to determine dirty state. Disable Save when unchanged or invalid. Announce success and failure inside the pane.

- [ ] **Step 4: Move platform information into comparison rows**

Show platform label, connection state, platform name, compact price, difference reason, and last-seen time. Keep IDs and long binding summaries in a collapsed `고급 원본 정보` disclosure.

- [ ] **Step 5: Replace delete-first behavior**

Expose `관리 제외` as the normal action. Only show `영구 삭제` inside advanced actions when there are zero mappings, and preserve the existing main-process delete guard.

- [ ] **Step 6: Run editor, page, and menu repository tests**

```powershell
npx vitest run tests/unit/renderer/menu-detail-pane.test.tsx tests/unit/renderer/unified-menu-page.test.tsx tests/unit/main/menu-repository.test.ts
```

- [ ] **Step 7: Commit**

```powershell
git add src/renderer/src/components/menu-workspace src/renderer/src/pages/UnifiedMenuPage.tsx src/renderer/src/App.css tests/unit/renderer/menu-detail-pane.test.tsx tests/unit/renderer/unified-menu-page.test.tsx
git commit -m "feat: add safe unified menu detail editing"
```

### Task 6: Make new-menu creation transactional from the user's perspective

**Files:**
- Create: `src/renderer/src/components/menu-workspace/CreateMenuPanel.tsx`
- Create: `tests/unit/renderer/create-menu-panel.test.tsx`
- Modify: `src/renderer/src/pages/UnifiedMenuPage.tsx`

- [ ] **Step 1: Write failing creation tests**

Verify opening and canceling the panel creates nothing, required fields block Save, one valid confirmation creates exactly one record, and platform sync is not invoked.

- [ ] **Step 2: Run the focused test**

```powershell
npx vitest run tests/unit/renderer/create-menu-panel.test.tsx
```

Expected: FAIL because current `handleAddMenu` immediately persists `새 메뉴`.

- [ ] **Step 3: Implement the minimal creation form**

Collect name, category, base price or variants, and management status. Generate the ID and call `menus.save` only after validation and confirmation.

- [ ] **Step 4: Verify no writer boundary is crossed**

Assert `sync.preview`, `sync.run`, and all platform session methods are untouched.

- [ ] **Step 5: Run focused tests**

```powershell
npx vitest run tests/unit/renderer/create-menu-panel.test.tsx tests/unit/renderer/unified-menu-page.test.tsx
```

- [ ] **Step 6: Commit**

```powershell
git add src/renderer/src/components/menu-workspace/CreateMenuPanel.tsx src/renderer/src/pages/UnifiedMenuPage.tsx tests/unit/renderer/create-menu-panel.test.tsx
git commit -m "feat: add deliberate unified menu creation"
```

### Task 7: Promote review work into a dedicated page

**Files:**
- Create: `src/renderer/src/pages/ReviewInboxPage.tsx`
- Modify: `src/renderer/src/components/ReviewInboxPanel.tsx`
- Modify: `src/renderer/src/pages/DashboardPage.tsx`
- Modify: `src/renderer/src/App.tsx`
- Create: `tests/unit/renderer/review-inbox-page.test.tsx`
- Modify: `tests/unit/renderer/dashboard-page.test.tsx`

- [ ] **Step 1: Write failing review navigation tests**

Verify Home shows counts and at most three groups, `전체 검토` opens the page, one group is expanded at a time, and completing a decision returns focus to the group header.

- [ ] **Step 2: Run focused tests**

```powershell
npx vitest run tests/unit/renderer/review-inbox-page.test.tsx tests/unit/renderer/dashboard-page.test.tsx
```

- [ ] **Step 3: Separate summary from decision UI**

Dashboard owns only summary presentation. `ReviewInboxPage` loads and groups all open items. Reuse the existing intent policy and resolution APIs without changing decision semantics.

- [ ] **Step 4: Simplify primary decisions**

Keep the most likely recommendation primary. Put remembered scope, evidence JSON, and multi-item application under advanced controls.

- [ ] **Step 5: Run renderer and policy tests**

```powershell
npx vitest run tests/unit/renderer/review-inbox-page.test.tsx tests/unit/renderer/review-inbox-panel.test.tsx tests/unit/main/catalog-intent-policy.test.ts
```

- [ ] **Step 6: Commit**

```powershell
git add src/renderer/src/pages/ReviewInboxPage.tsx src/renderer/src/components/ReviewInboxPanel.tsx src/renderer/src/pages/DashboardPage.tsx src/renderer/src/App.tsx tests/unit/renderer/review-inbox-page.test.tsx tests/unit/renderer/dashboard-page.test.tsx
git commit -m "feat: add focused catalog review inbox"
```

### Task 8: Add safe legacy reconfiguration entry and comparison

**Dependency:** Phase 3 Tasks 1-5 must provide a verified automatic recovery point before this task enables final activation.

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/main/services/catalog-bootstrap-service.ts`
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/src/lib/api.ts`
- Create: `src/renderer/src/components/catalog-reconfiguration/ReconfigurationEntryCard.tsx`
- Create: `src/renderer/src/components/catalog-reconfiguration/ActiveCatalogComparison.tsx`
- Modify: `src/renderer/src/pages/CatalogOnboardingPage.tsx`
- Modify: `src/renderer/src/pages/DashboardPage.tsx`
- Extend: `tests/unit/main/catalog-bootstrap-service.test.ts`
- Extend: `tests/unit/main/catalog-onboarding-integration.test.ts`
- Create: `tests/unit/renderer/catalog-reconfiguration.test.tsx`

- [ ] **Step 1: Write failing side-effect tests**

For an `active / legacy` workspace with existing menus, verify preview creation does not change `menus`, mappings, current version, or platform source rows.

- [ ] **Step 2: Run the tests and verify the current gate fails**

```powershell
npx vitest run tests/unit/main/catalog-bootstrap-service.test.ts tests/unit/main/catalog-onboarding-integration.test.ts
```

- [ ] **Step 3: Add an explicit reconfiguration draft contract**

The preview must include active-versus-draft counts and per-menu outcomes:

```ts
type CatalogDraftOutcome = 'unchanged' | 'add' | 'update' | 'exclude' | 'needs_review'
```

Do not reuse `lifecycleState` to hide the active catalog while a draft exists.

- [ ] **Step 4: Add the entry card**

Show the card only for `seedMode === 'legacy'` or a user-requested reconfiguration. Explain that the current catalog remains active until final confirmation.

- [ ] **Step 5: Require a recovery point before activation**

Call the Phase 3 backup service first. If backup verification fails, leave the draft intact and block activation. Never downgrade this to a warning-only path.

- [ ] **Step 6: Verify cancel, failure, and restart behavior**

Closing the app mid-draft must reopen the active catalog and offer draft continuation. Cancel deletes only the draft. Activation failure leaves both active catalog and recovery point usable.

- [ ] **Step 7: Run full focused verification**

```powershell
npx vitest run tests/unit/main/catalog-bootstrap-service.test.ts tests/unit/main/catalog-onboarding-integration.test.ts tests/unit/renderer/catalog-reconfiguration.test.tsx tests/unit/shared/preload-contract.test.ts
npm run lint:types
```

- [ ] **Step 8: Commit**

```powershell
git add src/shared/contracts.ts src/main/services/catalog-bootstrap-service.ts src/main/ipc/register-handlers.ts src/main/preload.ts src/renderer/src/lib/api.ts src/renderer/src/components/catalog-reconfiguration src/renderer/src/pages/CatalogOnboardingPage.tsx src/renderer/src/pages/DashboardPage.tsx tests/unit/main/catalog-bootstrap-service.test.ts tests/unit/main/catalog-onboarding-integration.test.ts tests/unit/renderer/catalog-reconfiguration.test.tsx tests/unit/shared/preload-contract.test.ts
git commit -m "feat: add recoverable legacy catalog reconfiguration"
```

### Task 9: Integrate options without restoring screen density

**Files:**
- Modify: `src/renderer/src/pages/UnifiedMenuPage.tsx`
- Modify: `src/renderer/src/pages/OptionPage.tsx`
- Create: `src/renderer/src/components/menu-workspace/OptionWorkspace.tsx`
- Create: `tests/unit/renderer/option-workspace.test.tsx`
- Modify: `tests/unit/renderer/option-page.test.tsx`

- [ ] **Step 1: Write failing view-switch tests**

Verify `메뉴 보기` and `옵션 보기` share search context and shell, while option source details remain collapsed. Switching views must not lose an unsaved menu draft without confirmation.

- [ ] **Step 2: Extract the current option page body**

Move current option filtering and grouping into `OptionWorkspace` without changing repository or option signature behavior.

- [ ] **Step 3: Mount options inside the unified catalog route**

Use a local segmented control under the `통합메뉴` heading. Do not add options back to primary navigation.

- [ ] **Step 4: Run option and workspace regressions**

```powershell
npx vitest run tests/unit/renderer/option-workspace.test.tsx tests/unit/renderer/option-page.test.tsx tests/unit/renderer/unified-menu-page.test.tsx
```

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/src/pages/UnifiedMenuPage.tsx src/renderer/src/pages/OptionPage.tsx src/renderer/src/components/menu-workspace/OptionWorkspace.tsx tests/unit/renderer/option-workspace.test.tsx tests/unit/renderer/option-page.test.tsx
git commit -m "feat: integrate options into catalog workspace"
```

### Task 10: Verify the redesign with realistic data and update the roadmap

**Files:**
- Modify: `docs/current-status.md`
- Modify: `README.md`
- Add: `docs/design/unified-menu-workspace/` screenshots
- Modify tests only if the smoke test exposes a reproducible defect.

- [ ] **Step 1: Run all automated checks**

```powershell
npm test
npm run lint:types
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Run a read-only real-data smoke test**

Using the existing local database:

- open the 120-menu workspace
- search by canonical name and platform name
- select menus with single and multiple prices
- inspect one missing-platform item and one option-heavy item
- edit then cancel without DB change
- save one no-platform-write local catalog edit only if the user provides a safe test record
- confirm no platform writer or sync run was invoked

- [ ] **Step 3: Verify keyboard and zoom behavior**

Test keyboard-only navigation at 100% and 200% zoom. Check 1024px, 1280px, and 1440px wide layouts. Record any screen-reader checks that still require a dedicated tool.

- [ ] **Step 4: Compare before and after screenshots**

Use identical viewport and data states. Confirm the primary task needs fewer visible controls, raw source data is subordinate, and the save state is always clear.

- [ ] **Step 5: Update roadmap status**

Record Phase 2.5 as complete only after the smoke test. Keep Phase 3 and Phase 4 incomplete. Mark legacy activation as blocked if the recovery-point dependency is not complete.

- [ ] **Step 6: Commit**

```powershell
git add README.md docs/current-status.md docs/design/unified-menu-workspace
git commit -m "docs: verify unified menu workspace redesign"
```

## Delivery order relative to remaining phases

1. Implement Tasks 1-7 and 9: active catalog shell, menu workspace, safe editor, review page, integrated options.
2. Implement Phase 3 Tasks 1-5: backup envelope, serializer, verified file write, restore preview, automatic recovery points.
3. Implement Task 8: legacy catalog reconfiguration activation.
4. Finish Phase 3 Tasks 6-7: CSV/PDF and backup UI.
5. Implement Phase 4: capability-aware safe multi-platform write, using the new detail and review surfaces.
6. Run Task 10 again after each dependent phase to keep the UI and roadmap evidence current.
