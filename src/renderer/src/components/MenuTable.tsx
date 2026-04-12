import { useEffect, useState } from 'react'

export type MenuRow = {
  menuId: string
  baseName: string
  basePrice: number
  isDirty: number
}

type MenuDraft = Pick<MenuRow, 'baseName' | 'basePrice'>

const buildDrafts = (menus: MenuRow[]) =>
  Object.fromEntries(
    menus.map((menu) => [menu.menuId, { baseName: menu.baseName, basePrice: menu.basePrice }])
  ) as Record<string, MenuDraft>

export const MenuTable = ({
  menus,
  onChange
}: {
  menus: MenuRow[]
  onChange: (menuId: string, patch: Partial<MenuRow>) => void
}) => {
  const [drafts, setDrafts] = useState<Record<string, MenuDraft>>(() => buildDrafts(menus))

  useEffect(() => {
    setDrafts(buildDrafts(menus))
  }, [menus])

  const updateDraft = (menuId: string, patch: Partial<MenuDraft>) => {
    const sourceMenu = menus.find((menu) => menu.menuId === menuId)
    const baseDraft = drafts[menuId] ?? {
      baseName: sourceMenu?.baseName ?? '',
      basePrice: sourceMenu?.basePrice ?? 0
    }
    const nextDraft = { ...baseDraft, ...patch }

    setDrafts((current) => ({ ...current, [menuId]: nextDraft }))
    onChange(menuId, nextDraft)
  }

  return (
    <table className="menu-table">
      <thead>
        <tr>
          <th>메뉴명</th>
          <th>가격</th>
        </tr>
      </thead>
      <tbody>
        {menus.map((menu) => {
          const draft = drafts[menu.menuId] ?? { baseName: menu.baseName, basePrice: menu.basePrice }

          return (
            <tr key={menu.menuId}>
              <td>
                <input
                  aria-label={`${menu.menuId}-name`}
                  value={draft.baseName}
                  onChange={(event) => updateDraft(menu.menuId, { baseName: event.target.value })}
                />
              </td>
              <td>
                <input
                  aria-label={`${menu.menuId}-price`}
                  value={String(draft.basePrice)}
                  onChange={(event) =>
                    updateDraft(menu.menuId, { basePrice: Number(event.target.value) })
                  }
                />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
