import type { PlatformCode } from './platforms'

export type PlatformAuthStrategy =
  | 'official_api'
  | 'reuse_managed_session'
  | 'reuse_extension_session'
  | 'embedded_credential_login'
  | 'managed_credential_login'
  | 'managed_password_manager_login'
  | 'manual_authentication'

export interface PlatformCapabilityManifest {
  schemaVersion: 1
  operations: {
    read: boolean
    project: boolean
    write: boolean
    verify: boolean
  }
  catalog: {
    menus: boolean
    menuCreation: 'verified' | 'inspection_only' | 'unsupported'
    optionGroups: boolean
    optionBindings: boolean
    images: boolean
    promotions: boolean
  }
  authentication: {
    strategies: readonly PlatformAuthStrategy[]
    persistentProfile: boolean
    userChallengePossible: boolean
    authenticatedPathPatterns: readonly string[]
  }
}

const reusableCredentialStrategies = [
  'reuse_managed_session',
  'reuse_extension_session',
  'embedded_credential_login',
  'managed_credential_login',
  'manual_authentication'
] as const

const reusablePasswordManagerStrategies = [
  'reuse_managed_session',
  'reuse_extension_session',
  'managed_password_manager_login',
  'manual_authentication'
] as const

const manifest = (
  operations: PlatformCapabilityManifest['operations'],
  catalog: PlatformCapabilityManifest['catalog'],
  strategies: readonly PlatformAuthStrategy[] = reusableCredentialStrategies,
  authenticatedPathPatterns: readonly string[] = []
): PlatformCapabilityManifest => ({
  schemaVersion: 1,
  operations,
  catalog,
  authentication: {
    strategies,
    persistentProfile: true,
    userChallengePossible: true,
    authenticatedPathPatterns
  }
})

export const PLATFORM_CAPABILITIES: Record<PlatformCode, PlatformCapabilityManifest> = {
  baemin: manifest(
    { read: true, project: true, write: true, verify: true },
    { menus: true, menuCreation: 'inspection_only', optionGroups: true, optionBindings: true, images: false, promotions: false },
    reusableCredentialStrategies,
    ['^/menu(?:/|$)']
  ),
  yogiyo: manifest(
    { read: true, project: true, write: false, verify: true },
    { menus: true, menuCreation: 'unsupported', optionGroups: true, optionBindings: true, images: false, promotions: false },
    reusableCredentialStrategies,
    ['^/(?:menu|option)(?:/|$)']
  ),
  coupangeats: manifest(
    { read: true, project: true, write: true, verify: true },
    { menus: true, menuCreation: 'unsupported', optionGroups: true, optionBindings: true, images: false, promotions: false },
    reusablePasswordManagerStrategies,
    ['^/merchant/management(?:/|$)']
  ),
  ddangyo: manifest(
    { read: true, project: true, write: true, verify: true },
    { menus: true, menuCreation: 'unsupported', optionGroups: true, optionBindings: true, images: false, promotions: false }
  ),
  deliveryspecial: manifest(
    { read: true, project: true, write: false, verify: true },
    { menus: true, menuCreation: 'unsupported', optionGroups: true, optionBindings: true, images: false, promotions: false },
    reusableCredentialStrategies,
    ['^/(?:shop|product|info|order|custom)(?:/|$)']
  ),
  naverorder: manifest(
    { read: false, project: true, write: false, verify: false },
    { menus: false, menuCreation: 'unsupported', optionGroups: false, optionBindings: false, images: false, promotions: false },
    [
      'reuse_managed_session',
      'reuse_extension_session',
      'managed_credential_login',
      'manual_authentication'
    ]
  )
}
