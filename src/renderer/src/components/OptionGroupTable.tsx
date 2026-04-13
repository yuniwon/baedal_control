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

export const OptionGroupTable = ({ groups }: { groups: LogicalOptionGroupRecord[] }) => {
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
            <div className="meta-chip-list">
              {group.sampleOptionNames.map((name) => (
                <span className="meta-chip" key={`${group.logicalGroupKey}:${name}`}>
                  {name}
                </span>
              ))}
            </div>
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
                      ? sourceGroup.linkedMenuNames.join(', ')
                      : '연결 메뉴 없음'}
                  </p>
                  {sourceGroup.lastSeenAt ? (
                    <p className="source-note source-note-muted">
                      {`마지막 확인 ${formatDateTimeLabel(sourceGroup.lastSeenAt)}`}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        )
      })}
    </div>
  )
}
