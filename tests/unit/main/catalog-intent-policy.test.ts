import { describe, expect, it } from 'vitest'

import { applyIntentRules } from '../../../src/main/services/catalog-intent-policy'
import type { CatalogIntentRule, CatalogReviewItem } from '../../../src/shared/contracts'

const item = (overrides: Partial<CatalogReviewItem> = {}): CatalogReviewItem => ({
  reviewItemId: 'review-1',
  workspaceId: 'default',
  fingerprint: 'fingerprint-1',
  kind: 'missing_on_platform',
  state: 'open',
  confidence: 1,
  title: '쿠팡이츠에 메뉴가 없습니다',
  explanation: '현재 원본에서 연결을 찾지 못했습니다.',
  recommendation: 'add_to_platform',
  evidenceJson: JSON.stringify({ fieldKey: 'presence', categoryKey: '피자' }),
  platformCode: 'coupangeats',
  canonicalMenuId: 'menu-1',
  sourceEntityId: null,
  intentRuleId: null,
  ...overrides
})

const rule = (overrides: Partial<CatalogIntentRule> = {}): CatalogIntentRule => ({
  intentRuleId: 'rule-1',
  workspaceId: 'default',
  kind: 'missing_on_platform',
  scope: 'entity',
  resolution: 'exclude_platform',
  platformCode: 'coupangeats',
  canonicalMenuId: 'menu-1',
  sourceEntityId: null,
  fieldKey: null,
  categoryKey: null,
  reason: '이 플랫폼에는 의도적으로 판매하지 않음',
  expiresAt: null,
  isActive: 1,
  ...overrides
})

describe('applyIntentRules', () => {
  it('does not reopen an intentional entity-level platform exclusion', () => {
    expect(applyIntentRules([item()], [rule()])).toEqual([])
  })

  it('applies the narrowest matching rule before a broad workspace rule', () => {
    const result = applyIntentRules(
      [item()],
      [
        rule({
          intentRuleId: 'workspace-rule',
          scope: 'workspace',
          resolution: 'exclude_platform',
          platformCode: null,
          canonicalMenuId: null
        }),
        rule({ intentRuleId: 'entity-rule', resolution: 'defer' })
      ]
    )

    expect(result).toEqual([
      expect.objectContaining({ state: 'deferred', intentRuleId: 'entity-rule' })
    ])
  })

  it('blocks rather than guessing when same-priority rules conflict', () => {
    const [result] = applyIntentRules(
      [item()],
      [rule({ intentRuleId: 'rule-a', resolution: 'defer' }), rule({ intentRuleId: 'rule-b' })]
    )

    expect(result).toMatchObject({
      state: 'blocked',
      recommendation: null,
      intentRuleId: null
    })
    expect(JSON.parse(result.evidenceJson)).toMatchObject({
      conflictingIntentRuleIds: ['rule-a', 'rule-b']
    })
  })

  it('ignores inactive and expired rules', () => {
    const review = item()
    const result = applyIntentRules(
      [review],
      [
        rule({ intentRuleId: 'inactive', isActive: 0 }),
        rule({ intentRuleId: 'expired', expiresAt: '2026-01-01T00:00:00.000Z' })
      ],
      '2026-07-25T00:00:00.000Z'
    )

    expect(result).toEqual([review])
  })
})
