import type {
  CatalogEntityType,
  CatalogPresenceStatus,
  PlatformCode,
  PlatformImportChangeRecord,
  PlatformImportChangeType
} from '../../shared/contracts'
import { nextPresenceState } from './absence-state-service'

type ComparableChangeType = Exclude<
  PlatformImportChangeType,
  'created' | 'missing_suspected' | 'absent_confirmed' | 'resurfaced'
>

type ComparableValue = Record<string, unknown>

interface PreviousCatalogRow<TComparable extends ComparableValue> {
  key: string
  name: string
  comparable: TComparable
  previousMissingStreak: number
  previousPresenceStatus: CatalogPresenceStatus
}

interface CurrentCatalogRow<TComparable extends ComparableValue> {
  key: string
  name: string
  comparable: TComparable
}

export interface CatalogPresenceUpdate {
  key: string
  missingStreak: number
  presenceStatus: CatalogPresenceStatus
}

export const diffCatalogRows = <TComparable extends ComparableValue>({
  platformCode,
  importRunId,
  entityType,
  comparableChangeType,
  previousRows,
  currentRows
}: {
  platformCode: PlatformCode
  importRunId: string
  entityType: CatalogEntityType
  comparableChangeType: ComparableChangeType
  previousRows: PreviousCatalogRow<TComparable>[]
  currentRows: CurrentCatalogRow<TComparable>[]
}) => {
  assertUniqueKeys(previousRows, 'previousRows')
  assertUniqueKeys(currentRows, 'currentRows')

  const sortedPreviousRows = [...previousRows].sort(compareRowsByKey)
  const sortedCurrentRows = [...currentRows].sort(compareRowsByKey)
  const previousByKey = new Map(sortedPreviousRows.map((row) => [row.key, row]))
  const currentByKey = new Map(sortedCurrentRows.map((row) => [row.key, row]))
  const changes: PlatformImportChangeRecord[] = []
  const presenceUpdates: CatalogPresenceUpdate[] = []

  for (const currentRow of sortedCurrentRows) {
    const previousRow = previousByKey.get(currentRow.key)
    const currentComparableJson = serializeComparable(currentRow.comparable)

    if (!previousRow) {
      changes.push({
        changeId: buildChangeId(importRunId, entityType, currentRow.key, 'created'),
        importRunId,
        platformCode,
        entityType,
        entityKey: currentRow.key,
        entityName: currentRow.name,
        changeType: 'created',
        presenceStatus: 'present',
        beforeJson: null,
        afterJson: currentComparableJson
      })
      presenceUpdates.push({
        key: currentRow.key,
        missingStreak: 0,
        presenceStatus: 'present'
      })
      continue
    }

    const previousComparableJson = serializeComparable(previousRow.comparable)
    const nextSeenState = nextPresenceState({
      previousStatus: previousRow.previousPresenceStatus,
      previousMissingStreak: previousRow.previousMissingStreak,
      isSeenInCurrentImport: true
    })

    presenceUpdates.push({
      key: currentRow.key,
      missingStreak: nextSeenState.missingStreak,
      presenceStatus: nextSeenState.presenceStatus
    })

    if (nextSeenState.presenceStatus === 'resurfaced') {
      changes.push({
        changeId: buildChangeId(importRunId, entityType, currentRow.key, 'resurfaced'),
        importRunId,
        platformCode,
        entityType,
        entityKey: currentRow.key,
        entityName: currentRow.name,
        changeType: 'resurfaced',
        presenceStatus: 'resurfaced',
        beforeJson: previousComparableJson,
        afterJson: currentComparableJson
      })
    }

    if (previousComparableJson !== currentComparableJson) {
      changes.push({
        changeId: buildChangeId(importRunId, entityType, currentRow.key, comparableChangeType),
        importRunId,
        platformCode,
        entityType,
        entityKey: currentRow.key,
        entityName: currentRow.name,
        changeType: comparableChangeType,
        presenceStatus: nextSeenState.presenceStatus,
        beforeJson: previousComparableJson,
        afterJson: currentComparableJson
      })
    }
  }

  for (const previousRow of sortedPreviousRows) {
    if (currentByKey.has(previousRow.key)) {
      continue
    }

    const nextMissingState = nextPresenceState({
      previousStatus: previousRow.previousPresenceStatus,
      previousMissingStreak: previousRow.previousMissingStreak,
      isSeenInCurrentImport: false
    })
    const missingChangeType =
      nextMissingState.presenceStatus === 'absent_confirmed'
        ? 'absent_confirmed'
        : 'missing_suspected'

    presenceUpdates.push({
      key: previousRow.key,
      missingStreak: nextMissingState.missingStreak,
      presenceStatus: nextMissingState.presenceStatus
    })
    changes.push({
      changeId: buildChangeId(importRunId, entityType, previousRow.key, missingChangeType),
      importRunId,
      platformCode,
      entityType,
      entityKey: previousRow.key,
      entityName: previousRow.name,
      changeType: missingChangeType,
      presenceStatus: nextMissingState.presenceStatus,
      beforeJson: serializeComparable(previousRow.comparable),
      afterJson: null
    })
  }

  return { changes, presenceUpdates }
}

const buildChangeId = (
  importRunId: string,
  entityType: CatalogEntityType,
  key: string,
  changeType: PlatformImportChangeType
) => `${importRunId}:${entityType}:${key}:${changeType}`

const compareRowsByKey = (
  left: { key: string },
  right: { key: string }
) => left.key.localeCompare(right.key)

const assertUniqueKeys = (
  rows: Array<{ key: string }>,
  label: 'previousRows' | 'currentRows'
) => {
  const seenKeys = new Set<string>()

  for (const row of rows) {
    if (seenKeys.has(row.key)) {
      throw new Error(`Duplicate key in ${label}: ${row.key}`)
    }

    seenKeys.add(row.key)
  }
}

const serializeComparable = (value: ComparableValue) => JSON.stringify(canonicalize(value))

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry))
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalize((value as Record<string, unknown>)[key])
        return result
      }, {})
  }

  return value
}
