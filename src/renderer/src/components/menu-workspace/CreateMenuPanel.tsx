import { useState } from 'react'
import type { MenuRecord } from '../../../../shared/contracts'

interface Props { onCancel: () => void; onCreate: (menu: MenuRecord) => Promise<void> }
export const CreateMenuPanel = ({ onCancel, onCreate }: Props) => {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = name.trim().length > 0 && price !== '' && Number(price) >= 0
  const submit = async () => {
    if (!valid) return
    setSaving(true); setError(null)
    try {
      await onCreate({
        menuId: typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `menu-${Date.now()}`,
        baseName: name.trim(), basePrice: Number(price), basePriceVariants: null, isDirty: 1, isManaged: 1
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '메뉴를 만들지 못했습니다.')
      setSaving(false)
    }
  }
  return (
    <aside className="menu-detail-pane create-menu-panel" aria-label="새 메뉴 만들기">
      <header><div><span className="eyebrow">통합메뉴</span><h2>새 메뉴 만들기</h2></div><button className="icon-button" aria-label="새 메뉴 닫기" onClick={onCancel} type="button">×</button></header>
      <div className="detail-body"><section className="detail-section"><p className="muted">여기서 만든 메뉴는 통합메뉴에만 저장됩니다. 플랫폼에는 별도 검토 후 반영됩니다.</p><label>메뉴명<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label><label>기준 가격<input min="0" type="number" value={price} onChange={(event) => setPrice(event.target.value)} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}</section></div>
      <footer><span>{valid ? '저장할 준비가 됐습니다.' : '메뉴명과 가격을 입력하세요.'}</span><button className="secondary-button" onClick={onCancel} type="button">취소</button><button className="primary-button" disabled={!valid || saving} onClick={() => void submit()} type="button">메뉴 만들기</button></footer>
    </aside>
  )
}
