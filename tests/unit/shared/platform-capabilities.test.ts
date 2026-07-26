import { describe, expect, it } from 'vitest'

import { PLATFORM_CAPABILITIES } from '../../../src/shared/platform-capabilities'
import { PLATFORM_CODES } from '../../../src/shared/platforms'

describe('platform capability manifests', () => {
  it('declares an operational manifest for every registered platform', () => {
    expect(Object.keys(PLATFORM_CAPABILITIES).sort()).toEqual([...PLATFORM_CODES].sort())
    expect(PLATFORM_CAPABILITIES.yogiyo.operations).toEqual({
      read: true,
      project: true,
      write: false,
      verify: true
    })
  })

  it('keeps unverified platform writes and the Naver skeleton disabled', () => {
    expect(PLATFORM_CAPABILITIES.deliveryspecial.operations.write).toBe(false)
    expect(PLATFORM_CAPABILITIES.naverorder.operations).toEqual({
      read: false,
      project: true,
      write: false,
      verify: false
    })
  })

  it('puts reusable sessions before credential submission', () => {
    expect(PLATFORM_CAPABILITIES.baemin.authentication.strategies.slice(0, 2)).toEqual([
      'reuse_managed_session',
      'reuse_extension_session'
    ])
    expect(PLATFORM_CAPABILITIES.coupangeats.authentication.strategies).not.toContain(
      'embedded_credential_login'
    )
  })

  it('uses Chrome Password Manager instead of app credentials for Coupang Eats', () => {
    expect(PLATFORM_CAPABILITIES.coupangeats.authentication.strategies).toEqual([
      'reuse_managed_session',
      'reuse_extension_session',
      'managed_password_manager_login',
      'manual_authentication'
    ])
    expect(PLATFORM_CAPABILITIES.coupangeats.authentication.strategies).not.toContain(
      'managed_credential_login'
    )
  })

  it('declares authenticated management paths as platform data', () => {
    expect(PLATFORM_CAPABILITIES.coupangeats.authentication.authenticatedPathPatterns).toContain(
      '^/merchant/management(?:/|$)'
    )
    expect(PLATFORM_CAPABILITIES.deliveryspecial.authentication.authenticatedPathPatterns).toContain(
      '^/(?:shop|product|info|order|custom)(?:/|$)'
    )
  })
})
