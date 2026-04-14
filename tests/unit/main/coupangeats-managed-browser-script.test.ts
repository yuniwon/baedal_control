// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadScript = async () =>
  (await import('../../../src/main/platforms/coupangeats/managed-browser-update-script.mjs') as unknown) as {
    applyManagedBrowserMenuUpdate: (payload: {
      platformMenuId?: string | null
      previousName: string
      previousPrice?: number | null
      nextName: string
      nextPrice: number
      platformMenuGroupName?: string | null
    }) => Promise<{ status: string; message?: string }>
  }

describe('applyManagedBrowserMenuUpdate', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/merchant/management/menu/109935')
  })

  it('returns no_change without opening the editor when name and price already match', async () => {
    document.body.innerHTML = `
      <div class="content-body-wrapper">
        <div class="content-body-item">
          <div class="css-csu06v e2waxd92">
            <div>추천메뉴 메뉴 사진은 연출된 이미지로 실제 조리된 음식과 다를 수 있습니다. 메뉴 추가 순서 변경</div>
            <ul class="css-1p2a3k e2waxd90">
              <li>
                <div class="dish">
                  <div class="dish-top">
                    <div class="content">
                      <div class="dish-wrapper"><span class="dish-name">왕새우갈비</span></div>
                      <div class="sale-price">23,900원</div>
                    </div>
                    <div class="image"><div class="edit"></div></div>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    `

    const editClick = vi.fn()
    document.querySelector('.edit')?.addEventListener('click', editClick)

    const { applyManagedBrowserMenuUpdate } = await loadScript()
    const result = await applyManagedBrowserMenuUpdate({
      previousName: '왕새우갈비',
      previousPrice: 23900,
      nextName: '왕새우갈비',
      nextPrice: 23900,
      platformMenuGroupName: '추천메뉴'
    })

    expect(result).toEqual({
      status: 'no_change',
      message: 'target_already_matches'
    })
    expect(editClick).not.toHaveBeenCalled()
  })

  it('opens the editor, updates the inputs, and saves the changed menu', async () => {
    document.body.innerHTML = `
      <div class="content-body-wrapper">
        <div class="content-body-item">
          <div class="css-csu06v e2waxd92">
            <div>추천메뉴 메뉴 사진은 연출된 이미지로 실제 조리된 음식과 다를 수 있습니다. 메뉴 추가 순서 변경</div>
            <ul class="css-1p2a3k e2waxd90">
              <li>
                <div class="dish">
                  <div class="dish-top">
                    <div class="content">
                      <div class="dish-wrapper"><span class="dish-name">왕새우갈비</span></div>
                      <div class="sale-price">23,900원</div>
                    </div>
                    <div class="image"><div class="edit"></div></div>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    `

    const rowName = document.querySelector('.dish-name') as HTMLElement
    const rowPrice = document.querySelector('.sale-price') as HTMLElement
    document.querySelector('.edit')?.addEventListener('click', () => {
      const form = document.createElement('div')
      form.setAttribute('data-testid', 'editor')
      form.innerHTML = `
        <input type="text" placeholder="예: 치즈버거" value="${rowName.textContent ?? ''}" />
        <input type="text" placeholder="0" value="23,900" />
        <button type="button">저장</button>
      `
      const saveButton = form.querySelector('button')
      saveButton?.addEventListener('click', () => {
        const inputs = form.querySelectorAll('input')
        rowName.textContent = (inputs[0] as HTMLInputElement).value
        rowPrice.textContent = `${(inputs[1] as HTMLInputElement).value}원`
        form.remove()
      })
      document.body.appendChild(form)
    })

    const { applyManagedBrowserMenuUpdate } = await loadScript()
    const result = await applyManagedBrowserMenuUpdate({
      previousName: '왕새우갈비',
      previousPrice: 23900,
      nextName: '왕새우갈비 수정',
      nextPrice: 24900,
      platformMenuGroupName: '추천메뉴'
    })

    expect(result).toEqual({
      status: 'saved',
      message: 'menu_updated'
    })
    expect(rowName.textContent).toBe('왕새우갈비 수정')
    expect(rowPrice.textContent).toBe('24,900원')
    expect(document.querySelector('[data-testid="editor"]')).toBeNull()
  })

  it('uses platformMenuId to pick the correct duplicate row within the same group', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            menus: [
              {
                menuId: 909523,
                menuName: '추천메뉴',
                dishes: [
                  {
                    dishId: 1001,
                    dishName: '중복 메뉴',
                    salePrice: 10000
                  },
                  {
                    dishId: 1002,
                    dishName: '중복 메뉴',
                    salePrice: 10000
                  }
                ]
              }
            ]
          }
        })
      })
    )

    document.body.innerHTML = `
      <div class="content-body-wrapper">
        <div class="content-body-item">
          <div data-testid="menu-content-909523" class="css-1vc30t0 ewd93p30">
            <div class="css-csu06v e2waxd92">
              <div class="css-1yorhis e2waxd91">
                <div class="content">
                  <div class="content-wrapper">
                    <div class="menu-info"><div class="menu-name">추천메뉴</div></div>
                  </div>
                </div>
              </div>
              <ul class="css-1p2a3k e2waxd90">
                <li>
                  <div class="dish">
                    <div class="dish-top">
                      <div class="content">
                        <div class="dish-wrapper"><span class="dish-name">중복 메뉴</span></div>
                        <div class="sale-price">10,000원</div>
                      </div>
                      <div class="image"><div class="edit" data-row="first"></div></div>
                    </div>
                  </div>
                </li>
                <li>
                  <div class="dish">
                    <div class="dish-top">
                      <div class="content">
                        <div class="dish-wrapper"><span class="dish-name">중복 메뉴</span></div>
                        <div class="sale-price">10,000원</div>
                      </div>
                      <div class="image"><div class="edit" data-row="second"></div></div>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    `

    const names = document.querySelectorAll('.dish-name')
    const prices = document.querySelectorAll('.sale-price')

    document.querySelectorAll('.edit').forEach((editButton, index) => {
      editButton.addEventListener('click', () => {
        const form = document.createElement('div')
        form.setAttribute('data-testid', `editor-${index}`)
        form.innerHTML = `
          <input type="text" placeholder="예: 치즈버거" value="${names[index]?.textContent ?? ''}" />
          <input type="text" placeholder="0" value="10,000" />
          <button type="button">저장</button>
        `
        form.querySelector('button')?.addEventListener('click', () => {
          const inputs = form.querySelectorAll('input')
          ;(names[index] as HTMLElement).textContent = (inputs[0] as HTMLInputElement).value
          ;(prices[index] as HTMLElement).textContent = `${(inputs[1] as HTMLInputElement).value}원`
          form.remove()
        })
        document.body.appendChild(form)
      })
    })

    const { applyManagedBrowserMenuUpdate } = await loadScript()
    const result = await applyManagedBrowserMenuUpdate({
      platformMenuId: '1002',
      previousName: '중복 메뉴',
      previousPrice: 10000,
      nextName: '중복 메뉴 수정',
      nextPrice: 11000,
      platformMenuGroupName: '추천메뉴'
    })

    expect(result).toEqual({
      status: 'saved',
      message: 'menu_updated'
    })
    expect(names[0]?.textContent).toBe('중복 메뉴')
    expect(prices[0]?.textContent).toBe('10,000원')
    expect(names[1]?.textContent).toBe('중복 메뉴 수정')
    expect(prices[1]?.textContent).toBe('11,000원')
  })

  it('returns contextual target info when no matching menu row is found', async () => {
    document.body.innerHTML = `
      <div class="content-body-wrapper">
        <div class="content-body-item">
          <div class="css-csu06v e2waxd92">
            <div>추천메뉴</div>
            <ul class="css-1p2a3k e2waxd90">
              <li>
                <div class="dish">
                  <div class="dish-top">
                    <div class="content">
                      <div class="dish-wrapper"><span class="dish-name">다른 메뉴</span></div>
                      <div class="sale-price">12,000원</div>
                    </div>
                    <div class="image"><div class="edit"></div></div>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    `

    const { applyManagedBrowserMenuUpdate } = await loadScript()
    const result = await applyManagedBrowserMenuUpdate({
      platformMenuId: '1002',
      previousName: '중복 메뉴',
      previousPrice: 10000,
      nextName: '중복 메뉴 수정',
      nextPrice: 11000,
      platformMenuGroupName: '추천메뉴'
    })

    expect(result.status).toBe('target_not_found')
    expect(result.message).toContain('matching_menu_row_not_found')
    expect(result.message).toContain('id=1002')
    expect(result.message).toContain('name=중복 메뉴')
    expect(result.message).toContain('group=추천메뉴')
  })

  it('returns duplicate candidate details when the target is ambiguous', async () => {
    document.body.innerHTML = `
      <div class="content-body-wrapper">
        <div class="content-body-item">
          <div class="css-csu06v e2waxd92">
            <div>추천메뉴</div>
            <ul class="css-1p2a3k e2waxd90">
              <li>
                <div class="dish">
                  <div class="dish-top">
                    <div class="content">
                      <div class="dish-wrapper"><span class="dish-name">중복 메뉴</span></div>
                      <div class="sale-price">10,000원</div>
                    </div>
                    <div class="image"><div class="edit"></div></div>
                  </div>
                </div>
              </li>
              <li>
                <div class="dish">
                  <div class="dish-top">
                    <div class="content">
                      <div class="dish-wrapper"><span class="dish-name">중복 메뉴</span></div>
                      <div class="sale-price">10,000원</div>
                    </div>
                    <div class="image"><div class="edit"></div></div>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    `

    const { applyManagedBrowserMenuUpdate } = await loadScript()
    const result = await applyManagedBrowserMenuUpdate({
      previousName: '중복 메뉴',
      previousPrice: 10000,
      nextName: '중복 메뉴 수정',
      nextPrice: 11000,
      platformMenuGroupName: '추천메뉴'
    })

    expect(result.status).toBe('ambiguous_target')
    expect(result.message).toContain('matching_menu_row_ambiguous')
    expect(result.message).toContain('count=2')
    expect(result.message).toContain('name=중복 메뉴')
    expect(result.message).toContain('group=추천메뉴')
  })
})
