import { useMemo, useState } from 'react'
import type { CatalogPublicationPreview, MenuRecord, PlatformCode } from '../../../../shared/contracts'
import { getPlatformLabel, PLATFORM_CODES } from '../../../../shared/platforms'

interface Props {
  onCancel: () => void
  onCreate: (menu: MenuRecord, targetPlatformCodes: PlatformCode[]) => Promise<void>
  onPreviewPublication?: (menu: Pick<MenuRecord, 'menuId' | 'baseName' | 'basePrice' | 'basePriceVariants'>, targetPlatformCodes: PlatformCode[]) => Promise<CatalogPublicationPreview>
}

const statusLabel = {
  already_connected: '이미 연결',
  automatic: '자동 등록 가능',
  manual: '수동 필요',
  blocked: '등록 차단'
} as const

export const CreateMenuPanel = ({ onCancel, onCreate, onPreviewPublication }: Props) => {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [targetPlatformCodes, setTargetPlatformCodes] = useState<PlatformCode[]>([...PLATFORM_CODES])
  const [publicationPreview, setPublicationPreview] = useState<CatalogPublicationPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const valid = name.trim().length > 0 && price !== '' && Number(price) >= 0
  const draftMenu = useMemo(() => ({
    menuId: typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `menu-${Date.now()}`,
    baseName: name.trim(),
    basePrice: Number(price),
    basePriceVariants: null
  }), [name, price])
  const preview = async () => {
    if (!valid || targetPlatformCodes.length === 0) return
    setPreviewing(true); setError(null)
    try {
      setPublicationPreview(await onPreviewPublication?.(draftMenu, targetPlatformCodes) ?? {
        menuId: draftMenu.menuId,
        menuName: draftMenu.baseName,
        generatedAt: '',
        items: [],
        summary: { total: 0, automatic: 0, manual: 0, blocked: 0, alreadyConnected: 0 }
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '플랫폼 등록 계획을 확인하지 못했습니다.')
    } finally {
      setPreviewing(false)
    }
  }
  const submit = async () => {
    if (!valid || targetPlatformCodes.length === 0) return
    if (!publicationPreview) {
      await preview()
      return
    }
    setSaving(true); setError(null)
    try {
      await onCreate({ ...draftMenu, isDirty: 1, isManaged: 1 }, targetPlatformCodes)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '메뉴를 만들지 못했습니다.')
      setSaving(false)
    }
  }
  return (
    <aside className="menu-detail-pane create-menu-panel" aria-label="새 메뉴 만들기">
      <header><div><span className="eyebrow">통합메뉴</span><h2>새 메뉴 만들기</h2></div><button className="icon-button" aria-label="새 메뉴 닫기" onClick={onCancel} type="button">×</button></header>
      <div className="detail-body"><section className="detail-section"><p className="muted">새 메뉴를 통합 기준으로 저장하고, 아래에서 전파할 플랫폼을 함께 선택합니다. 실제 플랫폼 등록은 각 플랫폼의 생성 가능 여부를 확인한 뒤 진행합니다.</p><label>메뉴명<input autoFocus value={name} onChange={(event) => { setName(event.target.value); setPublicationPreview(null) }} /></label><label>기준 가격<input min="0" type="number" value={price} onChange={(event) => { setPrice(event.target.value); setPublicationPreview(null) }} /></label><div className="publication-target-section"><div className="section-title"><h3>전파 대상 플랫폼</h3><span>{targetPlatformCodes.length}/{PLATFORM_CODES.length}개 선택</span></div><div className="publication-target-list">{PLATFORM_CODES.map((platformCode) => <label key={platformCode} className="publication-target-row"><input type="checkbox" checked={targetPlatformCodes.includes(platformCode)} onChange={(event) => { setTargetPlatformCodes((current) => event.target.checked ? [...current, platformCode] : current.filter((code) => code !== platformCode)); setPublicationPreview(null) }} /><span><strong>{getPlatformLabel(platformCode)}</strong><small>{platformCode === 'naverorder' ? '현재 수집 보류' : '새 메뉴 전파 대상'}</small></span></label>)}</div></div>{publicationPreview ? <div className="publication-preview-card"><strong>플랫폼 등록 계획</strong><div className="publication-summary"><span>{publicationPreview.summary.automatic} 자동</span><span>{publicationPreview.summary.manual} 수동</span><span>{publicationPreview.summary.blocked} 차단</span></div><ul>{publicationPreview.items.map((item) => <li key={item.platformCode}><span><strong>{getPlatformLabel(item.platformCode)}</strong><small>{item.detail}</small></span><b className={`publication-status ${item.disposition}`}>{statusLabel[item.disposition]}</b></li>)}</ul></div> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}</section></div>
      <footer><span>{!valid ? '메뉴명과 가격을 입력하세요.' : !publicationPreview ? '먼저 플랫폼 등록 계획을 확인하세요.' : '통합메뉴와 전파 대상을 저장할 준비가 됐습니다.'}</span><button className="secondary-button" onClick={onCancel} type="button">취소</button><button className="primary-button" disabled={!valid || targetPlatformCodes.length === 0 || saving || previewing} onClick={() => void submit()} type="button">{previewing ? '등록 계획 확인 중…' : publicationPreview ? '메뉴 만들기' : '등록 방식 확인'}</button></footer>
    </aside>
  )
}
