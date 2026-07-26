# Catalog Backup, Restore, and Printable Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators save the canonical catalog outside the app, validate and preview a recovery package before restoring it, create automatic recovery points around risky changes, and export a readable menu document without credentials or browser sessions.

**Architecture:** Serialize an explicitly versioned portable payload from repositories rather than copying the live SQLite WAL files. Hash the canonical JSON payload with SHA-256, validate imports with Zod, and apply restores inside a savepoint only after a comparison preview. Generate CSV directly and render a local, sanitized HTML report to PDF through an off-screen Electron window.

**Tech Stack:** Electron, TypeScript, node:fs, node:crypto, node:sqlite, Zod, Vitest

## Global Constraints

- Backup files never include usernames, passwords, credential revisions, cookies, session tokens, authorization headers, or raw unsanitized API responses.
- Backups are stored outside the application installation directory and Electron `userData` unless the user explicitly selects another external path.
- Every package has `formatVersion = 1`, app version, creation time, workspace ID, payload, and SHA-256 checksum.
- Restoring app data never writes to a delivery platform.
- Restore preview is mandatory before merge or replace.
- Replace restore runs in one database savepoint and leaves current data untouched on any validation or write failure.
- Automatic recovery points run after canonical version 1 activation, before a sync run, after a sync run, and before canonical structure changes.
- PDF and CSV exports are for reading; only the versioned recovery package is accepted for restore.
- Keep platform source history bounded in automatic backups, but always include the latest complete snapshot for every connected platform.
- Never stage unrelated files from the existing dirty worktree.

---

## File Map

- `src/shared/catalog-backup-schema.ts`: Zod format and exported TypeScript types.
- `src/shared/contracts.ts`: backup summary, restore preview, and export request DTOs.
- `src/main/services/catalog-backup-serializer.ts`: repository data to deterministic payload.
- `src/main/services/catalog-backup-service.ts`: checksum, file validation, export, and restore.
- `src/main/services/catalog-restore-planner.ts`: merge and replace comparison.
- `src/main/services/catalog-report-builder.ts`: sanitized HTML and CSV output.
- `src/main/services/catalog-pdf-exporter.ts`: off-screen PDF generation.
- `src/main/repositories/catalog-backup-history-repository.ts`: recovery point metadata.
- `src/main/db/migrations.ts`: backup history table.
- `src/main/services/catalog-bootstrap-service.ts`: post-activation recovery hook.
- `src/main/services/sync-engine.ts`: before/after sync recovery hooks.
- `src/main/repositories/settings-repository.ts`: external backup directory setting.
- `src/main/ipc/register-handlers.ts`: dialogs and backup APIs.
- `src/main/preload.ts`: renderer backup bridge.
- `src/renderer/src/pages/SettingsPage.tsx`: backup location and restore controls.
- `src/renderer/src/pages/MenuPage.tsx`: PDF, CSV, and manual backup actions.
- `tests/unit/**`: schema, checksum, restore atomicity, export escaping, handler, and renderer tests.

### Task 1: Define and Validate Recovery Package Version 1

**Files:**
- Create: `src/shared/catalog-backup-schema.ts`
- Modify: `src/shared/contracts.ts`
- Test: `tests/unit/shared/catalog-backup-schema.test.ts`

**Interfaces:**
- Consumes: canonical menu, mapping, option, workspace, review, and intent record contracts.
- Produces: `CatalogBackupPackageV1`, `CatalogBackupPayloadV1`, `CatalogBackupSummary`, and restore DTOs.

- [ ] **Step 1: Write failing schema tests**

```ts
it('accepts a valid version one package', () => {
  expect(catalogBackupPackageSchema.parse(validPackage).formatVersion).toBe(1)
})

it.each(['password', 'cookie', 'token', 'authorization'])(
  'rejects a forbidden key named %s anywhere in the package',
  (key) => expect(() => validateNoSecretKeys({ ...validPackage, payload: { [key]: 'secret' } }))
    .toThrow(`backup_forbidden_key:${key}`)
)
```

- [ ] **Step 2: Run the schema test and verify the module is missing**

Run: `npx vitest run tests/unit/shared/catalog-backup-schema.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement the exact package envelope**

```ts
const nullableString = z.string().nullable().optional()
const nullableNumber = z.number().int().nullable().optional()
const platformCodeSchema = z.enum(['baemin', 'yogiyo', 'coupangeats', 'ddangyo', 'deliveryspecial', 'naverorder'])
const reviewKindSchema = z.enum([
  'missing_on_platform', 'unmatched_platform_menu', 'price_outlier', 'price_policy_pattern',
  'variant_shape_conflict', 'duplicate_option_group', 'option_shape_conflict',
  'legacy_noise_candidate', 'external_drift', 'lossy_projection', 'authentication_required'
])
const recommendationSchema = z.enum([
  'add_to_platform', 'add_to_canonical', 'align_to_canonical', 'keep_platform_value',
  'merge_canonical_only', 'ignore_source', 'manual_review'
])
const priceChannelSchema = z.object({
  channelCode: z.enum(['base', 'delivery', 'pickup', 'dine_in']),
  channelLabel: z.string(),
  amount: nullableNumber,
  amountText: z.string()
}).strict()
const priceVariantSchema = z.object({
  variantLabel: nullableString,
  channels: z.array(priceChannelSchema)
}).strict()
const menuRecordSchema = z.object({
  menuId: z.string(), baseName: z.string(), basePrice: z.number().int(),
  basePriceVariants: z.array(priceVariantSchema).nullable().optional(),
  isDirty: z.number().int(), isManaged: z.number().int().optional(),
  createdAt: z.string().optional(), updatedAt: z.string().optional()
}).strict()
const mappingSchema = z.object({
  mappingId: z.string(), menuId: z.string(), platformCode: platformCodeSchema,
  platformMenuId: z.string(), platformMenuName: z.string(),
  mappingStatus: z.enum(['active', 'source_absent']).optional(),
  platformMenuCurrentPrice: nullableNumber, platformMenuPriceCount: nullableNumber,
  platformMenuGroupName: nullableString, platformMenuStatus: nullableString,
  platformMenuPriceSummary: nullableString,
  platformMenuPriceVariants: z.array(priceVariantSchema).nullable().optional(),
  platformMenuBindingSummary: nullableString, platformMenuBindingStatus: nullableString,
  matchedBy: z.enum(['auto', 'manual']), isConfirmed: z.number().int(),
  lastVerifiedAt: nullableString
}).strict()
const platformMenuSchema = z.object({
  platformCode: platformCodeSchema, platformMenuId: z.string(), platformMenuName: z.string(),
  platformMenuCurrentPrice: nullableNumber, platformMenuPriceCount: nullableNumber,
  platformMenuGroupName: nullableString, platformMenuStatus: nullableString,
  platformMenuPriceSummary: nullableString,
  platformMenuPriceVariants: z.array(priceVariantSchema).nullable().optional(),
  platformMenuBindingSummary: nullableString, platformMenuBindingStatus: nullableString,
  lastSeenImportId: nullableString, lastSeenAt: nullableString,
  missingStreak: z.number().int().optional(),
  presenceStatus: z.enum(['present', 'missing_suspected', 'absent_confirmed', 'resurfaced']).optional(),
  presenceChangedAt: nullableString
}).strict()
const optionItemSchema = z.object({
  optionId: z.string(), optionName: z.string(), optionPrice: nullableNumber,
  itemStatus: nullableString, restockedAt: nullableString
}).strict()
const optionMenuSchema = z.object({
  platformMenuId: z.string(), platformMenuName: z.string(), platformMenuGroupName: nullableString
}).strict()
const optionGroupSchema = z.object({
  platformCode: platformCodeSchema, optionGroupId: z.string(), optionGroupName: z.string(),
  minOrderQuantity: nullableNumber, maxOrderQuantity: nullableNumber,
  mappingMenusCount: nullableNumber, options: z.array(optionItemSchema), menus: z.array(optionMenuSchema),
  signatureKey: nullableString, lastSeenImportId: nullableString, lastSeenAt: nullableString,
  missingStreak: z.number().int().optional(),
  presenceStatus: z.enum(['present', 'missing_suspected', 'absent_confirmed', 'resurfaced']).optional(),
  presenceChangedAt: nullableString
}).strict()
const workspaceSchema = z.object({
  workspaceId: z.string(), displayName: z.string(),
  lifecycleState: z.enum(['collecting', 'reviewing', 'active']),
  seedMode: z.enum(['platform', 'blank', 'legacy']).nullable(),
  seedPlatformCode: platformCodeSchema.nullable(), canonicalVersion: z.number().int().nonnegative(),
  activatedAt: nullableString, createdAt: z.string().optional(), updatedAt: z.string().optional()
}).strict()
const intentRuleSchema = z.object({
  intentRuleId: z.string(), workspaceId: z.string(), kind: reviewKindSchema,
  scope: z.enum(['entity', 'platform', 'category', 'field', 'workspace']),
  resolution: z.enum(['apply_recommendation', 'keep_platform_value', 'exclude_platform', 'defer', 'ignore_source', 'merge_canonical_only']),
  platformCode: platformCodeSchema.nullable().optional(), canonicalMenuId: nullableString,
  sourceEntityId: nullableString, fieldKey: nullableString, reason: z.string(),
  expiresAt: nullableString, isActive: z.number().int(), createdAt: z.string().optional(), updatedAt: z.string().optional()
}).strict()
const reviewItemSchema = z.object({
  reviewItemId: z.string(), workspaceId: z.string(), fingerprint: z.string(), kind: reviewKindSchema,
  state: z.enum(['open', 'resolved', 'deferred', 'blocked']), confidence: z.number().min(0).max(1),
  title: z.string(), explanation: z.string(), recommendation: recommendationSchema.nullable(), evidenceJson: z.string(),
  canonicalMenuId: nullableString, platformCode: platformCodeSchema.nullable().optional(),
  sourceEntityId: nullableString, intentRuleId: nullableString,
  createdAt: z.string().optional(), updatedAt: z.string().optional()
}).strict()
const importRunSchema = z.object({
  importRunId: z.string(), platformCode: platformCodeSchema, startedAt: z.string(),
  finishedAt: nullableString, status: z.enum(['running', 'completed', 'partial_failed']),
  menuFetchCompleted: z.number().int(), optionFetchCompleted: z.number().int(),
  summaryJson: nullableString, errorMessage: nullableString
}).strict()
const syncRunSchema = z.object({
  syncRunId: z.string(), startedAt: z.string(), finishedAt: nullableString,
  triggerType: z.literal('manual'), resultSummary: nullableString
}).strict()

export const catalogBackupPackageV1Schema = z.object({
  formatVersion: z.literal(1),
  appVersion: z.string().min(1),
  createdAt: z.string().datetime(),
  workspaceId: z.string().min(1),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z.object({
    workspace: workspaceSchema,
    menus: z.array(menuRecordSchema),
    mappings: z.array(mappingSchema),
    latestPlatformMenus: z.array(platformMenuSchema),
    optionGroups: z.array(optionGroupSchema),
    intentRules: z.array(intentRuleSchema),
    openReviewItems: z.array(reviewItemSchema),
    importRuns: z.array(importRunSchema),
    syncRuns: z.array(syncRunSchema),
    assets: z.array(z.object({ assetId: z.string(), sha256: z.string(), mediaType: z.string(), dataBase64: z.string() }))
  })
}).strict()
```

Use strict nested schemas. Version 1 exports `assets: []` until canonical image storage exists; the field is present so adding assets does not change the envelope shape.

- [ ] **Step 4: Add a recursive forbidden-key validator**

Normalize keys to lowercase and reject exact or suffix matches for `password`, `cookie`, `token`, `authorization`, `credentialRevision`, and `screenshotDataUrl` before checksum or disk writes.

- [ ] **Step 5: Run schema tests and type checking**

Run: `npx vitest run tests/unit/shared/catalog-backup-schema.test.ts`

Expected: PASS.

Run: `npm run lint:types`

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/shared/catalog-backup-schema.ts src/shared/contracts.ts tests/unit/shared/catalog-backup-schema.test.ts
git commit -m "feat: define portable catalog backup format"
```

### Task 2: Serialize a Deterministic, Secret-Free Payload

**Files:**
- Create: `src/main/services/catalog-backup-serializer.ts`
- Test: `tests/unit/main/catalog-backup-serializer.test.ts`

**Interfaces:**
- Consumes: repository list methods and Task 1 payload type.
- Produces: `serialize(workspaceId): CatalogBackupPayloadV1` and `stableStringify(payload)`.

- [ ] **Step 1: Write failing deterministic serialization tests**

```ts
it('produces identical JSON regardless of repository row order', () => {
  expect(stableStringify(serializerA.serialize('default')))
    .toBe(stableStringify(serializerB.serialize('default')))
})

it('includes only the latest complete source snapshot for each platform', () => {
  const payload = serializer.serialize('default')
  expect(new Set(payload.latestPlatformMenus.map((row) => row.platformCode))).toEqual(new Set(['baemin', 'yogiyo']))
})
```

- [ ] **Step 2: Run the serializer tests**

Run: `npx vitest run tests/unit/main/catalog-backup-serializer.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement stable ordering**

Sort menus by `menuId`, mappings by `mappingId`, source menus by `platformCode/platformMenuId`, option groups by `platformCode/optionGroupId`, rules by `intentRuleId`, reviews by `reviewItemId`, and runs by timestamp then ID. Recursively sort object keys in `stableStringify`.

- [ ] **Step 4: Restrict source history deliberately**

Resolve the latest `completed` import run per platform, include current source catalog rows tied to that platform's latest state, and exclude browser inspection screenshots and API response bodies. Include import and sync run summaries only.

- [ ] **Step 5: Run serializer and secret scan tests**

Run: `npx vitest run tests/unit/main/catalog-backup-serializer.test.ts tests/unit/shared/catalog-backup-schema.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/main/services/catalog-backup-serializer.ts tests/unit/main/catalog-backup-serializer.test.ts
git commit -m "feat: serialize deterministic catalog recovery payloads"
```

### Task 3: Export and Verify Backup Files

**Files:**
- Create: `src/main/services/catalog-backup-service.ts`
- Test: `tests/unit/main/catalog-backup-service.test.ts`

**Interfaces:**
- Consumes: Task 2 serializer, app version, clock, and filesystem functions.
- Produces: `createPackage`, `writePackage`, and `readAndValidatePackage`.

- [ ] **Step 1: Write failing checksum and atomic-write tests**

```ts
it('rejects a payload changed after checksum creation', async () => {
  const backup = service.createPackage('default')
  backup.payload.menus[0].baseName = '변조됨'
  await expect(service.validatePackage(backup)).rejects.toThrow('backup_checksum_mismatch')
})

it('renames a complete temporary file instead of writing the target in place', async () => {
  await service.writePackage(targetPath, service.createPackage('default'))
  expect(fileOps.rename).toHaveBeenCalledWith(`${targetPath}.tmp`, targetPath)
})
```

- [ ] **Step 2: Run the backup service tests**

Run: `npx vitest run tests/unit/main/catalog-backup-service.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement package creation and checksum verification**

```ts
createPackage(workspaceId: string): CatalogBackupPackageV1 {
  const payload = this.serializer.serialize(workspaceId)
  validateNoSecretKeys(payload)
  const payloadSha256 = createHash('sha256').update(stableStringify(payload)).digest('hex')
  return { formatVersion: 1, appVersion: this.appVersion, createdAt: this.now(), workspaceId, payloadSha256, payload }
}
```

Parse with Zod before recomputing the checksum. Refuse unknown `formatVersion` values with `backup_version_unsupported:<version>`.

- [ ] **Step 4: Implement recoverable file writes**

Create the selected parent directory, write UTF-8 JSON to `<target>.tmp` using exclusive replacement, flush and close the file, then rename it to the final `.dms-backup.json` path. On error, remove only the exact temporary file created by this operation.

- [ ] **Step 5: Run file and checksum tests**

Run: `npx vitest run tests/unit/main/catalog-backup-service.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/main/services/catalog-backup-service.ts tests/unit/main/catalog-backup-service.test.ts
git commit -m "feat: write verified catalog backup files"
```

### Task 4: Preview and Apply Merge or Replace Restore

**Files:**
- Create: `src/main/services/catalog-restore-planner.ts`
- Modify: `src/main/services/catalog-backup-service.ts`
- Test: `tests/unit/main/catalog-restore-planner.test.ts`
- Test: `tests/unit/main/catalog-restore-atomicity.test.ts`

**Interfaces:**
- Consumes: validated package and current serialized payload.
- Produces: `previewRestore`, `applyMerge`, and `applyReplace`.

- [ ] **Step 1: Write failing restore preview tests**

```ts
it('reports additions, changes, removals, and intent-rule conflicts before restore', () => {
  expect(planner.preview(current, incoming)).toEqual(expect.objectContaining({
    menus: { add: 1, change: 2, remove: 1 },
    intentRuleConflicts: 1,
    platformWriteCount: 0
  }))
})

it('rolls back every table when replace fails midway', () => {
  expect(() => service.applyReplace(packageWithForcedFailure)).toThrow('forced_restore_failure')
  expect(serializer.serialize('default')).toEqual(before)
})
```

- [ ] **Step 2: Run restore tests**

Run: `npx vitest run tests/unit/main/catalog-restore-planner.test.ts tests/unit/main/catalog-restore-atomicity.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement comparison by stable identity**

Compare menus by `menuId`, mappings by `mappingId`, source rows by `platformCode/platformMenuId`, option groups by `platformCode/optionGroupId`, and intent rules by `intentRuleId`. A merge conflict exists when the same ID differs in both current and incoming data and neither `updatedAt` proves a strict descendant.

- [ ] **Step 4: Implement merge restore**

Merge adds missing rows and applies explicitly selected incoming changes. Keep current rows for unselected conflicts. Do not import open review items whose fingerprint is already resolved by an active current intent rule.

- [ ] **Step 5: Implement replace restore inside `withSavepoint`**

Delete and insert only catalog-owned tables in dependency order. Never modify `settings`, credentials files, `platform_session_states`, or browser inspection snapshots. Restore workspace, menus, mappings, latest source rows, option groups, intent rules, review items, and summarized run history.

- [ ] **Step 6: Run restore tests**

Run: `npx vitest run tests/unit/main/catalog-restore-planner.test.ts tests/unit/main/catalog-restore-atomicity.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/main/services/catalog-restore-planner.ts src/main/services/catalog-backup-service.ts tests/unit/main/catalog-restore-planner.test.ts tests/unit/main/catalog-restore-atomicity.test.ts
git commit -m "feat: preview and restore canonical catalog backups"
```

### Task 5: Record Automatic Recovery Points

**Files:**
- Modify: `src/main/db/migrations.ts`
- Create: `src/main/repositories/catalog-backup-history-repository.ts`
- Modify: `src/main/services/catalog-bootstrap-service.ts`
- Modify: `src/main/services/sync-engine.ts`
- Modify: `src/main/repositories/settings-repository.ts`
- Test: `tests/unit/main/catalog-backup-history-repository.test.ts`
- Modify: `tests/unit/main/catalog-bootstrap-service.test.ts`
- Modify: `tests/unit/main/sync-engine.test.ts`

**Interfaces:**
- Consumes: backup service and configured external directory.
- Produces: automatic recovery files and metadata around activation and sync.

- [ ] **Step 1: Write failing hook tests**

```ts
it('creates a recovery point after canonical version one activation', () => {
  service.activate(input)
  expect(recoveryPoints.create).toHaveBeenCalledWith('catalog_activated', expect.any(Object))
})

it('creates before and after recovery points around a sync run', async () => {
  await engine.run(items)
  expect(recoveryPoints.create.mock.calls.map(([reason]) => reason)).toEqual(['before_sync', 'after_sync'])
})
```

- [ ] **Step 2: Run hook tests**

Run: `npx vitest run tests/unit/main/catalog-backup-history-repository.test.ts tests/unit/main/catalog-bootstrap-service.test.ts tests/unit/main/sync-engine.test.ts`

Expected: FAIL.

- [ ] **Step 3: Add backup metadata storage**

```sql
create table if not exists catalog_backup_history (
  backup_id text primary key,
  workspace_id text not null,
  reason text not null,
  file_path text not null,
  payload_sha256 text not null,
  status text not null,
  error_code text,
  created_at text not null default current_timestamp
);
```

- [ ] **Step 4: Add recovery hooks without hiding failures**

Activation must fail if its required post-activation backup cannot be created; keep activation and backup metadata in the same logical operation by creating the file before committing active state and deleting that exact file if activation rolls back. Before-sync backup failure blocks platform writes. After-sync backup failure records `failed` and warns the user but does not change already verified platform results.

- [ ] **Step 5: Store the chosen external directory**

Use `SettingsRepository` key `catalogBackupDirectory`. Do not default to `app.getPath('userData')`; prompt the user on first required recovery point. Tests inject an explicit temporary directory.

- [ ] **Step 6: Run history, activation, and sync tests**

Run: `npx vitest run tests/unit/main/catalog-backup-history-repository.test.ts tests/unit/main/catalog-bootstrap-service.test.ts tests/unit/main/sync-engine.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/main/db/migrations.ts src/main/repositories/catalog-backup-history-repository.ts src/main/services/catalog-bootstrap-service.ts src/main/services/sync-engine.ts src/main/repositories/settings-repository.ts tests/unit/main/catalog-backup-history-repository.test.ts tests/unit/main/catalog-bootstrap-service.test.ts tests/unit/main/sync-engine.test.ts
git commit -m "feat: create automatic catalog recovery points"
```

### Task 6: Export Readable CSV and PDF Reports

**Files:**
- Create: `src/main/services/catalog-report-builder.ts`
- Create: `src/main/services/catalog-pdf-exporter.ts`
- Test: `tests/unit/main/catalog-report-builder.test.ts`
- Test: `tests/unit/main/catalog-pdf-exporter.test.ts`

**Interfaces:**
- Consumes: canonical catalog projection for display.
- Produces: UTF-8 BOM CSV, sanitized HTML, and PDF bytes.

- [ ] **Step 1: Write failing escaping and content tests**

```ts
it('escapes spreadsheet formulas and quotes in CSV', () => {
  expect(buildCsv([{ menuName: '=1+1', optionName: '치즈, "추가"' }]))
    .toContain("'=" + '1+1')
})

it('escapes menu HTML and includes channel prices and platform availability', () => {
  const html = buildPrintableHtml(report)
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('배달 25,900원')
  expect(html).toContain('쿠팡이츠: 미판매')
})
```

- [ ] **Step 2: Run report tests**

Run: `npx vitest run tests/unit/main/catalog-report-builder.test.ts tests/unit/main/catalog-pdf-exporter.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement one report view model**

Build category sections containing menu name, description, variant/channel prices, logical option groups, and six-platform availability. Both CSV and HTML consume the same view model so printed and tabular values cannot drift.

- [ ] **Step 4: Generate PDF from a sandboxed off-screen window**

Create a hidden `BrowserWindow` with `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. Load a `data:text/html` URL containing only escaped local HTML, call `webContents.printToPDF({ printBackground: true, pageSize: 'A4' })`, then always destroy the window in `finally`.

- [ ] **Step 5: Run report tests**

Run: `npx vitest run tests/unit/main/catalog-report-builder.test.ts tests/unit/main/catalog-pdf-exporter.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/main/services/catalog-report-builder.ts src/main/services/catalog-pdf-exporter.ts tests/unit/main/catalog-report-builder.test.ts tests/unit/main/catalog-pdf-exporter.test.ts
git commit -m "feat: export printable catalog reports"
```

### Task 7: Expose Safe Backup, Restore, and Export UI

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/src/lib/api.ts`
- Modify: `src/renderer/src/pages/SettingsPage.tsx`
- Modify: `src/renderer/src/pages/MenuPage.tsx`
- Test: `tests/unit/main/register-handlers.test.ts`
- Modify: `tests/unit/renderer/settings-page.test.tsx`
- Modify: `tests/unit/renderer/menu-page.test.tsx`

**Interfaces:**
- Consumes: backup, restore, report, and PDF services.
- Produces: path selection, manual backup, restore preview/apply, CSV, and PDF actions.

- [ ] **Step 1: Write failing IPC and renderer tests**

```tsx
it('requires a restore preview before enabling replace', async () => {
  render(<SettingsPage />)
  fireEvent.click(screen.getByRole('button', { name: '백업 파일 선택' }))
  expect(screen.getByRole('button', { name: '전체 복원' })).toBeDisabled()
  await screen.findByText('추가 1개 · 변경 2개 · 제거 1개')
  expect(screen.getByRole('button', { name: '전체 복원' })).toBeEnabled()
})
```

- [ ] **Step 2: Run handler and renderer tests**

Run: `npx vitest run tests/unit/main/register-handlers.test.ts tests/unit/renderer/settings-page.test.tsx tests/unit/renderer/menu-page.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Add the exact preload API**

```ts
catalogBackup: {
  chooseDirectory: () => ipcRenderer.invoke('catalogBackup:chooseDirectory'),
  createManual: () => ipcRenderer.invoke('catalogBackup:createManual'),
  chooseRestoreFile: () => ipcRenderer.invoke('catalogBackup:chooseRestoreFile'),
  previewRestore: (path: string) => ipcRenderer.invoke('catalogBackup:previewRestore', { path }),
  applyRestore: (payload: { path: string; mode: 'merge' | 'replace'; selectedIds?: string[] }) =>
    ipcRenderer.invoke('catalogBackup:applyRestore', payload),
  exportCsv: () => ipcRenderer.invoke('catalogBackup:exportCsv'),
  exportPdf: () => ipcRenderer.invoke('catalogBackup:exportPdf')
}
```

Validate that selected restore paths are files and selected backup destinations are directories. Use Electron dialogs in the main process only.

- [ ] **Step 4: Implement explicit restore confirmation copy**

Display `이 작업은 앱의 통합 메뉴를 복원하며 배달앱의 메뉴를 자동으로 되돌리지 않습니다.` Require the user to check this acknowledgement before replace restore.

- [ ] **Step 5: Add menu export actions**

Place `인쇄/PDF`, `CSV 저장`, and `복구 백업` in one secondary action group. Do not add another primary navigation page.

- [ ] **Step 6: Run automated verification**

Run: `npm run lint:types`

Expected: PASS.

Run: `npm test`

Expected: PASS with zero failed tests.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Perform an offline restore drill**

Using a temporary user data directory, activate a fake catalog, export a backup outside that directory, close the app, delete only the temporary user data directory after verifying its resolved path, reopen the app, import the backup, and verify menus, mappings, intent rules, and review items match the checksum-backed package. Confirm credential status and browser sessions remain empty and no platform writer runs.

- [ ] **Step 8: Commit Task 7**

```bash
git add src/main/index.ts src/main/ipc/register-handlers.ts src/main/preload.ts src/renderer/src/lib/api.ts src/renderer/src/pages/SettingsPage.tsx src/renderer/src/pages/MenuPage.tsx tests/unit/main/register-handlers.test.ts tests/unit/renderer/settings-page.test.tsx tests/unit/renderer/menu-page.test.tsx
git commit -m "feat: expose catalog backup restore and export"
```
