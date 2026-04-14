import { useEffect, useMemo, useState } from 'react'
import type { LogicalOptionGroupRecord } from '../../../shared/contracts'
import { OptionGroupTable } from '../components/OptionGroupTable'
import { appApi } from '../lib/api'

type OptionFilter =
  | 'all'
  | 'merge-candidate'
  | 'shape-conflict'
  | 'missing'
  | 'absent'
  | 'resurfaced'

const normalizeSearchValue = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR')
const buildOptionSearchTokens = (
  options: LogicalOptionGroupRecord['logicalOptions']
) =>
  options.flatMap((option) => [
    option.optionName,
    String(option.optionPrice),
    `${option.optionPrice.toLocaleString('ko-KR')}원`
  ])

const getFilterLabel = (
  key: OptionFilter,
  groups: LogicalOptionGroupRecord[]
) => {
  const counts = {
    all: groups.length,
    'merge-candidate': groups.filter((group) => group.status === 'merge_candidate').length,
    'shape-conflict': groups.filter((group) => group.status === 'shape_conflict').length,
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

  if (key === 'shape-conflict') {
    return `구성 다름 ${counts[key]}`
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
  const [search, setSearch] = useState('')

  useEffect(() => {
    void appApi.logicalOptionGroups.list().then((value) => {
      setGroups(Array.isArray(value) ? (value as LogicalOptionGroupRecord[]) : [])
    })
  }, [])

  const filteredGroups = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(search)

    return groups
      .filter((group) => {
        if (filter === 'merge-candidate') {
          return group.status === 'merge_candidate'
        }

        if (filter === 'shape-conflict') {
          return group.status === 'shape_conflict'
        }

        if (filter === 'missing') {
          return group.status === 'missing_suspected'
        }

        if (filter === 'absent') {
          return group.status === 'absent_confirmed'
        }

        if (filter === 'resurfaced') {
          return group.status === 'resurfaced'
        }

        return true
      })
      .filter((group) => {
        if (!normalizedSearch) {
          return true
        }

        const searchableText = normalizeSearchValue(
          [
            group.displayName,
            ...group.sampleOptionNames,
            ...buildOptionSearchTokens(group.logicalOptions),
            ...group.sourceGroups.map((sourceGroup) => sourceGroup.optionGroupName),
            ...group.sourceGroups.flatMap((sourceGroup) => sourceGroup.linkedMenuNames),
            ...group.sourceGroups.flatMap((sourceGroup) =>
              buildOptionSearchTokens(sourceGroup.options)
            )
          ].join(' ')
        )

        return searchableText.includes(normalizedSearch)
      })
  }, [filter, groups, search])

  const filterKeys: OptionFilter[] = [
    'all',
    'merge-candidate',
    'shape-conflict',
    'missing',
    'absent',
    'resurfaced'
  ]

  const summary = {
    total: groups.length,
    merge: groups.filter((group) => group.status === 'merge_candidate').length,
    conflict: groups.filter((group) => group.status === 'shape_conflict').length
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>옵션 관리</h1>
        <p>같은 구성의 옵션은 한 묶음으로 보고, 사라진 옵션은 별도로 추적합니다.</p>
      </header>

      <section className="panel panel-flat">
        {!!groups.length && (
          <div className="workspace-summary">
            <article className="change-summary-row">
              <strong>{summary.total}</strong>
              <span>옵션 묶음</span>
            </article>
            <article className="change-summary-row">
              <strong>{summary.merge}</strong>
              <span>통합 후보</span>
            </article>
            <article className="change-summary-row">
              <strong>{summary.conflict}</strong>
              <span>구성 충돌</span>
            </article>
          </div>
        )}
        {groups.length ? (
          <div className="panel-toolbar">
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
            <label className="toolbar-search">
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="옵션명, 가격 또는 연결 메뉴 검색"
                type="search"
                value={search}
              />
            </label>
          </div>
        ) : null}
        <OptionGroupTable groups={filteredGroups} />
      </section>
    </section>
  )
}
