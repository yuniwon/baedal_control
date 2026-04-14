import { useEffect, useMemo, useState } from 'react'
import type { SyncPreviewItem } from '../../../shared/contracts'
import { serializePlatformMenuPriceVariants } from '../../../shared/platform-menu-price-variants'
import { summarizeSyncPreviewItemChange } from '../../../shared/sync-preview-item-change'
import { getPlatformLabel } from '../lib/menu-source-labels'

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

export const SyncPreviewDialog = ({
  items,
  onConfirm
}: {
  items: SyncPreviewItem[]
  onConfirm: (items: SyncPreviewItem[]) => void
}) => {
  const [selectedKeys, setSelectedKeys] = useState(() => new Set(items.map(getPreviewItemKey)))

  useEffect(() => {
    setSelectedKeys(new Set(items.map(getPreviewItemKey)))
  }, [items])

  const selectedItems = useMemo(
    () => items.filter((item) => selectedKeys.has(getPreviewItemKey(item))),
    [items, selectedKeys]
  )

  const toggleItem = (item: SyncPreviewItem) => {
    const key = getPreviewItemKey(item)
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

  return (
    <section className="panel">
      <div className="page-header">
        <h2>변경 예정</h2>
        <p>선택한 메뉴만 반영합니다. 현재 판매 중인 메뉴를 다시 확인한 뒤 실행하세요.</p>
      </div>
      <div className="inline-actions preview-actions">
        <span>{`전체 ${items.length}건 · 선택 ${selectedItems.length}건`}</span>
        <div className="inline-actions">
          <button
            className="secondary-button"
            onClick={() => setSelectedKeys(new Set(items.map(getPreviewItemKey)))}
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
        {items.map((item) => {
          const checked = selectedKeys.has(getPreviewItemKey(item))
          const changeSummary = summarizeSyncPreviewItemChange(item)

          return (
            <label key={`${item.platformCode}:${item.platformMenuId}`} className="preview-row">
              <input
                aria-label={`${item.nextName} 선택`}
                checked={checked}
                onChange={() => toggleItem(item)}
                type="checkbox"
              />
              <div className="preview-copy">
                <strong>{item.nextName}</strong>
                <span>{`${getPlatformLabel(item.platformCode)} · ${changeSummary.headline}`}</span>
                {changeSummary.detailLines.map((line) => (
                  <span key={`${item.platformCode}:${item.platformMenuId}:${line}`}>{line}</span>
                ))}
                {item.executionMode === 'managed_browser' ? <span>현재 탭 반영</span> : null}
              </div>
              <div className="preview-price">
                <strong>{changeSummary.targetSummary ?? '-'}</strong>
                <span>{changeSummary.headline}</span>
              </div>
            </label>
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
          {`선택 ${selectedItems.length}건 실행`}
        </button>
      </div>
    </section>
  )
}
