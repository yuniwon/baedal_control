import { useEffect, useState } from 'react'
import { appApi } from '../lib/api'
import { MenuTable, type MenuRow } from '../components/MenuTable'

const initialMenus: MenuRow[] = [
  { menuId: 'm1', baseName: '콤비네이션', basePrice: 22900, isDirty: 0 },
  { menuId: 'm2', baseName: '페퍼로니', basePrice: 23900, isDirty: 0 }
]

export const MenuPage = () => {
  const [menus, setMenus] = useState<MenuRow[]>(initialMenus)

  useEffect(() => {
    void appApi.menus.list().then((value) => {
      if (Array.isArray(value) && value.length > 0) {
        setMenus(value as MenuRow[])
      }
    })
  }, [])

  const handleChange = (menuId: string, patch: Partial<MenuRow>) => {
    setMenus((current) =>
      current.map((menu) =>
        menu.menuId === menuId
          ? { ...menu, ...patch, isDirty: 1 }
          : menu
      )
    )
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>메뉴 관리</h1>
        <p>메뉴명과 가격을 수정하고, 반영 전에 변경된 항목만 확인합니다.</p>
      </header>

      <section className="panel">
        <MenuTable menus={menus} onChange={handleChange} />
      </section>
    </section>
  )
}
