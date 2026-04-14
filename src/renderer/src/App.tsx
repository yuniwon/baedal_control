import { useState } from 'react'
import './App.css'
import { DashboardPage } from './pages/DashboardPage'
import { HistoryPage } from './pages/HistoryPage'
import { MappingPage } from './pages/MappingPage'
import { MenuPage } from './pages/MenuPage'
import { OptionPage } from './pages/OptionPage'
import { SettingsPage } from './pages/SettingsPage'

const primaryTabs = ['home', 'menus', 'options', 'imports'] as const
const advancedTabs = ['mapping', 'history'] as const

type AppTab = (typeof primaryTabs)[number] | (typeof advancedTabs)[number]

const getTabLabel = (tab: AppTab) => {
  switch (tab) {
    case 'home':
      return '홈'
    case 'menus':
      return '메뉴'
    case 'options':
      return '옵션'
    case 'imports':
      return '가져오기'
    case 'mapping':
      return '매핑 검토'
    case 'history':
      return '실행 기록'
  }
}

export default function App() {
  const [tab, setTab] = useState<AppTab>('home')
  const [showAdvancedNav, setShowAdvancedNav] = useState(false)

  const renderNavButton = (value: AppTab) => (
    <button
      key={value}
      className={value === tab ? 'nav-button active' : 'nav-button'}
      onClick={() => setTab(value)}
      type="button"
    >
      {getTabLabel(value)}
    </button>
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>배달앱 메뉴 동기화</strong>
          <span>한 곳에서 수정하고 한번에 반영</span>
        </div>
        <nav className="nav">
          <div className="nav-section">{primaryTabs.map(renderNavButton)}</div>
          <div className="nav-section">
            <button
              className="nav-button nav-secondary-toggle"
              onClick={() =>
                setShowAdvancedNav((current) => {
                  const nextValue = !current
                  if (!nextValue && advancedTabs.includes(tab as (typeof advancedTabs)[number])) {
                    setTab('home')
                  }
                  return nextValue
                })
              }
              type="button"
            >
              {showAdvancedNav ? '고급 기능 숨기기' : '고급 기능 보기'}
            </button>
            {showAdvancedNav ? advancedTabs.map(renderNavButton) : null}
          </div>
        </nav>
      </aside>
      <main className="content">
        {tab === 'home' && <DashboardPage />}
        {tab === 'menus' && <MenuPage />}
        {tab === 'options' && <OptionPage />}
        {tab === 'mapping' && <MappingPage />}
        {tab === 'imports' && <SettingsPage />}
        {tab === 'history' && <HistoryPage />}
      </main>
    </div>
  )
}
