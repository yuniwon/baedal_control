import type {
  CatalogPublicationPlanItem,
  CatalogPublicationPreview,
  CatalogPublicationPreviewInput,
  PlatformMenuMappingRecord,
  PlatformCode
} from './contracts'
import { PLATFORM_CAPABILITIES } from './platform-capabilities'
import { getPlatformLabel } from './platforms'

export interface CatalogPublicationBuilderInput extends CatalogPublicationPreviewInput {
  mappings: PlatformMenuMappingRecord[]
  generatedAt?: string
}

const buildItem = (
  input: CatalogPublicationBuilderInput,
  platformCode: PlatformCode
): CatalogPublicationPlanItem => {
  const existing = input.mappings.some((mapping) =>
    mapping.menuId === input.menu.menuId
    && mapping.platformCode === platformCode
    && mapping.mappingStatus !== 'source_absent'
    && mapping.isConfirmed === 1
  )
  if (existing) {
    return {
      platformCode,
      intent: 'publish',
      disposition: 'already_connected',
      canAutoCreate: false,
      title: `${getPlatformLabel(platformCode)}에 이미 연결됨`,
      detail: '새 메뉴를 만들지 않고 현재 연결을 유지합니다.',
      blockers: []
    }
  }

  const capabilities = PLATFORM_CAPABILITIES[platformCode]
  if (!capabilities.catalog.menus || !capabilities.operations.read) {
    return {
      platformCode,
      intent: 'publish',
      disposition: 'blocked',
      canAutoCreate: false,
      title: `${getPlatformLabel(platformCode)} 메뉴 생성 차단`,
      detail: '메뉴 원본 수집과 생성 흐름이 확인되지 않아 자동 등록하지 않습니다.',
      blockers: ['platform_catalog_unavailable']
    }
  }

  if (capabilities.catalog.menuCreation === 'verified') {
    return {
      platformCode,
      intent: 'publish',
      disposition: 'automatic',
      canAutoCreate: true,
      title: `${getPlatformLabel(platformCode)} 자동 등록 가능`,
      detail: '검증된 메뉴 생성 writer가 있어 승인 후 자동 등록할 수 있습니다.',
      blockers: []
    }
  }

  return {
    platformCode,
    intent: 'publish',
    disposition: 'manual',
    canAutoCreate: false,
    title: `${getPlatformLabel(platformCode)} 수동 등록 필요`,
    detail: capabilities.catalog.menuCreation === 'inspection_only'
      ? '생성 화면은 확인했지만 최종 저장과 재수집 검증이 끝나지 않았습니다.'
      : '메뉴 생성 writer가 아직 연결되지 않았습니다.',
    blockers: ['menu_creation_not_verified']
  }
}

export const buildCatalogPublicationPreview = (
  input: CatalogPublicationBuilderInput
): CatalogPublicationPreview => {
  const items = input.targetPlatformCodes.map((platformCode) => buildItem(input, platformCode))
  return {
    menuId: input.menu.menuId,
    menuName: input.menu.baseName,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    items,
    summary: {
      total: items.length,
      automatic: items.filter((item) => item.disposition === 'automatic').length,
      manual: items.filter((item) => item.disposition === 'manual').length,
      blocked: items.filter((item) => item.disposition === 'blocked').length,
      alreadyConnected: items.filter((item) => item.disposition === 'already_connected').length
    }
  }
}
