import { useEffect, useState } from 'react'
import type {
  CatalogPresenceStatus,
  PlatformCode,
  PlatformMappingStatus,
  PlatformMenuPriceVariantRecord
} from '../../../shared/contracts'
import {
  describeMenuSourceStatus,
  formatDateTimeLabel,
  getPlatformLabel
} from '../lib/menu-source-labels'
import { flattenPlatformMenuPriceVariants } from '../lib/platform-menu-price-variants'

export type MenuSourceInfo = {
  platformCode: PlatformCode
  platformMenuId: string
  platformMenuName: string
  mappingStatus?: PlatformMappingStatus
  presenceStatus?: CatalogPresenceStatus
  lastSeenAt?: string | null
  platformMenuGroupName?: string
  platformMenuStatus?: string
  platformMenuPriceSummary?: string
  platformMenuPriceVariants?: PlatformMenuPriceVariantRecord[]
  platformMenuBindingSummary?: string
  platformMenuBindingStatus?: string
  duplicateNameCount?: number
  optionGroups?: MenuSourceOptionGroupInfo[]
}

export type MenuSourceOptionGroupInfo = {
  optionGroupId: string
  optionGroupName: string
  minOrderQuantity?: number | null
  maxOrderQuantity?: number | null
  mappingMenusCount?: number | null
  optionCount: number
  sampleOptionNames: string[]
}

export type MenuRow = {
  menuId: string
  baseName: string
  basePrice: number
  basePriceVariants?: PlatformMenuPriceVariantRecord[] | null
  isDirty: number
  isManaged?: number
  categoryName?: string
  sources?: MenuSourceInfo[]
}

type MenuDraft = Pick<MenuRow, 'baseName' | 'basePrice' | 'basePriceVariants'>

const clonePriceVariants = (variants?: PlatformMenuPriceVariantRecord[] | null) =>
  variants?.map((variant) => ({
    ...variant,
    channels: variant.channels.map((channel) => ({ ...channel }))
  })) ?? null

const buildAmountText = (amount?: number | null) =>
  typeof amount === 'number' ? `${amount.toLocaleString('ko-KR')}원` : '-'

const deriveBasePriceFromVariants = (
  variants?: PlatformMenuPriceVariantRecord[] | null,
  fallback = 0
) =>
  variants
    ?.flatMap((variant) => variant.channels)
    .find((channel) => typeof channel.amount === 'number')?.amount ?? fallback

const buildDrafts = (menus: MenuRow[]) =>
  Object.fromEntries(
    menus.map((menu) => [
      menu.menuId,
      {
        baseName: menu.baseName,
        basePrice: menu.basePrice,
        basePriceVariants: clonePriceVariants(menu.basePriceVariants)
      }
    ])
  ) as Record<string, MenuDraft>

const buildSourceMetaItems = (source: MenuSourceInfo) =>
  [
    source.platformMenuStatus,
    source.platformMenuBindingStatus,
    source.platformMenuGroupName,
    source.platformMenuPriceSummary,
    source.optionGroups?.length ? `옵션그룹 ${source.optionGroups.length}개` : undefined,
    source.duplicateNameCount && source.duplicateNameCount > 1
      ? `이름 중복 ${source.duplicateNameCount}개`
      : undefined
  ].filter(Boolean) as string[]

const buildOptionRuleLabel = (optionGroup: MenuSourceOptionGroupInfo) => {
  const min = optionGroup.minOrderQuantity
  const max = optionGroup.maxOrderQuantity

  if (typeof min === 'number' && min > 0 && typeof max === 'number') {
    return `필수 ${min}~${max}`
  }

  if (typeof min === 'number' && min > 0) {
    return `필수 최소 ${min}개`
  }

  if (typeof max === 'number') {
    return `최대 ${max}개`
  }

  return '선택'
}

const buildOptionSampleLabel = (optionGroup: MenuSourceOptionGroupInfo) => {
  if (!optionGroup.sampleOptionNames.length) {
    return `옵션 ${optionGroup.optionCount}개`
  }

  if (optionGroup.optionCount > optionGroup.sampleOptionNames.length) {
    return `${optionGroup.sampleOptionNames.join(', ')} 외 ${
      optionGroup.optionCount - optionGroup.sampleOptionNames.length
    }개`
  }

  return optionGroup.sampleOptionNames.join(', ')
}

export const MenuTable = ({
  menus,
  onChange,
  onDelete
}: {
  menus: MenuRow[]
  onChange: (menuId: string, patch: Partial<MenuRow>) => void
  onDelete: (menuId: string) => void
}) => {
  const [drafts, setDrafts] = useState<Record<string, MenuDraft>>(() => buildDrafts(menus))

  useEffect(() => {
    setDrafts(buildDrafts(menus))
  }, [menus])

  const updateDraft = (menuId: string, patch: Partial<MenuDraft>) => {
    const sourceMenu = menus.find((menu) => menu.menuId === menuId)
    const baseDraft = drafts[menuId] ?? {
      baseName: sourceMenu?.baseName ?? '',
      basePrice: sourceMenu?.basePrice ?? 0,
      basePriceVariants: clonePriceVariants(sourceMenu?.basePriceVariants)
    }
    const nextDraft = { ...baseDraft, ...patch }
    const payload = nextDraft.basePriceVariants?.length
      ? nextDraft
      : { baseName: nextDraft.baseName, basePrice: nextDraft.basePrice }

    setDrafts((current) => ({ ...current, [menuId]: nextDraft }))
    onChange(menuId, payload)
  }

  return (
    <table className="menu-table menu-management-table">
      <colgroup>
        <col className="menu-table-manage-col" />
        <col className="menu-table-name-col" />
        <col className="menu-table-price-col" />
        <col className="menu-table-source-col" />
      </colgroup>
      <thead>
        <tr>
          <th>관리</th>
          <th>메뉴명</th>
          <th>가격</th>
          <th>원본 정보</th>
        </tr>
      </thead>
      <tbody>
        {menus.map((menu) => {
          const draft = drafts[menu.menuId] ?? { baseName: menu.baseName, basePrice: menu.basePrice }
          const hasVariantEditor = (draft.basePriceVariants?.length ?? 0) > 1

          return (
            <tr
              className={(menu.isManaged ?? 1) === 0 ? 'menu-row menu-row-muted' : 'menu-row'}
              key={menu.menuId}
            >
              <td>
                <div className="table-action-stack">
                  <button
                    className="secondary-button table-button"
                    onClick={() =>
                      onChange(menu.menuId, { isManaged: (menu.isManaged ?? 1) ? 0 : 1 })
                    }
                    type="button"
                  >
                    {(menu.isManaged ?? 1) ? '관리 제외' : '다시 포함'}
                  </button>
                  {!menu.sources?.length ? (
                    <button
                      aria-label={`${menu.menuId}-delete`}
                      className="secondary-button table-button danger-button"
                      onClick={() => onDelete(menu.menuId)}
                      type="button"
                    >
                      삭제
                    </button>
                  ) : null}
                </div>
              </td>
              <td>
                <input
                  autoComplete="off"
                  aria-label={`${menu.menuId}-name`}
                  className="menu-name-input"
                  name={`${menu.menuId}-name`}
                  value={draft.baseName}
                  onChange={(event) => updateDraft(menu.menuId, { baseName: event.target.value })}
                />
              </td>
              <td>
                {hasVariantEditor ? (
                  <div className="menu-variant-editor">
                    {draft.basePriceVariants?.map((variant, variantIndex) => (
                      <div
                        className="menu-variant-block"
                        key={`${menu.menuId}:${variant.variantLabel ?? 'base'}:${variantIndex}`}
                      >
                        <p className="menu-variant-label">{variant.variantLabel?.trim() || '기본'}</p>
                        <div className="menu-variant-channel-list">
                          {variant.channels.map((channel, channelIndex) => (
                            <label
                              className="menu-variant-channel"
                              key={`${menu.menuId}:${variantIndex}:${channel.channelCode}:${channelIndex}`}
                            >
                              <span>{channel.channelLabel}</span>
                              <input
                                autoComplete="off"
                                aria-label={`${menu.menuId}-price-${variantIndex}-${channel.channelCode}`}
                                className="menu-price-input menu-price-input-variant"
                                inputMode="numeric"
                                name={`${menu.menuId}-price-${variantIndex}-${channel.channelCode}`}
                                type="number"
                                value={String(channel.amount ?? 0)}
                                onChange={(event) => {
                                  const nextAmount = event.target.value.trim()
                                    ? Number(event.target.value)
                                    : 0
                                  const nextVariants = clonePriceVariants(draft.basePriceVariants) ?? []
                                  const targetVariant = nextVariants[variantIndex]
                                  const targetChannel = targetVariant?.channels[channelIndex]

                                  if (!targetChannel) {
                                    return
                                  }

                                  targetChannel.amount = nextAmount
                                  targetChannel.amountText = buildAmountText(nextAmount)

                                  updateDraft(menu.menuId, {
                                    basePrice: deriveBasePriceFromVariants(nextVariants, draft.basePrice),
                                    basePriceVariants: nextVariants
                                  })
                                }}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <input
                    autoComplete="off"
                    aria-label={`${menu.menuId}-price`}
                    className="menu-price-input"
                    inputMode="numeric"
                    name={`${menu.menuId}-price`}
                    type="number"
                    value={String(draft.basePrice)}
                    onChange={(event) =>
                      updateDraft(menu.menuId, {
                        basePrice: event.target.value.trim() ? Number(event.target.value) : 0
                      })
                    }
                  />
                )}
              </td>
              <td>
                {menu.sources?.length ? (
                  <div className="source-list">
                    {menu.sources.map((source) => {
                      const status = describeMenuSourceStatus(source)
                      const metaItems = buildSourceMetaItems(source)

                      return (
                        <div
                          className={`source-item source-item-${status.tone}`}
                          key={`${source.platformCode}:${source.platformMenuId}`}
                        >
                          <div className="source-header">
                            <span className={`source-status-pill source-status-pill-${status.tone}`}>
                              {status.label}
                            </span>
                            <p className="source-line">{getPlatformLabel(source.platformCode)}</p>
                            <p className="source-title">{source.platformMenuName}</p>
                          </div>
                          {metaItems.length ? (
                            <div className="meta-chip-list">
                              {metaItems.map((item) => (
                                <span
                                  className="meta-chip"
                                  key={`${source.platformCode}:${source.platformMenuId}:${item}`}
                                >
                                  {item}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {source.platformMenuBindingSummary ? (
                            <p className="source-note">{source.platformMenuBindingSummary}</p>
                          ) : null}
                          {source.platformMenuPriceVariants?.length ? (
                            <div className="source-price-variant-list">
                              {flattenPlatformMenuPriceVariants(
                                source.platformMenuPriceVariants
                              )
                                .slice(0, 4)
                                .map((line) => (
                                  <p
                                    className="source-price-variant-line"
                                    key={`${source.platformCode}:${source.platformMenuId}:${line}`}
                                  >
                                    {line}
                                  </p>
                                ))}
                              {source.platformMenuPriceVariants.length > 4 ? (
                                <p className="source-option-more">
                                  {`외 ${source.platformMenuPriceVariants.length - 4}개 가격 항목`}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          {source.lastSeenAt ? (
                            <p className="source-note source-note-muted">
                              {`마지막 확인 ${formatDateTimeLabel(source.lastSeenAt)}`}
                            </p>
                          ) : null}
                          {source.optionGroups?.length ? (
                            <div className="source-option-list">
                              {source.optionGroups.slice(0, 3).map((optionGroup) => (
                                <p
                                  className="source-option-line"
                                  key={`${source.platformCode}:${source.platformMenuId}:${optionGroup.optionGroupId}`}
                                >
                                  {`${optionGroup.optionGroupName} · ${buildOptionRuleLabel(optionGroup)} · ${buildOptionSampleLabel(optionGroup)}`}
                                </p>
                              ))}
                              {source.optionGroups.length > 3 ? (
                                <p className="source-option-more">
                                  {`외 ${source.optionGroups.length - 3}개 옵션그룹`}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <span className="source-empty">아직 연결된 플랫폼 메뉴가 없습니다.</span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
