# Six-Platform Catalog Ingestion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the desktop app so Baemin, Yogiyo, Coupang Eats, Ddangyo, Delivery Special, and Naver Order can authenticate using the most reliable platform-specific path and import complete menu, price, option, and menu-option binding catalogs.

**Architecture:** Add a shared six-platform registry and a completeness contract around the existing adapter interface. Reuse embedded Playwright login for ordinary forms, use the managed Chrome profile for anti-automation or secondary-authentication flows, capture authenticated API responses first, and fall back to detail-page DOM collection only for missing fields. Preserve raw evidence and refuse to apply absence side effects when a catalog or its bindings are incomplete.

**Tech Stack:** Electron, React, TypeScript, Playwright, Chrome DevTools Protocol, SQLite, Zod, Vitest, Testing Library

---

## File Map

- `src/shared/platforms.ts`: canonical platform codes, labels, hosts, login and menu entry URLs.
- `src/shared/contracts.ts`: six-platform types and catalog completeness DTOs.
- `src/main/platforms/base/types.ts`: adapter fetch result completeness contract.
- `src/main/services/platform-session-strategy.ts`: ordered per-platform authentication strategies.
- `src/main/services/managed-chrome-session-probe.ts`: recognize all platform hosts and page kinds.
- `src/main/services/managed-chrome-login-automator.ts`: ordinary-form auto-login and managed-session fallback descriptors.
- `src/main/services/browser-inspector-bridge.ts`: accept snapshots for all six platforms.
- `browser-extension/delivery-menu-inspector/*`: recognize and capture all six official management portals.
- `src/main/platforms/browser-catalog/*`: shared API/DOM snapshot parsing and completeness helpers.
- `src/main/platforms/yogiyo/*`: Yogiyo login, capture, and parser.
- `src/main/platforms/deliveryspecial/*`: Delivery Special/PAYCO login, capture, and parser.
- `src/main/platforms/naverorder/*`: Naver SmartPlace managed-session capture and parser.
- `src/main/platforms/coupangeats/browser-session-parser.ts`: exact option-binding completeness checks.
- `src/main/platforms/ddangyo/*`: real state fields and option catalog collection.
- `src/main/index.ts`: register six adapters and managed capture callbacks.
- `src/renderer/src/pages/SettingsPage.tsx`: six-platform credentials, session, and import controls.
- `src/renderer/src/pages/DashboardPage.tsx`: six-platform import status.
- `src/renderer/src/lib/*`: platform labels and import messages from the shared registry.
- `tests/unit/**`: TDD coverage for every new behavior.

### Task 1: Restore the Managed Chrome Test Baseline

**Files:**
- Modify: `tests/unit/main/managed-chrome-script-runner.test.ts`
- Modify: `tests/unit/main/managed-chrome-snapshot-capturer.test.ts`

- [ ] Re-run the two failing files and confirm `CloseEvent is not defined` is the only failure.
- [ ] Add a test-environment-safe close event object in the mock WebSocket implementations without changing production behavior.
- [ ] Run both files and confirm all five tests pass.
- [ ] Run `npm test` and record the new baseline.

### Task 2: Add a Canonical Six-Platform Registry

**Files:**
- Create: `src/shared/platforms.ts`
- Modify: `src/shared/contracts.ts`
- Modify: renderer hard-coded platform arrays and label helpers.
- Test: `tests/unit/shared/platforms.test.ts`

- [ ] Write a failing test expecting codes `baemin`, `yogiyo`, `coupangeats`, `ddangyo`, `deliveryspecial`, and `naverorder` in stable display order.
- [ ] Verify the test fails because the registry does not exist.
- [ ] Implement `PLATFORM_CODES`, `PLATFORM_METADATA`, `isPlatformCode`, and `getPlatformLabel`.
- [ ] Replace three-platform unions and label ternaries with registry-backed types.
- [ ] Run shared and renderer tests.

Target API:

```ts
export const PLATFORM_CODES = [
  'baemin',
  'yogiyo',
  'coupangeats',
  'ddangyo',
  'deliveryspecial',
  'naverorder'
] as const

export type PlatformCode = (typeof PLATFORM_CODES)[number]
```

### Task 3: Introduce Catalog Completeness and Safe Import Semantics

**Files:**
- Modify: `src/main/platforms/base/types.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/main/services/catalog-import-orchestrator.ts`
- Test: `tests/unit/main/catalog-import-orchestrator.test.ts`

- [ ] Write a failing test proving an incomplete menu catalog does not increment absence streaks.
- [ ] Write a failing test proving incomplete option bindings mark the run `partial_failed`.
- [ ] Add `PlatformCatalogCompleteness` to fetch results.
- [ ] Make complete legacy adapters default explicitly to their proven coverage rather than silently assuming completeness.
- [ ] Block absence side effects for incomplete entity catalogs.
- [ ] Run orchestrator tests.

### Task 4: Expand Browser Recognition and Snapshot Intake

**Files:**
- Modify: `src/main/services/managed-chrome-session-probe.ts`
- Modify: `src/main/services/browser-inspector-bridge.ts`
- Modify: `browser-extension/delivery-menu-inspector/content.js`
- Modify: `browser-extension/delivery-menu-inspector/manifest.json`
- Test: `tests/unit/main/managed-chrome-session-probe.test.ts`
- Test: `tests/unit/main/browser-inspector-dom-snapshot.test.ts`

- [ ] Write failing host-inference tests for Yogiyo, PAYCO, and Naver SmartPlace.
- [ ] Verify snapshot schema rejects a new platform before implementation.
- [ ] Add platform host aliases and menu/option page classifiers.
- [ ] Extend extension host permissions and platform detection.
- [ ] Run browser inspection tests.

### Task 5: Implement Ordered Platform Session Strategies

**Files:**
- Create: `src/main/services/platform-session-strategy.ts`
- Modify: `src/main/services/managed-chrome-login-automator.ts`
- Test: `tests/unit/main/platform-session-strategy.test.ts`
- Test: `tests/unit/main/managed-chrome-login-automator.test.ts`

- [ ] Write failing tests for each platform's ordered strategy list.
- [ ] Implement session-first strategies with credential login for Baemin, Yogiyo, Ddangyo, and Delivery Special.
- [ ] Implement managed-profile-first strategies for Coupang Eats and Naver Order.
- [ ] Add login descriptors for Yogiyo, Ddangyo, Delivery Special, and Naver without weakening Coupang fallback behavior.
- [ ] Run session and login tests.

### Task 6: Add a Shared Browser Catalog Capture Adapter

**Files:**
- Create: `src/main/platforms/browser-catalog/api-event-parser.ts`
- Create: `src/main/platforms/browser-catalog/snapshot-adapter.ts`
- Create: `src/main/platforms/browser-catalog/completeness.ts`
- Test: `tests/unit/main/browser-catalog-api-event-parser.test.ts`
- Test: `tests/unit/main/browser-catalog-completeness.test.ts`

- [ ] Write failing tests for extracting menu candidates from common API response shapes.
- [ ] Write failing tests for rejecting truncated JSON previews and mismatched expected counts.
- [ ] Implement conservative field extraction using IDs, names, prices, categories, and statuses.
- [ ] Implement DOM `menuItems` fallback that always reports unknown completeness unless a platform count proves coverage.
- [ ] Run browser catalog tests.

### Task 7: Add Yogiyo Import Support

**Files:**
- Create: `src/main/platforms/yogiyo/selectors.ts`
- Create: `src/main/platforms/yogiyo/parser.ts`
- Create: `src/main/platforms/yogiyo/adapter.ts`
- Create: `tests/fixtures/platforms/yogiyo/menu-list.html`
- Test: `tests/unit/main/yogiyo-adapter.test.ts`
- Test: `tests/unit/main/yogiyo-parser.test.ts`

- [ ] Write failing parser and login-flow tests using captured public login markup and synthetic authenticated catalog fixtures.
- [ ] Implement One ID form login and authenticated menu navigation.
- [ ] Capture API responses and parse menu, option, and binding data.
- [ ] Add managed-browser snapshot fallback.
- [ ] Refuse success when menu or option counts cannot be reconciled.
- [ ] Run Yogiyo tests.

### Task 8: Add Delivery Special Import Support

**Files:**
- Create: `src/main/platforms/deliveryspecial/selectors.ts`
- Create: `src/main/platforms/deliveryspecial/parser.ts`
- Create: `src/main/platforms/deliveryspecial/adapter.ts`
- Create: `tests/fixtures/platforms/deliveryspecial/menu-list.html`
- Test: `tests/unit/main/deliveryspecial-adapter.test.ts`
- Test: `tests/unit/main/deliveryspecial-parser.test.ts`

- [ ] Write failing tests for the PAYCO partner login form and menu parsing.
- [ ] Implement credential login and store-selection verification.
- [ ] Capture authenticated API responses with DOM detail fallback.
- [ ] Validate that the selected store belongs to the Delivery Special channel.
- [ ] Run Delivery Special tests.

### Task 9: Add Naver Order Import Support

**Files:**
- Create: `src/main/platforms/naverorder/parser.ts`
- Create: `src/main/platforms/naverorder/adapter.ts`
- Test: `tests/unit/main/naverorder-adapter.test.ts`
- Test: `tests/unit/main/naverorder-parser.test.ts`

- [ ] Write failing tests proving an existing SmartPlace menu tab can be captured without credential submission.
- [ ] Implement managed-profile-first capture and explicit reauthentication status.
- [ ] Add optional standard Naver login submission without attempting to bypass security challenges.
- [ ] Parse selected business, menu, option, and binding responses.
- [ ] Run Naver Order tests.

### Task 10: Complete Coupang and Ddangyo Catalog Evidence

**Files:**
- Modify: `src/main/platforms/coupangeats/browser-session-parser.ts`
- Modify: `src/main/platforms/coupangeats/adapter.ts`
- Modify: `src/main/platforms/ddangyo/adapter.ts`
- Modify: `src/main/platforms/ddangyo/parser.ts`
- Test: existing Coupang and Ddangyo test files plus new fixtures.

- [ ] Write a failing Coupang test for `mappingDishCount: 17` with one returned mapping dish.
- [ ] Mark that option binding catalog incomplete and request option/menu detail capture.
- [ ] Write a failing Ddangyo test proving button labels are not treated as actual status.
- [ ] Read real state fields and option bindings from WebSquare data collections.
- [ ] Run both platform suites.

### Task 11: Register Six Adapters and Expose Six-Platform UI

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/renderer/src/pages/SettingsPage.tsx`
- Modify: `src/renderer/src/pages/DashboardPage.tsx`
- Modify: `src/renderer/src/pages/MappingPage.tsx`
- Modify: `src/renderer/src/components/MappingReviewTable.tsx`
- Test: relevant renderer and handler tests.

- [ ] Write failing tests expecting six settings cards and six dashboard platforms.
- [ ] Register all adapter factories and managed snapshot callbacks.
- [ ] Render platform-specific login and managed-browser actions from metadata.
- [ ] Keep write/sync controls disabled for read-only new adapters.
- [ ] Run renderer and handler tests.

### Task 12: Verify with Real Accounts and Preserve Evidence

**Files:**
- Modify fixtures and parsers only when real response evidence requires it.
- Update: `README.md`

- [ ] Run `npm run lint:types`.
- [ ] Run `npm test` and confirm zero failures.
- [ ] Run `npm run build`.
- [ ] Launch the Electron app.
- [ ] Import Baemin and Ddangyo and compare counts to the existing known-good runs.
- [ ] Reuse the Coupang managed session and verify exact binding completeness reporting.
- [ ] Let the user enter Yogiyo and Delivery Special credentials, then import each catalog.
- [ ] Let the user authenticate Naver once if required, then verify a second import requires no input.
- [ ] Re-import all six and verify idempotency and no false absence transitions.
- [ ] Record any platform challenge as a structured actionable status rather than a successful import.
