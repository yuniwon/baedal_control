import type { LogicalOptionGroupRecord } from '../../../shared/contracts'
import {
  formatDateTimeLabel,
  getPlatformLabel
} from '../lib/menu-source-labels'

const getOptionStatusLabel = (status: LogicalOptionGroupRecord['status']) => {
  if (status === 'merge_candidate') {
    return '통합 가능'
  }

  if (status === 'missing_suspected') {
    return '원본 누락 의심'
  }

  if (status === 'absent_confirmed') {
    return '플랫폼에 없음'
  }

  if (status === 'resurfaced') {
    return '재등장'
  }

  if (status === 'shape_conflict') {
    return '구성 다름'
  }

  return '단일 구성'
}

const getOptionStatusTone = (status: LogicalOptionGroupRecord['status']) => {
  if (status === 'absent_confirmed') {
    return 'danger'
  }

  if (status === 'missing_suspected') {
    return 'warning'
  }

  if (status === 'resurfaced') {
    return 'info'
  }

  if (status === 'shape_conflict') {
    return 'warning'
  }

  return 'success'
}

const getSourcePresenceLabel = (presenceStatus: LogicalOptionGroupRecord['sourceGroups'][number]['presenceStatus']) => {
  if (presenceStatus === 'absent_confirmed') {
    return '플랫폼에 없음'
  }

  if (presenceStatus === 'missing_suspected') {
    return '원본 누락 의심'
  }

  if (presenceStatus === 'resurfaced') {
    return '재등장'
  }

  return '확인됨'
}

const getSourcePresenceTone = (presenceStatus: LogicalOptionGroupRecord['sourceGroups'][number]['presenceStatus']) => {
  if (presenceStatus === 'absent_confirmed') {
    return 'danger'
  }

  if (presenceStatus === 'missing_suspected') {
    return 'warning'
  }

  if (presenceStatus === 'resurfaced') {
    return 'info'
  }

  return 'success'
}

const buildRuleSummary = (group: LogicalOptionGroupRecord) => {
  const min = group.minOrderQuantity
  const max = group.maxOrderQuantity

  if (typeof min === 'number' && min > 0 && typeof max === 'number') {
    return `선택 규칙 ${min}~${max}`
  }

  if (typeof min === 'number' && min > 0) {
    return `선택 규칙 최소 ${min}`
  }

  if (typeof max === 'number') {
    return `선택 규칙 최대 ${max}`
  }

  return '선택 규칙 자유'
}

const formatOptionPrice = (price: number) =>
  price > 0 ? `+${price.toLocaleString('ko-KR')}원` : '무료'

const buildLinkedMenuPreview = (linkedMenuNames: string[]) => {
  if (linkedMenuNames.length <= 3) {
    return linkedMenuNames.join(', ')
  }

  return `${linkedMenuNames.slice(0, 3).join(', ')} 외 ${linkedMenuNames.length - 3}개`
}

export const OptionGroupTable = ({
  groups,
  showSourceDetails = false
}: {
  groups: LogicalOptionGroupRecord[]
  showSourceDetails?: boolean
}) => {
  if (!groups.length) {
    return <p className="source-empty">조건에 맞는 옵션 묶음이 없습니다.</p>
  }

  return (
    <div className="option-group-list">
      {groups.map((group) => {
        const tone = getOptionStatusTone(group.status)

        return (
          <article className="option-group-card" key={group.logicalGroupKey}>
            <header className="option-group-header">
              <div className="option-group-title">
                <span className="candidate-kicker">{getPlatformLabel(group.platformCode)}</span>
                <h2>{group.displayName}</h2>
                <p className="source-detail">
                  {`${buildRuleSummary(group)} · 옵션 ${group.optionCount}개 · 연결 메뉴 ${group.connectedMenuCount}개 · 원본 그룹 ${group.sourceGroupCount}개`}
                </p>
              </div>
              <span className={`source-status-pill source-status-pill-${tone}`}>
                {getOptionStatusLabel(group.status)}
              </span>
            </header>
            <div className="option-group-structure">
              <div className="option-group-structure-head">
                <strong>구성</strong>
                <span>{`${group.logicalOptions.length}개 항목`}</span>
              </div>
              <div className="option-group-option-list">
                {group.logicalOptions.map((option) => (
                  <div
                    className="option-group-option-row"
                    key={`${group.logicalGroupKey}:${option.optionName}:${option.optionPrice}`}
                  >
                    <strong>{option.optionName}</strong>
                    <span>{formatOptionPrice(option.optionPrice)}</span>
                  </div>
                ))}
              </div>
            </div>
            {group.status === 'merge_candidate' ? (
              <p className="option-group-summary-note">
                구성이 같아서 나중에 하나의 공용 옵션으로 합칠 수 있는 후보입니다.
              </p>
            ) : null}
            {group.status === 'shape_conflict' ? (
              <p className="option-group-summary-note">
                옵션명은 같지만 실제 구성이나 가격이 달라 먼저 비교가 필요합니다.
              </p>
            ) : null}
            {showSourceDetails ? (
              <div className="option-group-source-list">
                {group.sourceGroups.map((sourceGroup, index) => (
                  <div className="option-group-source-item" key={`${group.logicalGroupKey}:${index}`}>
                    <div className="option-group-source-head">
                      <strong>{sourceGroup.optionGroupName}</strong>
                      <span
                        className={`source-status-pill source-status-pill-${getSourcePresenceTone(
                          sourceGroup.presenceStatus
                        )}`}
                      >
                        {getSourcePresenceLabel(sourceGroup.presenceStatus)}
                      </span>
                    </div>
                    <p className="source-detail">
                      {sourceGroup.linkedMenuNames.length
                        ? buildLinkedMenuPreview(sourceGroup.linkedMenuNames)
                        : '연결 메뉴 없음'}
                    </p>
                    <p className="source-note">
                      {`연결 메뉴 ${sourceGroup.linkedMenuCount}개`}
                    </p>
                    {sourceGroup.lastSeenAt ? (
                      <p className="source-note source-note-muted">
                        {`마지막 확인 ${formatDateTimeLabel(sourceGroup.lastSeenAt)}`}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
