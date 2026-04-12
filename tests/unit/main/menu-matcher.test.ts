import { describe, expect, it } from 'vitest'
import { normalizeMenuName, scoreMenuMatch } from '../../../src/main/services/menu-matcher'

describe('menu matcher', () => {
  it('normalizes whitespace and punctuation', () => {
    expect(normalizeMenuName('콤비네이션   피자(L)')).toBe('콤비네이션피자l')
  })

  it('prefers exact normalized matches', () => {
    expect(scoreMenuMatch('콤비네이션 피자', '콤비네이션피자')).toBeGreaterThan(0.95)
  })
})
