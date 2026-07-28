import { useEffect, useMemo, useState } from 'react'
import type { CatalogMenuListItem } from '../../lib/catalog-workspace-view'
import { getPlatformLabel } from '../../lib/menu-source-labels'

interface Props { item: CatalogMenuListItem | null; onSave: (item: CatalogMenuListItem) => Promise<void>; onClose: () => void; onDirtyChange?: (dirty: boolean) => void }
export const MenuDetailPane = ({ item, onSave, onClose, onDirtyChange }: Props) => {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('0')
  const [managed, setManaged] = useState(true)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  useEffect(() => {
    setName(item?.baseName ?? '')
    setPrice(String(item?.basePrice ?? 0))
    setManaged((item?.isManaged ?? 1) === 1)
    setState('idle')
  }, [item])
  const dirty = useMemo(() => Boolean(item && (name !== item.baseName || Number(price) !== item.basePrice || managed !== ((item.isManaged ?? 1) === 1))), [item, name, price, managed])
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])
  if (!item) return <aside className="menu-detail-pane empty"><div><strong>메뉴를 선택하세요</strong><p>왼쪽 목록에서 메뉴를 고르면 가격과 플랫폼 연결 상태를 함께 확인할 수 있습니다.</p></div></aside>
  const save = async () => {
    setState('saving')
    try {
      await onSave({ ...item, baseName: name.trim(), basePrice: Number(price), isManaged: managed ? 1 : 0, isDirty: 1 })
      setState('saved')
    } catch { setState('error') }
  }
  return (
    <aside className="menu-detail-pane" aria-label="선택한 메뉴 편집">
      <header><div><span className="eyebrow">통합메뉴 편집</span><h2>{item.baseName}</h2></div><button className="icon-button" aria-label="상세 닫기" onClick={onClose} type="button">×</button></header>
      <div className="detail-body">
        <section className="detail-section"><h3>기준 정보</h3>
          <label>기준 메뉴명<input aria-label="기준 메뉴명" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>기준 가격<input aria-label="기준 가격" min="0" type="number" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
          <label className="toggle-row"><input checked={managed} onChange={(event) => setManaged(event.target.checked)} type="checkbox" /><span><strong>통합 관리 대상</strong><small>끄면 동기화 후보에서 제외합니다.</small></span></label>
        </section>
        <section className="detail-section"><div className="section-title"><h3>플랫폼 비교</h3><span>{item.connectedPlatformCount}개 연결</span></div>
          <div className="platform-comparison">
            {(item.sources ?? []).map((source) => <div className="platform-row" key={`${source.platformCode}:${source.platformMenuId}`}><span className={`platform-logo ${source.platformCode}`}>{getPlatformLabel(source.platformCode).slice(0, 1)}</span><span><strong>{getPlatformLabel(source.platformCode)}</strong><small>{source.platformMenuName}</small></span><b>{source.platformMenuPriceSummary ?? '가격 확인 필요'}</b></div>)}
            {!item.sources?.length ? <p className="muted">아직 연결된 플랫폼 메뉴가 없습니다.</p> : null}
          </div>
          <details><summary>고급 원본 정보</summary><div className="raw-info">{(item.sources ?? []).map((source) => <code key={source.platformMenuId}>{source.platformCode} · {source.platformMenuId}</code>)}</div></details>
        </section>
      </div>
      <footer><span role="status">{state === 'saved' ? '저장했습니다.' : state === 'error' ? '저장하지 못했습니다. 입력 내용은 유지됩니다.' : dirty ? '저장하지 않은 변경이 있습니다.' : '변경 없음'}</span><button className="secondary-button" disabled={!dirty || state === 'saving'} onClick={() => { setName(item.baseName); setPrice(String(item.basePrice)); setManaged((item.isManaged ?? 1) === 1); setState('idle') }} type="button">취소</button><button className="primary-button" disabled={!dirty || !name.trim() || Number(price) < 0 || state === 'saving'} onClick={() => void save()} type="button">변경 저장</button></footer>
    </aside>
  )
}
