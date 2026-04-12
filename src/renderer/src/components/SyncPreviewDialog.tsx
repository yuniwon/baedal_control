import type { SyncPreviewItem } from '../../../shared/contracts'

export const SyncPreviewDialog = ({
  items,
  onConfirm
}: {
  items: SyncPreviewItem[]
  onConfirm: () => void
}) => (
  <section className="panel">
    <div className="page-header">
      <h2>변경 예정</h2>
      <p>이 내용으로 각 플랫폼 메뉴명과 가격을 반영합니다.</p>
    </div>
    <div className="history-list">
      {items.map((item) => (
        <article key={`${item.platformCode}:${item.platformMenuId}`} className="history-row">
          <strong>{item.platformCode}</strong>
          <span>
            {item.nextName} / {item.nextPrice}
          </span>
        </article>
      ))}
    </div>
    <div className="inline-actions">
      <button className="primary-button" onClick={onConfirm}>
        실행
      </button>
    </div>
  </section>
)
