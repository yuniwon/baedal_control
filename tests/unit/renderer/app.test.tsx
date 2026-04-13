import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/renderer/src/pages/DashboardPage', () => ({
  DashboardPage: () => <h1>대시보드</h1>
}))

vi.mock('../../../src/renderer/src/pages/MenuPage', () => ({
  MenuPage: () => <h1>메뉴 관리</h1>
}))

vi.mock('../../../src/renderer/src/pages/OptionPage', () => ({
  OptionPage: () => <h1>옵션 관리</h1>
}))

vi.mock('../../../src/renderer/src/pages/MappingPage', () => ({
  MappingPage: () => <h1>매핑 검토</h1>
}))

vi.mock('../../../src/renderer/src/pages/SettingsPage', () => ({
  SettingsPage: () => <h1>계정 연결</h1>
}))

vi.mock('../../../src/renderer/src/pages/HistoryPage', () => ({
  HistoryPage: () => <h1>실행 기록</h1>
}))

import App from '../../../src/renderer/src/App'

describe('App navigation', () => {
  it('shows the option management tab and opens the page', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '옵션 관리' }))

    expect(await screen.findByRole('heading', { name: '옵션 관리' })).toBeTruthy()
  })
})
