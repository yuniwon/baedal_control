import { useEffect, useMemo, useState } from 'react'
import type { LogicalOptionGroupRecord } from '../../../shared/contracts'
import { OptionGroupTable } from '../components/OptionGroupTable'
import { appApi } from '../lib/api'

type OptionFilter = 'all' | 'merge-candidate' | 'missing' | 'absent' | 'resurfaced'

const getFilterLabel = (
  key: OptionFilter,
  groups: LogicalOptionGroupRecord[]
) => {
  const counts = {
    all: groups.length,
    'merge-candidate': groups.filter((group) => group.status === 'merge_candidate').length,
    missing: groups.filter((group) => group.status === 'missing_suspected').length,
    absent: groups.filter((group) => group.status === 'absent_confirmed').length,
    resurfaced: groups.filter((group) => group.status === 'resurfaced').length
  }

  if (key === 'merge-candidate') {
    return `통합 가능 ${counts[key]}`
  }

  if (key === 'missing') {
    return `원본 누락 의심 ${counts[key]}`
  }

  if (key === 'absent') {
    return `플랫폼에 없음 ${counts[key]}`
  }

  if (key === 'resurfaced') {
    return `재등장 ${counts[key]}`
  }

  return `전체 ${counts[key]}`
}

export const OptionPage = () => {
  const [groups, setGroups] = useState<LogicalOptionGroupRecord[]>([])
  const [filter, setFilter] = useState<OptionFilter>('all')

  useEffect(() => {
    void appApi.logicalOptionGroups.list().then((value) => {
      setGroups(Array.isArray(value) ? (value as LogicalOptionGroupRecord[]) : [])
    })
  }, [])

  const filteredGroups = useMemo(() => {
    if (filter === 'merge-candidate') {
      return groups.filter((group) => group.status === 'merge_candidate')
    }

    if (filter === 'missing') {
      return groups.filter((group) => group.status === 'missing_suspected')
    }

    if (filter === 'absent') {
      return groups.filter((group) => group.status === 'absent_confirmed')
    }

    if (filter === 'resurfaced') {
      return groups.filter((group) => group.status === 'resurfaced')
    }

    return groups
  }, [filter, groups])

  const filterKeys: OptionFilter[] = ['all', 'merge-candidate', 'missing', 'absent', 'resurfaced']

  return (
    <section className="page">
      <header className="page-header">
        <h1>옵션 관리</h1>
        <p>같은 구성의 옵션은 한 묶음으로 보고, 사라진 옵션은 별도로 추적합니다.</p>
      </header>

      <section className="panel">
        {groups.length ? (
          <div className="menu-filter-list">
            {filterKeys.map((key) => (
              <button
                className={filter === key ? 'primary-button' : 'secondary-button'}
                key={key}
                onClick={() => setFilter(key)}
                type="button"
              >
                {getFilterLabel(key, groups)}
              </button>
            ))}
          </div>
        ) : null}
        <OptionGroupTable groups={filteredGroups} />
      </section>
    </section>
  )
}
