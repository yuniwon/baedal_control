import { describe, expect, it } from 'vitest'
import { summarizeImportChanges } from '../../../src/main/services/import-summary-service'

describe('summarizeImportChanges', () => {
  it('counts created menu, missing menu, absent menu, absent option group, and resurfaced entity changes', () => {
    const summary = summarizeImportChanges([
      {
        changeId: 'change-1',
        importRunId: 'run-1',
        platformCode: 'baemin',
        entityType: 'menu',
        entityKey: 'menu-a',
        entityName: '감자피자',
        changeType: 'created'
      },
      {
        changeId: 'change-2',
        importRunId: 'run-1',
        platformCode: 'baemin',
        entityType: 'menu',
        entityKey: 'menu-b',
        entityName: '불고기피자',
        changeType: 'missing_suspected'
      },
      {
        changeId: 'change-3',
        importRunId: 'run-1',
        platformCode: 'baemin',
        entityType: 'option_group',
        entityKey: 'group-a',
        entityName: '사이즈 선택',
        changeType: 'absent_confirmed'
      },
      {
        changeId: 'change-4',
        importRunId: 'run-1',
        platformCode: 'baemin',
        entityType: 'menu',
        entityKey: 'menu-c',
        entityName: '새우피자',
        changeType: 'absent_confirmed'
      },
      {
        changeId: 'change-5',
        importRunId: 'run-1',
        platformCode: 'baemin',
        entityType: 'menu',
        entityKey: 'menu-d',
        entityName: '고구마피자',
        changeType: 'resurfaced'
      }
    ])

    expect(summary).toEqual({
      createdMenus: 1,
      missingMenus: 1,
      absentMenus: 1,
      mergeCandidateOptionBundles: 0,
      missingOptionGroups: 0,
      absentOptionGroups: 1,
      resurfacedEntities: 1
    })
  })
})
