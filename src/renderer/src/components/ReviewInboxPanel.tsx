import { useEffect, useMemo, useState } from 'react'

import type {
  CatalogIntentRule,
  CatalogReviewItem,
  CatalogReviewResolutionInput
} from '../../../shared/contracts'
import { getPlatformLabel } from '../lib/menu-source-labels'
import { appApi } from '../lib/api'

type ReviewGroup = {
  key: string
  label: string
  selectionLabel: string
  explanation: string
  items: CatalogReviewItem[]
}

type ReviewFlow = {
  sourceLabel: string
  sourceValue: string
  targetLabel: string
  targetValue: string
  decisionValue: string
  detail: string
}

const readEvidence = (evidenceJson: string): Record<string, unknown> => {
  try {
    const evidence = JSON.parse(evidenceJson) as unknown
    return evidence && typeof evidence === 'object' && !Array.isArray(evidence)
      ? evidence as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

const buildReviewFlow = (item: CatalogReviewItem): ReviewFlow => {
  const evidence = readEvidence(item.evidenceJson)
  const canonicalName = typeof evidence.canonicalName === 'string'
    ? evidence.canonicalName
    : item.title
  const platformName = item.platformCode ? getPlatformLabel(item.platformCode) : '대상 플랫폼'

  if (item.kind === 'missing_on_platform') {
    return {
      sourceLabel: '통합 메뉴',
      sourceValue: canonicalName,
      targetLabel: '대상 플랫폼',
      targetValue: platformName,
      decisionValue: '추가 여부 결정',
      detail: '현재는 추가 의사만 저장합니다. 실제 등록은 플랫폼 생성 기능이 연결된 뒤 실행됩니다.'
    }
  }

  if (item.kind === 'option_only_on_platform') {
    const optionRole = evidence.optionRole === 'paid_add_on'
      ? '유료 옵션'
      : evidence.optionRole === 'bundle_selection'
        ? '세트·반반 선택 옵션'
      : evidence.optionRole === 'included_selection'
        ? '세트·반반 포함 옵션'
        : '유료·포함 옵션'

    return {
      sourceLabel: '통합 메뉴',
      sourceValue: canonicalName,
      targetLabel: '현재 플랫폼 상태',
      targetValue: `${platformName} ${optionRole}만 제공`,
      decisionValue: '일반 메뉴 추가 여부',
      detail: '같은 이름 또는 유사한 항목이 옵션으로만 존재합니다. 일반 메뉴와 옵션은 별도 판매 단위로 판단합니다.'
    }
  }

  if (item.kind === 'price_outlier') {
    return {
      sourceLabel: '통합 기준',
      sourceValue: canonicalName,
      targetLabel: '차이가 난 곳',
      targetValue: platformName,
      decisionValue: '가격 기준 결정',
      detail: '기준 가격을 적용할지 플랫폼별 가격을 유지할지 결정합니다.'
    }
  }

  return {
    sourceLabel: '확인할 항목',
    sourceValue: canonicalName,
    targetLabel: '영향 범위',
    targetValue: platformName,
    decisionValue: '처리 방법 결정',
    detail: item.explanation
  }
}

const buildReviewGroups = (items: CatalogReviewItem[]): ReviewGroup[] => {
  const grouped = new Map<string, CatalogReviewItem[]>()
  for (const item of items) {
    const key = [
      item.kind,
      item.platformCode ?? 'unknown',
      item.recommendation ?? 'no_recommendation'
    ].join(':')
    grouped.set(key, [...(grouped.get(key) ?? []), item])
  }

  return [...grouped.entries()].map(([key, groupItems]) => {
    const first = groupItems[0]
    if (first.kind === 'missing_on_platform') {
      return {
        key,
        label: `${first.platformCode ? getPlatformLabel(first.platformCode) : '플랫폼'} 누락 메뉴 ${groupItems.length}개`,
        selectionLabel: `${first.platformCode ? getPlatformLabel(first.platformCode) : '플랫폼'} 누락 메뉴`,
        explanation: '통합 메뉴에는 있지만 해당 플랫폼에 연결되지 않은 메뉴입니다.',
        items: groupItems
      }
    }
    if (first.kind === 'option_only_on_platform') {
      return {
        key,
        label: `${first.platformCode ? getPlatformLabel(first.platformCode) : '플랫폼'} 일반 메뉴 누락·옵션만 제공 ${groupItems.length}개`,
        selectionLabel: `${first.platformCode ? getPlatformLabel(first.platformCode) : '플랫폼'} 옵션만 제공`,
        explanation: '일반 메뉴는 없고 옵션으로만 제공되는 항목입니다. 두 판매 단위는 서로 대체하지 않습니다.',
        items: groupItems
      }
    }
    if (first.kind === 'price_outlier') {
      return {
        key,
        label: `${first.platformCode ? getPlatformLabel(first.platformCode) : '플랫폼별'} 가격 차이 ${groupItems.length}개`,
        selectionLabel: `${first.platformCode ? getPlatformLabel(first.platformCode) : '플랫폼별'} 가격 차이`,
        explanation: '같은 메뉴의 가격이 플랫폼별로 다릅니다.',
        items: groupItems
      }
    }
    if (first.kind === 'duplicate_option_group') {
      return {
        key,
        label: `중복 옵션 구성 ${groupItems.length}개`,
        selectionLabel: '중복 옵션 구성',
        explanation: '같은 옵션 모양이 여러 그룹으로 나뉘어 있습니다.',
        items: groupItems
      }
    }
    return {
      key,
      label: `${first.title} ${groupItems.length}개`,
      selectionLabel: first.title,
      explanation: first.explanation,
      items: groupItems
    }
  }).sort((left, right) => {
    const priority = (group: ReviewGroup) => {
      const kind = group.items[0]?.kind
      return kind === 'missing_on_platform' ? 0 : kind === 'option_only_on_platform' ? 1 : kind === 'price_outlier' ? 2 : kind === 'duplicate_option_group' ? 3 : 4
    }
    return priority(left) - priority(right) || left.label.localeCompare(right.label, 'ko')
  })
}

const formatEvidence = (evidenceJson: string): string => {
  try {
    return JSON.stringify(JSON.parse(evidenceJson), null, 2)
  } catch {
    return evidenceJson
  }
}

export const ReviewInboxPanel = () => {
  const [items, setItems] = useState<CatalogReviewItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null)
  const [selectedReviewIds, setSelectedReviewIds] = useState<Set<string>>(new Set())
  const [resolution, setResolution] = useState<CatalogIntentRule['resolution'] | null>(null)
  const [remember, setRemember] = useState(false)
  const [scope, setScope] = useState<CatalogIntentRule['scope']>('entity')
  const [reason, setReason] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const listOpen = appApi.catalogReviews?.listOpen
    if (!listOpen) {
      setIsLoading(false)
      return
    }
    void listOpen().then((nextItems) => {
      setItems(nextItems)
      setIsLoading(false)
    }).catch(() => setIsLoading(false))
  }, [])

  const groups = useMemo(() => buildReviewGroups(items), [items])
  const summary = useMemo(() => {
    const blocked = items.filter((item) => item.state === 'blocked').length
    const recommended = items.filter(
      (item) =>
        item.state === 'open' &&
        item.confidence >= 0.8 &&
        item.recommendation !== null &&
        item.recommendation !== 'manual_review'
    ).length
    return {
      autoResolved: 0,
      recommended,
      decisionRequired: Math.max(items.length - recommended - blocked, 0),
      blocked
    }
  }, [items])

  useEffect(() => {
    if (!groups.length || expandedGroup) return
    setExpandedGroup(groups[0].key)
    setSelectedReviewId(groups[0].items[0]?.reviewItemId ?? null)
  }, [groups, expandedGroup])

  const selectedItem = items.find((item) => item.reviewItemId === selectedReviewId) ?? null
  const selectedFlow = selectedItem ? buildReviewFlow(selectedItem) : null
  const selectedResolutionItems = items.filter((item) => selectedReviewIds.has(item.reviewItemId))
  const resolutionTargets = selectedResolutionItems.length > 0
    ? selectedResolutionItems
    : selectedItem
      ? [selectedItem]
      : []
  const hasCompatibleRecommendations = new Set(
    resolutionTargets.map((item) => item.recommendation)
  ).size <= 1

  const beginDecision = (nextResolution: CatalogIntentRule['resolution']) => {
    if (!hasCompatibleRecommendations) return
    setResolution(nextResolution)
    setRemember(false)
    setScope('entity')
    setReason(
      nextResolution === 'exclude_platform'
        ? '이 플랫폼에는 의도적으로 판매하지 않음'
        : nextResolution === 'defer'
          ? '추가 확인 후 결정'
          : '검토 결과에 따라 처리'
    )
  }

  const saveDecision = async () => {
    if (!selectedItem || resolutionTargets.length === 0 || !hasCompatibleRecommendations || !resolution || !reason.trim()) return
    const resolve = appApi.catalogReviews?.resolve
    if (!resolve) return

    setIsSaving(true)
    const payload: CatalogReviewResolutionInput = {
      reviewItemIds: resolutionTargets.map((item) => item.reviewItemId),
      resolution,
      remember,
      scope,
      reason: reason.trim(),
      expiresAt: null
    }
    try {
      await resolve(payload)
      const resolvedIds = new Set(payload.reviewItemIds)
      setItems((current) => current.filter((item) => !resolvedIds.has(item.reviewItemId)))
      setSelectedReviewIds(new Set())
      setSelectedReviewId(null)
      setExpandedGroup(null)
      setResolution(null)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="review-inbox panel" aria-labelledby="review-inbox-title">
      <header className="review-inbox-header">
        <div>
          <h2 id="review-inbox-title">확인이 필요한 항목</h2>
          <p>자동으로 단정하지 않고, 차이가 생긴 이유와 추천만 모았습니다.</p>
        </div>
        <strong>{isLoading ? '확인 중' : `${items.length}개`}</strong>
      </header>

      <div className="review-tier-summary" aria-label="검수 상태 요약">
        <article><strong>{summary.autoResolved}</strong><span>자동 정리</span></article>
        <article><strong>{summary.recommended}</strong><span>추천 확인</span></article>
        <article><strong>{summary.decisionRequired}</strong><span>결정 필요</span></article>
        <article><strong>{summary.blocked}</strong><span>실행 차단</span></article>
      </div>

      {!isLoading && groups.length === 0 ? (
        <div className="review-inbox-empty">
          <strong>지금 확인할 항목이 없습니다</strong>
          <span>가져온 원본 데이터는 변경되지 않았습니다.</span>
        </div>
      ) : (
        <div className="review-group-list">
          {groups.map((group) => {
            const isExpanded = expandedGroup === group.key
            return (
              <section className={`review-group${isExpanded ? ' is-active' : ''}`} key={group.key}>
                <button
                  type="button"
                  className="review-group-toggle"
                  aria-expanded={isExpanded}
                  onClick={() => {
                    setExpandedGroup(isExpanded ? null : group.key)
                    setSelectedReviewId(group.items[0]?.reviewItemId ?? null)
                    setSelectedReviewIds(new Set())
                    setResolution(null)
                  }}
                >
                  <span>
                    <strong>{group.label}</strong>
                    <small>{group.explanation}</small>
                  </span>
                  <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                </button>

                {isExpanded ? (
                  <div className="review-group-detail">
                    <label className="review-group-select-all">
                      <input
                        type="checkbox"
                        aria-label={`${group.selectionLabel} 모두 선택`}
                        checked={group.items.every((item) => selectedReviewIds.has(item.reviewItemId))}
                        onChange={(event) => {
                          setSelectedReviewIds((current) => {
                            const next = new Set(current)
                            for (const item of group.items) {
                              if (event.target.checked) next.add(item.reviewItemId)
                              else next.delete(item.reviewItemId)
                            }
                            return next
                          })
                          setResolution(null)
                        }}
                      />
                      같은 추천 {group.items.length}개 함께 선택
                    </label>
                    <div className="review-item-list" role="radiogroup" aria-label={`${group.label} 항목`}>
                      {group.items.map((item) => (
                        <label className={`review-item-row${selectedReviewId === item.reviewItemId ? ' is-selected' : ''}`} key={item.reviewItemId}>
                          <input
                            type="radio"
                            name="selected-review"
                            checked={selectedReviewId === item.reviewItemId}
                            onChange={() => {
                              setSelectedReviewId(item.reviewItemId)
                              setResolution(null)
                            }}
                          />
                          <span>
                            <strong>{item.title}</strong>
                            <small>{item.explanation}</small>
                          </span>
                          <em>{`${Math.round(item.confidence * 100)}% 근거`}</em>
                        </label>
                      ))}
                    </div>

                    {selectedItem && group.items.some((item) => item.reviewItemId === selectedItem.reviewItemId) ? (
                      <div className="review-decision-area">
                        {selectedFlow ? (
                          <div className="review-flow-card" aria-label="검토 진행 순서">
                            <span className="review-flow-kicker">지금 결정할 항목</span>
                            <div className="review-flow-route">
                              <div className="review-flow-node">
                                <small>{selectedFlow.sourceLabel}</small>
                                <strong>{selectedFlow.sourceValue}</strong>
                              </div>
                              <span className="review-flow-arrow" aria-hidden="true">→</span>
                              <div className="review-flow-node">
                                <small>{selectedFlow.targetLabel}</small>
                                <strong>{selectedFlow.targetValue}</strong>
                              </div>
                              <span className="review-flow-arrow" aria-hidden="true">→</span>
                              <div className="review-flow-node review-flow-node-next">
                                <small>다음 단계</small>
                                <strong>{selectedFlow.decisionValue}</strong>
                              </div>
                            </div>
                            <p>{selectedFlow.detail}</p>
                          </div>
                        ) : null}
                        <div className="review-decision-actions">
                          {selectedResolutionItems.length > 1 ? (
                            <strong className="review-bulk-selection">{selectedResolutionItems.length}개에 함께 적용</strong>
                          ) : null}
                          {selectedItem.recommendation === 'add_to_platform' ? (
                            <button type="button" className="primary-button" disabled={!hasCompatibleRecommendations} onClick={() => beginDecision('apply_recommendation')}>
                              {selectedItem.kind === 'option_only_on_platform' ? '일반 메뉴 추가 대상으로 표시' : '추가 대상으로 표시'}
                            </button>
                          ) : null}
                          <button type="button" className="secondary-button" disabled={!hasCompatibleRecommendations} onClick={() => beginDecision('exclude_platform')}>
                            의도적으로 제외
                          </button>
                          <button type="button" className="secondary-button" disabled={!hasCompatibleRecommendations} onClick={() => beginDecision('defer')}>
                            나중에 결정
                          </button>
                          <details>
                            <summary>근거 보기</summary>
                            <pre>{formatEvidence(selectedItem.evidenceJson)}</pre>
                          </details>
                        </div>

                        {resolution ? (
                          <div className="review-decision-form">
                            <label className="review-remember-control">
                              <input
                                type="checkbox"
                                checked={remember}
                                onChange={(event) => setRemember(event.target.checked)}
                              />
                              앞으로 같은 경우에도 적용
                            </label>
                            {remember ? (
                              <label>
                                적용 범위
                                <select value={scope} onChange={(event) => setScope(event.target.value as CatalogIntentRule['scope'])}>
                                  <option value="entity">이 메뉴만</option>
                                  <option value="platform">이 플랫폼 전체</option>
                                  <option value="category">같은 분류</option>
                                  <option value="field">같은 항목</option>
                                  <option value="workspace">매장 전체</option>
                                </select>
                              </label>
                            ) : null}
                            <label>
                              결정 이유
                              <input value={reason} onChange={(event) => setReason(event.target.value)} />
                            </label>
                            <button type="button" className="primary-button" disabled={isSaving || !reason.trim()} onClick={() => void saveDecision()}>
                              {isSaving ? '저장 중…' : '결정 저장'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}
