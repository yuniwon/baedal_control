import type { PlatformCode } from '../../shared/contracts'
import type { PlatformAuthStrategy } from '../../shared/platform-capabilities'

const reuseStrategies = new Set<PlatformAuthStrategy>([
  'official_api',
  'reuse_managed_session',
  'reuse_extension_session'
])

const credentialStrategies = new Set<PlatformAuthStrategy>([
  'embedded_credential_login',
  'managed_credential_login',
  'managed_password_manager_login'
])

const applicationCredentialStrategies = new Set<PlatformAuthStrategy>([
  'embedded_credential_login',
  'managed_credential_login'
])

export const requiresApplicationCredential = (
  strategies: readonly PlatformAuthStrategy[]
) => strategies.some((strategy) => applicationCredentialStrategies.has(strategy))

export const validatePlatformSessionStrategyOrder = (
  strategies: readonly PlatformAuthStrategy[]
): PlatformAuthStrategy[] => {
  let credentialSeen = false
  for (const [index, strategy] of strategies.entries()) {
    if (credentialStrategies.has(strategy)) {
      credentialSeen = true
    }
    if (credentialSeen && reuseStrategies.has(strategy)) {
      throw new Error('invalid_platform_session_strategy_order')
    }
    if (strategy === 'manual_authentication' && index !== strategies.length - 1) {
      throw new Error('invalid_platform_session_strategy_order')
    }
  }
  return [...strategies]
}

const singleTabCatalogPlatforms = new Set<PlatformCode>(['yogiyo', 'deliveryspecial'])

export const selectManagedCatalogCaptureTabs = <T>(platformCode: PlatformCode, tabs: T[]): T[] =>
  singleTabCatalogPlatforms.has(platformCode) ? tabs.slice(0, 1) : tabs
