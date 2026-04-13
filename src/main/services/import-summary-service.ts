import type { PlatformImportChangeRecord } from '../../shared/contracts'

export const summarizeImportChanges = (changes: PlatformImportChangeRecord[]) =>
  changes.reduce(
    (summary, change) => {
      if (change.entityType === 'menu' && change.changeType === 'created') {
        summary.createdMenus += 1
      }

      if (change.entityType === 'menu' && change.changeType === 'missing_suspected') {
        summary.missingMenus += 1
      }

      if (change.entityType === 'menu' && change.changeType === 'absent_confirmed') {
        summary.absentMenus += 1
      }

      if (change.entityType === 'option_group' && change.changeType === 'missing_suspected') {
        summary.missingOptionGroups += 1
      }

      if (change.entityType === 'option_group' && change.changeType === 'absent_confirmed') {
        summary.absentOptionGroups += 1
      }

      if (change.changeType === 'resurfaced') {
        summary.resurfacedEntities += 1
      }

      return summary
    },
    {
      createdMenus: 0,
      missingMenus: 0,
      absentMenus: 0,
      mergeCandidateOptionBundles: 0,
      missingOptionGroups: 0,
      absentOptionGroups: 0,
      resurfacedEntities: 0
    }
  )
