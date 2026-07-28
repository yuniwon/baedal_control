import type {
  CatalogMaintenanceApplyInput,
  CatalogMaintenancePreview,
  CatalogMaintenanceResult,
  CatalogMergeCandidate,
  PlatformCode
} from '../../shared/contracts'
import {
  catalogMenuIdentity,
  cleanCatalogCategoryName
} from '../../shared/catalog-normalization'
import type { DatabaseConnection } from '../db/connection'
import { withSavepoint } from '../db/savepoint'

interface CatalogMaintenanceServiceDependencies {
  db: DatabaseConnection
  backupDatabase?: () => string
  refreshReviews?: () => void
}

interface MenuRow {
  menuId: string
  baseName: string
  basePrice: number
  isDirty: number
  isManaged: number
}

interface MappingRow {
  mappingId: string
  menuId: string
  platformCode: PlatformCode
  platformMenuId: string
  mappingStatus: 'active' | 'source_absent'
}

interface SourceRow {
  platformCode: PlatformCode
  platformMenuId: string
  platformMenuName: string
  platformMenuCurrentPrice: number | null
  platformMenuPriceVariantsJson: string | null
  platformMenuStatus: string | null
  presenceStatus: string | null
}

const candidateId = (sourceMenuId: string, targetMenuId: string) =>
  `merge:${sourceMenuId}:${targetMenuId}`

const isHidden = (status: string | null) => status?.trim() === '숨김'
const terminalSize = (name: string) => name.match(/[\s(（]([ML])(?:[)）])?\s*$/iu)?.[1].toUpperCase() ?? null
const withoutTerminalSize = (name: string) => name.replace(/[\s(（][ML](?:[)）])?\s*$/iu, '').trim()

export class CatalogMaintenanceService {
  constructor(private readonly deps: CatalogMaintenanceServiceDependencies) {}

  preview(referencePlatformCode: PlatformCode): CatalogMaintenancePreview {
    const menus = this.listMenus()
    const mappings = this.listMappings()
    const sources = this.listSources()
    const mappingsByMenu = new Map<string, MappingRow[]>()
    const sourceByKey = new Map(
      sources.map((source) => [`${source.platformCode}:${source.platformMenuId}`, source])
    )

    for (const mapping of mappings) {
      const rows = mappingsByMenu.get(mapping.menuId) ?? []
      rows.push(mapping)
      mappingsByMenu.set(mapping.menuId, rows)
    }

    const referenceMenusByIdentity = new Map<string, MenuRow[]>()
    for (const menu of menus) {
      const hasActiveReference = (mappingsByMenu.get(menu.menuId) ?? []).some((mapping) =>
        mapping.platformCode === referencePlatformCode && mapping.mappingStatus !== 'source_absent'
      )
      if (!hasActiveReference) continue
      const identity = catalogMenuIdentity(menu.baseName)
      const rows = referenceMenusByIdentity.get(identity) ?? []
      rows.push(menu)
      referenceMenusByIdentity.set(identity, rows)
    }

    const referenceMerges = menus.flatMap((menu): CatalogMergeCandidate[] => {
      const menuMappings = mappingsByMenu.get(menu.menuId) ?? []
      if (menuMappings.length !== 1 || menuMappings[0].platformCode === referencePlatformCode) {
        return []
      }
      const targets = referenceMenusByIdentity.get(catalogMenuIdentity(menu.baseName)) ?? []
      if (targets.length !== 1 || targets[0].menuId === menu.menuId) return []
      const target = targets[0]
      return [{
        candidateId: candidateId(menu.menuId, target.menuId),
        sourceMenuId: menu.menuId,
        sourceName: menu.baseName,
        targetMenuId: target.menuId,
        targetName: target.baseName,
        platformCode: menuMappings[0].platformCode,
        reason: '기준 플랫폼 메뉴와 이름·사이즈 표기가 안전하게 일치합니다.',
        mergeKind: 'reference_match'
      }]
    })

    const referenceMergeSources = new Set(referenceMerges.map((candidate) => candidate.sourceMenuId))
    const siblingGroups = new Map<string, Array<{ menu: MenuRow; mapping: MappingRow; source: SourceRow }>>()
    for (const menu of menus) {
      if (referenceMergeSources.has(menu.menuId) || menu.isManaged === 0) continue
      const menuMappings = mappingsByMenu.get(menu.menuId) ?? []
      if (menuMappings.length !== 1 || menuMappings[0].platformCode === referencePlatformCode) continue
      if ((referenceMenusByIdentity.get(catalogMenuIdentity(menu.baseName)) ?? []).length > 0) continue
      const mapping = menuMappings[0]
      const source = sourceByKey.get(`${mapping.platformCode}:${mapping.platformMenuId}`)
      const size = terminalSize(menu.baseName)
      if (!source || isHidden(source.platformMenuStatus) || !size) continue
      const key = `${mapping.platformCode}:${catalogMenuIdentity(menu.baseName)}`
      const rows = siblingGroups.get(key) ?? []
      rows.push({ menu, mapping, source })
      siblingGroups.set(key, rows)
    }
    const siblingMerges = [...siblingGroups.values()].flatMap((rows): CatalogMergeCandidate[] => {
      const bySize = new Map(rows.map((row) => [terminalSize(row.menu.baseName), row]))
      const medium = bySize.get('M')
      const large = bySize.get('L')
      if (!medium || !large || rows.length !== 2) return []
      return [{
        candidateId: candidateId(large.menu.menuId, medium.menu.menuId),
        sourceMenuId: large.menu.menuId,
        sourceName: large.menu.baseName,
        targetMenuId: medium.menu.menuId,
        targetName: withoutTerminalSize(medium.menu.baseName),
        platformCode: medium.mapping.platformCode,
        reason: '같은 플랫폼에서 M/L로만 분리된 메뉴를 하나의 사이즈 메뉴로 통합합니다.',
        mergeKind: 'size_sibling'
      }]
    })
    const safeMerges = [...referenceMerges, ...siblingMerges]
      .sort((left, right) => left.sourceName.localeCompare(right.sourceName, 'ko'))

    const mergeSourceIds = new Set(safeMerges.map((candidate) => candidate.sourceMenuId))
    const hiddenMenuIds = menus.flatMap((menu) => {
      if (menu.isManaged === 0 || mergeSourceIds.has(menu.menuId)) return []
      const menuMappings = mappingsByMenu.get(menu.menuId) ?? []
      if (menuMappings.length === 0) return []
      const allHidden = menuMappings.every((mapping) => {
        const source = sourceByKey.get(`${mapping.platformCode}:${mapping.platformMenuId}`)
        return Boolean(source && isHidden(source.platformMenuStatus))
      })
      return allHidden ? [menu.menuId] : []
    }).sort()

    return { referencePlatformCode, menuCount: menus.length, safeMerges, hiddenMenuIds }
  }

  apply(input: CatalogMaintenanceApplyInput): CatalogMaintenanceResult {
    const preview = this.preview(input.referencePlatformCode)
    const candidatesById = new Map(preview.safeMerges.map((candidate) => [candidate.candidateId, candidate]))
    const candidates = [...new Set(input.acceptedCandidateIds)].map((id) => {
      const candidate = candidatesById.get(id)
      if (!candidate) throw new Error(`catalog_maintenance_candidate_stale:${id}`)
      return candidate
    })
    const backupPath = this.deps.backupDatabase?.() ?? null

    return withSavepoint(this.deps.db, () => {
      const normalizedCategoryCount = this.normalizeStoredCategories()

      for (const candidate of candidates) {
        this.deps.db.prepare(`
          update platform_menu_mappings
          set menu_id = ?, matched_by = 'auto', is_confirmed = 1
          where menu_id = ?
        `).run(candidate.targetMenuId, candidate.sourceMenuId)
        this.deps.db.prepare('delete from menus where menu_id = ?').run(candidate.sourceMenuId)
        if (candidate.mergeKind === 'size_sibling') {
          this.refreshSizeSiblingMenu(candidate.targetMenuId, candidate.targetName)
        }
      }

      let excludedMenuCount = 0
      if (input.excludeHiddenOnlyMenus) {
        const acceptedSources = new Set(candidates.map((candidate) => candidate.sourceMenuId))
        const hiddenMenuIds = preview.hiddenMenuIds.filter((menuId) => !acceptedSources.has(menuId))
        for (const menuId of hiddenMenuIds) {
          const result = this.deps.db.prepare(`
            update menus set is_managed = 0, updated_at = current_timestamp
            where menu_id = ? and is_managed <> 0
          `).run(menuId)
          this.deps.db.prepare(`
            update platform_menu_mappings set is_confirmed = 0 where menu_id = ?
          `).run(menuId)
          excludedMenuCount += Number(result.changes)
        }
      }

      this.markUnreviewedSingleSourceMappings(input.referencePlatformCode)
      const refreshedReferencePriceCount = this.refreshReferencePrices(input.referencePlatformCode)
      this.deps.db.prepare(`
        update catalog_workspaces
        set seed_mode = 'platform', seed_platform_code = ?,
            canonical_version = canonical_version + 1, updated_at = current_timestamp
        where workspace_id = 'default'
      `).run(input.referencePlatformCode)
      this.deps.refreshReviews?.()

      return {
        backupPath,
        mergedMenuCount: candidates.length,
        excludedMenuCount,
        normalizedCategoryCount,
        refreshedReferencePriceCount,
        remainingMenuCount: this.listMenus().length
      }
    })
  }

  private listMenus() {
    return this.deps.db.prepare(`
      select menu_id menuId, base_name baseName, base_price basePrice,
             is_dirty isDirty, is_managed isManaged
      from menus order by menu_id
    `).all() as unknown as MenuRow[]
  }

  private listMappings() {
    return this.deps.db.prepare(`
      select mapping_id mappingId, menu_id menuId, platform_code platformCode,
             platform_menu_id platformMenuId, mapping_status mappingStatus
      from platform_menu_mappings order by mapping_id
    `).all() as unknown as MappingRow[]
  }

  private listSources() {
    return this.deps.db.prepare(`
      select platform_code platformCode, platform_menu_id platformMenuId,
             platform_menu_name platformMenuName,
             platform_menu_current_price platformMenuCurrentPrice,
             platform_menu_price_variants_json platformMenuPriceVariantsJson,
             platform_menu_status platformMenuStatus, presence_status presenceStatus
      from platform_menus
    `).all() as unknown as SourceRow[]
  }

  private normalizeStoredCategories() {
    let changes = 0
    for (const table of ['platform_menus', 'platform_menu_mappings'] as const) {
      const idColumns = table === 'platform_menus'
        ? ['platform_code', 'platform_menu_id']
        : ['mapping_id']
      const rows = this.deps.db.prepare(`
        select ${idColumns.join(', ')}, platform_menu_group_name groupName from ${table}
        where platform_menu_group_name is not null
      `).all() as Array<Record<string, string | null> & { groupName: string }>
      for (const row of rows) {
        const cleaned = cleanCatalogCategoryName(row.groupName)
        if (cleaned === row.groupName) continue
        const where = idColumns.map((column) => `${column} = ?`).join(' and ')
        this.deps.db.prepare(`update ${table} set platform_menu_group_name = ? where ${where}`)
          .run(cleaned, ...idColumns.map((column) => row[column]))
        changes += 1
      }
    }
    return changes
  }

  private markUnreviewedSingleSourceMappings(referencePlatformCode: PlatformCode) {
    this.deps.db.prepare(`
      update platform_menu_mappings
      set is_confirmed = 0
      where menu_id in (
        select menu_id from platform_menu_mappings
        group by menu_id
        having count(*) = 1 and max(platform_code = ?) = 0
      )
    `).run(referencePlatformCode)
  }

  private refreshSizeSiblingMenu(menuId: string, baseName: string) {
    const rows = this.deps.db.prepare(`
      select pm.platform_menu_name platformMenuName,
             pm.platform_menu_current_price platformMenuCurrentPrice
      from platform_menu_mappings mm
      join platform_menus pm
        on pm.platform_code = mm.platform_code
       and pm.platform_menu_id = mm.platform_menu_id
      where mm.menu_id = ?
      order by pm.platform_menu_name
    `).all(menuId) as unknown as Array<{
      platformMenuName: string
      platformMenuCurrentPrice: number | null
    }>
    const variants = rows.flatMap((row) => {
      const size = terminalSize(row.platformMenuName)
      if (!size || row.platformMenuCurrentPrice == null) return []
      return [{
        variantLabel: size,
        channels: [{
          channelCode: 'delivery',
          channelLabel: '배달',
          amount: row.platformMenuCurrentPrice,
          amountText: `${row.platformMenuCurrentPrice.toLocaleString('ko-KR')}원`
        }]
      }]
    }).sort((left, right) => (left.variantLabel === 'M' ? 0 : 1) - (right.variantLabel === 'M' ? 0 : 1))
    this.deps.db.prepare(`
      update menus set base_name = ?, base_price_variants_json = ?, updated_at = current_timestamp
      where menu_id = ?
    `).run(baseName, JSON.stringify(variants), menuId)
  }

  private refreshReferencePrices(referencePlatformCode: PlatformCode) {
    const result = this.deps.db.prepare(`
      update menus
      set base_price = (
            select pm.platform_menu_current_price
            from platform_menu_mappings mm
            join platform_menus pm
              on pm.platform_code = mm.platform_code
             and pm.platform_menu_id = mm.platform_menu_id
            where mm.menu_id = menus.menu_id
              and mm.platform_code = ?
              and mm.mapping_status <> 'source_absent'
              and pm.platform_menu_current_price is not null
            order by mm.mapping_id limit 1
          ),
          base_price_variants_json = (
            select pm.platform_menu_price_variants_json
            from platform_menu_mappings mm
            join platform_menus pm
              on pm.platform_code = mm.platform_code
             and pm.platform_menu_id = mm.platform_menu_id
            where mm.menu_id = menus.menu_id
              and mm.platform_code = ?
              and mm.mapping_status <> 'source_absent'
            order by mm.mapping_id limit 1
          ),
          updated_at = current_timestamp
      where is_dirty = 0
        and exists (
          select 1 from platform_menu_mappings mm
          join platform_menus pm
            on pm.platform_code = mm.platform_code
           and pm.platform_menu_id = mm.platform_menu_id
          where mm.menu_id = menus.menu_id
            and mm.platform_code = ?
            and mm.mapping_status <> 'source_absent'
            and pm.platform_menu_current_price is not null
            and (
              menus.base_price <> pm.platform_menu_current_price
              or coalesce(menus.base_price_variants_json, '') <> coalesce(pm.platform_menu_price_variants_json, '')
            )
        )
    `).run(referencePlatformCode, referencePlatformCode, referencePlatformCode)
    return Number(result.changes)
  }
}
