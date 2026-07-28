import { JSDOM } from 'jsdom'
import { describe, expect, it, vi } from 'vitest'

import {
  buildPostSaveSuccessDialogDismissalExpression,
  buildSafeNoticeDialogDismissalExpression,
  dismissPostSaveSuccessDialogsInDocument,
  dismissSafeNoticeDialogsInDocument
} from '../../../src/main/services/safe-notice-dialog-dismissal'

const makeVisible = (element: Element) => {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    top: 0,
    right: 120,
    bottom: 40,
    left: 0,
    toJSON: () => ({})
  })
}

describe('safe notice dialog dismissal', () => {
  it('dismisses only allow-listed notice controls and leaves state-changing actions untouched', () => {
    const dom = new JSDOM(`
      <div role="dialog">
        <button id="save">저장</button>
        <button id="dismiss">오늘 하루 보지 않기</button>
      </div>
    `)
    const save = dom.window.document.querySelector('#save')!
    const dismiss = dom.window.document.querySelector('#dismiss')!
    makeVisible(save)
    makeVisible(dismiss)
    const saveClick = vi.fn()
    const dismissClick = vi.fn()
    save.addEventListener('click', saveClick)
    dismiss.addEventListener('click', dismissClick)

    expect(dismissSafeNoticeDialogsInDocument(dom.window.document)).toEqual([
      '오늘 하루 보지 않기'
    ])
    expect(dismissClick).toHaveBeenCalledTimes(1)
    expect(saveClick).not.toHaveBeenCalled()
  })

  it('does not click a generic close button outside a modal-like surface', () => {
    const dom = new JSDOM('<main><button id="close">닫기</button></main>')
    const close = dom.window.document.querySelector('#close')!
    makeVisible(close)
    const click = vi.fn()
    close.addEventListener('click', click)

    expect(dismissSafeNoticeDialogsInDocument(dom.window.document)).toEqual([])
    expect(click).not.toHaveBeenCalled()
  })

  it('builds a standalone browser expression', () => {
    const expression = buildSafeNoticeDialogDismissalExpression()

    expect(expression).toContain('dismissSafeNoticeDialogsInDocument(document)')
    expect(expression).toContain('보지\\s*않기')
  })

  it('dismisses a single informational confirmation but not a state-changing confirmation', () => {
    const dom = new JSDOM(`
      <div role="dialog" id="notice"><p>서비스 이용 안내</p><button id="notice-confirm">확인</button></div>
      <div role="dialog" id="change"><p>메뉴 변경을 적용하시겠습니까?</p><button id="change-confirm">확인</button></div>
    `)
    const noticeDialog = dom.window.document.querySelector('#notice')!
    const changeDialog = dom.window.document.querySelector('#change')!
    const notice = dom.window.document.querySelector('#notice-confirm')!
    const change = dom.window.document.querySelector('#change-confirm')!
    ;[noticeDialog, changeDialog, notice, change].forEach(makeVisible)
    const noticeClick = vi.fn()
    const changeClick = vi.fn()
    notice.addEventListener('click', noticeClick)
    change.addEventListener('click', changeClick)

    expect(dismissSafeNoticeDialogsInDocument(dom.window.document)).toEqual(['확인'])
    expect(noticeClick).toHaveBeenCalledTimes(1)
    expect(changeClick).not.toHaveBeenCalled()
  })

  it('dismisses only a confirmed save-success dialog', () => {
    const dom = new JSDOM(`
      <div class="save-result-modal" id="success"><p>메뉴 저장이 완료되었습니다.</p><button>확인</button></div>
      <div role="dialog" id="error"><p>저장에 실패했습니다.</p><button>확인</button></div>
    `)
    const successButton = dom.window.document.querySelector('#success button')!
    const errorButton = dom.window.document.querySelector('#error button')!
    makeVisible(dom.window.document.querySelector('#success')!)
    makeVisible(dom.window.document.querySelector('#error')!)
    makeVisible(successButton)
    makeVisible(errorButton)
    const successClick = vi.fn()
    const errorClick = vi.fn()
    successButton.addEventListener('click', successClick)
    errorButton.addEventListener('click', errorClick)

    expect(dismissPostSaveSuccessDialogsInDocument(dom.window.document)).toEqual(['확인'])
    expect(successClick).toHaveBeenCalledOnce()
    expect(errorClick).not.toHaveBeenCalled()
    expect(buildPostSaveSuccessDialogDismissalExpression()).toContain(
      'dismissPostSaveSuccessDialogsInDocument(document)'
    )
  })
})
