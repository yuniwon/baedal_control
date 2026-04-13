import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { PlatformImportChangeRepository } from '../../../src/main/repositories/platform-import-change-repository'

describe('PlatformImportChangeRepository', () => {
  let repository: PlatformImportChangeRepository

  beforeEach(() => {
    const db = createInMemoryConnection()
    migrate(db)
    repository = new PlatformImportChangeRepository(db)
  })

  it('replaces changes for a run without affecting other runs', () => {
    repository.replaceForRun('run-1', [
      {
        changeId: 'change-1',
        importRunId: 'run-1',
        platformCode: 'baemin',
        entityType: 'menu',
        entityKey: 'menu:p-1',
        entityName: '콤비네이션',
        changeType: 'created',
        beforeJson: null,
        afterJson: '{"name":"콤비네이션"}'
      }
    ])

    repository.replaceForRun('run-2', [
      {
        changeId: 'change-2',
        importRunId: 'run-2',
        platformCode: 'coupangeats',
        entityType: 'option_group',
        entityKey: 'option_group:g-1',
        entityName: '토핑 추가',
        changeType: 'option_signature_changed',
        presenceStatus: 'present',
        beforeJson: '{"signature":"old"}',
        afterJson: '{"signature":"new"}'
      }
    ])

    repository.replaceForRun('run-1', [
      {
        changeId: 'change-3',
        importRunId: 'run-1',
        platformCode: 'baemin',
        entityType: 'menu',
        entityKey: 'menu:p-2',
        entityName: '포테이토',
        changeType: 'missing_suspected',
        presenceStatus: 'missing_suspected',
        beforeJson: '{"name":"포테이토"}',
        afterJson: null
      }
    ])

    expect(repository.listLatest()).toEqual([
      expect.objectContaining({
        changeId: 'change-3',
        importRunId: 'run-1',
        changeType: 'missing_suspected',
        presenceStatus: 'missing_suspected'
      }),
      expect.objectContaining({
        changeId: 'change-2',
        importRunId: 'run-2',
        changeType: 'option_signature_changed',
        presenceStatus: 'present'
      })
    ])
  })

  it('applies the latest limit when listing changes', () => {
    repository.replaceForRun('run-1', [
      {
        changeId: 'change-1',
        importRunId: 'run-1',
        platformCode: 'baemin',
        entityType: 'menu',
        entityKey: 'menu:p-1',
        entityName: '콤비네이션',
        changeType: 'created'
      }
    ])

    repository.replaceForRun('run-2', [
      {
        changeId: 'change-2',
        importRunId: 'run-2',
        platformCode: 'coupangeats',
        entityType: 'menu',
        entityKey: 'menu:p-2',
        entityName: '포테이토',
        changeType: 'created'
      }
    ])

    expect(repository.listLatest(1)).toEqual([
      expect.objectContaining({
        changeId: 'change-2'
      })
    ])
  })
})
