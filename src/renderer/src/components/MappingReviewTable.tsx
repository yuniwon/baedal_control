import { useEffect, useMemo, useState } from 'react'
import type { PlatformCode, PlatformMenuPriceVariantRecord } from '../../../shared/contracts'
import { flattenPlatformMenuPriceVariants } from '../lib/platform-menu-price-variants'
import { PLATFORM_CODES, getPlatformLabel } from '../../../shared/platforms'

export interface MappingCandidate {
  currentMappingId?: string
  currentMenuId?: string
  currentBaseName?: string
  platformCode: PlatformCode
  platformMenuId: string
  platformMenuName: string
  platformMenuGroupName?: string
  platformMenuStatus?: string
  platformMenuPriceSummary?: string
  platformMenuPriceVariants?: PlatformMenuPriceVariantRecord[]
  platformMenuBindingSummary?: string
  platformMenuBindingStatus?: string
  duplicateNameCount?: number
}

export interface MappingReviewRow {
  menuId: string
  baseName: string
  platformCode: PlatformCode
  platformMenuId?: string
  platformMenuName?: string
  platformMenuGroupName?: string
  platformMenuStatus?: string
  platformMenuPriceSummary?: string
  platformMenuPriceVariants?: PlatformMenuPriceVariantRecord[]
  platformMenuBindingSummary?: string
  platformMenuBindingStatus?: string
  duplicateNameCount?: number
  currentMappings?: MappingCandidate[]
}

const platformOrder: readonly PlatformCode[] = PLATFORM_CODES

const buildMetaItems = (input: {
  platformMenuStatus?: string
  platformMenuBindingStatus?: string
  platformMenuGroupName?: string
  platformMenuPriceSummary?: string
  duplicateNameCount?: number
  currentLabel?: string
}) =>
  [
    input.platformMenuStatus,
    input.platformMenuBindingStatus,
    input.platformMenuGroupName,
    input.platformMenuPriceSummary,
    input.duplicateNameCount && input.duplicateNameCount > 1
      ? `이름 중복 ${input.duplicateNameCount}개`
      : undefined,
    input.currentLabel
  ].filter(Boolean) as string[]

const buildSearchText = (candidate: MappingCandidate) =>
  [
    candidate.platformMenuName,
    candidate.currentBaseName,
    candidate.platformMenuStatus,
    candidate.platformMenuBindingStatus,
    candidate.platformMenuBindingSummary,
    candidate.platformMenuGroupName,
    ...flattenPlatformMenuPriceVariants(candidate.platformMenuPriceVariants)
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const scoreCandidate = (
  row: MappingReviewRow,
  candidate: MappingCandidate,
  query: string
) => {
  const normalizedQuery = query.replace(/\s+/g, ' ').trim().toLowerCase()
  const searchText = buildSearchText(candidate)
  const tokens = (normalizedQuery || row.baseName.toLowerCase())
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)

  if (!tokens.length) {
    return 0
  }

  let score = 0
  for (const token of tokens) {
    if (!searchText.includes(token)) {
      return -1
    }

    score += candidate.platformMenuName.toLowerCase().includes(token) ? 4 : 2
  }

  if (candidate.platformMenuBindingStatus === '연결 정상') {
    score += 2
  }

  if (candidate.platformMenuName.replace(/\s+/g, '') === row.baseName.replace(/\s+/g, '')) {
    score += 3
  }

  if (candidate.currentMappingId === `${row.menuId}:${row.platformCode}`) {
    score += 1
  }

  return score
}

const buildSearchDrafts = (rows: MappingReviewRow[]) =>
  Object.fromEntries(
    rows.map((row) => [`${row.menuId}:${row.platformCode}`, ''])
  ) as Record<string, string>

const buildGroups = (rows: MappingReviewRow[]) =>
  [...rows]
    .sort(
      (left, right) =>
        left.baseName.localeCompare(right.baseName, 'ko-KR') ||
        platformOrder.indexOf(left.platformCode) - platformOrder.indexOf(right.platformCode)
    )
    .reduce<Array<{ menuId: string; baseName: string; rows: MappingReviewRow[] }>>(
      (groups, row) => {
        const current = groups[groups.length - 1]
        if (current?.menuId === row.menuId) {
          current.rows.push(row)
          return groups
        }

        groups.push({
          menuId: row.menuId,
          baseName: row.baseName,
          rows: [row]
        })
        return groups
      },
      []
    )

export const MappingReviewTable = ({
  rows,
  catalog,
  showDetails = false,
  onSelectCandidate,
  onClear
}: {
  rows: MappingReviewRow[]
  catalog: Record<PlatformCode, MappingCandidate[]>
  showDetails?: boolean
  onSelectCandidate: (
    menuId: string,
    platformCode: PlatformCode,
    candidate: MappingCandidate
  ) => void
  onClear: (mappingId: string) => void
}) => {
  const [drafts, setDrafts] = useState<Record<string, string>>(() => buildSearchDrafts(rows))

  useEffect(() => {
    setDrafts(buildSearchDrafts(rows))
  }, [rows])

  const groups = useMemo(() => buildGroups(rows), [rows])

  return (
    <div className="mapping-group-list">
      {groups.map((group) => (
        <section className="mapping-group-card" key={group.menuId}>
          <header className="mapping-group-header">
            <h2>{group.baseName}</h2>
            <span>{`플랫폼 ${group.rows.length}개 · 연결 ${group.rows.filter((row) => row.platformMenuId).length}개`}</span>
          </header>

          <div className="mapping-platform-list">
            {group.rows.map((row) => {
              const rowKey = `${row.menuId}:${row.platformCode}`
              const currentMappings = row.currentMappings ?? (row.platformMenuId ? [{
                currentMappingId: rowKey,
                currentMenuId: row.menuId,
                currentBaseName: row.baseName,
                platformCode: row.platformCode,
                platformMenuId: row.platformMenuId,
                platformMenuName: row.platformMenuName ?? '',
                platformMenuGroupName: row.platformMenuGroupName,
                platformMenuStatus: row.platformMenuStatus,
                platformMenuPriceSummary: row.platformMenuPriceSummary,
                platformMenuPriceVariants: row.platformMenuPriceVariants,
                platformMenuBindingSummary: row.platformMenuBindingSummary,
                platformMenuBindingStatus: row.platformMenuBindingStatus,
                duplicateNameCount: row.duplicateNameCount
              }] : [])
              const query = drafts[rowKey] ?? ''
              const candidates = catalog[row.platformCode]
                .map((candidate) => ({
                  candidate,
                  score: scoreCandidate(row, candidate, query)
                }))
                .filter((item) => item.score >= 0)
                .sort((left, right) => right.score - left.score)
                .slice(0, 5)
                .map((item) => item.candidate)

              return (
                <article
                  className={`mapping-platform-row${currentMappings.length ? ' has-current' : ''}`}
                  data-platform-row={rowKey}
                  key={rowKey}
                >
                  <div className="mapping-platform-label">{getPlatformLabel(row.platformCode)}</div>

                  <section className="mapping-column">
                    <strong className="mapping-column-title">후보 선택</strong>
                    <div className="source-list">
                      <input
                        aria-label={`${row.menuId}-${row.platformCode}-search`}
                        autoComplete="off"
                        name={`${row.menuId}-${row.platformCode}-search`}
                        placeholder="플랫폼 메뉴 검색"
                        value={query}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [rowKey]: event.target.value
                          }))
                        }
                      />
                      {candidates.length ? (
                        <div className="candidate-list">
                          {candidates.map((candidate) => {
                            const isCurrent = candidate.currentMenuId === row.menuId
                            const metaItems = buildMetaItems({
                              platformMenuStatus: candidate.platformMenuStatus,
                              platformMenuBindingStatus: candidate.platformMenuBindingStatus,
                              platformMenuGroupName: candidate.platformMenuGroupName,
                              platformMenuPriceSummary: candidate.platformMenuPriceSummary,
                              duplicateNameCount: candidate.duplicateNameCount,
                              currentLabel: isCurrent
                                ? '현재 연결'
                                : candidate.currentBaseName
                                  ? `현재 ${candidate.currentBaseName}`
                                  : undefined
                            })

                            return (
                              <button
                                aria-label={`${candidate.platformMenuName} 선택`}
                                className={`secondary-button candidate-button${isCurrent ? ' active' : ''}`}
                                key={`${rowKey}:${candidate.platformMenuId}`}
                                onClick={() =>
                                  onSelectCandidate(row.menuId, row.platformCode, candidate)
                                }
                                type="button"
                              >
                                <strong>{candidate.platformMenuName}</strong>
                                {metaItems.length ? (
                                  <span className="meta-chip-list">
                                    {metaItems.map((item) => (
                                      <span
                                        className="meta-chip"
                                        key={`${rowKey}:${candidate.platformMenuId}:${item}`}
                                      >
                                        {item}
                                      </span>
                                    ))}
                                  </span>
                                ) : null}
                                {showDetails && candidate.platformMenuBindingSummary ? (
                                  <span className="candidate-note">
                                    {candidate.platformMenuBindingSummary}
                                  </span>
                                ) : null}
                                {showDetails && candidate.platformMenuPriceVariants?.length ? (
                                  <span className="candidate-price-variant-list">
                                    {flattenPlatformMenuPriceVariants(
                                      candidate.platformMenuPriceVariants
                                    )
                                      .slice(0, 3)
                                      .map((line) => (
                                        <span
                                          className="candidate-price-variant-line"
                                          key={`${rowKey}:${candidate.platformMenuId}:${line}`}
                                        >
                                          {line}
                                        </span>
                                      ))}
                                  </span>
                                ) : null}
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <span className="source-empty">조건에 맞는 후보가 없습니다.</span>
                      )}
                    </div>
                  </section>

                  <section
                    className={`mapping-column current-connection-card${currentMappings.length ? '' : ' empty'}`}
                  >
                    <strong className="mapping-column-title">현재 연결</strong>
                    {currentMappings.length ? (
                      <div className="source-list">
                        {currentMappings.map((mapping) => (
                          <div className="source-item current-connection-item" key={mapping.currentMappingId}>
                            <div className="source-header">
                              <p className="source-line">{getPlatformLabel(row.platformCode)}</p>
                              <p className="source-title">{mapping.platformMenuName}</p>
                            </div>
                            <div className="meta-chip-list">
                              {buildMetaItems({
                                platformMenuStatus: mapping.platformMenuStatus,
                                platformMenuBindingStatus: mapping.platformMenuBindingStatus,
                                platformMenuGroupName: mapping.platformMenuGroupName,
                                platformMenuPriceSummary: mapping.platformMenuPriceSummary,
                                duplicateNameCount: mapping.duplicateNameCount
                              }).map((item) => (
                                <span className="meta-chip" key={`${mapping.currentMappingId}:${item}`}>
                                  {item}
                                </span>
                              ))}
                            </div>
                            {showDetails && mapping.platformMenuBindingSummary ? (
                              <p className="source-note">{mapping.platformMenuBindingSummary}</p>
                            ) : null}
                            {showDetails && mapping.platformMenuPriceVariants?.length ? (
                              <div className="source-price-variant-list">
                                {flattenPlatformMenuPriceVariants(mapping.platformMenuPriceVariants)
                                  .slice(0, 4)
                                  .map((line) => (
                                    <p className="source-price-variant-line" key={`${mapping.currentMappingId}:${line}`}>
                                      {line}
                                    </p>
                                  ))}
                              </div>
                            ) : null}
                            <button
                              aria-label={`${mapping.currentMappingId}-clear`}
                              className="secondary-button table-button"
                              onClick={() => onClear(mapping.currentMappingId ?? rowKey)}
                              type="button"
                            >
                              연결 해제
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="source-empty">아직 저장된 상세 정보가 없습니다.</span>
                    )}
                  </section>
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
