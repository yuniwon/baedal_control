import { describe, expect, it } from 'vitest'

import {
  requiresApplicationCredential,
  validatePlatformSessionStrategyOrder,
  selectManagedCatalogCaptureTabs
} from '../../../src/main/services/platform-session-strategy'

describe('platform session strategy', () => {
  it('accepts a manifest order that reuses sessions before credentials and manual auth', () => {
    expect(validatePlatformSessionStrategyOrder([
      'reuse_managed_session',
      'reuse_extension_session',
      'managed_credential_login',
      'manual_authentication'
    ])).toEqual([
      'reuse_managed_session',
      'reuse_extension_session',
      'managed_credential_login',
      'manual_authentication'
    ])
  })

  it('rejects a manifest that submits credentials before session reuse', () => {
    expect(() => validatePlatformSessionStrategyOrder([
      'managed_credential_login',
      'reuse_managed_session'
    ])).toThrow('invalid_platform_session_strategy_order')
  })

  it('accepts password-manager login only after reusable session strategies', () => {
    expect(validatePlatformSessionStrategyOrder([
      'reuse_managed_session',
      'reuse_extension_session',
      'managed_password_manager_login',
      'manual_authentication'
    ])).toEqual([
      'reuse_managed_session',
      'reuse_extension_session',
      'managed_password_manager_login',
      'manual_authentication'
    ])
  })

  it('rejects password-manager login before reusable session strategies', () => {
    expect(() => validatePlatformSessionStrategyOrder([
      'managed_password_manager_login',
      'reuse_managed_session'
    ])).toThrow('invalid_platform_session_strategy_order')
  })

  it('does not require app credentials for a password-manager-only login stage', () => {
    expect(requiresApplicationCredential([
      'reuse_managed_session',
      'managed_password_manager_login',
      'manual_authentication'
    ])).toBe(false)
    expect(requiresApplicationCredential([
      'reuse_managed_session',
      'managed_credential_login',
      'manual_authentication'
    ])).toBe(true)
  })

  it('captures a full-catalog platform from only one authenticated tab', () => {
    const tabs = [
      { tabId: 'first', url: 'https://partner.payco.kr/shop/main' },
      { tabId: 'second', url: 'https://partner.payco.kr/product/menuBoard/shop/detail' }
    ]

    expect(selectManagedCatalogCaptureTabs('deliveryspecial', tabs)).toEqual([tabs[0]])
    expect(selectManagedCatalogCaptureTabs('yogiyo', tabs)).toEqual([tabs[0]])
  })

  it('keeps every tab for platforms whose menu and option pages are captured separately', () => {
    const tabs = [
      { tabId: 'menu', url: 'https://store.coupangeats.com/menu' },
      { tabId: 'option', url: 'https://store.coupangeats.com/options' }
    ]

    expect(selectManagedCatalogCaptureTabs('coupangeats', tabs)).toEqual(tabs)
  })
})
