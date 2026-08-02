import { createConnection } from '../src/main/db/connection'
import { MappingRepository } from '../src/main/repositories/mapping-repository'
import { MenuRepository } from '../src/main/repositories/menu-repository'
import { PlatformMenuRepository } from '../src/main/repositories/platform-menu-repository'
import { PlatformOptionGroupRepository } from '../src/main/repositories/platform-option-group-repository'
import { buildCatalogProjectionPreview } from '../src/shared/catalog-projection'

const readArgument = (name: string) => {
  const prefix = `--${name}=`
  const inline = process.argv.find((value) => value.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const databasePath = readArgument('db')
if (!databasePath) throw new Error('catalog_projection_db_path_required')

const db = createConnection(databasePath)
try {
  const preview = buildCatalogProjectionPreview({
    referencePlatformCode: 'baemin',
    menus: new MenuRepository(db).list(),
    mappings: new MappingRepository(db).listAll(),
    platformMenus: new PlatformMenuRepository(db).listAll(),
    optionGroups: new PlatformOptionGroupRepository(db).listAll()
  })
  process.stdout.write(`${JSON.stringify({
    generatedAt: preview.generatedAt,
    menuCount: preview.menuCount,
    platforms: preview.platforms,
    items: preview.items
  }, null, 2)}\n`)
} finally {
  db.close()
}
