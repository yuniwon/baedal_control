import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { PlatformImportRunRepository } from '../../../src/main/repositories/platform-import-run-repository'

describe('PlatformImportRunRepository', () => {
  let repository: PlatformImportRunRepository

  beforeEach(() => {
    const db = createInMemoryConnection()
    migrate(db)
    repository = new PlatformImportRunRepository(db)
  })

  it('starts, finishes, and lists the latest import runs', () => {
    repository.start({ importRunId: 'run-1', platformCode: 'baemin' })
    repository.finish('run-1', {
      status: 'completed',
      menuFetchCompleted: 1,
      optionFetchCompleted: 0,
      summaryJson: '{"menus":1}',
      errorMessage: null
    })

    repository.start({ importRunId: 'run-2', platformCode: 'coupangeats' })

    expect(repository.listLatest()).toEqual([
      expect.objectContaining({
        importRunId: 'run-2',
        platformCode: 'coupangeats',
        status: 'running',
        menuFetchCompleted: 0,
        optionFetchCompleted: 0,
        finishedAt: null,
        summaryJson: null,
        errorMessage: null
      }),
      expect.objectContaining({
        importRunId: 'run-1',
        platformCode: 'baemin',
        status: 'completed',
        menuFetchCompleted: 1,
        optionFetchCompleted: 0,
        finishedAt: expect.any(String),
        summaryJson: '{"menus":1}',
        errorMessage: null
      })
    ])
  })

  it('stores the latest import failure message for partial failures', () => {
    repository.start({ importRunId: 'run-1', platformCode: 'baemin' })
    repository.finish('run-1', {
      status: 'partial_failed',
      menuFetchCompleted: 1,
      optionFetchCompleted: 0,
      summaryJson: null,
      errorMessage: 'baemin_menu_page_collection_incomplete:2/3'
    })

    expect(repository.listLatest()).toEqual([
      expect.objectContaining({
        importRunId: 'run-1',
        status: 'partial_failed',
        errorMessage: 'baemin_menu_page_collection_incomplete:2/3'
      })
    ])
  })

  it('applies the latest limit when listing import runs', () => {
    repository.start({ importRunId: 'run-1', platformCode: 'baemin' })
    repository.start({ importRunId: 'run-2', platformCode: 'coupangeats' })

    expect(repository.listLatest(1)).toEqual([
      expect.objectContaining({
        importRunId: 'run-2'
      })
    ])
  })

  it('throws when finishing an unknown import run id', () => {
    expect(() =>
      repository.finish('missing-run', {
        status: 'completed',
        menuFetchCompleted: 1,
        optionFetchCompleted: 1
      })
    ).toThrow('Platform import run not found: missing-run')
  })
})
