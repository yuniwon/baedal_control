# Catalog Data Repair Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the current unified catalog without losing source data and prevent noisy categories, duplicate canonical menus, stale review items, hidden-menu noise, and incomplete imports from recurring.

**Architecture:** Normalize unstable source labels at ingestion and analysis boundaries, then reconcile legacy canonical menus through a transactional maintenance service. The service exposes a read-only preview and an explicit apply operation, backs up the SQLite database before mutation, preserves every platform source row, moves mappings into the selected Baemin-reference canonical menu, refreshes canonical prices from the reference source, and rebuilds the review inbox.

**Tech Stack:** Electron, TypeScript, React, Node SQLite, Vitest

---

### Task 1: Stable source normalization

**Files:**
- Create: `src/shared/catalog-normalization.ts`
- Modify: `src/main/platforms/ddangyo/managed-catalog.ts`
- Modify: `src/main/services/catalog-import-orchestrator.ts`
- Modify: `src/main/services/catalog-exception-analyzer.ts`
- Modify: `src/renderer/src/lib/catalog-category.ts`
- Test: `tests/unit/shared/catalog-normalization.test.ts`
- Test: `tests/unit/main/catalog-exception-analyzer.test.ts`

- [x] Write failing tests for stripping Ddangyo heading badges and producing stable category keys.
- [x] Run the focused tests and confirm expected failures.
- [x] Implement shared normalization and apply it before persistence and fingerprint generation.
- [x] Run the focused tests and confirm they pass.

### Task 2: Safe legacy catalog reconciliation

**Files:**
- Create: `src/main/services/catalog-maintenance-service.ts`
- Modify: `src/main/repositories/menu-repository.ts`
- Modify: `src/main/repositories/mapping-repository.ts`
- Modify: `src/main/repositories/catalog-workspace-repository.ts`
- Modify: `src/main/repositories/catalog-review-repository.ts`
- Test: `tests/unit/main/catalog-maintenance-service.test.ts`

- [x] Write failing tests for exact M/L/F aliases, source mapping reassignment, hidden-only exclusion, reference-price refresh, workspace reference persistence, review rebuild, and rollback on failure.
- [x] Run the focused tests and confirm expected failures.
- [x] Implement preview and transactional apply operations without deleting platform source rows.
- [x] Run the focused tests and confirm they pass.

### Task 3: Operator preview and confirmation UI

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/renderer/src/lib/api.ts`
- Modify: `src/renderer/src/pages/UnifiedMenuPage.tsx`
- Modify: `src/renderer/src/App.css`
- Test: `tests/unit/main/register-handlers.test.ts`
- Test: `tests/unit/renderer/unified-menu-page.test.tsx`

- [x] Write failing IPC and renderer tests for preview, confirmed safe repair, and ambiguous candidate deferral.
- [x] Run the focused tests and confirm expected failures.
- [x] Add the maintenance API and a concise repair preview in the unified-menu workspace.
- [x] Run the focused tests and confirm they pass.

### Task 4: Import completeness and platform-specific gaps

**Files:**
- Modify: `src/main/platforms/baemin/adapter.ts`
- Modify: `src/main/platforms/ddangyo/managed-catalog.ts`
- Modify: `src/main/platforms/ddangyo/adapter.ts`
- Modify: `src/shared/platform-capabilities.ts`
- Test: `tests/unit/main/baemin-adapter.test.ts`
- Test: `tests/unit/main/ddangyo-managed-catalog.test.ts`

- [ ] Write failing tests for safe notice dismissal during Baemin menu-page wait and Ddangyo option extraction when the page exposes option data.
- [ ] Run the focused tests and confirm expected failures.
- [x] Implement bounded modal recovery; Ddangyo option collection remains truthfully unsupported until a live option-management surface is available.
- [ ] Run the focused tests and confirm they pass.

### Task 5: Back up, repair, and verify current data

**Files:**
- Create at runtime: timestamped backup beside `delivery-menu-sync.db`
- Modify at runtime: `%APPDATA%/delivery-menu-sync/delivery-menu-sync.db`

- [x] Stop or confirm the app is not writing to SQLite.
- [x] Create and validate a timestamped database backup.
- [x] Run maintenance preview and compare counts to the audit baseline.
- [x] Apply only high-confidence merges and hidden-only exclusions.
- [x] Recompute reviews and verify orphan counts, canonical counts, category noise, reference price, and review reopen behavior.
- [x] Run all tests, type checking, production build, and `git diff --check`.
- [x] Commit only project files; preserve user-owned status files.
