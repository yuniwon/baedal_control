import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'

describe('delivery-menu inspector DOM snapshot', () => {
  it('focuses on menu rows instead of portal chrome and captures structured menu items', async () => {
    const module = await import(
      '../../../browser-extension/delivery-menu-inspector/dom-snapshot.mjs'
    ).catch(() => null)

    expect(module?.collectDomSnapshot).toBeTypeOf('function')

    if (!module?.collectDomSnapshot) {
      return
    }

    const dom = new JSDOM(`
      <body>
        <aside>
          <button>POS 설치</button>
          <button>FAQ 보기</button>
        </aside>
        <main>
          <h1>메뉴 편집 ・ 추가</h1>
          <nav>
            <button>추천메뉴</button>
            <button>꾸버스반반피자메뉴</button>
          </nav>
          <section>
            <header>
              <h2>추천메뉴</h2>
              <button>그룹 추가</button>
              <button>메뉴 추가</button>
            </header>
            <article>
              <div>왕새우갈비</div>
              <div>23,900원</div>
            </article>
            <article>
              <div>불고기피자</div>
              <div>19,900원</div>
            </article>
          </section>
          <section>
            <header>
              <h2>함께하면 더욱 좋은 음료 및 사이드메뉴</h2>
            </header>
            <article>
              <div>사이다</div>
              <div>1,800원</div>
            </article>
          </section>
        </main>
      </body>
    `)

    const snapshot = module.collectDomSnapshot({
      document: dom.window.document,
      href: 'https://store.coupangeats.com/merchant/menu',
      pageTitle: '쿠팡이츠 사장님 포털',
      capturedAt: '2026-04-13T00:00:00.000Z',
      captureMode: 'full_scroll',
      apiEvents: [
        {
          url: 'https://store.coupangeats.com/api/menus',
          method: 'GET',
          status: 200,
          capturedAt: '2026-04-13T00:00:00.000Z',
          responsePreview: '{"menus":[{"name":"왕새우갈비"}]}'
        }
      ],
      screenshotDataUrl: 'data:image/png;base64,ZmFrZQ=='
    })

    expect(snapshot.platformCode).toBe('coupangeats')
    expect(snapshot.pageKind).toBe('menu_list')
    expect(snapshot.captureMode).toBe('full_scroll')
    expect(snapshot.pageTitle).toBe('쿠팡이츠 사장님 포털')
    expect(snapshot.menuNames).toContain('왕새우갈비')
    expect(snapshot.menuNames).toContain('불고기피자')
    expect(snapshot.menuNames).toContain('사이다')
    expect(snapshot.menuNames).not.toContain('추천메뉴')
    expect(snapshot.buttonLabels).toEqual(expect.arrayContaining(['그룹 추가', '메뉴 추가']))
    expect(snapshot.buttonLabels).not.toContain('POS 설치')
    expect(snapshot.buttonLabels).not.toContain('FAQ 보기')
    expect(snapshot.menuItems).toEqual([
      {
        name: '왕새우갈비',
        priceText: '23,900원',
        categoryName: '추천메뉴'
      },
      {
        name: '불고기피자',
        priceText: '19,900원',
        categoryName: '추천메뉴'
      },
      {
        name: '사이다',
        priceText: '1,800원',
        categoryName: '함께하면 더욱 좋은 음료 및 사이드메뉴'
      }
    ])
    expect(snapshot.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'menu[0].name',
          value: '왕새우갈비',
          source: 'dom'
        }),
        expect.objectContaining({
          name: 'menu[0].price',
          value: '23,900원',
          source: 'dom'
        })
      ])
    )
    expect(snapshot.apiEvents).toHaveLength(1)
  })

  it('ignores menu state badges and keeps the nearest menu category instead of unrelated portal text', async () => {
    const module = await import(
      '../../../browser-extension/delivery-menu-inspector/dom-snapshot.mjs'
    ).catch(() => null)

    expect(module?.collectDomSnapshot).toBeTypeOf('function')

    if (!module?.collectDomSnapshot) {
      return
    }

    const dom = new JSDOM(`
      <body>
        <aside>
          <strong>FAQ</strong>
          <button>FAQ 보기</button>
        </aside>
        <main>
          <h1>메뉴 편집 ・ 추가</h1>
          <section>
            <div>추천메뉴</div>
            <button>메뉴 추가</button>
            <article>
              <div>왕새우갈비</div>
              <div>23,900원</div>
            </article>
            <article>
              <div>오늘만 품절</div>
              <div>통마늘바베큐피자</div>
              <div>21,900원</div>
            </article>
          </section>
          <section>
            <div>함께하면 더욱 좋은 음료 및 사이드메뉴</div>
            <article>
              <div>사이다</div>
              <div>1,800원</div>
            </article>
          </section>
        </main>
      </body>
    `)

    const snapshot = module.collectDomSnapshot({
      document: dom.window.document,
      href: 'https://store.coupangeats.com/merchant/management/menu/109935',
      pageTitle: '쿠팡이츠 사장님 포털',
      capturedAt: '2026-04-13T00:00:00.000Z',
      captureMode: 'full_scroll'
    })

    expect(snapshot.pageKind).toBe('menu_list')
    expect(snapshot.menuItems).toEqual([
      {
        name: '왕새우갈비',
        priceText: '23,900원',
        categoryName: '추천메뉴'
      },
      {
        name: '통마늘바베큐피자',
        priceText: '21,900원',
        categoryName: '추천메뉴'
      },
      {
        name: '사이다',
        priceText: '1,800원',
        categoryName: '함께하면 더욱 좋은 음료 및 사이드메뉴'
      }
    ])
    expect(snapshot.menuNames).not.toContain('오늘만 품절')
    expect(snapshot.menuItems.every((item) => item.categoryName !== 'FAQ')).toBe(true)
  })

  it('treats the options page as option_list and extracts option group names separately', async () => {
    const module = await import(
      '../../../browser-extension/delivery-menu-inspector/dom-snapshot.mjs'
    ).catch(() => null)

    expect(module?.collectDomSnapshot).toBeTypeOf('function')

    if (!module?.collectDomSnapshot) {
      return
    }

    const dom = new JSDOM(`
      <body>
        <aside>
          <strong>FAQ</strong>
        </aside>
        <main>
          <h1>메뉴 편집 ・ 추가</h1>
          <nav>
            <button>메뉴</button>
            <button>옵션</button>
          </nav>
          <section>
            <div>
              <div>기본</div>
              <div>최대 1 / 최소 1 (필수 옵션) / 왕새우갈비 외 19개</div>
              <button>옵션 추가</button>
              <article>
                <div>L</div>
                <div>4,000원</div>
              </article>
              <article>
                <div>M</div>
                <div>0원</div>
              </article>
            </div>
            <div>
              <div>도우 추가선택</div>
              <div>최대 1 / 왕새우갈비 외 22개</div>
              <button>옵션 추가</button>
              <article>
                <div>치즈크러스트 변경</div>
                <div>3,000원</div>
              </article>
            </div>
          </section>
        </main>
      </body>
    `)

    const snapshot = module.collectDomSnapshot({
      document: dom.window.document,
      href: 'https://store.coupangeats.com/merchant/management/menu/109935/options',
      pageTitle: '쿠팡이츠 사장님 포털',
      capturedAt: '2026-04-13T00:00:00.000Z',
      captureMode: 'full_scroll'
    })

    expect(snapshot.pageKind).toBe('option_list')
    expect(snapshot.optionGroupNames).toEqual(['기본', '도우 추가선택'])
    expect(snapshot.menuNames).toEqual([])
    expect(snapshot.menuItems).toEqual([])
  })

  it('removes review badges from menu names and skips merged control text when resolving categories', async () => {
    const module = await import(
      '../../../browser-extension/delivery-menu-inspector/dom-snapshot.mjs'
    ).catch(() => null)

    expect(module?.collectDomSnapshot).toBeTypeOf('function')

    if (!module?.collectDomSnapshot) {
      return
    }

    const dom = new JSDOM(`
      <body>
        <main>
          <h1>메뉴 편집 ・ 추가</h1>
          <section>
            <div>추천메뉴</div>
            <div>메뉴 추가순서 변경</div>
            <article>
              <div>리뷰이벤트꾸버스반반피자23,900원</div>
            </article>
          </section>
        </main>
      </body>
    `)

    const snapshot = module.collectDomSnapshot({
      document: dom.window.document,
      href: 'https://store.coupangeats.com/merchant/management/menu/109935',
      pageTitle: '쿠팡이츠 사장님 포털',
      capturedAt: '2026-04-13T00:00:00.000Z',
      captureMode: 'full_scroll'
    })

    expect(snapshot.menuItems).toEqual([
      {
        name: '꾸버스반반피자',
        priceText: '23,900원',
        categoryName: '추천메뉴'
      }
    ])
  })

  it('keeps option group extraction focused on group headers instead of option item rows', async () => {
    const module = await import(
      '../../../browser-extension/delivery-menu-inspector/dom-snapshot.mjs'
    ).catch(() => null)

    expect(module?.collectDomSnapshot).toBeTypeOf('function')

    if (!module?.collectDomSnapshot) {
      return
    }

    const dom = new JSDOM(`
      <body>
        <main>
          <h1>메뉴 편집 ・ 추가</h1>
          <section>
            <div>
              <div>A:</div>
            </div>
            <div>
              <div>* 참고</div>
            </div>
            <div>
              <div>기본</div>
              <div>최대 1 / 최소 1 (필수 옵션) / 왕새우갈비 외 19개</div>
              <article>
                <div>L</div>
                <div>4,000원</div>
              </article>
              <article>
                <div>M</div>
                <div>0원</div>
              </article>
            </div>
            <div>
              <div>도우 추가선택</div>
              <div>최대 1 / 왕새우갈비 외 22개</div>
              <article>
                <div>치즈크러스트 변경</div>
                <div>3,000원</div>
              </article>
            </div>
          </section>
        </main>
      </body>
    `)

    const snapshot = module.collectDomSnapshot({
      document: dom.window.document,
      href: 'https://store.coupangeats.com/merchant/management/menu/109935/options',
      pageTitle: '쿠팡이츠 사장님 포털',
      capturedAt: '2026-04-13T00:00:00.000Z',
      captureMode: 'full_scroll'
    })

    expect(snapshot.optionGroupNames).toEqual(['기본', '도우 추가선택'])
  })

  it('recovers category names from section heading blocks in a live-like menu layout', async () => {
    const module = await import(
      '../../../browser-extension/delivery-menu-inspector/dom-snapshot.mjs'
    ).catch(() => null)

    expect(module?.collectDomSnapshot).toBeTypeOf('function')

    if (!module?.collectDomSnapshot) {
      return
    }

    const dom = new JSDOM(`
      <body>
        <main>
          <h1>메뉴 편집 ・ 추가</h1>
          <div>
            <button>그룹 추가</button>
            <button>추천메뉴</button>
            <button>함께하면 더욱 좋은 음료 및 사이드메뉴</button>
          </div>
          <section>
            <div>추천메뉴</div>
            <div>메뉴 사진은 연출된 이미지로 실제 조리된 음식과 다를 수 있습니다.</div>
            <div>메뉴 추가 순서 변경</div>
            <article>
              <div>왕새우갈비</div>
              <div>23,900원</div>
            </article>
          </section>
          <section>
            <div>함께하면 더욱 좋은 음료 및 사이드메뉴</div>
            <div>메뉴 사진은 연출된 이미지로 실제 조리된 음식과 다를 수 있습니다.</div>
            <div>메뉴 추가 순서 변경</div>
            <article>
              <div>사이다</div>
              <div>1,800원</div>
            </article>
          </section>
        </main>
      </body>
    `)

    const snapshot = module.collectDomSnapshot({
      document: dom.window.document,
      href: 'https://store.coupangeats.com/merchant/management/menu/109935',
      pageTitle: '쿠팡이츠 사장님 포털',
      capturedAt: '2026-04-13T00:00:00.000Z',
      captureMode: 'full_scroll'
    })

    expect(snapshot.menuItems).toEqual([
      {
        name: '왕새우갈비',
        priceText: '23,900원',
        categoryName: '추천메뉴'
      },
      {
        name: '사이다',
        priceText: '1,800원',
        categoryName: '함께하면 더욱 좋은 음료 및 사이드메뉴'
      }
    ])
  })

  it('recovers category names when the section heading is flattened into a single text block', async () => {
    const module = await import(
      '../../../browser-extension/delivery-menu-inspector/dom-snapshot.mjs'
    ).catch(() => null)

    expect(module?.collectDomSnapshot).toBeTypeOf('function')

    if (!module?.collectDomSnapshot) {
      return
    }

    const dom = new JSDOM(`
      <body>
        <main>
          <h1>메뉴 편집 ・ 추가</h1>
          <div>
            <button>그룹 추가</button>
            <button>추천메뉴</button>
            <button>꾸버스반반피자메뉴</button>
            <button>함께하면 더욱 좋은 음료 및 사이드메뉴</button>
          </div>
          <section>
            <div>추천메뉴 메뉴 사진은 연출된 이미지로 실제 조리된 음식과 다를 수 있습니다. 메뉴 추가 순서 변경</div>
          </section>
          <section>
            <div>
              <div>
                <article>
                  <div>왕새우갈비</div>
                  <div>23,900원</div>
                </article>
              </div>
            </div>
          </section>
          <section>
            <div>함께하면 더욱 좋은 음료 및 사이드메뉴 메뉴 사진은 연출된 이미지로 실제 조리된 음식과 다를 수 있습니다. 메뉴 추가 순서 변경</div>
          </section>
          <section>
            <div>
              <div>
                <article>
                  <div>사이다</div>
                  <div>1,800원</div>
                </article>
              </div>
            </div>
          </section>
        </main>
      </body>
    `)

    const snapshot = module.collectDomSnapshot({
      document: dom.window.document,
      href: 'https://store.coupangeats.com/merchant/management/menu/109935',
      pageTitle: '쿠팡이츠 사장님 포털',
      capturedAt: '2026-04-13T00:00:00.000Z',
      captureMode: 'full_scroll'
    })

    expect(snapshot.menuItems).toEqual([
      {
        name: '왕새우갈비',
        priceText: '23,900원',
        categoryName: '추천메뉴'
      },
      {
        name: '사이다',
        priceText: '1,800원',
        categoryName: '함께하면 더욱 좋은 음료 및 사이드메뉴'
      }
    ])
  })

  it('filters only invalid generic option labels while preserving valid group names', async () => {
    const module = await import(
      '../../../browser-extension/delivery-menu-inspector/dom-snapshot.mjs'
    ).catch(() => null)

    expect(module?.collectDomSnapshot).toBeTypeOf('function')

    if (!module?.collectDomSnapshot) {
      return
    }

    const dom = new JSDOM(`
      <body>
        <main>
          <h1>메뉴 편집 ・ 추가</h1>
          <section>
            <div>
              <div>기본</div>
              <div>최대 1 / 최소 1 (필수 옵션) / 왕새우갈비 외 19개</div>
            </div>
            <div>
              <div>가격</div>
              <div>최대 1 / 최소 1 / 메뉴 외 10개</div>
            </div>
            <div>
              <div>추가선택</div>
              <div>최대 1 / 메뉴 외 10개</div>
            </div>
            <div>
              <div>피자 선택</div>
              <div>최대 1 / 메뉴 외 10개</div>
            </div>
            <div>
              <div>피자 선택 1</div>
              <div>최대 1 / 메뉴 외 10개</div>
            </div>
          </section>
        </main>
      </body>
    `)

    const snapshot = module.collectDomSnapshot({
      document: dom.window.document,
      href: 'https://store.coupangeats.com/merchant/management/menu/109935/options',
      pageTitle: '쿠팡이츠 사장님 포털',
      capturedAt: '2026-04-13T00:00:00.000Z',
      captureMode: 'full_scroll'
    })

    expect(snapshot.optionGroupNames).toEqual(['기본', '추가선택', '피자 선택', '피자 선택 1'])
  })

  it('merges scroll segments into one de-duplicated snapshot payload', async () => {
    const module = await import(
      '../../../browser-extension/delivery-menu-inspector/dom-snapshot.mjs'
    ).catch(() => null)

    expect(module?.mergeDomSnapshots).toBeTypeOf('function')

    if (!module?.mergeDomSnapshots) {
      return
    }

    const merged = module.mergeDomSnapshots([
      {
        platformCode: 'coupangeats',
        pageUrl: 'https://store.coupangeats.com/merchant/menu',
        pageTitle: '쿠팡이츠 사장님 포털',
        pageKind: 'menu_list',
        captureMode: 'full_scroll',
        host: 'store.coupangeats.com',
        capturedAt: '2026-04-13T00:00:00.000Z',
        textSnippet: '왕새우갈비 23,900원',
        menuNames: ['왕새우갈비'],
        menuItems: [{ name: '왕새우갈비', priceText: '23,900원', categoryName: '추천메뉴' }],
        optionGroupNames: [],
        buttonLabels: ['메뉴 추가'],
        inputHints: [],
        fields: [{ name: 'menu[0].name', value: '왕새우갈비', source: 'dom' }],
        apiEvents: []
      },
      {
        platformCode: 'coupangeats',
        pageUrl: 'https://store.coupangeats.com/merchant/menu',
        pageTitle: '쿠팡이츠 사장님 포털',
        pageKind: 'menu_list',
        captureMode: 'full_scroll',
        host: 'store.coupangeats.com',
        capturedAt: '2026-04-13T00:00:01.000Z',
        textSnippet: '불고기피자 19,900원',
        menuNames: ['왕새우갈비', '불고기피자'],
        menuItems: [
          { name: '왕새우갈비', priceText: '23,900원', categoryName: '추천메뉴' },
          { name: '불고기피자', priceText: '19,900원', categoryName: '추천메뉴' }
        ],
        optionGroupNames: [],
        buttonLabels: ['메뉴 추가', '그룹 추가'],
        inputHints: [],
        fields: [{ name: 'menu[1].name', value: '불고기피자', source: 'dom' }],
        apiEvents: [
          {
            url: 'https://store.coupangeats.com/api/menus',
            method: 'GET',
            status: 200,
            capturedAt: '2026-04-13T00:00:01.000Z'
          }
        ]
      }
    ])

    expect(merged).not.toBeNull()
    if (!merged) {
      return
    }

    expect(merged.menuNames).toEqual(['왕새우갈비', '불고기피자'])
    expect(merged.menuItems).toEqual([
      { name: '왕새우갈비', priceText: '23,900원', categoryName: '추천메뉴' },
      { name: '불고기피자', priceText: '19,900원', categoryName: '추천메뉴' }
    ])
    expect(merged.buttonLabels).toEqual(['메뉴 추가', '그룹 추가'])
    expect(merged.apiEvents).toEqual([
      expect.objectContaining({
        url: 'https://store.coupangeats.com/api/menus'
      })
    ])
  })

  it('keeps recommendation duplicates but collapses conflicting non-recommend categories to the last one', async () => {
    const module = await import(
      '../../../browser-extension/delivery-menu-inspector/dom-snapshot.mjs'
    ).catch(() => null)

    expect(module?.mergeDomSnapshots).toBeTypeOf('function')

    if (!module?.mergeDomSnapshots) {
      return
    }

    const merged = module.mergeDomSnapshots([
      {
        platformCode: 'coupangeats',
        pageUrl: 'https://store.coupangeats.com/merchant/menu',
        pageTitle: '쿠팡이츠 사장님 포털',
        pageKind: 'menu_list',
        captureMode: 'full_scroll',
        host: 'store.coupangeats.com',
        capturedAt: '2026-04-13T00:00:00.000Z',
        textSnippet: '치즈바이트 25,900원',
        menuNames: ['치즈바이트'],
        menuItems: [
          { name: '치즈바이트', priceText: '25,900원', categoryName: '추천메뉴' },
          { name: '치즈바이트', priceText: '25,900원', categoryName: '선택에 실패 없는 알뜰피자' }
        ],
        optionGroupNames: [],
        buttonLabels: [],
        inputHints: [],
        fields: [],
        apiEvents: []
      },
      {
        platformCode: 'coupangeats',
        pageUrl: 'https://store.coupangeats.com/merchant/menu',
        pageTitle: '쿠팡이츠 사장님 포털',
        pageKind: 'menu_list',
        captureMode: 'full_scroll',
        host: 'store.coupangeats.com',
        capturedAt: '2026-04-13T00:00:01.000Z',
        textSnippet: '치즈바이트 25,900원',
        menuNames: ['치즈바이트'],
        menuItems: [
          { name: '치즈바이트', priceText: '25,900원', categoryName: '특별함원한다면! 프리미엄피자' }
        ],
        optionGroupNames: [],
        buttonLabels: [],
        inputHints: [],
        fields: [],
        apiEvents: []
      }
    ])

    expect(merged).not.toBeNull()
    if (!merged) {
      return
    }

    expect(merged.menuItems).toEqual([
      { name: '치즈바이트', priceText: '25,900원', categoryName: '추천메뉴' },
      { name: '치즈바이트', priceText: '25,900원', categoryName: '특별함원한다면! 프리미엄피자' }
    ])
  })
})
