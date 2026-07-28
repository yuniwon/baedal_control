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
