import type { CatalogMenuListItem } from '../../lib/catalog-workspace-view'

interface Props { items: CatalogMenuListItem[]; selectedId: string | null; onSelect: (item: CatalogMenuListItem) => void }
export const MenuListPane = ({ items, selectedId, onSelect }: Props) => (
  <section className="menu-list-pane" aria-label="메뉴 목록">
    <div className="menu-list-heading"><strong>메뉴 {items.length}개</strong><span>이름 · 가격 · 연결 상태</span></div>
    <div className="menu-compact-list">
      {items.map((item) => (
        <button
          aria-label={`${item.baseName}, ${item.priceSummary}`}
          className={selectedId === item.menuId ? 'menu-list-row selected' : 'menu-list-row'}
          key={item.menuId}
          onClick={() => onSelect(item)}
          type="button"
        >
          <span className="menu-row-main"><strong>{item.baseName}</strong><small>{item.categoryName}</small></span>
          <span className="menu-row-price">{item.priceSummary}</span>
          <span className="menu-row-meta">{item.connectedPlatformCount}개 앱</span>
          {item.issueCount ? <span className="issue-badge">확인 {item.issueCount}</span> : <span className="ok-badge">정상</span>}
        </button>
      ))}
      {!items.length ? <div className="menu-empty"><strong>조건에 맞는 메뉴가 없습니다.</strong><span>검색어나 필터를 바꿔보세요.</span></div> : null}
    </div>
  </section>
)
