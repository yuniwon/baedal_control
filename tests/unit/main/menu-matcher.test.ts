import { describe, expect, it } from 'vitest'
import {
  buildAutoLinkKey,
  isSafeAutoLinkMatch,
  normalizeMenuName,
  scoreMenuMatch
} from '../../../src/main/services/menu-matcher'

describe('menu matcher', () => {
  it('normalizes whitespace and punctuation', () => {
    expect(normalizeMenuName('콤비네이션   피자(L)')).toBe('콤비네이션피자l')
  })

  it('prefers exact normalized matches', () => {
    expect(scoreMenuMatch('콤비네이션 피자', '콤비네이션피자')).toBeGreaterThan(0.95)
  })

  it('builds conservative auto-link keys for harmless trailing detail only', () => {
    expect(buildAutoLinkKey('Set 1 (피자M 스파게티 콜라)')).toBe('set1')
    expect(buildAutoLinkKey('사이다(500ml/1.25L)')).toBe('사이다')
    expect(buildAutoLinkKey('갈릭소스 1개')).toBe('갈릭소스')
  })

  it('accepts safe variants and rejects loose overlap matches for auto-linking', () => {
    expect(isSafeAutoLinkMatch('Set 1', 'Set 1 (피자M 스파게티 콜라)')).toBe(true)
    expect(isSafeAutoLinkMatch('사이다', '사이다(500ml/1.25L)')).toBe(true)
    expect(isSafeAutoLinkMatch('갈릭소스 1개', '갈릭소스')).toBe(true)
    expect(isSafeAutoLinkMatch('콜라', 'Set. 3(피자M 스파게티 훈제치킨 콜라)')).toBe(false)
    expect(isSafeAutoLinkMatch('국산 피클 1개', '피클')).toBe(false)
  })
})
