import type { CatalogIntentRule, CatalogReviewItem } from '../../shared/contracts'

const scopePriority: Record<CatalogIntentRule['scope'], number> = {
  entity: 5,
  field: 4,
  category: 3,
  platform: 2,
  workspace: 1
}

const readEvidence = (item: CatalogReviewItem): Record<string, unknown> => {
  try {
    return JSON.parse(item.evidenceJson) as Record<string, unknown>
  } catch {
    return {}
  }
}

const matchesRule = (
  rule: CatalogIntentRule,
  item: CatalogReviewItem,
  at: string
) => {
  if (
    rule.isActive !== 1 ||
    rule.workspaceId !== item.workspaceId ||
    rule.kind !== item.kind ||
    (rule.expiresAt && rule.expiresAt <= at)
  ) {
    return false
  }

  const evidence = readEvidence(item)
  const dimensionsMatch =
    (!rule.platformCode || rule.platformCode === item.platformCode) &&
    (!rule.canonicalMenuId || rule.canonicalMenuId === item.canonicalMenuId) &&
    (!rule.sourceEntityId || rule.sourceEntityId === item.sourceEntityId) &&
    (!rule.fieldKey || rule.fieldKey === evidence.fieldKey) &&
    (!rule.categoryKey || rule.categoryKey === evidence.categoryKey)

  if (!dimensionsMatch) {
    return false
  }

  switch (rule.scope) {
    case 'entity':
      return Boolean(rule.canonicalMenuId || rule.sourceEntityId)
    case 'field':
      return Boolean(rule.fieldKey && rule.fieldKey === evidence.fieldKey)
    case 'category':
      return Boolean(rule.categoryKey && rule.categoryKey === evidence.categoryKey)
    case 'platform':
      return Boolean(rule.platformCode && rule.platformCode === item.platformCode)
    case 'workspace':
      return true
  }
}

export const applyIntentRules = (
  items: CatalogReviewItem[],
  rules: CatalogIntentRule[],
  at = new Date().toISOString()
): CatalogReviewItem[] =>
  items.flatMap((item) => {
    const matchingRules = rules
      .filter((rule) => matchesRule(rule, item, at))
      .sort(
        (left, right) =>
          scopePriority[right.scope] - scopePriority[left.scope] ||
          left.intentRuleId.localeCompare(right.intentRuleId)
      )

    const highestPriority = matchingRules[0]
      ? scopePriority[matchingRules[0].scope]
      : null
    if (highestPriority === null) {
      return [item]
    }

    const highestRules = matchingRules.filter(
      (rule) => scopePriority[rule.scope] === highestPriority
    )
    const resolutions = new Set(highestRules.map((rule) => rule.resolution))

    if (resolutions.size > 1) {
      const conflictingIntentRuleIds = highestRules
        .map((rule) => rule.intentRuleId)
        .sort((left, right) => left.localeCompare(right))

      return [{
        ...item,
        state: 'blocked' as const,
        recommendation: null,
        intentRuleId: null,
        explanation: `${item.explanation} 같은 우선순위의 저장된 결정이 서로 충돌합니다.`,
        evidenceJson: JSON.stringify({
          ...readEvidence(item),
          conflictingIntentRuleIds
        })
      }]
    }

    const selectedRule = highestRules[0]
    if (selectedRule.resolution === 'defer') {
      return [{
        ...item,
        state: 'deferred' as const,
        intentRuleId: selectedRule.intentRuleId
      }]
    }

    return []
  })
