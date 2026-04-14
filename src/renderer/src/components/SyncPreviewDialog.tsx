import { useEffect, useMemo, useState } from 'react'
import type { SyncPreviewItem } from '../../../shared/contracts'
import { serializePlatformMenuPriceVariants } from '../../../shared/platform-menu-price-variants'
import { summarizeSyncPreviewItemChange } from '../../../shared/sync-preview-item-change'
import { getPlatformLabel } from '../lib/menu-source-labels'

const DETAIL_LINE_COLLAPSE_LIMIT = 72
const TARGET_SUMMARY_COLLAPSE_LIMIT = 36

const getPreviewItemKey = (item: SyncPreviewItem) =>
  JSON.stringify({
    platformCode: item.platformCode,
    menuId: item.menuId,
    platformMenuId: item.platformMenuId,
    previousName: item.previousName,
    previousPrice: item.previousPrice ?? null,
    previousPriceVariants: serializePlatformMenuPriceVariants(item.previousPriceVariants),
    nextName: item.nextName,
    nextPrice: item.nextPrice,
    nextPriceVariants: serializePlatformMenuPriceVariants(item.nextPriceVariants),
    executionMode: item.executionMode ?? null
  })

const buildPreviewInputId = (item: SyncPreviewItem, index: number) =>
  `sync-preview-${index}-${item.platformCode}-${String(item.platformMenuId).replace(/[^a-zA-Z0-9_-]+/g, '-')}`

const truncateText = (value: string, maxLength: number) =>
  value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`

export const SyncPreviewDialog = ({
  items,
  onConfirm
}: {
  items: SyncPreviewItem[]
  onConfirm: (items: SyncPreviewItem[]) => void
}) => {
  const previewEntries = useMemo(
    () =>
      items.map((item, index) => ({
        item,
        key: getPreviewItemKey(item),
        inputId: buildPreviewInputId(item, index)
      })),
    [items]
  )
  const [selectedKeys, setSelectedKeys] = useState(() => new Set(previewEntries.map(({ key }) => key)))
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setSelectedKeys(new Set(previewEntries.map(({ key }) => key)))
    setExpandedKeys((current) => {
      const next = new Set<string>()
      const validKeys = new Set(previewEntries.map(({ key }) => key))
      for (const key of current) {
        if (validKeys.has(key)) {
          next.add(key)
        }
      }
      return next
    })
  }, [previewEntries])

  const selectedItems = useMemo(
    () =>
      previewEntries
        .filter(({ key }) => selectedKeys.has(key))
        .map(({ item }) => item),
    [previewEntries, selectedKeys]
  )

  const toggleItem = (key: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const toggleExpanded = (key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <section className="panel">
      <div className="page-header">
        <h2>반영 확인</h2>
        <p>선택한 메뉴만 반영합니다. 무엇이 바뀌는지와 반영값만 먼저 확인하세요.</p>
      </div>
      <div className="inline-actions preview-actions">
        <span>{`전체 ${items.length}건 · 선택 ${selectedItems.length}건`}</span>
        <div className="inline-actions">
          <button
            className="secondary-button"
            onClick={() => setSelectedKeys(new Set(previewEntries.map(({ key }) => key)))}
            type="button"
          >
            전체 선택
          </button>
          <button
            className="secondary-button"
            onClick={() => setSelectedKeys(new Set())}
            type="button"
          >
            선택 해제
          </button>
        </div>
      </div>
      <div className="preview-list">
        {previewEntries.map(({ item, key, inputId }) => {
          const checked = selectedKeys.has(key)
          const expanded = expandedKeys.has(key)
          const changeSummary = summarizeSyncPreviewItemChange(item)
          const isCollapsible =
            changeSummary.detailLines.length > 1 ||
            changeSummary.detailLines.some((line) => line.length > DETAIL_LINE_COLLAPSE_LIMIT) ||
            (changeSummary.targetSummary?.length ?? 0) > TARGET_SUMMARY_COLLAPSE_LIMIT
          const visibleDetailLines = expanded
            ? changeSummary.detailLines
            : changeSummary.detailLines
                .slice(0, 1)
                .map((line) => truncateText(line, DETAIL_LINE_COLLAPSE_LIMIT))
          const targetSummary = expanded
            ? changeSummary.targetSummary ?? '-'
            : truncateText(changeSummary.targetSummary ?? '-', TARGET_SUMMARY_COLLAPSE_LIMIT)

          return (
            <article key={`${item.platformCode}:${item.platformMenuId}`} className="preview-row">
              <input
                id={inputId}
                aria-label={`${item.nextName} 선택`}
                checked={checked}
                onChange={() => toggleItem(key)}
                type="checkbox"
              />
              <div className="preview-copy">
                <label className="preview-main" htmlFor={inputId}>
                  <strong>{item.nextName}</strong>
                  <span>{`${getPlatformLabel(item.platformCode)} · ${changeSummary.headline}`}</span>
                  {changeSummary.targetSummary ? (
                    <span className="preview-target">{`반영값 ${targetSummary}`}</span>
                  ) : null}
                  {visibleDetailLines.map((line) => (
                    <span key={`${item.platformCode}:${item.platformMenuId}:${line}`}>{line}</span>
                  ))}
                </label>
                <div className="preview-row-actions">
                  {item.executionMode === 'managed_browser' ? (
                    <span className="status-pill pending preview-mode-pill">현재 탭</span>
                  ) : null}
                  {isCollapsible ? (
                    <button
                      aria-expanded={expanded}
                      className="secondary-button preview-detail-toggle"
                      onClick={() => toggleExpanded(key)}
                      type="button"
                    >
                      {expanded ? '접기' : '상세 보기'}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </div>
      <div className="inline-actions preview-actions">
        <button
          className="primary-button"
          disabled={selectedItems.length === 0}
          onClick={() => onConfirm(selectedItems)}
          type="button"
        >
          {`선택 ${selectedItems.length}건 반영`}
        </button>
      </div>
    </section>
  )
}
