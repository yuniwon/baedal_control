export const PLATFORM_CODES = [
  'baemin',
  'yogiyo',
  'coupangeats',
  'ddangyo',
  'deliveryspecial',
  'naverorder'
] as const

export type PlatformCode = (typeof PLATFORM_CODES)[number]

export type PlatformAuthenticationPreference =
  | 'credential_first'
  | 'managed_session_first'

export interface PlatformMetadata {
  label: string
  loginUrl: string
  managementHosts: readonly string[]
  authenticationPreference: PlatformAuthenticationPreference
}

export const PLATFORM_METADATA: Record<PlatformCode, PlatformMetadata> = {
  baemin: {
    label: '배민',
    loginUrl:
      'https://biz-member.baemin.com/login?returnUrl=https%3A%2F%2Fself.baemin.com%2Fmenu',
    managementHosts: ['biz-member.baemin.com', 'self.baemin.com'],
    authenticationPreference: 'credential_first'
  },
  yogiyo: {
    label: '요기요',
    loginUrl: 'https://ceo.yogiyo.co.kr/login/',
    managementHosts: ['ceo.yogiyo.co.kr', 'owner.yogiyo.co.kr'],
    authenticationPreference: 'credential_first'
  },
  coupangeats: {
    label: '쿠팡이츠',
    loginUrl: 'https://store.coupangeats.com/merchant/login',
    managementHosts: ['store.coupangeats.com'],
    authenticationPreference: 'managed_session_first'
  },
  ddangyo: {
    label: '땡겨요',
    loginUrl: 'https://boss.ddangyo.com/',
    managementHosts: ['boss.ddangyo.com'],
    authenticationPreference: 'credential_first'
  },
  deliveryspecial: {
    label: '배달특급',
    loginUrl: 'https://partner.payco.kr/user/login',
    managementHosts: ['partner.payco.kr', 'specialdelivery.co.kr'],
    authenticationPreference: 'credential_first'
  },
  naverorder: {
    label: '네이버주문',
    loginUrl: 'https://new.smartplace.naver.com/',
    managementHosts: ['new.smartplace.naver.com', 'smartplace.naver.com'],
    authenticationPreference: 'managed_session_first'
  }
}

export const isPlatformCode = (value: unknown): value is PlatformCode =>
  typeof value === 'string' && (PLATFORM_CODES as readonly string[]).includes(value)

export const getPlatformLabel = (platformCode: PlatformCode) =>
  PLATFORM_METADATA[platformCode].label

export type CatalogSeedCompleteness = 'complete' | 'incomplete' | 'unknown'

export const getEligibleCatalogSeedPlatforms = (
  completenessByPlatform: Partial<Record<PlatformCode, CatalogSeedCompleteness>>
) => PLATFORM_CODES.filter((platformCode) => completenessByPlatform[platformCode] === 'complete')

export const inferPlatformCodeFromHost = (host: string): PlatformCode | null => {
  const normalizedHost = host.trim().toLowerCase()

  for (const platformCode of PLATFORM_CODES) {
    if (
      PLATFORM_METADATA[platformCode].managementHosts.some(
        (candidate) =>
          normalizedHost === candidate || normalizedHost.endsWith(`.${candidate}`)
      )
    ) {
      return platformCode
    }
  }

  return null
}
