import type {
  LogicalOptionGroupRecord,
  PlatformOptionGroupRecord
} from '../../shared/contracts'
import {
  buildNormalizedOptionSignature,
  buildOptionSignature
} from './option-signature'

type LogicalSourceGroup = PlatformOptionGroupRecord & {
  canonicalSignature: string
  normalizedSignature: ReturnType<typeof buildNormalizedOptionSignature>
}

const compareGroups = (
  left: { platformCode: string; displayName: string; logicalGroupKey: string },
  right: { platformCode: string; displayName: string; logicalGroupKey: string }
) =>
  left.platformCode.localeCompare(right.platformCode, 'ko-KR') ||
  left.displayName.localeCompare(right.displayName, 'ko-KR') ||
  left.logicalGroupKey.localeCompare(right.logicalGroupKey, 'ko-KR')

const compareSourceGroups = (
  left: {
    normalizedSignature: ReturnType<typeof buildNormalizedOptionSignature>
    optionGroupId: string
  },
  right: {
    normalizedSignature: ReturnType<typeof buildNormalizedOptionSignature>
    optionGroupId: string
  }
) =>
  left.normalizedSignature.optionGroupName.localeCompare(
    right.normalizedSignature.optionGroupName,
    'ko-KR'
  ) ||
  left.optionGroupId.localeCompare(right.optionGroupId, 'ko-KR')

const compareNames = (left: string, right: string) => left.localeCompare(right, 'ko-KR')

const resolveLogicalStatus = (sourceGroups: PlatformOptionGroupRecord[]) => {
  if (sourceGroups.some((group) => group.presenceStatus === 'absent_confirmed')) {
    return 'absent_confirmed'
  }

  if (sourceGroups.some((group) => group.presenceStatus === 'missing_suspected')) {
    return 'missing_suspected'
  }

  if (sourceGroups.some((group) => group.presenceStatus === 'resurfaced')) {
    return 'resurfaced'
  }

  return sourceGroups.length > 1 ? 'merge_candidate' : 'single'
}

const normalizeLinkedMenuNames = (group: PlatformOptionGroupRecord) => {
  const names = group.menus
    .map((menu) => menu.platformMenuName.trim())
    .filter((name) => name.length > 0)

  return [...new Set(names)].sort(compareNames)
}

const buildCanonicalSourceGroup = (group: PlatformOptionGroupRecord) => {
  const normalizedSignature = buildNormalizedOptionSignature(group)

  return {
    ...group,
    canonicalSignature: buildOptionSignature(group),
    normalizedSignature
  }
}

export const buildLogicalOptionGroups = (
  platformGroups: PlatformOptionGroupRecord[]
): LogicalOptionGroupRecord[] => {
  const groupsByKey = new Map<string, LogicalSourceGroup[]>()

  for (const group of platformGroups) {
    const sourceGroup = buildCanonicalSourceGroup(group)
    const logicalGroupKey = `${group.platformCode}:${sourceGroup.canonicalSignature}`

    groupsByKey.set(logicalGroupKey, [...(groupsByKey.get(logicalGroupKey) ?? []), sourceGroup])
  }

  const logicalGroups = [...groupsByKey.entries()]
    .map(([logicalGroupKey, groupedSourceGroups]) => {
      const sourceGroups = [...groupedSourceGroups].sort(compareSourceGroups)
      const primaryGroup = sourceGroups[0]
      const connectedMenuNames = new Set<string>()
      const primaryNormalizedSignature = primaryGroup.normalizedSignature

      for (const group of sourceGroups) {
        for (const menuName of normalizeLinkedMenuNames(group)) {
          connectedMenuNames.add(menuName)
        }
      }

      return {
        logicalGroupKey,
        platformCode: primaryGroup.platformCode,
        displayName: primaryNormalizedSignature.optionGroupName,
        minOrderQuantity: primaryNormalizedSignature.minOrderQuantity,
        maxOrderQuantity: primaryNormalizedSignature.maxOrderQuantity,
        optionCount: primaryNormalizedSignature.options.length,
        connectedMenuCount: connectedMenuNames.size,
        sourceGroupCount: sourceGroups.length,
        sampleOptionNames: primaryNormalizedSignature.options
          .slice(0, 3)
          .map((option) => option.optionName),
        logicalOptions: primaryNormalizedSignature.options.map((option) => ({
          optionName: option.optionName,
          optionPrice: option.optionPrice
        })),
        status: resolveLogicalStatus(sourceGroups),
        sourceGroups: sourceGroups.map((group) => {
          const linkedMenuNames = normalizeLinkedMenuNames(group)

          return {
            optionGroupId: group.optionGroupId,
            optionGroupName: group.optionGroupName,
            presenceStatus: group.presenceStatus ?? 'present',
            lastSeenAt: group.lastSeenAt ?? null,
            linkedMenuCount: linkedMenuNames.length,
            linkedMenuNames,
            options: group.normalizedSignature.options.map((option) => ({
              optionName: option.optionName,
              optionPrice: option.optionPrice
            }))
          }
        })
      } satisfies LogicalOptionGroupRecord
    })
    .sort(compareGroups)

  const displayNameCounts = logicalGroups.reduce<Map<string, number>>((result, group) => {
    const key = `${group.platformCode}:${group.displayName}`
    result.set(key, (result.get(key) ?? 0) + 1)
    return result
  }, new Map())

  return logicalGroups.map((group) => {
    const key = `${group.platformCode}:${group.displayName}`
    const hasShapeConflict = (displayNameCounts.get(key) ?? 0) > 1

    if (!hasShapeConflict) {
      return group
    }

    if (
      group.status === 'missing_suspected' ||
      group.status === 'absent_confirmed' ||
      group.status === 'resurfaced'
    ) {
      return group
    }

    return {
      ...group,
      status: 'shape_conflict'
    }
  })
}
