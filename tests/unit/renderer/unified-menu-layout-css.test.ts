import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('unified menu scroll layout', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/renderer/src/App.css'), 'utf8')

  it('gives the workspace a bounded viewport height without conflicting min and max heights', () => {
    const rule = css.match(/\.menu-workspace\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/height:\s*clamp\([^;]*100dvh[^;]*\)/)
    expect(rule).not.toMatch(/min-height:\s*620px/)
    expect(rule).not.toMatch(/max-height:/)
  })

  it('lets the menu list shrink and delegates scrolling to the list body', () => {
    const pane = css.match(/\.menu-list-pane\s*\{([^}]*)\}/)?.[1] ?? ''
    const list = css.match(/\.menu-compact-list\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(pane).toMatch(/display:\s*flex/)
    expect(pane).toMatch(/flex-direction:\s*column/)
    expect(pane).toMatch(/min-height:\s*0/)
    expect(list).toMatch(/flex:\s*1/)
    expect(list).toMatch(/min-height:\s*0/)
    expect(list).toMatch(/overflow-y:\s*auto/)
  })
})
