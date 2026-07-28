import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createConnection } from '../src/main/db/connection'
import { MappingRepository } from '../src/main/repositories/mapping-repository'
import { MenuRepository } from '../src/main/repositories/menu-repository'
import { PlatformMenuRepository } from '../src/main/repositories/platform-menu-repository'
import { PlatformOptionGroupRepository } from '../src/main/repositories/platform-option-group-repository'
import { CatalogIntentRuleRepository } from '../src/main/repositories/catalog-intent-rule-repository'
import { CatalogReviewRepository } from '../src/main/repositories/catalog-review-repository'
import { CatalogWorkspaceRepository } from '../src/main/repositories/catalog-workspace-repository'
import { analyzeCatalogExceptions } from '../src/main/services/catalog-exception-analyzer'
import { applyIntentRules } from '../src/main/services/catalog-intent-policy'
import { CatalogMaintenanceService } from '../src/main/services/catalog-maintenance-service'
import { buildLogicalOptionGroups } from '../src/main/services/logical-option-group-service'

const readArgument = (name: string) => {
  const prefix = `--${name}=`
  const inline = process.argv.find((value) => value.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const databasePath = readArgument('db')
if (!databasePath) throw new Error('catalog_maintenance_db_path_required')

const applyChanges = process.argv.includes('--apply')
const refreshOnly = process.argv.includes('--refresh-reviews')
const db = createConnection(databasePath)

try {
  const menuRepository = new MenuRepository(db)
  const mappingRepository = new MappingRepository(db)
  const platformMenuRepository = new PlatformMenuRepository(db)
  const platformOptionGroupRepository = new PlatformOptionGroupRepository(db)
  const catalogReviewRepository = new CatalogReviewRepository(db)
  const catalogIntentRuleRepository = new CatalogIntentRuleRepository(db)
  const refreshReviews = () => {
    const workspaceId = 'default'
    const workspace = new CatalogWorkspaceRepository(db).getDefault()
    const reviews = analyzeCatalogExceptions({
      workspaceId,
      referencePlatformCode: workspace.seedMode === 'platform'
        ? workspace.seedPlatformCode
        : null,
      menus: menuRepository.list(),
      platformMenus: platformMenuRepository.listAll(),
      mappings: mappingRepository.listAll(),
      logicalOptionGroups: buildLogicalOptionGroups(platformOptionGroupRepository.listAll())
    })
    catalogReviewRepository.replaceOpen(
      workspaceId,
      applyIntentRules(reviews, catalogIntentRuleRepository.listActive(workspaceId))
    )
  }
  const service = new CatalogMaintenanceService({
    db,
    backupDatabase: () => {
      db.exec('pragma wal_checkpoint(full)')
      const backupDirectory = join(dirname(databasePath), 'backups')
      mkdirSync(backupDirectory, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = join(backupDirectory, `delivery-menu-sync-${timestamp}.db`)
      copyFileSync(databasePath, backupPath)
      return backupPath
    },
    refreshReviews
  })
  const preview = service.preview('baemin')
  if (refreshOnly) refreshReviews()
  const result = applyChanges
    ? service.apply({
        referencePlatformCode: 'baemin',
        acceptedCandidateIds: preview.safeMerges.map((candidate) => candidate.candidateId),
        excludeHiddenOnlyMenus: true
      })
    : null

  const mode = applyChanges ? 'apply' : refreshOnly ? 'refresh-reviews' : 'preview'
  process.stdout.write(`${JSON.stringify({ mode, preview, result }, null, 2)}\n`)
} finally {
  db.close()
}
