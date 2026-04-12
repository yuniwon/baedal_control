# Delivery Menu Sync MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-only local desktop app that lets one store owner edit menu names and prices in one place, preview the changes, and sync them to Baemin, Coupang Eats, and Ddangyo through browser automation.

**Architecture:** Start from a fresh Electron + React + TypeScript workspace. Keep all menu data, mappings, settings, and sync logs in a local SQLite database, store credentials in the Windows credential vault, and isolate each delivery platform behind a dedicated Playwright adapter. The renderer handles data entry, preview, and status views through a narrow preload bridge; the main process owns SQLite, credentials, sync orchestration, and automation.

**Tech Stack:** Electron, electron-vite, React, TypeScript, SQLite (`better-sqlite3`), Playwright, Keytar, Zod, Vitest, React Testing Library, jsdom

---

## File Map

- `package.json`: app metadata, scripts, dependencies
- `electron.vite.config.ts`: build config for main, preload, and renderer bundles
- `tsconfig.json`: root TypeScript config
- `src/shared/contracts.ts`: shared DTOs and enums used by preload, main, and renderer
- `src/main/index.ts`: Electron bootstrap and BrowserWindow creation
- `src/main/preload.ts`: safe IPC bridge exposed to the renderer
- `src/main/ipc/register-handlers.ts`: central handler registration
- `src/main/db/connection.ts`: SQLite connection and initialization
- `src/main/db/migrations.ts`: schema creation SQL
- `src/main/repositories/*.ts`: CRUD access for menus, mappings, runs, and settings
- `src/main/services/*.ts`: credential vault, matcher, planner, and sync engine
- `src/main/platforms/base/*.ts`: adapter contracts and registry
- `src/main/platforms/<platform>/*.ts`: platform selectors, parser helpers, and Playwright adapter
- `src/renderer/src/App.tsx`: top-level renderer shell
- `src/renderer/src/components/*.tsx`: menu table, preview dialog, status badges
- `src/renderer/src/pages/*.tsx`: Dashboard, Menus, Mapping, History, Settings
- `src/renderer/src/lib/api.ts`: typed wrapper over preload bridge
- `src/renderer/src/styles/app.css`: app-wide styling
- `tests/unit/main/**/*.test.ts`: main-process unit tests
- `tests/unit/renderer/**/*.test.tsx`: renderer unit tests
- `tests/fixtures/platforms/**/*.html`: saved HTML fixtures for adapter parser tests
- `README.md`: local development and manual verification instructions

## Task 1: Bootstrap the Electron Workspace

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/main/index.ts`
- Create: `src/main/preload.ts`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/styles/app.css`
- Test: `tests/unit/shared/preload-contract.test.ts`

- [ ] **Step 1: Initialize Git and scaffold the Electron + React + TypeScript app**

Run:

```bash
git init
npm create @quick-start/electron@latest . -- --template react-ts
npm install
```

Expected: a new Electron workspace exists in `C:/dev/bedal` with `src/main`, `src/preload`, and `src/renderer`.

- [ ] **Step 2: Add the runtime and test dependencies**

Run:

```bash
npm install better-sqlite3 keytar zod
npm install -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom jsdom
```

Expected: `package.json` contains the new runtime and dev dependencies.

- [ ] **Step 3: Update `package.json` scripts and test config**

Use this as the target shape:

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run --coverage",
    "test:watch": "vitest",
    "lint:types": "tsc --noEmit"
  }
}
```

- [ ] **Step 4: Write the failing preload contract test**

Create `tests/unit/shared/preload-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { appApiKeys } from '../../../src/shared/contracts'

describe('preload contract', () => {
  it('exposes the expected renderer API keys', () => {
    expect(appApiKeys).toEqual([
      'menus',
      'mappings',
      'settings',
      'syncRuns',
      'sync'
    ])
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/unit/shared/preload-contract.test.ts
```

Expected: FAIL because `src/shared/contracts.ts` does not exist yet.

- [ ] **Step 6: Add the minimal shared contract and preload bridge**

Create `src/shared/contracts.ts`:

```ts
export const appApiKeys = ['menus', 'mappings', 'settings', 'syncRuns', 'sync'] as const

export type AppApiKey = (typeof appApiKeys)[number]
```

Create `src/main/preload.ts`:

```ts
import { contextBridge } from 'electron'

const appApi = {
  menus: {},
  mappings: {},
  settings: {},
  syncRuns: {},
  sync: {}
}

contextBridge.exposeInMainWorld('appApi', appApi)
```

Update `src/main/index.ts` so the BrowserWindow points to the preload file:

```ts
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: false
}
```

- [ ] **Step 7: Run the test suite and type-check**

Run:

```bash
npm run test -- tests/unit/shared/preload-contract.test.ts
npm run lint:types
```

Expected: PASS and TypeScript exits cleanly.

- [ ] **Step 8: Commit the bootstrap**

Run:

```bash
git add .
git commit -m "chore: bootstrap electron workspace"
```

## Task 2: Implement the Shared Domain Model and SQLite Layer

**Files:**
- Create: `src/shared/contracts.ts`
- Create: `src/main/db/connection.ts`
- Create: `src/main/db/migrations.ts`
- Create: `src/main/repositories/menu-repository.ts`
- Create: `src/main/repositories/mapping-repository.ts`
- Create: `src/main/repositories/sync-run-repository.ts`
- Test: `tests/unit/main/menu-repository.test.ts`
- Test: `tests/unit/main/mapping-repository.test.ts`

- [ ] **Step 1: Write the failing menu repository tests**

Create `tests/unit/main/menu-repository.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { MenuRepository } from '../../../src/main/repositories/menu-repository'

describe('MenuRepository', () => {
  let repository: MenuRepository

  beforeEach(() => {
    const db = createInMemoryConnection()
    migrate(db)
    repository = new MenuRepository(db)
  })

  it('creates and lists menus ordered by name', () => {
    repository.upsert({ menuId: 'm2', baseName: '페퍼로니', basePrice: 23900, isDirty: 1 })
    repository.upsert({ menuId: 'm1', baseName: '콤비네이션', basePrice: 22900, isDirty: 0 })

    expect(repository.list()).toEqual([
      expect.objectContaining({ menuId: 'm1', baseName: '콤비네이션', basePrice: 22900 }),
      expect.objectContaining({ menuId: 'm2', baseName: '페퍼로니', basePrice: 23900 })
    ])
  })
})
```

Create `tests/unit/main/mapping-repository.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { MappingRepository } from '../../../src/main/repositories/mapping-repository'

describe('MappingRepository', () => {
  let repository: MappingRepository

  beforeEach(() => {
    const db = createInMemoryConnection()
    migrate(db)
    repository = new MappingRepository(db)
  })

  it('stores confirmed platform mappings', () => {
    repository.upsert({
      mappingId: 'map-1',
      menuId: 'm1',
      platformCode: 'baemin',
      platformMenuId: 'p-11',
      platformMenuName: '콤비네이션',
      matchedBy: 'manual',
      isConfirmed: 1
    })

    expect(repository.listForMenu('m1')).toEqual([
      expect.objectContaining({ platformCode: 'baemin', platformMenuId: 'p-11', isConfirmed: 1 })
    ])
  })
})
```

- [ ] **Step 2: Run the repository tests to verify they fail**

Run:

```bash
npm run test -- tests/unit/main/menu-repository.test.ts tests/unit/main/mapping-repository.test.ts
```

Expected: FAIL because the DB layer and repositories do not exist yet.

- [ ] **Step 3: Expand `src/shared/contracts.ts` with the app DTOs**

Use this structure:

```ts
export type PlatformCode = 'baemin' | 'coupangeats' | 'ddangyo'

export interface MenuRecord {
  menuId: string
  baseName: string
  basePrice: number
  isDirty: number
  createdAt?: string
  updatedAt?: string
}

export interface PlatformMenuMappingRecord {
  mappingId: string
  menuId: string
  platformCode: PlatformCode
  platformMenuId: string
  platformMenuName: string
  matchedBy: 'auto' | 'manual'
  isConfirmed: number
  lastVerifiedAt?: string
}

export interface SyncRunRecord {
  syncRunId: string
  startedAt: string
  finishedAt?: string
  triggerType: 'manual'
  resultSummary?: string
}
```

- [ ] **Step 4: Implement the SQLite connection and migrations**

Create `src/main/db/connection.ts`:

```ts
import Database from 'better-sqlite3'

export const createConnection = (filename: string) => new Database(filename)
export const createInMemoryConnection = () => new Database(':memory:')
```

Create `src/main/db/migrations.ts`:

```ts
import type Database from 'better-sqlite3'

export const migrate = (db: Database.Database) => {
  db.exec(`
    create table if not exists menus (
      menu_id text primary key,
      base_name text not null,
      base_price integer not null,
      is_dirty integer not null default 0,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists platform_menu_mappings (
      mapping_id text primary key,
      menu_id text not null,
      platform_code text not null,
      platform_menu_id text not null,
      platform_menu_name text not null,
      matched_by text not null,
      is_confirmed integer not null default 0,
      last_verified_at text,
      foreign key(menu_id) references menus(menu_id)
    );

    create table if not exists sync_runs (
      sync_run_id text primary key,
      started_at text not null,
      finished_at text,
      trigger_type text not null,
      result_summary text
    );
  `)
}
```

- [ ] **Step 5: Implement the menu and mapping repositories**

Create `src/main/repositories/menu-repository.ts`:

```ts
import type Database from 'better-sqlite3'
import type { MenuRecord } from '../../shared/contracts'

export class MenuRepository {
  constructor(private readonly db: Database.Database) {}

  upsert(record: MenuRecord) {
    this.db.prepare(`
      insert into menus (menu_id, base_name, base_price, is_dirty)
      values (@menuId, @baseName, @basePrice, @isDirty)
      on conflict(menu_id) do update set
        base_name = excluded.base_name,
        base_price = excluded.base_price,
        is_dirty = excluded.is_dirty,
        updated_at = current_timestamp
    `).run(record)
  }

  list(): MenuRecord[] {
    return this.db.prepare(`
      select menu_id as menuId, base_name as baseName, base_price as basePrice, is_dirty as isDirty,
             created_at as createdAt, updated_at as updatedAt
      from menus
      order by base_name asc
    `).all() as MenuRecord[]
  }
}
```

Create `src/main/repositories/mapping-repository.ts`:

```ts
import type Database from 'better-sqlite3'
import type { PlatformMenuMappingRecord } from '../../shared/contracts'

export class MappingRepository {
  constructor(private readonly db: Database.Database) {}

  upsert(record: PlatformMenuMappingRecord) {
    this.db.prepare(`
      insert into platform_menu_mappings (
        mapping_id, menu_id, platform_code, platform_menu_id, platform_menu_name, matched_by, is_confirmed
      ) values (
        @mappingId, @menuId, @platformCode, @platformMenuId, @platformMenuName, @matchedBy, @isConfirmed
      )
      on conflict(mapping_id) do update set
        platform_menu_name = excluded.platform_menu_name,
        matched_by = excluded.matched_by,
        is_confirmed = excluded.is_confirmed,
        last_verified_at = current_timestamp
    `).run(record)
  }

  listForMenu(menuId: string): PlatformMenuMappingRecord[] {
    return this.db.prepare(`
      select mapping_id as mappingId, menu_id as menuId, platform_code as platformCode,
             platform_menu_id as platformMenuId, platform_menu_name as platformMenuName,
             matched_by as matchedBy, is_confirmed as isConfirmed, last_verified_at as lastVerifiedAt
      from platform_menu_mappings
      where menu_id = ?
      order by platform_code asc
    `).all(menuId) as PlatformMenuMappingRecord[]
  }

  listAll(): PlatformMenuMappingRecord[] {
    return this.db.prepare(`
      select mapping_id as mappingId, menu_id as menuId, platform_code as platformCode,
             platform_menu_id as platformMenuId, platform_menu_name as platformMenuName,
             matched_by as matchedBy, is_confirmed as isConfirmed, last_verified_at as lastVerifiedAt
      from platform_menu_mappings
      order by menu_id asc, platform_code asc
    `).all() as PlatformMenuMappingRecord[]
  }
}
```

- [ ] **Step 6: Add a minimal sync run repository**

Create `src/main/repositories/sync-run-repository.ts`:

```ts
import type Database from 'better-sqlite3'
import type { SyncRunRecord } from '../../shared/contracts'

export class SyncRunRepository {
  constructor(private readonly db: Database.Database) {}

  create(record: SyncRunRecord) {
    this.db.prepare(`
      insert into sync_runs (sync_run_id, started_at, finished_at, trigger_type, result_summary)
      values (@syncRunId, @startedAt, @finishedAt, @triggerType, @resultSummary)
    `).run(record)
  }

  update(record: { syncRunId: string; finishedAt: string; resultSummary: string }) {
    this.db.prepare(`
      update sync_runs
      set finished_at = @finishedAt, result_summary = @resultSummary
      where sync_run_id = @syncRunId
    `).run(record)
  }

  list(): SyncRunRecord[] {
    return this.db.prepare(`
      select sync_run_id as syncRunId, started_at as startedAt, finished_at as finishedAt,
             trigger_type as triggerType, result_summary as resultSummary
      from sync_runs
      order by started_at desc
    `).all() as SyncRunRecord[]
  }
}
```

- [ ] **Step 7: Run the tests again**

Run:

```bash
npm run test -- tests/unit/main/menu-repository.test.ts tests/unit/main/mapping-repository.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the data layer**

Run:

```bash
git add .
git commit -m "feat: add sqlite repositories"
```

## Task 3: Add Credential Storage and Platform Settings

**Files:**
- Create: `src/main/services/credential-vault.ts`
- Create: `src/main/repositories/settings-repository.ts`
- Create: `src/main/ipc/register-handlers.ts`
- Modify: `src/main/preload.ts`
- Test: `tests/unit/main/credential-vault.test.ts`

- [ ] **Step 1: Write the failing credential vault tests**

Create `tests/unit/main/credential-vault.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CredentialVault } from '../../../src/main/services/credential-vault'

const keytar = {
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn()
}

describe('CredentialVault', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('stores and reads platform credentials by platform code', async () => {
    keytar.getPassword.mockResolvedValue(JSON.stringify({ username: 'owner', password: 'pw' }))
    const vault = new CredentialVault(keytar as never)

    const result = await vault.get('baemin')

    expect(result).toEqual({ username: 'owner', password: 'pw' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/unit/main/credential-vault.test.ts
```

Expected: FAIL because the service does not exist yet.

- [ ] **Step 3: Implement the vault and settings repository**

Create `src/main/services/credential-vault.ts`:

```ts
import keytar from 'keytar'
import type { PlatformCode } from '../../shared/contracts'

const SERVICE_NAME = 'delivery-menu-sync'

export class CredentialVault {
  constructor(private readonly store = keytar) {}

  async get(platformCode: PlatformCode) {
    const raw = await this.store.getPassword(SERVICE_NAME, platformCode)
    return raw ? JSON.parse(raw) as { username: string; password: string } : null
  }

  async set(platformCode: PlatformCode, username: string, password: string) {
    await this.store.setPassword(SERVICE_NAME, platformCode, JSON.stringify({ username, password }))
  }

  async clear(platformCode: PlatformCode) {
    await this.store.deletePassword(SERVICE_NAME, platformCode)
  }
}
```

Create `src/main/repositories/settings-repository.ts`:

```ts
import type Database from 'better-sqlite3'

export class SettingsRepository {
  constructor(private readonly db: Database.Database) {}

  setValue(key: string, value: string) {
    this.db.prepare(`
      create table if not exists settings (
        key text primary key,
        value text not null
      )
    `).run()

    this.db.prepare(`
      insert into settings (key, value) values (?, ?)
      on conflict(key) do update set value = excluded.value
    `).run(key, value)
  }

  getValue(key: string) {
    const row = this.db.prepare(`select value from settings where key = ?`).get(key) as { value: string } | undefined
    return row?.value ?? null
  }
}
```

- [ ] **Step 4: Wire the preload API for settings**

Update `src/main/preload.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'

const appApi = {
  menus: {
    list: () => ipcRenderer.invoke('menus:list'),
    save: (payload: unknown) => ipcRenderer.invoke('menus:save', payload)
  },
  mappings: {
    list: () => ipcRenderer.invoke('mappings:list'),
    save: (payload: unknown) => ipcRenderer.invoke('mappings:save', payload)
  },
  settings: {
    getPlatformCredentialStatus: () => ipcRenderer.invoke('settings:get-platform-credential-status'),
    savePlatformCredential: (payload: { platformCode: string; username: string; password: string }) =>
      ipcRenderer.invoke('settings:save-platform-credential', payload)
  },
  syncRuns: {
    list: () => ipcRenderer.invoke('syncRuns:list')
  },
  sync: {
    preview: () => ipcRenderer.invoke('sync:preview'),
    run: () => ipcRenderer.invoke('sync:run')
  }
}

contextBridge.exposeInMainWorld('appApi', appApi)
```

Create `src/main/ipc/register-handlers.ts`:

```ts
import { ipcMain } from 'electron'
import { CredentialVault } from '../services/credential-vault'
import type { PlatformCode } from '../../shared/contracts'

export const registerHandlers = ({
  menuRepository,
  mappingRepository,
  syncRunRepository,
  credentialVault
}: {
  menuRepository: { list: () => unknown[]; upsert: (payload: any) => void }
  mappingRepository: { listAll: () => unknown[]; upsert: (payload: any) => void }
  syncRunRepository: { list: () => unknown[] }
  credentialVault: CredentialVault
}) => {
  ipcMain.handle('menus:list', async () => menuRepository.list())
  ipcMain.handle('menus:save', async (_event, payload) => {
    menuRepository.upsert(payload)
    return { ok: true }
  })

  ipcMain.handle('mappings:list', async () => mappingRepository.listAll())
  ipcMain.handle('mappings:save', async (_event, payload) => {
    mappingRepository.upsert(payload)
    return { ok: true }
  })

  ipcMain.handle('syncRuns:list', async () => syncRunRepository.list())

  ipcMain.handle('settings:get-platform-credential-status', async () => {
    const platforms: PlatformCode[] = ['baemin', 'coupangeats', 'ddangyo']
    const entries = await Promise.all(platforms.map(async (platformCode) => ({
      platformCode,
      connected: Boolean(await credentialVault.get(platformCode))
    })))

    return entries
  })

  ipcMain.handle('settings:save-platform-credential', async (_event, payload) => {
    await credentialVault.set(payload.platformCode, payload.username, payload.password)
    return { ok: true }
  })
}
```

- [ ] **Step 5: Run the test and type-check**

Run:

```bash
npm run test -- tests/unit/main/credential-vault.test.ts
npm run lint:types
```

Expected: PASS.

- [ ] **Step 6: Commit the credential and settings layer**

Run:

```bash
git add .
git commit -m "feat: add credential storage and settings handlers"
```

## Task 4: Build the Sync Planner and Diff Rules

**Files:**
- Create: `src/main/services/sync-planner.ts`
- Create: `src/main/services/menu-matcher.ts`
- Test: `tests/unit/main/sync-planner.test.ts`
- Test: `tests/unit/main/menu-matcher.test.ts`

- [ ] **Step 1: Write the failing sync planner tests**

Create `tests/unit/main/sync-planner.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildSyncPreview } from '../../../src/main/services/sync-planner'

describe('buildSyncPreview', () => {
  it('creates one update item per changed mapped platform menu', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'm1', baseName: '직화불고기', basePrice: 23900, isDirty: 1 }],
      mappings: [{
        mappingId: 'map-1',
        menuId: 'm1',
        platformCode: 'baemin',
        platformMenuId: 'p-1',
        platformMenuName: '불고기피자',
        matchedBy: 'manual',
        isConfirmed: 1
      }]
    })

    expect(preview.items).toEqual([
      expect.objectContaining({
        platformCode: 'baemin',
        menuId: 'm1',
        nextName: '직화불고기',
        nextPrice: 23900
      })
    ])
  })

  it('marks unmapped menus as needsReview instead of scheduling a write', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'm2', baseName: '페퍼로니', basePrice: 24900, isDirty: 1 }],
      mappings: []
    })

    expect(preview.needsReview).toEqual([
      expect.objectContaining({ menuId: 'm2', reason: 'missing_mapping' })
    ])
  })
})
```

Create `tests/unit/main/menu-matcher.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeMenuName, scoreMenuMatch } from '../../../src/main/services/menu-matcher'

describe('menu matcher', () => {
  it('normalizes whitespace and punctuation', () => {
    expect(normalizeMenuName('콤비네이션   피자(L)')).toBe('콤비네이션피자l')
  })

  it('prefers exact normalized matches', () => {
    expect(scoreMenuMatch('콤비네이션 피자', '콤비네이션피자')).toBeGreaterThan(0.95)
  })
})
```

- [ ] **Step 2: Run the planner tests to verify they fail**

Run:

```bash
npm run test -- tests/unit/main/sync-planner.test.ts tests/unit/main/menu-matcher.test.ts
```

Expected: FAIL because the services do not exist yet.

- [ ] **Step 3: Implement the matcher**

Create `src/main/services/menu-matcher.ts`:

```ts
export const normalizeMenuName = (value: string) =>
  value.toLowerCase().replace(/[\s()\-_/]/g, '')

export const scoreMenuMatch = (left: string, right: string) => {
  const a = normalizeMenuName(left)
  const b = normalizeMenuName(right)
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.9

  const overlap = [...new Set(a)].filter((char) => b.includes(char)).length
  return overlap / Math.max(a.length, b.length, 1)
}
```

- [ ] **Step 4: Implement the sync planner**

Create `src/main/services/sync-planner.ts`:

```ts
import type { MenuRecord, PlatformMenuMappingRecord } from '../../shared/contracts'

interface BuildSyncPreviewInput {
  menus: MenuRecord[]
  mappings: PlatformMenuMappingRecord[]
}

export const buildSyncPreview = ({ menus, mappings }: BuildSyncPreviewInput) => {
  const items = []
  const needsReview = []

  for (const menu of menus.filter((entry) => entry.isDirty)) {
    const relatedMappings = mappings.filter((mapping) => mapping.menuId === menu.menuId && mapping.isConfirmed)

    if (relatedMappings.length === 0) {
      needsReview.push({ menuId: menu.menuId, reason: 'missing_mapping' as const })
      continue
    }

    for (const mapping of relatedMappings) {
      items.push({
        platformCode: mapping.platformCode,
        menuId: menu.menuId,
        platformMenuId: mapping.platformMenuId,
        previousName: mapping.platformMenuName,
        nextName: menu.baseName,
        nextPrice: menu.basePrice
      })
    }
  }

  return { items, needsReview }
}
```

- [ ] **Step 5: Run the tests again**

Run:

```bash
npm run test -- tests/unit/main/sync-planner.test.ts tests/unit/main/menu-matcher.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the planning rules**

Run:

```bash
git add .
git commit -m "feat: add menu matching and sync planner"
```

## Task 5: Build the Renderer Shell and Menu Management UI

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/lib/api.ts`
- Create: `src/renderer/src/pages/DashboardPage.tsx`
- Create: `src/renderer/src/pages/MenuPage.tsx`
- Create: `src/renderer/src/pages/SettingsPage.tsx`
- Create: `src/renderer/src/pages/HistoryPage.tsx`
- Create: `src/renderer/src/components/MenuTable.tsx`
- Modify: `src/renderer/src/styles/app.css`
- Test: `tests/unit/renderer/menu-table.test.tsx`

- [ ] **Step 1: Write the failing menu table test**

Create `tests/unit/renderer/menu-table.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MenuTable } from '../../../src/renderer/src/components/MenuTable'

describe('MenuTable', () => {
  it('edits menu name and price inline', () => {
    const onChange = vi.fn()

    render(
      <MenuTable
        menus={[{ menuId: 'm1', baseName: '콤비네이션', basePrice: 22900, isDirty: 0 }]}
        onChange={onChange}
      />
    )

    fireEvent.change(screen.getByDisplayValue('콤비네이션'), { target: { value: '직화불고기' } })
    fireEvent.change(screen.getByDisplayValue('22900'), { target: { value: '23900' } })

    expect(onChange).toHaveBeenLastCalledWith('m1', { baseName: '직화불고기', basePrice: 23900 })
  })
})
```

- [ ] **Step 2: Run the renderer test to verify it fails**

Run:

```bash
npm run test -- tests/unit/renderer/menu-table.test.tsx
```

Expected: FAIL because the component does not exist yet.

- [ ] **Step 3: Implement the typed renderer API wrapper**

Create `src/renderer/src/lib/api.ts`:

```ts
declare global {
  interface Window {
    appApi: {
      menus: {
        list: () => Promise<unknown[]>
        save: (payload: unknown) => Promise<void>
      }
      settings: {
        getPlatformCredentialStatus: () => Promise<unknown[]>
        savePlatformCredential: (payload: { platformCode: string; username: string; password: string }) => Promise<{ ok: true }>
      }
      syncRuns: {
        list: () => Promise<unknown[]>
      }
      sync: {
        preview: () => Promise<unknown>
        run: () => Promise<unknown>
      }
      mappings: {
        list: () => Promise<unknown[]>
      }
    }
  }
}

export const appApi = window.appApi
```

- [ ] **Step 4: Implement the menu page and table**

Create `src/renderer/src/components/MenuTable.tsx`:

```tsx
type MenuRow = {
  menuId: string
  baseName: string
  basePrice: number
  isDirty: number
}

export const MenuTable = ({
  menus,
  onChange
}: {
  menus: MenuRow[]
  onChange: (menuId: string, patch: Partial<MenuRow>) => void
}) => (
  <table>
    <thead>
      <tr>
        <th>메뉴명</th>
        <th>가격</th>
      </tr>
    </thead>
    <tbody>
      {menus.map((menu) => (
        <tr key={menu.menuId}>
          <td>
            <input
              value={menu.baseName}
              onChange={(event) => onChange(menu.menuId, { baseName: event.target.value })}
            />
          </td>
          <td>
            <input
              value={String(menu.basePrice)}
              onChange={(event) => onChange(menu.menuId, { basePrice: Number(event.target.value) })}
            />
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)
```

Create `src/renderer/src/pages/MenuPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { appApi } from '../lib/api'
import { MenuTable } from '../components/MenuTable'

export const MenuPage = () => {
  const [menus, setMenus] = useState<any[]>([])

  useEffect(() => {
    void appApi.menus.list().then((data) => setMenus(data as any[]))
  }, [])

  const handleChange = (menuId: string, patch: Record<string, unknown>) => {
    setMenus((current) =>
      current.map((menu) => menu.menuId === menuId ? { ...menu, ...patch, isDirty: 1 } : menu)
    )
  }

  return <MenuTable menus={menus} onChange={handleChange} />
}
```

- [ ] **Step 5: Implement the shell pages and navigation**

Set `src/renderer/src/App.tsx` to this shape:

```tsx
import { useState } from 'react'
import { DashboardPage } from './pages/DashboardPage'
import { HistoryPage } from './pages/HistoryPage'
import { MenuPage } from './pages/MenuPage'
import { SettingsPage } from './pages/SettingsPage'

const tabs = ['dashboard', 'menus', 'settings', 'history'] as const

export default function App() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('dashboard')

  return (
    <div className="app-shell">
      <aside className="sidebar">
        {tabs.map((value) => (
          <button key={value} onClick={() => setTab(value)}>{value}</button>
        ))}
      </aside>
      <main className="content">
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'menus' && <MenuPage />}
        {tab === 'settings' && <SettingsPage />}
        {tab === 'history' && <HistoryPage />}
      </main>
    </div>
  )
}
```

- [ ] **Step 6: Run the test and renderer smoke check**

Run:

```bash
npm run test -- tests/unit/renderer/menu-table.test.tsx
npm run dev
```

Expected: the test passes and the Electron window opens with sidebar navigation and an empty menu table.

- [ ] **Step 7: Commit the UI shell**

Run:

```bash
git add .
git commit -m "feat: add dashboard and menu management ui"
```

## Task 6: Add the Menu Mapping Review Workflow

**Files:**
- Create: `src/renderer/src/pages/MappingPage.tsx`
- Create: `src/renderer/src/components/MappingReviewTable.tsx`
- Modify: `src/main/ipc/register-handlers.ts`
- Create: `src/main/services/mapping-suggester.ts`
- Test: `tests/unit/main/mapping-suggester.test.ts`

- [ ] **Step 1: Write the failing mapping suggester test**

Create `tests/unit/main/mapping-suggester.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { suggestMappings } from '../../../src/main/services/mapping-suggester'

describe('suggestMappings', () => {
  it('auto-matches close menu names above the threshold', () => {
    const result = suggestMappings(
      [{ menuId: 'm1', baseName: '콤비네이션 피자', basePrice: 22900, isDirty: 0 }],
      [{ platformMenuId: 'p1', platformMenuName: '콤비네이션피자' }],
    )

    expect(result[0]).toEqual(expect.objectContaining({
      menuId: 'm1',
      platformMenuId: 'p1',
      matchedBy: 'auto'
    }))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/unit/main/mapping-suggester.test.ts
```

Expected: FAIL because the service does not exist yet.

- [ ] **Step 3: Implement the mapping suggester**

Create `src/main/services/mapping-suggester.ts`:

```ts
import { scoreMenuMatch } from './menu-matcher'

export const suggestMappings = (
  menus: Array<{ menuId: string; baseName: string }>,
  platformMenus: Array<{ platformMenuId: string; platformMenuName: string }>
) => menus.flatMap((menu) => {
  const best = platformMenus
    .map((platformMenu) => ({
      ...platformMenu,
      score: scoreMenuMatch(menu.baseName, platformMenu.platformMenuName)
    }))
    .sort((left, right) => right.score - left.score)[0]

  return best && best.score >= 0.9 ? [{
    menuId: menu.menuId,
    platformMenuId: best.platformMenuId,
    platformMenuName: best.platformMenuName,
    matchedBy: 'auto' as const
  }] : []
})
```

- [ ] **Step 4: Add the mapping review UI**

Create `src/renderer/src/components/MappingReviewTable.tsx`:

```tsx
export const MappingReviewTable = ({
  rows,
  onConfirm
}: {
  rows: Array<{ menuId: string; baseName: string; platformCode: string; platformMenuName?: string }>
  onConfirm: (menuId: string, platformCode: string, platformMenuName: string) => void
}) => (
  <table>
    <thead>
      <tr>
        <th>기준 메뉴</th>
        <th>플랫폼</th>
        <th>연결 메뉴</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr key={`${row.menuId}:${row.platformCode}`}>
          <td>{row.baseName}</td>
          <td>{row.platformCode}</td>
          <td>
            <input
              defaultValue={row.platformMenuName ?? ''}
              onBlur={(event) => onConfirm(row.menuId, row.platformCode, event.target.value)}
            />
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)
```

Create `src/renderer/src/pages/MappingPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { appApi } from '../lib/api'
import { MappingReviewTable } from '../components/MappingReviewTable'

export const MappingPage = () => {
  const [rows, setRows] = useState<any[]>([])

  useEffect(() => {
    void appApi.mappings.list().then((value) => setRows(value as any[]))
  }, [])

  return <MappingReviewTable rows={rows} onConfirm={() => undefined} />
}
```

- [ ] **Step 5: Wire mapping confirmation to the existing IPC handlers and add the page to the shell**

Update `src/renderer/src/pages/MappingPage.tsx`:

```tsx
return (
  <MappingReviewTable
    rows={rows}
    onConfirm={(menuId, platformCode, platformMenuName) =>
      void appApi.mappings.save({
        mappingId: `${menuId}:${platformCode}`,
        menuId,
        platformCode,
        platformMenuId: `${platformCode}:${platformMenuName}`,
        platformMenuName,
        matchedBy: 'manual',
        isConfirmed: 1
      })
    }
  />
)
```

Update `src/renderer/src/App.tsx` tab list:

```tsx
const tabs = ['dashboard', 'menus', 'mapping', 'settings', 'history'] as const
```

Expected: mapping review becomes a first-class screen.

- [ ] **Step 6: Run the test and commit**

Run:

```bash
npm run test -- tests/unit/main/mapping-suggester.test.ts
git add .
git commit -m "feat: add mapping review workflow"
```

Expected: tests pass and the commit succeeds.

## Task 7: Implement Sync Preview, Run Execution, and History Logging

**Files:**
- Create: `src/main/services/sync-engine.ts`
- Create: `src/main/repositories/sync-run-item-repository.ts`
- Create: `src/renderer/src/components/SyncPreviewDialog.tsx`
- Modify: `src/renderer/src/pages/DashboardPage.tsx`
- Modify: `src/main/ipc/register-handlers.ts`
- Test: `tests/unit/main/sync-engine.test.ts`

- [ ] **Step 1: Write the failing sync engine test**

Create `tests/unit/main/sync-engine.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { SyncEngine } from '../../../src/main/services/sync-engine'

describe('SyncEngine', () => {
  it('continues to the next platform when one adapter fails', async () => {
    const adapterRegistry = {
      get: (platformCode: string) => ({
        applyMenuUpdate: vi.fn().mockImplementation(() => {
          if (platformCode === 'coupangeats') throw new Error('save_failed')
        })
      })
    }

    const engine = new SyncEngine(adapterRegistry as never, { create: vi.fn(), finish: vi.fn(), addItem: vi.fn() } as never)

    const result = await engine.run([
      { platformCode: 'baemin', menuId: 'm1', platformMenuId: 'b1', nextName: '직화불고기', nextPrice: 23900 },
      { platformCode: 'coupangeats', menuId: 'm1', platformMenuId: 'c1', nextName: '직화불고기', nextPrice: 23900 }
    ])

    expect(result.summary).toBe('1 succeeded, 1 failed')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/unit/main/sync-engine.test.ts
```

Expected: FAIL because the sync engine does not exist yet.

- [ ] **Step 3: Implement the sync engine and run-item repository**

Create `src/main/repositories/sync-run-item-repository.ts`:

```ts
import type Database from 'better-sqlite3'

export class SyncRunItemRepository {
  constructor(private readonly db: Database.Database) {}

  ensureTable() {
    this.db.exec(`
      create table if not exists sync_run_items (
        sync_run_item_id text primary key,
        sync_run_id text not null,
        platform_code text not null,
        menu_id text not null,
        field_type text not null,
        before_value text,
        after_value text,
        status text not null,
        error_code text,
        error_message text
      )
    `)
  }

  addItem(record: Record<string, unknown>) {
    this.ensureTable()
    this.db.prepare(`
      insert into sync_run_items (
        sync_run_item_id, sync_run_id, platform_code, menu_id, field_type, before_value, after_value, status, error_code, error_message
      ) values (
        @syncRunItemId, @syncRunId, @platformCode, @menuId, @fieldType, @beforeValue, @afterValue, @status, @errorCode, @errorMessage
      )
    `).run(record)
  }
}
```

Create `src/main/services/sync-engine.ts`:

```ts
import { randomUUID } from 'node:crypto'

export class SyncEngine {
  constructor(
    private readonly adapterRegistry: { get: (platformCode: string) => { applyMenuUpdate: (item: any) => Promise<void> | void } },
    private readonly runLogger: { create: (record: any) => void; finish: (record: any) => void; addItem: (record: any) => void }
  ) {}

  async run(items: any[]) {
    const syncRunId = randomUUID()
    let successCount = 0
    let failureCount = 0

    this.runLogger.create({ syncRunId, startedAt: new Date().toISOString(), triggerType: 'manual' })

    for (const item of items) {
      try {
        await this.adapterRegistry.get(item.platformCode).applyMenuUpdate(item)
        successCount += 1
        this.runLogger.addItem({
          syncRunItemId: randomUUID(),
          syncRunId,
          platformCode: item.platformCode,
          menuId: item.menuId,
          fieldType: 'menu',
          beforeValue: item.previousName ?? null,
          afterValue: JSON.stringify({ name: item.nextName, price: item.nextPrice }),
          status: 'success',
          errorCode: null,
          errorMessage: null
        })
      } catch (error) {
        failureCount += 1
        this.runLogger.addItem({
          syncRunItemId: randomUUID(),
          syncRunId,
          platformCode: item.platformCode,
          menuId: item.menuId,
          fieldType: 'menu',
          beforeValue: item.previousName ?? null,
          afterValue: JSON.stringify({ name: item.nextName, price: item.nextPrice }),
          status: 'failed',
          errorCode: 'apply_failed',
          errorMessage: error instanceof Error ? error.message : 'unknown_error'
        })
      }
    }

    const summary = `${successCount} succeeded, ${failureCount} failed`
    this.runLogger.finish({ syncRunId, finishedAt: new Date().toISOString(), resultSummary: summary })
    return { syncRunId, summary }
  }
}
```

- [ ] **Step 4: Add sync preview and run handlers**

Update `src/main/ipc/register-handlers.ts`:

```ts
export const registerHandlers = ({
  menuRepository,
  mappingRepository,
  syncRunRepository,
  credentialVault,
  syncEngine
}: {
  menuRepository: { list: () => unknown[]; upsert: (payload: any) => void }
  mappingRepository: { listAll: () => unknown[]; upsert: (payload: any) => void }
  syncRunRepository: { list: () => unknown[] }
  credentialVault: CredentialVault
  syncEngine: { run: (items: any[]) => Promise<unknown> }
}) => {
  ipcMain.handle('sync:preview', async () => buildSyncPreview({
    menus: menuRepository.list(),
    mappings: mappingRepository.listAll()
  }))

  ipcMain.handle('sync:run', async () => {
    const preview = buildSyncPreview({
      menus: menuRepository.list(),
      mappings: mappingRepository.listAll()
    })

    return syncEngine.run(preview.items)
  })
}
```

Create `src/renderer/src/components/SyncPreviewDialog.tsx`:

```tsx
export const SyncPreviewDialog = ({
  items,
  onConfirm
}: {
  items: Array<{ platformCode: string; nextName: string; nextPrice: number }>
  onConfirm: () => void
}) => (
  <section>
    <h2>변경 예정</h2>
    <ul>
      {items.map((item, index) => (
        <li key={`${item.platformCode}:${index}`}>
          {item.platformCode} / {item.nextName} / {item.nextPrice}
        </li>
      ))}
    </ul>
    <button onClick={onConfirm}>실행</button>
  </section>
)
```

- [ ] **Step 5: Wire the dashboard to preview and run sync**

Update `src/renderer/src/pages/DashboardPage.tsx`:

```tsx
import { useState } from 'react'
import { appApi } from '../lib/api'
import { SyncPreviewDialog } from '../components/SyncPreviewDialog'

export const DashboardPage = () => {
  const [preview, setPreview] = useState<any | null>(null)
  const [summary, setSummary] = useState<string>('')

  return (
    <div>
      <button onClick={() => void appApi.sync.preview().then((value) => setPreview(value))}>전체 반영</button>
      {preview ? (
        <SyncPreviewDialog
          items={preview.items}
          onConfirm={() => void appApi.sync.run().then((result: any) => setSummary(result.summary))}
        />
      ) : null}
      {summary ? <p>{summary}</p> : null}
    </div>
  )
}
```

- [ ] **Step 6: Run the sync engine test and commit**

Run:

```bash
npm run test -- tests/unit/main/sync-engine.test.ts
git add .
git commit -m "feat: add sync preview and run logging"
```

Expected: test passes and dashboard supports preview + run.

## Task 8: Add the Platform Adapter Contract and Fake Adapter Harness

**Files:**
- Create: `src/main/platforms/base/types.ts`
- Create: `src/main/platforms/base/registry.ts`
- Create: `src/main/platforms/base/fake-adapter.ts`
- Test: `tests/unit/main/adapter-registry.test.ts`

- [ ] **Step 1: Write the failing adapter registry test**

Create `tests/unit/main/adapter-registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PlatformAdapterRegistry } from '../../../src/main/platforms/base/registry'

describe('PlatformAdapterRegistry', () => {
  it('returns a registered adapter by platform code', () => {
    const registry = new PlatformAdapterRegistry()
    registry.register('baemin', {
      platformCode: 'baemin',
      fetchMenus: () => Promise.resolve([]),
      applyMenuUpdate: () => Promise.resolve()
    })

    expect(registry.get('baemin')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/unit/main/adapter-registry.test.ts
```

Expected: FAIL because the registry does not exist yet.

- [ ] **Step 3: Implement the adapter contract and registry**

Create `src/main/platforms/base/types.ts`:

```ts
import type { PlatformCode } from '../../../shared/contracts'

export interface PlatformMenuSnapshot {
  platformMenuId: string
  platformMenuName: string
  currentPrice?: number
}

export interface PlatformAdapter {
  platformCode: PlatformCode
  fetchMenus(): Promise<PlatformMenuSnapshot[]>
  applyMenuUpdate(item: { platformMenuId: string; nextName: string; nextPrice: number }): Promise<void>
}
```

Create `src/main/platforms/base/registry.ts`:

```ts
import type { PlatformCode } from '../../../shared/contracts'
import type { PlatformAdapter } from './types'

export class PlatformAdapterRegistry {
  private readonly adapters = new Map<PlatformCode, PlatformAdapter>()

  register(platformCode: PlatformCode, adapter: PlatformAdapter) {
    this.adapters.set(platformCode, adapter)
  }

  get(platformCode: PlatformCode) {
    const adapter = this.adapters.get(platformCode)
    if (!adapter) throw new Error(`adapter_missing:${platformCode}`)
    return adapter
  }
}
```

- [ ] **Step 4: Add a fake adapter for main-process tests**

Create `src/main/platforms/base/fake-adapter.ts`:

```ts
import type { PlatformAdapter, PlatformMenuSnapshot } from './types'
import type { PlatformCode } from '../../../shared/contracts'

export class FakeAdapter implements PlatformAdapter {
  constructor(
    public readonly platformCode: PlatformCode,
    private readonly menus: PlatformMenuSnapshot[] = []
  ) {}

  async fetchMenus() {
    return this.menus
  }

  async applyMenuUpdate() {
    return
  }
}
```

- [ ] **Step 5: Run the test and commit**

Run:

```bash
npm run test -- tests/unit/main/adapter-registry.test.ts
git add .
git commit -m "feat: add platform adapter registry"
```

Expected: PASS.

## Task 9: Implement the Baemin Adapter

**Files:**
- Create: `src/main/platforms/baemin/selectors.ts`
- Create: `src/main/platforms/baemin/parser.ts`
- Create: `src/main/platforms/baemin/adapter.ts`
- Create: `tests/fixtures/platforms/baemin/menu-list.html`
- Test: `tests/unit/main/baemin-parser.test.ts`

- [ ] **Step 1: Write the failing Baemin parser test**

Create `tests/unit/main/baemin-parser.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseBaeminMenus } from '../../../src/main/platforms/baemin/parser'

describe('parseBaeminMenus', () => {
  it('extracts platform menu id and name from the fixture', () => {
    const html = readFileSync('tests/fixtures/platforms/baemin/menu-list.html', 'utf8')
    const menus = parseBaeminMenus(html)

    expect(menus[0]).toEqual(expect.objectContaining({
      platformMenuId: 'bm-1',
      platformMenuName: '콤비네이션'
    }))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/unit/main/baemin-parser.test.ts
```

Expected: FAIL because the parser and fixture do not exist yet.

- [ ] **Step 3: Add the Baemin fixture and parser**

Create `tests/fixtures/platforms/baemin/menu-list.html`:

```html
<table>
  <tbody>
    <tr data-menu-id="bm-1">
      <td class="name">콤비네이션</td>
      <td class="price">22900</td>
    </tr>
  </tbody>
</table>
```

Create `src/main/platforms/baemin/parser.ts`:

```ts
import { JSDOM } from 'jsdom'

export const parseBaeminMenus = (html: string) => {
  const document = new JSDOM(html).window.document
  return [...document.querySelectorAll('tr[data-menu-id]')].map((row) => ({
    platformMenuId: row.getAttribute('data-menu-id') ?? '',
    platformMenuName: row.querySelector('.name')?.textContent?.trim() ?? '',
    currentPrice: Number(row.querySelector('.price')?.textContent?.trim() ?? 0)
  }))
}
```

- [ ] **Step 4: Implement the Baemin Playwright adapter**

Create `src/main/platforms/baemin/selectors.ts`:

```ts
export const baeminSelectors = {
  username: 'input[type="text"]',
  password: 'input[type="password"]',
  loginButton: 'button[type="submit"]',
  menuListRows: 'tr[data-menu-id]',
  saveButton: 'button:has-text("저장")'
} as const
```

Create `src/main/platforms/baemin/adapter.ts`:

```ts
import { chromium } from 'playwright'
import type { PlatformAdapter } from '../base/types'
import { baeminSelectors } from './selectors'
import { parseBaeminMenus } from './parser'

export class BaeminAdapter implements PlatformAdapter {
  readonly platformCode = 'baemin' as const

  constructor(
    private readonly credentials: { username: string; password: string },
    private readonly baseUrl = 'https://ceo.baemin.com/'
  ) {}

  async fetchMenus() {
    const browser = await chromium.launch({ headless: false })
    const page = await browser.newPage()
    await page.goto(this.baseUrl)
    const html = await page.content()
    await browser.close()
    return parseBaeminMenus(html)
  }

  async applyMenuUpdate(item: { platformMenuId: string; nextName: string; nextPrice: number }) {
    const browser = await chromium.launch({ headless: false })
    const page = await browser.newPage()
    await page.goto(this.baseUrl)
    await page.fill(baeminSelectors.username, this.credentials.username)
    await page.fill(baeminSelectors.password, this.credentials.password)
    await page.click(baeminSelectors.loginButton)
    await page.locator(`tr[data-menu-id="${item.platformMenuId}"] .name input`).fill(item.nextName)
    await page.locator(`tr[data-menu-id="${item.platformMenuId}"] .price input`).fill(String(item.nextPrice))
    await page.click(baeminSelectors.saveButton)
    await browser.close()
  }
}
```

- [ ] **Step 5: Run the parser test and do a manual smoke pass**

Run:

```bash
npm run test -- tests/unit/main/baemin-parser.test.ts
```

Then run the app with a test store account and verify one menu rename/price change through the preview flow.

Expected: the parser test passes and a manual test account can complete one edit end-to-end.

- [ ] **Step 6: Commit the Baemin adapter**

Run:

```bash
git add .
git commit -m "feat: add baemin adapter"
```

## Task 10: Implement the Coupang Eats Adapter

**Files:**
- Create: `src/main/platforms/coupangeats/selectors.ts`
- Create: `src/main/platforms/coupangeats/parser.ts`
- Create: `src/main/platforms/coupangeats/adapter.ts`
- Create: `tests/fixtures/platforms/coupangeats/menu-list.html`
- Test: `tests/unit/main/coupangeats-parser.test.ts`

- [ ] **Step 1: Write the failing Coupang Eats parser test**

Create `tests/unit/main/coupangeats-parser.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseCoupangEatsMenus } from '../../../src/main/platforms/coupangeats/parser'

describe('parseCoupangEatsMenus', () => {
  it('extracts menu rows from the fixture', () => {
    const html = readFileSync('tests/fixtures/platforms/coupangeats/menu-list.html', 'utf8')
    const menus = parseCoupangEatsMenus(html)

    expect(menus[0]).toEqual(expect.objectContaining({
      platformMenuId: 'ce-1',
      platformMenuName: '콤비네이션'
    }))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/unit/main/coupangeats-parser.test.ts
```

Expected: FAIL because the parser and fixture do not exist yet.

- [ ] **Step 3: Add the fixture and parser**

Create `tests/fixtures/platforms/coupangeats/menu-list.html`:

```html
<div class="menu-row" data-menu-id="ce-1">
  <span class="menu-name">콤비네이션</span>
  <span class="menu-price">22900</span>
</div>
```

Create `src/main/platforms/coupangeats/parser.ts`:

```ts
import { JSDOM } from 'jsdom'

export const parseCoupangEatsMenus = (html: string) => {
  const document = new JSDOM(html).window.document
  return [...document.querySelectorAll('.menu-row[data-menu-id]')].map((row) => ({
    platformMenuId: row.getAttribute('data-menu-id') ?? '',
    platformMenuName: row.querySelector('.menu-name')?.textContent?.trim() ?? '',
    currentPrice: Number(row.querySelector('.menu-price')?.textContent?.trim() ?? 0)
  }))
}
```

- [ ] **Step 4: Implement the Coupang Eats adapter**

Create `src/main/platforms/coupangeats/selectors.ts`:

```ts
export const coupangEatsSelectors = {
  username: 'input[name="email"]',
  password: 'input[name="password"]',
  loginButton: 'button[type="submit"]',
  menuRows: '.menu-row[data-menu-id]',
  saveButton: 'button:has-text("저장")'
} as const
```

Create `src/main/platforms/coupangeats/adapter.ts`:

```ts
import { chromium } from 'playwright'
import type { PlatformAdapter } from '../base/types'
import { coupangEatsSelectors } from './selectors'
import { parseCoupangEatsMenus } from './parser'

export class CoupangEatsAdapter implements PlatformAdapter {
  readonly platformCode = 'coupangeats' as const

  constructor(
    private readonly credentials: { username: string; password: string },
    private readonly baseUrl = 'https://store.coupangeats.com/'
  ) {}

  async fetchMenus() {
    const browser = await chromium.launch({ headless: false })
    const page = await browser.newPage()
    await page.goto(this.baseUrl)
    const html = await page.content()
    await browser.close()
    return parseCoupangEatsMenus(html)
  }

  async applyMenuUpdate(item: { platformMenuId: string; nextName: string; nextPrice: number }) {
    const browser = await chromium.launch({ headless: false })
    const page = await browser.newPage()
    await page.goto(this.baseUrl)
    await page.fill(coupangEatsSelectors.username, this.credentials.username)
    await page.fill(coupangEatsSelectors.password, this.credentials.password)
    await page.click(coupangEatsSelectors.loginButton)
    await page.locator(`.menu-row[data-menu-id="${item.platformMenuId}"] .menu-name input`).fill(item.nextName)
    await page.locator(`.menu-row[data-menu-id="${item.platformMenuId}"] .menu-price input`).fill(String(item.nextPrice))
    await page.click(coupangEatsSelectors.saveButton)
    await browser.close()
  }
}
```

- [ ] **Step 5: Run the parser test and do a manual smoke pass**

Run:

```bash
npm run test -- tests/unit/main/coupangeats-parser.test.ts
```

Then verify one test-store change manually through the preview flow.

Expected: parser passes and one manual sync succeeds.

- [ ] **Step 6: Commit the Coupang Eats adapter**

Run:

```bash
git add .
git commit -m "feat: add coupang eats adapter"
```

## Task 11: Implement the Ddangyo Adapter

**Files:**
- Create: `src/main/platforms/ddangyo/selectors.ts`
- Create: `src/main/platforms/ddangyo/parser.ts`
- Create: `src/main/platforms/ddangyo/adapter.ts`
- Create: `tests/fixtures/platforms/ddangyo/menu-list.html`
- Test: `tests/unit/main/ddangyo-parser.test.ts`

- [ ] **Step 1: Write the failing Ddangyo parser test**

Create `tests/unit/main/ddangyo-parser.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseDdangyoMenus } from '../../../src/main/platforms/ddangyo/parser'

describe('parseDdangyoMenus', () => {
  it('extracts menu rows from the fixture', () => {
    const html = readFileSync('tests/fixtures/platforms/ddangyo/menu-list.html', 'utf8')
    const menus = parseDdangyoMenus(html)

    expect(menus[0]).toEqual(expect.objectContaining({
      platformMenuId: 'dd-1',
      platformMenuName: '콤비네이션'
    }))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/unit/main/ddangyo-parser.test.ts
```

Expected: FAIL because the parser and fixture do not exist yet.

- [ ] **Step 3: Add the fixture and parser**

Create `tests/fixtures/platforms/ddangyo/menu-list.html`:

```html
<table>
  <tbody>
    <tr data-menu-id="dd-1">
      <td class="menu-name">콤비네이션</td>
      <td class="menu-price">22900</td>
    </tr>
  </tbody>
</table>
```

Create `src/main/platforms/ddangyo/parser.ts`:

```ts
import { JSDOM } from 'jsdom'

export const parseDdangyoMenus = (html: string) => {
  const document = new JSDOM(html).window.document
  return [...document.querySelectorAll('tr[data-menu-id]')].map((row) => ({
    platformMenuId: row.getAttribute('data-menu-id') ?? '',
    platformMenuName: row.querySelector('.menu-name')?.textContent?.trim() ?? '',
    currentPrice: Number(row.querySelector('.menu-price')?.textContent?.trim() ?? 0)
  }))
}
```

- [ ] **Step 4: Implement the Ddangyo adapter**

Create `src/main/platforms/ddangyo/selectors.ts`:

```ts
export const ddangyoSelectors = {
  username: 'input[name="mbrId"]',
  password: 'input[type="password"]',
  loginButton: 'button:has-text("로그인")',
  menuRows: 'tr[data-menu-id]',
  saveButton: 'button:has-text("저장")'
} as const
```

Create `src/main/platforms/ddangyo/adapter.ts`:

```ts
import { chromium } from 'playwright'
import type { PlatformAdapter } from '../base/types'
import { ddangyoSelectors } from './selectors'
import { parseDdangyoMenus } from './parser'

export class DdangyoAdapter implements PlatformAdapter {
  readonly platformCode = 'ddangyo' as const

  constructor(
    private readonly credentials: { username: string; password: string },
    private readonly baseUrl = 'https://boss.ddangyo.com/'
  ) {}

  async fetchMenus() {
    const browser = await chromium.launch({ headless: false })
    const page = await browser.newPage()
    await page.goto(this.baseUrl)
    const html = await page.content()
    await browser.close()
    return parseDdangyoMenus(html)
  }

  async applyMenuUpdate(item: { platformMenuId: string; nextName: string; nextPrice: number }) {
    const browser = await chromium.launch({ headless: false })
    const page = await browser.newPage()
    await page.goto(this.baseUrl)
    await page.fill(ddangyoSelectors.username, this.credentials.username)
    await page.fill(ddangyoSelectors.password, this.credentials.password)
    await page.click(ddangyoSelectors.loginButton)
    await page.locator(`tr[data-menu-id="${item.platformMenuId}"] .menu-name input`).fill(item.nextName)
    await page.locator(`tr[data-menu-id="${item.platformMenuId}"] .menu-price input`).fill(String(item.nextPrice))
    await page.click(ddangyoSelectors.saveButton)
    await browser.close()
  }
}
```

- [ ] **Step 5: Run the parser test and do a manual smoke pass**

Run:

```bash
npm run test -- tests/unit/main/ddangyo-parser.test.ts
```

Then verify one test-store change manually through the preview flow.

Expected: parser passes and one manual sync succeeds.

- [ ] **Step 6: Commit the Ddangyo adapter**

Run:

```bash
git add .
git commit -m "feat: add ddangyo adapter"
```

## Task 12: Wire the Real Adapters, Finish the History View, and Document Manual Verification

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/renderer/src/pages/HistoryPage.tsx`
- Create: `README.md`
- Test: `tests/unit/renderer/history-page.test.tsx`

- [ ] **Step 1: Write the failing history page test**

Create `tests/unit/renderer/history-page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HistoryPage } from '../../../src/renderer/src/pages/HistoryPage'

describe('HistoryPage', () => {
  it('shows the latest run summary', async () => {
    render(<HistoryPage initialRuns={[{ syncRunId: 'r1', startedAt: '2026-04-12T10:00:00Z', resultSummary: '3 succeeded, 0 failed' }]} />)

    expect(screen.getByText('3 succeeded, 0 failed')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/unit/renderer/history-page.test.tsx
```

Expected: FAIL because the page does not support data rendering yet.

- [ ] **Step 3: Register the real adapters in the main process**

Update `src/main/index.ts` so the main process creates the DB, repositories, vault, registry, and sync engine:

```ts
const db = createConnection(join(app.getPath('userData'), 'delivery-menu-sync.db'))
migrate(db)

const menuRepository = new MenuRepository(db)
const mappingRepository = new MappingRepository(db)
const syncRunRepository = new SyncRunRepository(db)
const syncRunItemRepository = new SyncRunItemRepository(db)
const credentialVault = new CredentialVault()
const registry = new PlatformAdapterRegistry()

const baeminCredential = await credentialVault.get('baemin')
if (baeminCredential) registry.register('baemin', new BaeminAdapter(baeminCredential))

const coupangCredential = await credentialVault.get('coupangeats')
if (coupangCredential) registry.register('coupangeats', new CoupangEatsAdapter(coupangCredential))

const ddangyoCredential = await credentialVault.get('ddangyo')
if (ddangyoCredential) registry.register('ddangyo', new DdangyoAdapter(ddangyoCredential))

const syncEngine = new SyncEngine(registry, {
  create: (record) => syncRunRepository.create(record),
  finish: (record) => syncRunRepository.update(record),
  addItem: (record) => syncRunItemRepository.addItem(record)
})

registerHandlers({ menuRepository, mappingRepository, syncRunRepository, credentialVault, syncEngine })
```

- [ ] **Step 4: Finish the history page and write the operator README**

Update `src/renderer/src/pages/HistoryPage.tsx`:

```tsx
export const HistoryPage = ({ initialRuns = [] as any[] }) => (
  <section>
    <h1>실행 기록</h1>
    <ul>
      {initialRuns.map((run) => (
        <li key={run.syncRunId}>
          <strong>{run.startedAt}</strong> - {run.resultSummary}
        </li>
      ))}
    </ul>
  </section>
)
```

Create `README.md`:

````md
# Delivery Menu Sync MVP

## Development

```bash
npm install
npm run dev
```

## Tests

```bash
npm run test
```

## Manual Verification

1. Save credentials for Baemin, Coupang Eats, and Ddangyo in Settings.
2. Import or create at least one menu row in Menus.
3. Open Mapping and confirm all auto-suggested rows.
4. From Dashboard, click `전체 반영`.
5. Verify the preview contents before confirming.
6. Confirm one menu rename and price update on a test store for each platform.
7. Open History and verify the run summary appears.
```
````

- [ ] **Step 5: Run tests, do a full local smoke pass, and commit**

Run:

```bash
npm run test
npm run lint:types
npm run dev
git add .
git commit -m "feat: finish delivery menu sync mvp"
```

Expected: all tests pass, type-checking passes, the Electron app opens, credentials can be saved, menus can be edited, preview works, and the history page renders the run summary.

## Self-Review Checklist

- Spec coverage:
  - local Windows desktop app: Tasks 1, 5, 12
  - local SQLite storage: Tasks 2, 7
  - encrypted credential storage: Task 3
  - menu edit UI: Task 5
  - initial mapping review: Task 6
  - preview before run: Task 7
  - platform adapters for Baemin, Coupang Eats, Ddangyo: Tasks 9, 10, 11
  - run logging and retry foundation: Task 7 and Task 12
- Placeholder scan:
  - no unresolved placeholder markers remain in this plan
- Type consistency:
  - `PlatformCode` uses `baemin | coupangeats | ddangyo` consistently
  - `MenuRecord`, `PlatformMenuMappingRecord`, and `SyncRunRecord` are introduced before later tasks depend on them
