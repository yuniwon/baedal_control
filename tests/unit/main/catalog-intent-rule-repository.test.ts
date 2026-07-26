import { beforeEach, describe, expect, it } from 'vitest'

import type { CatalogIntentRule } from '../../../src/shared/contracts'
import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { CatalogIntentRuleRepository } from '../../../src/main/repositories/catalog-intent-rule-repository'

const rule = (overrides: Partial<CatalogIntentRule> = {}): CatalogIntentRule => ({
  intentRuleId: 'intent-1',
  workspaceId: 'default',
  kind: 'missing_on_platform',
  scope: 'entity',
  resolution: 'exclude_platform',
  platformCode: 'coupangeats',
  canonicalMenuId: 'menu-1',
  sourceEntityId: null,
  fieldKey: null,
  reason: '쿠팡이츠에서는 판매하지 않음',
  expiresAt: null,
  isActive: 1,
  ...overrides
})

describe('CatalogIntentRuleRepository', () => {
  let repository: CatalogIntentRuleRepository

  beforeEach(() => {
    const db = createInMemoryConnection()
    migrate(db)
    repository = new CatalogIntentRuleRepository(db)
  })

  it('lists only active, unexpired rules for the workspace', () => {
    repository.upsert(rule())
    repository.upsert(rule({
      intentRuleId: 'intent-expired',
      expiresAt: '2026-07-24T23:59:59.000Z'
    }))
    repository.upsert(rule({
      intentRuleId: 'intent-disabled',
      isActive: 0
    }))
    repository.upsert(rule({
      intentRuleId: 'intent-other-workspace',
      workspaceId: 'other'
    }))

    expect(repository.listActive('default', '2026-07-25T00:00:00.000Z')).toEqual([
      expect.objectContaining({ intentRuleId: 'intent-1' })
    ])
  })

  it('updates a rule while preserving its identity', () => {
    repository.upsert(rule())
    repository.upsert(rule({ reason: '운영 전략으로 제외', scope: 'platform' }))

    expect(repository.listActive('default', '2026-07-25T00:00:00.000Z')).toEqual([
      expect.objectContaining({
        intentRuleId: 'intent-1',
        reason: '운영 전략으로 제외',
        scope: 'platform'
      })
    ])
  })
})
