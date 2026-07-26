import { beforeEach, describe, expect, it } from 'vitest'

import type { CatalogReviewItem } from '../../../src/shared/contracts'
import { createInMemoryConnection, type DatabaseConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { CatalogReviewRepository } from '../../../src/main/repositories/catalog-review-repository'

const reviewItem = (overrides: Partial<CatalogReviewItem> = {}): CatalogReviewItem => ({
  reviewItemId: 'review-1',
  workspaceId: 'default',
  fingerprint: 'same-fingerprint',
  kind: 'missing_on_platform',
  state: 'open',
  confidence: 0.95,
  title: '쿠팡이츠에 메뉴가 없습니다',
  explanation: '다른 플랫폼에서는 판매 중입니다.',
  recommendation: 'add_to_platform',
  evidenceJson: '{"platform":"coupangeats"}',
  platformCode: 'coupangeats',
  canonicalMenuId: 'menu-1',
  sourceEntityId: null,
  intentRuleId: null,
  ...overrides
})

describe('CatalogReviewRepository', () => {
  let db: DatabaseConnection
  let repository: CatalogReviewRepository

  beforeEach(() => {
    db = createInMemoryConnection()
    migrate(db)
    repository = new CatalogReviewRepository(db)
  })

  it('deduplicates generated items by workspace and fingerprint', () => {
    repository.replaceOpen('default', [
      reviewItem(),
      reviewItem({ reviewItemId: 'review-2', explanation: '최신 근거입니다.' })
    ])

    expect(repository.listOpen('default')).toEqual([
      expect.objectContaining({
        reviewItemId: 'review-2',
        fingerprint: 'same-fingerprint',
        explanation: '최신 근거입니다.'
      })
    ])
  })

  it('closes an old open item when it is absent from the replacement set', () => {
    repository.replaceOpen('default', [reviewItem()])
    repository.replaceOpen('default', [])

    expect(repository.listOpen('default')).toEqual([])
    const row = db.prepare(`
      select state
      from catalog_review_items
      where review_item_id = ?
    `).get('review-1') as { state: string }
    expect(row.state).toBe('resolved')
  })

  it('resolves selected items without changing unrelated open items', () => {
    repository.replaceOpen('default', [
      reviewItem(),
      reviewItem({
        reviewItemId: 'review-2',
        fingerprint: 'other-fingerprint',
        kind: 'price_outlier'
      })
    ])

    repository.resolve(['review-1'], 'intent-1')

    expect(repository.listOpen('default')).toEqual([
      expect.objectContaining({ reviewItemId: 'review-2' })
    ])
  })

  it('preserves resolved history when the same fingerprint is analyzed again', () => {
    repository.replaceOpen('default', [reviewItem()])
    repository.resolve(['review-1'])

    repository.replaceOpen('default', [reviewItem({ explanation: '같은 근거를 다시 분석했습니다.' })])

    expect(repository.listOpen('default')).toEqual([])
    expect(
      db.prepare(`select state from catalog_review_items where fingerprint = ?`)
        .get('same-fingerprint')
    ).toEqual({ state: 'resolved' })
  })
})
