import { useEffect, useState } from 'react'
import type { CatalogWorkspaceRecord } from '../../shared/contracts'
import './App.css'
import { DashboardPage } from './pages/DashboardPage'
import { HistoryPage } from './pages/HistoryPage'
import { MappingPage } from './pages/MappingPage'
import { SettingsPage } from './pages/SettingsPage'
import { CatalogOnboardingPage } from './pages/CatalogOnboardingPage'
import { ReviewInboxPage } from './pages/ReviewInboxPage'
import { UnifiedMenuPage } from './pages/UnifiedMenuPage'
import { appApi } from './lib/api'
import type { AppRoute } from './app/routes'
import { AppShell } from './components/AppShell'

const WorkspaceShell = ({ workspace }: { workspace: CatalogWorkspaceRecord }) => {
  const [route, setRoute] = useState<AppRoute>('home')
  const [reviewCount, setReviewCount] = useState(0)
  const [latestImportAt, setLatestImportAt] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      appApi.catalogReviews?.listOpen?.() ?? Promise.resolve([]),
      appApi.platformImportRuns?.list?.() ?? Promise.resolve([])
    ]).then(([reviews, imports]) => {
      setReviewCount(reviews.length)
      const latest = [...imports]
        .filter((item) => item.status === 'completed')
        .sort((left, right) => (right.finishedAt ?? right.startedAt).localeCompare(left.finishedAt ?? left.startedAt))[0]
      setLatestImportAt(latest?.finishedAt ?? latest?.startedAt ?? null)
    }).catch(() => undefined)
  }, [])

  return (
    <AppShell workspaceName={workspace.displayName} catalogVersion={workspace.canonicalVersion} reviewCount={reviewCount} latestImportAt={latestImportAt} route={route} onNavigate={setRoute}>
        {route === 'home' && <DashboardPage />}
        {route === 'catalog' && <UnifiedMenuPage />}
        {route === 'reviews' && <ReviewInboxPage />}
        {route === 'mappings' && <MappingPage />}
        {route === 'imports' && <SettingsPage />}
        {route === 'history' && <HistoryPage />}
    </AppShell>
  )
}

export default function App() {
  const [workspace, setWorkspace] = useState<CatalogWorkspaceRecord | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    void appApi.catalogWorkspace.get()
      .then(setWorkspace)
      .catch((error) => setLoadError(error instanceof Error ? error.message : '통합 메뉴 상태를 확인하지 못했습니다.'))
  }, [])

  if (loadError) {
    return <main className="catalog-workspace-error" role="alert">{loadError}</main>
  }
  if (!workspace) {
    return <main className="catalog-workspace-loading" role="status">통합 메뉴 상태 확인 중</main>
  }
  if (workspace.lifecycleState !== 'active') {
    return <CatalogOnboardingPage workspace={workspace} onActivated={setWorkspace} />
  }

  return <WorkspaceShell workspace={workspace} />
}
