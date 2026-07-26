# Platform Plugin and Session Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make platform integrations register through one capability-driven plugin contract and minimize repeated logins with persistent sessions, guarded credential attempts, extension-session fallback, and explicit user-challenge states.

**Architecture:** Split the current read/write `PlatformAdapter` into a `PlatformPlugin` whose authentication, reader, projector, writer, and verifier are independently declared. A session orchestrator executes strategies from the plugin manifest, persists non-secret session status, and opens a user checkpoint for OTP, QR, CAPTCHA, or unsupported automation. The current adapters are wrapped incrementally so the catalog importer and sync engine continue to use narrow reader and writer interfaces.

**Tech Stack:** Electron, TypeScript, Playwright, Chrome DevTools Protocol, browser extension messaging, node:sqlite, Zod, Vitest

## Global Constraints

- Do not use stealth plugins, fingerprint spoofing, CAPTCHA solving, security-control bypasses, or repeated credential guessing.
- Reuse an authenticated session before submitting stored credentials.
- One rejected credential submission opens the circuit until the user saves a changed credential.
- Credentials remain in Electron `safeStorage`; cookies remain in browser profiles.
- Logs, backups, snapshots, and errors must not contain passwords, cookies, tokens, or authorization headers.
- User challenges are first-class states, not generic failures.
- A new platform must not require changes to the canonical catalog engine or renderer platform switch statements.
- Read, project, write, and verify capabilities must be independently optional.
- Preserve the current read-only behavior of Yogiyo, Delivery Special, and Naver Order until real write verification exists.
- Never stage unrelated files from the existing dirty worktree.

---

## File Map

- `src/shared/platforms.ts`: platform metadata without source-of-truth semantics.
- `src/shared/platform-capabilities.ts`: typed operational capability manifests.
- `src/shared/contracts.ts`: session state and user-action DTOs.
- `src/main/platforms/base/plugin.ts`: plugin component interfaces.
- `src/main/platforms/base/plugin-registry.ts`: plugin registration and lookup.
- `src/main/platforms/base/legacy-adapter-plugin.ts`: compatibility wrapper during migration.
- `src/main/services/platform-session-orchestrator.ts`: ordered session strategy execution.
- `src/main/services/auth-attempt-guard.ts`: rejected-credential circuit breaker.
- `src/main/repositories/platform-session-state-repository.ts`: non-secret session status.
- `src/main/services/extension-session-broker.ts`: authenticated ordinary-Chrome evidence from extension snapshots.
- `src/main/services/credential-vault.ts`: credential revision fingerprint without secret exposure.
- `src/main/index.ts`: register plugins and orchestrator dependencies.
- `src/main/ipc/register-handlers.ts`: session check, connect, and resume handlers.
- `src/main/preload.ts`: renderer session APIs.
- `src/renderer/src/pages/SettingsPage.tsx`: status-driven login controls.
- `tests/unit/**`: capability, registry, session, guard, and UI tests.

### Task 1: Define Operational Capabilities and the Plugin Contract

**Files:**
- Create: `src/shared/platform-capabilities.ts`
- Create: `src/main/platforms/base/plugin.ts`
- Create: `src/main/platforms/base/plugin-registry.ts`
- Modify: `src/shared/contracts.ts`
- Test: `tests/unit/shared/platform-capabilities.test.ts`
- Test: `tests/unit/main/platform-plugin-registry.test.ts`

**Interfaces:**
- Consumes: `PlatformCode`, existing catalog snapshot and sync preview contracts.
- Produces: `PlatformCapabilityManifest`, `PlatformPlugin`, and `PlatformPluginRegistry`.

- [x] **Step 1: Write failing capability and registry tests**

```ts
it('declares independent read, project, write, and verify support', () => {
  expect(PLATFORM_CAPABILITIES.yogiyo.operations).toEqual({
    read: true,
    project: true,
    write: false,
    verify: true
  })
})

it('registers a plugin without a core platform switch', () => {
  const registry = new PlatformPluginRegistry()
  registry.register(fakePlugin)
  expect(registry.get(fakePlugin.metadata.code)).toBe(fakePlugin)
})
```

- [x] **Step 2: Run the tests and verify the modules are missing**

Run: `npx vitest run tests/unit/shared/platform-capabilities.test.ts tests/unit/main/platform-plugin-registry.test.ts`

Expected: FAIL.

- [x] **Step 3: Add the exact capability types**

```ts
export interface PlatformCapabilityManifest {
  schemaVersion: 1
  operations: { read: boolean; project: boolean; write: boolean; verify: boolean }
  catalog: {
    menus: boolean
    optionGroups: boolean
    optionBindings: boolean
    images: boolean
    promotions: boolean
  }
  authentication: {
    strategies: readonly PlatformAuthStrategy[]
    persistentProfile: boolean
    userChallengePossible: boolean
  }
}

export type PlatformAuthStrategy =
  | 'official_api'
  | 'reuse_managed_session'
  | 'reuse_extension_session'
  | 'embedded_credential_login'
  | 'managed_credential_login'
  | 'manual_authentication'

export type PlatformSessionState =
  | 'unknown'
  | 'checking'
  | 'ready'
  | 'expired'
  | 'credential_required'
  | 'challenge_required'
  | 'credential_rejected'
  | 'locked_out_risk'
  | 'unsupported'
  | 'error'

export interface PlatformSessionStateRecord {
  workspaceId: string
  platformCode: PlatformCode
  state: PlatformSessionState
  detailCode?: string | null
  credentialRevision?: string | null
  lastAttemptAt?: string | null
  lastReadyAt?: string | null
  updatedAt?: string
}

export interface PlatformAuthProbe {
  state: PlatformSessionState
  detailCode?: string | null
  authenticatedStoreKey?: string | null
}

export interface CanonicalMenuProjectionInput {
  menu: MenuRecord
  mappings: PlatformMenuMappingRecord[]
  targetPlatformCode: PlatformCode
}

export interface PlatformProjectionResult {
  disposition: 'exact' | 'transformed' | 'lossy' | 'unsupported' | 'unverified'
  projectedMenu: SyncPreviewItem | null
  issues: string[]
}

export interface PlatformWriteVerification {
  status: 'verified' | 'mismatch' | 'unknown'
  issues: string[]
}
```

Populate all six manifests from the verified matrix. Keep unverified writes `false`.

- [x] **Step 4: Add narrow plugin interfaces**

```ts
export interface PlatformPlugin {
  metadata: PlatformMetadata & { code: PlatformCode }
  capabilities: PlatformCapabilityManifest
  auth: PlatformAuthDriver
  reader: PlatformCatalogReader
  projector?: PlatformCatalogProjector
  writer?: PlatformCatalogWriter
  verifier?: PlatformWriteVerifier
}

export interface PlatformAuthDriver {
  probe(): Promise<PlatformAuthProbe>
  submitCredential?(credential: PlatformCredential): Promise<PlatformAuthProbe>
  openUserChallenge?(): Promise<void>
}

export interface PlatformCatalogReader {
  fetchCatalog(): Promise<PlatformMenuFetchResult>
}

export interface PlatformCatalogProjector {
  plan(item: CanonicalMenuProjectionInput): Promise<PlatformProjectionResult>
}

export interface PlatformCatalogWriter {
  apply(item: SyncPreviewItem): Promise<void>
}

export interface PlatformWriteVerifier {
  verify(item: SyncPreviewItem): Promise<PlatformWriteVerification>
}

export interface PlatformCredential {
  username: string
  password: string
}
```

- [x] **Step 5: Run tests and type checking**

Run: `npx vitest run tests/unit/shared/platform-capabilities.test.ts tests/unit/main/platform-plugin-registry.test.ts`

Expected: PASS.

Run: `npm run lint:types`

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/shared/platform-capabilities.ts src/main/platforms/base/plugin.ts src/main/platforms/base/plugin-registry.ts src/shared/contracts.ts tests/unit/shared/platform-capabilities.test.ts tests/unit/main/platform-plugin-registry.test.ts
git commit -m "feat: define capability-driven platform plugins"
```

### Task 2: Wrap Existing Adapters Without Breaking Imports or Sync

**Files:**
- Create: `src/main/platforms/base/legacy-adapter-plugin.ts`
- Modify: `src/main/platforms/base/registry.ts`
- Modify: `src/main/services/catalog-import-orchestrator.ts`
- Modify: `src/main/services/sync-engine.ts`
- Test: `tests/unit/main/legacy-adapter-plugin.test.ts`
- Modify: `tests/unit/main/adapter-registry.test.ts`

**Interfaces:**
- Consumes: existing `PlatformAdapter` and Task 1 plugin interfaces.
- Produces: a compatibility wrapper and narrow registry views for reader and writer consumers.

- [x] **Step 1: Write failing compatibility tests**

```ts
it('maps fetchMenusWithInspection to plugin reader fetchCatalog', async () => {
  const plugin = createLegacyAdapterPlugin(adapter, metadata, capabilities, authDriver)
  await expect(plugin.reader.fetchCatalog()).resolves.toEqual(fetchResult)
})

it('omits a writer when the manifest says writes are unverified', () => {
  const plugin = createLegacyAdapterPlugin(adapter, metadata, readOnlyCapabilities, authDriver)
  expect(plugin.writer).toBeUndefined()
})
```

- [x] **Step 2: Run the compatibility tests**

Run: `npx vitest run tests/unit/main/legacy-adapter-plugin.test.ts tests/unit/main/adapter-registry.test.ts`

Expected: FAIL.

- [x] **Step 3: Implement the wrapper**

```ts
export const createLegacyAdapterPlugin = (
  adapter: PlatformAdapter,
  metadata: PlatformMetadata & { code: PlatformCode },
  capabilities: PlatformCapabilityManifest,
  auth: PlatformAuthDriver
): PlatformPlugin => ({
  metadata,
  capabilities,
  auth,
  reader: {
    fetchCatalog: async () => adapter.fetchMenusWithInspection
      ? adapter.fetchMenusWithInspection()
      : { menus: await adapter.fetchMenus() }
  },
  ...(capabilities.operations.write
    ? { writer: { apply: (item: SyncPreviewItem) => adapter.applyMenuUpdate(item) } }
    : {})
})
```

- [x] **Step 4: Give the registry explicit reader and writer lookups**

`getReader(platformCode)` must always require a reader. `getWriter(platformCode)` throws `platform_write_unavailable:<code>` when the capability or writer is absent. Update the importer and sync engine to depend on those narrow methods.

- [x] **Step 5: Run importer and sync regression tests**

Run: `npx vitest run tests/unit/main/legacy-adapter-plugin.test.ts tests/unit/main/adapter-registry.test.ts tests/unit/main/catalog-import-orchestrator.test.ts tests/unit/main/sync-engine.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/main/platforms/base/legacy-adapter-plugin.ts src/main/platforms/base/registry.ts src/main/services/catalog-import-orchestrator.ts src/main/services/sync-engine.ts tests/unit/main/legacy-adapter-plugin.test.ts tests/unit/main/adapter-registry.test.ts
git commit -m "refactor: consume platform readers and writers through plugins"
```

### Task 3: Persist Non-Secret Session State

**Files:**
- Modify: `src/main/db/migrations.ts`
- Create: `src/main/repositories/platform-session-state-repository.ts`
- Test: `tests/unit/main/platform-session-state-repository.test.ts`

**Interfaces:**
- Consumes: `PlatformCode` and session contracts.
- Produces: `get`, `save`, and `list` session state methods.

- [x] **Step 1: Write a failing state persistence test**

```ts
it('persists a challenge without storing secret fields', () => {
  repository.save({
    workspaceId: 'default',
    platformCode: 'naverorder',
    state: 'challenge_required',
    detailCode: 'otp_required',
    credentialRevision: null,
    lastAttemptAt: '2026-07-25T00:00:00.000Z'
  })
  expect(repository.get('default', 'naverorder')).toMatchObject({ state: 'challenge_required' })
  expect(JSON.stringify(repository.get('default', 'naverorder'))).not.toMatch(/password|cookie|token/i)
})
```

- [x] **Step 2: Run the test and verify the table is missing**

Run: `npx vitest run tests/unit/main/platform-session-state-repository.test.ts`

Expected: FAIL.

- [x] **Step 3: Add the session table**

```sql
create table if not exists platform_session_states (
  workspace_id text not null,
  platform_code text not null,
  state text not null,
  detail_code text,
  credential_revision text,
  last_attempt_at text,
  last_ready_at text,
  updated_at text not null default current_timestamp,
  primary key (workspace_id, platform_code)
);
```

- [x] **Step 4: Implement the repository with an explicit column allowlist**

The `save` SQL must list only the seven non-secret columns above. Do not accept an arbitrary object or JSON blob.

- [x] **Step 5: Run repository and migration tests**

Run: `npx vitest run tests/unit/main/platform-session-state-repository.test.ts tests/unit/main/db-connection.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/main/db/migrations.ts src/main/repositories/platform-session-state-repository.ts tests/unit/main/platform-session-state-repository.test.ts
git commit -m "feat: persist safe platform session states"
```

### Task 4: Stop Rejected Credentials from Repeating

**Files:**
- Create: `src/main/services/auth-attempt-guard.ts`
- Modify: `src/main/services/credential-vault.ts`
- Test: `tests/unit/main/auth-attempt-guard.test.ts`
- Modify: `tests/unit/main/credential-vault.test.ts`

**Interfaces:**
- Consumes: credential vault and session state repository.
- Produces: `getCredentialRevision`, `assertAttemptAllowed`, `markRejected`, and `markReady`.

- [x] **Step 1: Write failing circuit-breaker tests**

```ts
it('blocks a second submission of the same rejected credential revision', () => {
  guard.markRejected('default', 'deliveryspecial', 'rev-a')
  expect(() => guard.assertAttemptAllowed('default', 'deliveryspecial', 'rev-a'))
    .toThrow('credential_retry_blocked:deliveryspecial')
})

it('allows a changed credential revision', () => {
  guard.markRejected('default', 'deliveryspecial', 'rev-a')
  expect(() => guard.assertAttemptAllowed('default', 'deliveryspecial', 'rev-b')).not.toThrow()
})
```

- [x] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run tests/unit/main/auth-attempt-guard.test.ts tests/unit/main/credential-vault.test.ts`

Expected: FAIL.

- [x] **Step 3: Add a non-reversible credential revision**

```ts
getRevision(platformCode: PlatformCode): string | null {
  const credential = this.get(platformCode)
  if (!credential) return null
  return createHash('sha256')
    .update(`${platformCode}\u0000${credential.username}\u0000${credential.password}`)
    .digest('hex')
}
```

The hash is only a change detector. Never display or export it.

- [x] **Step 4: Implement the guard**

`assertAttemptAllowed` compares the rejected state's revision with the current revision. `markReady` clears the error state. A challenge does not increment a credential failure count.

- [x] **Step 5: Run guard and vault tests**

Run: `npx vitest run tests/unit/main/auth-attempt-guard.test.ts tests/unit/main/credential-vault.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/main/services/auth-attempt-guard.ts src/main/services/credential-vault.ts tests/unit/main/auth-attempt-guard.test.ts tests/unit/main/credential-vault.test.ts
git commit -m "feat: block repeated rejected credential attempts"
```

### Task 5: Orchestrate Session Reuse, Credential Login, and User Challenges

**Files:**
- Create: `src/main/services/platform-session-orchestrator.ts`
- Modify: `src/main/services/platform-session-strategy.ts`
- Modify: `tests/unit/main/platform-session-strategy.test.ts`
- Test: `tests/unit/main/platform-session-orchestrator.test.ts`

**Interfaces:**
- Consumes: plugin auth driver, capability strategies, credential vault, attempt guard, and state repository.
- Produces: `connect(platformCode)` and `resumeAfterUserAction(platformCode)`.

- [x] **Step 1: Write failing ordered-strategy tests**

```ts
it('returns ready from a reused session without reading credentials', async () => {
  auth.probe.mockResolvedValue({ state: 'ready' })
  await expect(orchestrator.connect('baemin')).resolves.toMatchObject({ state: 'ready' })
  expect(credentialVault.get).not.toHaveBeenCalled()
})

it('stops at challenge_required and does not continue credential retries', async () => {
  auth.probe.mockResolvedValue({ state: 'expired' })
  auth.submitCredential.mockResolvedValue({ state: 'challenge_required', detailCode: 'otp_required' })
  await expect(orchestrator.connect('naverorder')).resolves.toMatchObject({ state: 'challenge_required' })
  expect(auth.submitCredential).toHaveBeenCalledTimes(1)
})
```

- [x] **Step 2: Run the orchestrator tests**

Run: `npx vitest run tests/unit/main/platform-session-orchestrator.test.ts tests/unit/main/platform-session-strategy.test.ts`

Expected: FAIL.

- [x] **Step 3: Implement the state transition loop**

```ts
async connect(platformCode: PlatformCode): Promise<PlatformSessionStateRecord> {
  const plugin = this.plugins.get(platformCode)
  this.states.save(this.checking(platformCode))
  const probe = await plugin.auth.probe()
  if (probe.state === 'ready') return this.persistReady(platformCode, probe)
  for (const strategy of plugin.capabilities.authentication.strategies) {
    const result = await this.execute(strategy, plugin)
    if (result.state === 'ready') return this.persistReady(platformCode, result)
    if (['challenge_required', 'credential_rejected', 'locked_out_risk', 'unsupported'].includes(result.state)) {
      return this.persist(platformCode, result)
    }
  }
  return this.persist(platformCode, { state: 'credential_required', detailCode: 'no_available_strategy' })
}
```

`execute` must call the attempt guard immediately before credential submission. `resumeAfterUserAction` performs a fresh probe; it never replays the password automatically.

- [x] **Step 4: Keep strategies in manifests, not platform switches**

Deprecate the hard-coded `strategies` record in `platform-session-strategy.ts`. Retain only generic ordering validation and managed-tab selection until tab discovery moves into plugin metadata.

- [x] **Step 5: Run session and login regressions**

Run: `npx vitest run tests/unit/main/platform-session-orchestrator.test.ts tests/unit/main/platform-session-strategy.test.ts tests/unit/main/managed-chrome-login-automator.test.ts tests/unit/main/managed-chrome-session-probe.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/main/services/platform-session-orchestrator.ts src/main/services/platform-session-strategy.ts tests/unit/main/platform-session-orchestrator.test.ts tests/unit/main/platform-session-strategy.test.ts
git commit -m "feat: orchestrate persistent platform sessions"
```

### Task 6: Recognize Authenticated Ordinary-Chrome Extension Sessions

**Files:**
- Create: `src/main/services/extension-session-broker.ts`
- Modify: `src/main/services/browser-inspector-bridge.ts`
- Modify: `browser-extension/delivery-menu-inspector/content.js`
- Test: `tests/unit/main/extension-session-broker.test.ts`
- Modify: `tests/unit/main/browser-inspector-bridge.test.ts`

**Interfaces:**
- Consumes: sanitized browser inspection snapshots.
- Produces: recent authenticated-session evidence for `reuse_extension_session`.

- [x] **Step 1: Write failing broker tests**

```ts
it('accepts a recent management page without visible password fields', () => {
  expect(broker.probe('coupangeats', recentAuthenticatedSnapshot)).toMatchObject({ state: 'ready' })
})

it('rejects a login page and stale evidence', () => {
  expect(broker.probe('coupangeats', loginSnapshot)).toMatchObject({ state: 'expired' })
  expect(broker.probe('coupangeats', staleSnapshot)).toMatchObject({ state: 'unknown' })
})
```

- [x] **Step 2: Run broker tests**

Run: `npx vitest run tests/unit/main/extension-session-broker.test.ts tests/unit/main/browser-inspector-bridge.test.ts`

Expected: FAIL.

- [x] **Step 3: Add sanitized auth evidence to snapshots**

Add only these fields: `visiblePasswordInputCount`, `loginMarkerDetected`, `logoutMarkerDetected`, and `managementMarkerDetected`. Do not capture input values, cookies, local storage, request headers, or response headers.

- [x] **Step 4: Implement freshness and host checks**

Accept evidence only when the snapshot host maps to the requested platform, capture age is at most five minutes, password input count is zero, and either logout or management markers are present. Otherwise return `unknown` or `expired` without trying to imitate the browser.

- [x] **Step 5: Run extension and bridge tests**

Run: `npx vitest run tests/unit/main/extension-session-broker.test.ts tests/unit/main/browser-inspector-bridge.test.ts tests/unit/browser-extension/capture-client.test.js`

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/main/services/extension-session-broker.ts src/main/services/browser-inspector-bridge.ts browser-extension/delivery-menu-inspector/content.js tests/unit/main/extension-session-broker.test.ts tests/unit/main/browser-inspector-bridge.test.ts
git commit -m "feat: reuse authenticated extension browser sessions"
```

### Task 7: Connect Plugins and Render Actionable Session States

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/src/pages/SettingsPage.tsx`
- Modify: `src/renderer/src/lib/api.ts`
- Test: `tests/unit/main/register-handlers.test.ts`
- Modify: `tests/unit/renderer/settings-page.test.tsx`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: `check`, `connect`, and `resumeAfterUserAction` UI actions with stable session-state copy.

- [x] **Step 1: Write failing IPC and UI state tests**

```tsx
it('shows one user action for an OTP challenge and no automatic retry button', async () => {
  render(<SettingsPage />)
  expect(await screen.findByText('추가 인증이 필요합니다')).toBeTruthy()
  expect(screen.getByRole('button', { name: '인증 화면 열기' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '자동 재시도' })).toBeNull()
})
```

- [x] **Step 2: Run handler and renderer tests**

Run: `npx vitest run tests/unit/main/register-handlers.test.ts tests/unit/renderer/settings-page.test.tsx`

Expected: FAIL.

- [x] **Step 3: Register all six plugins in `src/main/index.ts`**

Build each plugin from its existing adapter, platform metadata, verified capability manifest, and auth driver. Pass the plugin registry to imports, sync, and session orchestration. Remove platform factory decisions from renderer code.

- [x] **Step 4: Add the exact IPC surface**

```ts
platformSessions: {
  list: () => ipcRenderer.invoke('platformSessions:list'),
  check: (platformCode: PlatformCode) => ipcRenderer.invoke('platformSessions:check', { platformCode }),
  connect: (platformCode: PlatformCode) => ipcRenderer.invoke('platformSessions:connect', { platformCode }),
  resumeAfterUserAction: (platformCode: PlatformCode) =>
    ipcRenderer.invoke('platformSessions:resumeAfterUserAction', { platformCode })
}
```

- [x] **Step 5: Render controls from state and capability data**

Show `연결됨`, `세션 만료`, `로그인 정보 필요`, `추가 인증 필요`, `로그인 정보 확인 필요`, and `자동 연결 불가`. A rejected credential state offers `로그인 정보 수정` only. A challenge offers `인증 화면 열기` followed by `인증 완료 확인`.

- [x] **Step 6: Run automated verification**

Run: `npm run lint:types`

Expected: PASS.

Run: `npx vitest run tests/unit/main/platform-session-orchestrator.test.ts tests/unit/main/register-handlers.test.ts tests/unit/renderer/settings-page.test.tsx`

Expected: PASS.

Run: `npm test`

Expected: PASS with zero failed tests.

- [x] **Step 7: Perform a no-write real-session smoke test**

For the five currently authenticated platforms, close and reopen the app, confirm session probes return `ready`, then test one expired-session path without entering a deliberately wrong password. Leave Naver Order deferred until the user supplies a valid login. Do not invoke any platform writer.

2026-07-26 결과: 플랫폼 writer와 비밀번호 제출 없이 전용 프로필을 재실행했다. 배민·요기요·쿠팡이츠·땡겨요·배달특급은 모두 로그인 화면으로 돌아가 `expired`로 정확히 판정됐고 네이버주문은 `unknown`으로 유지됐다. 다섯 플랫폼의 `ready` 재확인은 사용자가 열린 전용 Chrome에서 로그인한 뒤 계속한다.

2026-07-26 후속 결과: 로그인 복원 뒤 실제 읽기 전용 가져오기는 배민 46개·옵션 12그룹, 요기요 71개·옵션 18그룹, 쿠팡이츠 38개·옵션 11그룹, 땡겨요 44개, 배달특급 47개·옵션 24그룹까지 성공했다. 후속 반복 검사에서 배달특급 로그인 폼 입력값이 어긋나 서버 로그인 오류가 발생해 자동 재시도를 중단했고, 사용자가 정상 로그인한 뒤 현재 세션만 재사용해 47개·24그룹을 다시 수집했다. 다섯 플랫폼의 최신 실행 기록은 모두 `completed`, 세션 상태는 모두 `ready`다. 플랫폼 writer는 호출하지 않았다.

- [ ] **Step 8: Commit Task 7**

```bash
git add src/main/index.ts src/main/ipc/register-handlers.ts src/main/preload.ts src/renderer/src/pages/SettingsPage.tsx src/renderer/src/lib/api.ts tests/unit/main/register-handlers.test.ts tests/unit/renderer/settings-page.test.tsx
git commit -m "feat: expose actionable platform session states"
```
