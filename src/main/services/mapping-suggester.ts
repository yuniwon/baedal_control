import { scoreMenuMatch } from './menu-matcher'

export const suggestMappings = (
  menus: Array<{ menuId: string; baseName: string }>,
  platformMenus: Array<{ platformMenuId: string; platformMenuName: string }>
) =>
  menus.flatMap((menu) => {
    const best = [...platformMenus]
      .map((platformMenu) => ({
        ...platformMenu,
        score: scoreMenuMatch(menu.baseName, platformMenu.platformMenuName)
      }))
      .sort((left, right) => right.score - left.score)[0]

    return best && best.score >= 0.9
      ? [
          {
            menuId: menu.menuId,
            platformMenuId: best.platformMenuId,
            platformMenuName: best.platformMenuName,
            matchedBy: 'auto' as const
          }
        ]
      : []
  })
