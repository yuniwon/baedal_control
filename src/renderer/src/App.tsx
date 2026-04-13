import { useState } from 'react'
import './App.css'
import { DashboardPage } from './pages/DashboardPage'
import { HistoryPage } from './pages/HistoryPage'
import { MappingPage } from './pages/MappingPage'
import { MenuPage } from './pages/MenuPage'
import { OptionPage } from './pages/OptionPage'
import { SettingsPage } from './pages/SettingsPage'

const tabs = ['dashboard', 'menus', 'options', 'mapping', 'settings', 'history'] as const

type AppTab = (typeof tabs)[number]

export default function App() {
  const [tab, setTab] = useState<AppTab>('dashboard')

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>배달앱 메뉴 동기화</strong>
          <span>한 곳에서 수정하고 한번에 반영</span>
        </div>
        <nav className="nav">
          {tabs.map((value) => (
            <button
              key={value}
              className={value === tab ? 'nav-button active' : 'nav-button'}
              onClick={() => setTab(value)}
            >
              {value === 'dashboard' && '대시보드'}
              {value === 'menus' && '메뉴 관리'}
              {value === 'options' && '옵션 관리'}
              {value === 'mapping' && '매핑 검토'}
              {value === 'settings' && '계정 연결'}
              {value === 'history' && '실행 기록'}
            </button>
          ))}
        </nav>
      </aside>
      <main className="content">
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'menus' && <MenuPage />}
        {tab === 'options' && <OptionPage />}
        {tab === 'mapping' && <MappingPage />}
        {tab === 'settings' && <SettingsPage />}
        {tab === 'history' && <HistoryPage />}
      </main>
    </div>
  )
}
