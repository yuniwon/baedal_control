import type { CatalogMenuListItem } from '../../lib/catalog-workspace-view'

interface Props { items: CatalogMenuListItem[]; categories: string[]; selected: string | null; onSelect: (value: string | null) => void }
export const CategoryRail = ({ items, categories, selected, onSelect }: Props) => (
  <aside className="category-rail" aria-label="메뉴 카테고리">
    <button className={!selected ? 'active' : ''} onClick={() => onSelect(null)} type="button"><span>전체 메뉴</span><b>{items.length}</b></button>
    {categories.map((category) => (
      <button className={selected === category ? 'active' : ''} key={category} onClick={() => onSelect(category)} type="button">
        <span>{category}</span><b>{items.filter((item) => item.categoryName === category).length}</b>
      </button>
    ))}
  </aside>
)
