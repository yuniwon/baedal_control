import type { PlatformCatalogCompleteness } from '../../../shared/contracts'
import type { PlatformMenuSnapshot, PlatformOptionGroupSnapshot } from '../base/types'

interface BuildBrowserCatalogCompletenessInput {
  menus: PlatformMenuSnapshot[]
  optionGroups: PlatformOptionGroupSnapshot[]
  menuCollectionProven: boolean
  optionCollectionProven: boolean
  expectedMenuCount?: number
  expectedOptionGroupCount?: number
  parseIssues: string[]
}

export const buildBrowserCatalogCompleteness = ({
  menus,
  optionGroups,
  menuCollectionProven,
  optionCollectionProven,
  expectedMenuCount,
  expectedOptionGroupCount,
  parseIssues
}: BuildBrowserCatalogCompletenessInput): PlatformCatalogCompleteness => {
  const issues = [...parseIssues]

  const menuCountMismatch =
    expectedMenuCount !== undefined && expectedMenuCount !== menus.length
  if (menuCountMismatch) {
    issues.push(`menu_count_mismatch:${menus.length}/${expectedMenuCount}`)
  }

  const optionGroupCountMismatch =
    expectedOptionGroupCount !== undefined && expectedOptionGroupCount !== optionGroups.length
  if (optionGroupCountMismatch) {
    issues.push(
      `option_group_count_mismatch:${optionGroups.length}/${expectedOptionGroupCount}`
    )
  }

  let bindingMismatch = false
  for (const group of optionGroups) {
    if (
      group.mappingMenusCount !== undefined &&
      group.mappingMenusCount !== null &&
      group.mappingMenusCount !== group.menus.length
    ) {
      bindingMismatch = true
      issues.push(
        `option_binding_count_mismatch:${group.optionGroupId}:${group.menus.length}/${group.mappingMenusCount}`
      )
    }
  }

  const hasParseIssues = parseIssues.length > 0

  return {
    menuCatalog: !menuCollectionProven
      ? 'unknown'
      : menuCountMismatch || hasParseIssues
        ? 'incomplete'
        : 'complete',
    optionCatalog: !optionCollectionProven
      ? 'unknown'
      : optionGroupCountMismatch || hasParseIssues
        ? 'incomplete'
        : 'complete',
    optionBindings: !optionCollectionProven
      ? 'unknown'
      : bindingMismatch || hasParseIssues
        ? 'incomplete'
        : 'complete',
    ...(expectedMenuCount === undefined ? {} : { expectedMenuCount }),
    collectedMenuCount: menus.length,
    ...(expectedOptionGroupCount === undefined ? {} : { expectedOptionGroupCount }),
    collectedOptionGroupCount: optionGroups.length,
    issues: [...new Set(issues)]
  }
}
