import { useEffect, useMemo, useState } from 'react'

import type {
  CatalogBootstrapDraftMenu,
  CatalogBootstrapPreview,
  CatalogWorkspaceRecord,
  PlatformCode,
  PlatformImportRunRecord
} from '../../../shared/contracts'
import {
  getEligibleCatalogSeedPlatforms,
  getPlatformLabel,
  PLATFORM_CODES,
  type CatalogSeedCompleteness
} from '../../../shared/platforms'
import { appApi } from '../lib/api'
import { pickLatestImportRuns } from '../lib/platform-imports'

const onboardingSteps = [
  '플랫폼 연결 확인',
  '초기 기준 선택',
  '초안',
  '다른 플랫폼 후보',
  '결정 요약',
  '버전 1 확정'
]

const onboardingPlatformLabel = (platformCode: PlatformCode) =>
  platformCode === 'baemin' ? '배달의민족' : getPlatformLabel(platformCode)

type CredentialStatus = { platformCode: PlatformCode; connected: boolean }

export const CatalogOnboardingPage = ({
  workspace,
  onActivated
}: {
  workspace: CatalogWorkspaceRecord
  onActivated: (workspace: CatalogWorkspaceRecord) => void
}) => {
  const [connectedByPlatform, setConnectedByPlatform] = useState<
    Partial<Record<PlatformCode, boolean>>
  >({})
  const [completenessByPlatform, setCompletenessByPlatform] = useState<
    Partial<Record<PlatformCode, CatalogSeedCompleteness>>
  >({})
  const [isLoading, setIsLoading] = useState(true)
  const [selectedSeed, setSelectedSeed] = useState<PlatformCode | 'blank' | null>(null)
  const [preview, setPreview] = useState<CatalogBootstrapPreview | null>(null)
  const [draftMenus, setDraftMenus] = useState<CatalogBootstrapDraftMenu[]>([])
  const [confirmedMappingIds, setConfirmedMappingIds] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    void Promise.all([
      appApi.settings.getPlatformCredentialStatus(),
      appApi.platformImportRuns.list()
    ]).then(([credentialRows, importRuns]) => {
      if (disposed) return

      const connections = (Array.isArray(credentialRows) ? credentialRows : [])
        .filter(
          (entry): entry is CredentialStatus =>
            entry !== null &&
            typeof entry === 'object' &&
            'platformCode' in entry &&
            'connected' in entry &&
            PLATFORM_CODES.includes((entry as CredentialStatus).platformCode)
        )
        .reduce<Partial<Record<PlatformCode, boolean>>>((result, entry) => {
          result[entry.platformCode] = Boolean(entry.connected)
          return result
        }, {})
      const latestRuns = pickLatestImportRuns(
        (Array.isArray(importRuns) ? importRuns : []) as PlatformImportRunRecord[]
      )
      const completeness = PLATFORM_CODES.reduce<
        Partial<Record<PlatformCode, CatalogSeedCompleteness>>
      >((result, platformCode) => {
        const run = latestRuns[platformCode]
        result[platformCode] =
          connections[platformCode] && run?.status === 'completed' && run.menuFetchCompleted === 1
            ? 'complete'
            : run
              ? 'incomplete'
              : 'unknown'
        return result
      }, {})
      const eligible = getEligibleCatalogSeedPlatforms(completeness).filter(
        (platformCode) => connections[platformCode]
      )

      setConnectedByPlatform(connections)
      setCompletenessByPlatform(completeness)
      setSelectedSeed(eligible[0] ?? 'blank')
      setIsLoading(false)
    }).catch((loadError) => {
      if (disposed) return
      setError(loadError instanceof Error ? loadError.message : '초기 상태를 확인하지 못했습니다.')
      setIsLoading(false)
    })

    return () => {
      disposed = true
    }
  }, [])

  const eligiblePlatforms = useMemo(
    () => new Set(getEligibleCatalogSeedPlatforms(completenessByPlatform)),
    [completenessByPlatform]
  )
  const hasUndecidedSeedRows = draftMenus.some((draft) => draft.disposition === 'undecided')
  const currentStep = preview ? (hasUndecidedSeedRows ? 3 : 6) : 2

  const buildPreview = async () => {
    if (!selectedSeed) return
    setError(null)
    try {
      const nextPreview = await appApi.catalogBootstrap.preview({
        workspaceId: workspace.workspaceId,
        seedMode: selectedSeed === 'blank' ? 'blank' : 'platform',
        seedPlatformCode: selectedSeed === 'blank' ? null : selectedSeed
      })
      setPreview(nextPreview)
      setDraftMenus(nextPreview.draftMenus)
      setConfirmedMappingIds(
        new Set(
          nextPreview.suggestedMappings
            .filter((mapping) => mapping.isConfirmed === 1)
            .map((mapping) => mapping.mappingId)
        )
      )
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : '초안을 만들지 못했습니다.')
    }
  }

  const activate = async () => {
    if (!preview || hasUndecidedSeedRows) return
    setIsSaving(true)
    setError(null)
    try {
      const includedMenus = draftMenus.filter((draft) => draft.disposition === 'include')
      const includedMenuIds = new Set(includedMenus.map((draft) => draft.menuId))
      const activeWorkspace = await appApi.catalogBootstrap.activate({
        workspaceId: preview.workspaceId,
        seedMode: preview.seedMode,
        seedPlatformCode: preview.seedPlatformCode,
        previewFingerprint: preview.previewFingerprint,
        menus: includedMenus.map((draft) => ({
          menuId: draft.menuId,
          baseName: draft.baseName,
          basePrice: draft.basePrice,
          basePriceVariants: draft.basePriceVariants,
          isDirty: 0,
          isManaged: 1
        })),
        ignoredSourceEntityIds: draftMenus
          .filter((draft) => draft.disposition === 'ignore' && draft.sourcePlatformMenuId)
          .map((draft) => draft.sourcePlatformMenuId as string),
        confirmedMappings: preview.suggestedMappings
          .filter(
            (mapping) =>
              includedMenuIds.has(mapping.menuId) && confirmedMappingIds.has(mapping.mappingId)
          )
          .map((mapping) => ({ ...mapping, isConfirmed: 1 })),
        remainingReviewItems: preview.reviewItems
      })
      onActivated(activeWorkspace)
    } catch (activationError) {
      setError(
        activationError instanceof Error
          ? activationError.message
          : '통합 메뉴를 시작하지 못했습니다.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="catalog-onboarding-shell">
      <aside className="catalog-onboarding-rail" aria-label="초기 설정 단계">
        <div className="catalog-onboarding-brand">
          <strong>통합 메뉴 관리</strong>
          <span>초기 설정</span>
        </div>
        <ol>
          {onboardingSteps.map((step, index) => {
            const stepNumber = index + 1
            return (
              <li
                key={step}
                className={stepNumber === currentStep ? 'active' : stepNumber < currentStep ? 'done' : ''}
                aria-current={stepNumber === currentStep ? 'step' : undefined}
              >
                <span>{stepNumber}</span>
                <strong>{step}</strong>
              </li>
            )
          })}
        </ol>
      </aside>

      <main className="catalog-onboarding-main">
        {!preview ? (
          <div className="catalog-onboarding-stage">
            <header className="catalog-onboarding-header">
              <h1>초기 기준을 선택하세요</h1>
              <p>
                선택한 플랫폼의 메뉴로 통합 메뉴 초안을 만듭니다. 이 선택은 최초 설정에만
                사용되고, 이후에는 통합 메뉴가 기준이 됩니다.
              </p>
            </header>

            <fieldset className="catalog-seed-list" disabled={isLoading}>
              <legend>플랫폼에서 메뉴 선택</legend>
              {PLATFORM_CODES.map((platformCode) => {
                const connected = Boolean(connectedByPlatform[platformCode])
                const complete = eligiblePlatforms.has(platformCode) && connected
                const status = !connected
                  ? '연결되지 않음'
                  : complete
                    ? '가져오기 완료'
                    : '가져오기 미완료'
                return (
                  <label className={complete ? 'catalog-seed-row' : 'catalog-seed-row disabled'} key={platformCode}>
                    <input
                      aria-label={onboardingPlatformLabel(platformCode)}
                      type="radio"
                      name="catalog-seed"
                      value={platformCode}
                      checked={selectedSeed === platformCode}
                      disabled={!complete}
                      onChange={() => setSelectedSeed(platformCode)}
                    />
                    <strong>{onboardingPlatformLabel(platformCode)}</strong>
                    <span className={complete ? 'seed-status complete' : 'seed-status incomplete'}>
                      {connected ? '연결됨' : '미연결'}
                    </span>
                    <span>{status}</span>
                  </label>
                )
              })}
              <label className="catalog-seed-row blank-seed-row">
                <input
                  aria-label="빈 통합 메뉴로 시작"
                  type="radio"
                  name="catalog-seed"
                  value="blank"
                  checked={selectedSeed === 'blank'}
                  onChange={() => setSelectedSeed('blank')}
                />
                <strong>빈 통합 메뉴로 시작</strong>
                <span>가져온 플랫폼 없이 직접 메뉴를 구성합니다.</span>
              </label>
            </fieldset>

            <div className="catalog-safety-notes">
              <div>
                <strong>가져온 데이터는 수정하지 않습니다</strong>
                <span>각 플랫폼에서 읽어 온 원본은 그대로 보존됩니다.</span>
              </div>
              <div>
                <strong>확정 전까지 배달앱에는 반영되지 않습니다</strong>
                <span>버전 1을 확정하기 전에는 어떤 플랫폼에도 쓰지 않습니다.</span>
              </div>
            </div>

            {error ? <p className="catalog-error" role="alert">{error}</p> : null}
            <footer className="catalog-onboarding-actions">
              <span>{isLoading ? '플랫폼 상태를 확인하고 있습니다.' : '나중에 다시 이어서 설정할 수 있습니다.'}</span>
              <button
                type="button"
                className="primary-button"
                disabled={isLoading || !selectedSeed}
                onClick={() => void buildPreview()}
              >
                통합 메뉴 초안 만들기
              </button>
            </footer>
          </div>
        ) : (
          <div className="catalog-onboarding-stage catalog-draft-stage">
            <header className="catalog-onboarding-header">
              <h1>통합 메뉴 초안을 확인하세요</h1>
              <p>원본은 그대로 두고, 포함할 메뉴와 다른 플랫폼의 연결 후보만 결정합니다.</p>
            </header>

            <section className="catalog-draft-section">
              <div className="catalog-section-heading">
                <div>
                  <h2>초기 메뉴</h2>
                  <p>{`가져온 메뉴 ${draftMenus.length}개`}</p>
                </div>
                {hasUndecidedSeedRows ? <strong className="catalog-decision-warning">미결정 항목이 있습니다</strong> : null}
              </div>
              {draftMenus.length ? (
                <div className="catalog-draft-list">
                  {draftMenus.map((draft) => (
                    <article className="catalog-draft-row" key={draft.menuId}>
                      <div>
                        <input
                          aria-label={`${draft.baseName} 메뉴명`}
                          value={draft.baseName}
                          onChange={(event) =>
                            setDraftMenus((current) =>
                              current.map((item) =>
                                item.menuId === draft.menuId
                                  ? { ...item, baseName: event.target.value }
                                  : item
                              )
                            )
                          }
                        />
                        <input
                          aria-label={`${draft.baseName} 가격`}
                          type="number"
                          min="0"
                          value={draft.basePrice}
                          onChange={(event) =>
                            setDraftMenus((current) =>
                              current.map((item) =>
                                item.menuId === draft.menuId
                                  ? { ...item, basePrice: Number(event.target.value) }
                                  : item
                              )
                            )
                          }
                        />
                      </div>
                      <fieldset>
                        <legend className="sr-only">{`${draft.baseName} 처리 방식`}</legend>
                        <label>
                          <input
                            aria-label="통합 메뉴에 포함"
                            type="radio"
                            name={`draft-${draft.menuId}`}
                            checked={draft.disposition === 'include'}
                            onChange={() =>
                              setDraftMenus((current) =>
                                current.map((item) =>
                                  item.menuId === draft.menuId
                                    ? { ...item, disposition: 'include' }
                                    : item
                                )
                              )
                            }
                          />
                          통합 메뉴에 포함
                        </label>
                        <label>
                          <input
                            aria-label="원본 노이즈로 제외"
                            type="radio"
                            name={`draft-${draft.menuId}`}
                            checked={draft.disposition === 'ignore'}
                            onChange={() =>
                              setDraftMenus((current) =>
                                current.map((item) =>
                                  item.menuId === draft.menuId
                                    ? { ...item, disposition: 'ignore' }
                                    : item
                                )
                              )
                            }
                          />
                          원본 노이즈로 제외
                        </label>
                      </fieldset>
                    </article>
                  ))}
                </div>
              ) : <p className="source-empty">빈 통합 메뉴로 시작합니다.</p>}
            </section>

            {preview.suggestedMappings.some((mapping) => mapping.isConfirmed !== 1) ? (
              <section className="catalog-draft-section">
                <div className="catalog-section-heading">
                  <div>
                    <h2>다른 플랫폼 연결 후보</h2>
                    <p>이름이 안전하게 일치해도 자동 확정하지 않습니다.</p>
                  </div>
                </div>
                <div className="catalog-suggestion-list">
                  {preview.suggestedMappings
                    .filter((mapping) => mapping.isConfirmed !== 1)
                    .map((mapping) => (
                      <label key={mapping.mappingId}>
                        <input
                          type="checkbox"
                          checked={confirmedMappingIds.has(mapping.mappingId)}
                          onChange={(event) => {
                            setConfirmedMappingIds((current) => {
                              const next = new Set(current)
                              if (event.target.checked) next.add(mapping.mappingId)
                              else next.delete(mapping.mappingId)
                              return next
                            })
                          }}
                        />
                        <strong>{`${onboardingPlatformLabel(mapping.platformCode)} · ${mapping.platformMenuName}`}</strong>
                        <span>통합 메뉴 연결 후보</span>
                      </label>
                    ))}
                </div>
              </section>
            ) : null}

            <section className="catalog-draft-section catalog-decision-summary">
              <h2>결정 요약</h2>
              <dl>
                <div><dt>포함</dt><dd>{draftMenus.filter((draft) => draft.disposition === 'include').length}개</dd></div>
                <div><dt>제외</dt><dd>{draftMenus.filter((draft) => draft.disposition === 'ignore').length}개</dd></div>
                <div><dt>추가 검토</dt><dd>{preview.reviewItems.length}개</dd></div>
              </dl>
            </section>

            {error ? <p className="catalog-error" role="alert">{error}</p> : null}
            <footer className="catalog-onboarding-actions">
              <button type="button" className="secondary-button" onClick={() => setPreview(null)}>
                기준 다시 선택
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={hasUndecidedSeedRows || isSaving}
                onClick={() => void activate()}
              >
                {isSaving ? '확정 중…' : '통합 메뉴 시작'}
              </button>
            </footer>
          </div>
        )}
      </main>
    </div>
  )
}
