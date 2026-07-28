import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/renderer/src/lib/api', () => ({
  appApi: {
    catalogWorkspace: {
      get: vi.fn().mockResolvedValue({
        workspaceId: 'default',
        displayName: '기본 매장',
        lifecycleState: 'active',
        seedMode: 'legacy',
        seedPlatformCode: null,
        canonicalVersion: 1
      })
    }
  }
}))

vi.mock('../../../src/renderer/src/pages/DashboardPage', () => ({
  DashboardPage: () => <h1>대시보드</h1>
}))

vi.mock('../../../src/renderer/src/pages/MenuPage', () => ({
  MenuPage: () => <h1>메뉴 관리</h1>
}))

vi.mock('../../../src/renderer/src/pages/UnifiedMenuPage', () => ({
  UnifiedMenuPage: () => <h1>통합메뉴 관리</h1>
}))

vi.mock('../../../src/renderer/src/pages/ReviewInboxPage', () => ({
  ReviewInboxPage: () => <h1>검토함</h1>
}))

vi.mock('../../../src/renderer/src/pages/OptionPage', () => ({
  OptionPage: () => <h1>옵션 관리</h1>
}))

vi.mock('../../../src/renderer/src/pages/MappingPage', () => ({
  MappingPage: () => <h1>연결</h1>
}))

vi.mock('../../../src/renderer/src/pages/SettingsPage', () => ({
  SettingsPage: () => <h1>가져오기</h1>
}))

vi.mock('../../../src/renderer/src/pages/HistoryPage', () => ({
  HistoryPage: () => <h1>기록</h1>
}))

import App from '../../../src/renderer/src/App'

describe('App navigation', () => {
  it('shows task-first navigation and keeps advanced pages collapsed until requested', async () => {
    render(<App />)

    expect(await screen.findByRole('button', { name: '홈' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '통합메뉴' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '검토함' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '가져오기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '옵션' })).toBeNull()
    expect(screen.queryByRole('button', { name: '연결' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '통합메뉴' }))
    expect(await screen.findByRole('heading', { name: '통합메뉴 관리' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '검토함' }))
    expect(await screen.findByRole('heading', { name: '검토함' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '고급 기능 보기' }))
    fireEvent.click(await screen.findByRole('button', { name: '연결' }))

    expect(await screen.findByRole('heading', { name: '연결' })).toBeTruthy()
  })
})
