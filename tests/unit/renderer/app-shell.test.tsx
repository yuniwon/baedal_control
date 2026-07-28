import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from '../../../src/renderer/src/components/AppShell'

describe('AppShell', () => {
  it('keeps store context and catalog health visible around the current task', () => {
    const onNavigate = vi.fn()

    render(
      <AppShell
        workspaceName="강남점"
        catalogVersion={7}
        reviewCount={3}
        latestImportAt="2026-07-28T05:30:00.000Z"
        route="catalog"
        onNavigate={onNavigate}
      >
        <h1>통합메뉴</h1>
      </AppShell>
    )

    expect(screen.getByText('강남점')).toBeTruthy()
    expect(screen.getByText('버전 7')).toBeTruthy()
    expect(screen.getByText('검토 3건')).toBeTruthy()
    expect(screen.getByRole('button', { name: '통합메뉴' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('heading', { name: '통합메뉴' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '검토함' }))
    expect(onNavigate).toHaveBeenCalledWith('reviews')
  })
})
