import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ManagedChromeSessionStatus, SyncPreviewItem } from '../../../shared/contracts'

interface CoupangEatsManagedBrowserUpdaterDependencies {
  managedChromeSessionProbe: {
    inspect: () => Promise<ManagedChromeSessionStatus> | ManagedChromeSessionStatus
  }
  managedChromeScriptRunner: {
    evaluateJson: <T>(tabId: string, expression: string) => Promise<T>
  }
  loadManagedBrowserScript?: () => Promise<string>
}

const loadManagedBrowserScriptSource = () =>
  readFile(
    join(process.cwd(), 'src', 'main', 'platforms', 'coupangeats', 'managed-browser-update-script.mjs'),
    'utf8'
  )

const sanitizeModuleSource = (value: string) => value.replace(/^export\s+/gmu, '')

const buildManagedBrowserExpression = (scriptSource: string, item: SyncPreviewItem) => `
(async () => {
${sanitizeModuleSource(scriptSource)}
  return JSON.stringify(
    await applyManagedBrowserMenuUpdate(${JSON.stringify({
      platformMenuId: item.platformMenuId,
      previousName: item.previousName,
      previousPrice: item.previousPrice ?? null,
      nextName: item.nextName,
      nextPrice: item.nextPrice,
      platformMenuGroupName: item.platformMenuGroupName ?? null
    })})
  )
})()
`

export class CoupangEatsManagedBrowserUpdater {
  private readonly loadManagedBrowserScript: () => Promise<string>

  constructor(private readonly deps: CoupangEatsManagedBrowserUpdaterDependencies) {
    this.loadManagedBrowserScript =
      deps.loadManagedBrowserScript ?? loadManagedBrowserScriptSource
  }

  async applyMenuUpdate(item: SyncPreviewItem) {
    const session = await this.deps.managedChromeSessionProbe.inspect()
    const menuTab = session.tabs.find(
      (tab) => tab.platformCode === 'coupangeats' && tab.pageKind === 'menu_list'
    )

    if (!menuTab) {
      throw new Error('coupangeats_managed_menu_tab_not_found')
    }

    const scriptSource = await this.loadManagedBrowserScript()
    const result = await this.deps.managedChromeScriptRunner.evaluateJson<{
      status?: string
      message?: string
    }>(menuTab.tabId, buildManagedBrowserExpression(scriptSource, item))

    if (result.status === 'saved' || result.status === 'no_change') {
      return
    }

    throw new Error(
      `coupangeats_managed_update_failed:${result.status ?? 'unknown'}:${result.message ?? 'unknown_error'}`
    )
  }
}
