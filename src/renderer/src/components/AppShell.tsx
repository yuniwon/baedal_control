import { useState, type ReactNode } from 'react'
import { advancedRoutes, getRouteLabel, primaryRoutes, type AppRoute } from '../app/routes'
import { WorkspaceStatusBar } from './WorkspaceStatusBar'

interface AppShellProps {
  workspaceName: string
  catalogVersion: number
  reviewCount: number
  latestImportAt?: string | null
  route: AppRoute
  onNavigate: (route: AppRoute) => void
  children: ReactNode
}

export const AppShell = ({
  workspaceName,
  catalogVersion,
  reviewCount,
  latestImportAt,
  route,
  onNavigate,
  children
}: AppShellProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const renderButton = (value: AppRoute) => (
    <button
      key={value}
      className={value === route ? 'nav-button active' : 'nav-button'}
      aria-label={getRouteLabel(value)}
      aria-current={value === route ? 'page' : undefined}
      onClick={() => onNavigate(value)}
      type="button"
    >
      <span className="nav-dot" aria-hidden="true" />
      {getRouteLabel(value)}
      {value === 'reviews' && reviewCount > 0 ? <span className="nav-count">{reviewCount}</span> : null}
    </button>
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">B</span>
          <div><strong>배달 컨트롤</strong><span>통합 메뉴 관리</span></div>
        </div>
        <div className="workspace-card">
          <span>현재 매장</span>
          <strong>{workspaceName}</strong>
        </div>
        <nav className="nav" aria-label="주요 화면">
          <div className="nav-section">{primaryRoutes.map(renderButton)}</div>
          <div className="nav-section nav-advanced">
            <button className="nav-button nav-secondary-toggle" onClick={() => setShowAdvanced((value) => !value)} type="button">
              <span aria-hidden="true">•••</span>{showAdvanced ? '고급 기능 숨기기' : '고급 기능 보기'}
            </button>
            {showAdvanced ? advancedRoutes.map(renderButton) : null}
          </div>
        </nav>
        <div className="sidebar-footer">플랫폼 변경은 검토 후 반영됩니다.</div>
      </aside>
      <section className="workspace-frame">
        <header className="workspace-topbar">
          <WorkspaceStatusBar catalogVersion={catalogVersion} reviewCount={reviewCount} latestImportAt={latestImportAt} />
        </header>
        <main className="content">{children}</main>
      </section>
    </div>
  )
}
