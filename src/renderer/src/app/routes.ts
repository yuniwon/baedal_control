export type AppRoute =
  | 'home'
  | 'catalog'
  | 'reviews'
  | 'imports'
  | 'mappings'
  | 'history'
  | 'backup'

export const primaryRoutes: readonly AppRoute[] = ['home', 'catalog', 'reviews', 'imports']
export const advancedRoutes: readonly AppRoute[] = ['mappings', 'history']

export const getRouteLabel = (route: AppRoute) => {
  switch (route) {
    case 'home':
      return '홈'
    case 'catalog':
      return '통합메뉴'
    case 'reviews':
      return '검토함'
    case 'imports':
      return '가져오기'
    case 'mappings':
      return '연결'
    case 'history':
      return '기록'
    case 'backup':
      return '백업 및 내보내기'
  }
}
