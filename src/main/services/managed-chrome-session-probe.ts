import { URL } from 'node:url'
import type {
  BrowserInspectionPageKind,
  ManagedChromeSessionStatus,
  ManagedChromeTabInfo
} from '../../shared/contracts'
import { inferPlatformCodeFromHost } from '../../shared/platforms'

interface ManagedChromeSessionProbeOptions {
  endpointUrl?: string
  fetch?: typeof fetch
}

interface DevtoolsListEntry {
  id?: string
  title?: string
  type?: string
  url?: string
}

const inferPageKind = (url: string): BrowserInspectionPageKind => {
  if (/\/options?(?:\/|$)|[?&]tab=option/i.test(url)) {
    return 'option_list'
  }

  if (/\/menu(?:\/|$)|\/management\/menu/i.test(url)) {
    return 'menu_list'
  }

  return 'unknown'
}

export class ManagedChromeSessionProbe {
  private readonly endpointUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options: ManagedChromeSessionProbeOptions = {}) {
    this.endpointUrl = options.endpointUrl ?? 'http://127.0.0.1:39482'
    this.fetchImpl = options.fetch ?? globalThis.fetch
  }

  async inspect(): Promise<ManagedChromeSessionStatus> {
    try {
      const response = await this.fetchImpl(`${this.endpointUrl}/json/list`)
      if (!response.ok) {
        return {
          endpointUrl: this.endpointUrl,
          connected: false,
          error: `devtools_http_${response.status}`,
          tabs: []
        }
      }

      const payload = (await response.json()) as DevtoolsListEntry[]
      const tabs = payload
        .filter((entry) => entry.type === 'page' && typeof entry.url === 'string')
        .map((entry): ManagedChromeTabInfo => {
          const parsedUrl = this.parseUrl(entry.url ?? '')
          return {
            tabId: entry.id ?? entry.url ?? 'unknown-tab',
            title: entry.title?.trim() || parsedUrl.url || '이름 없는 탭',
            url: parsedUrl.url,
            type: entry.type ?? 'page',
            host: parsedUrl.host,
            platformCode: inferPlatformCodeFromHost(parsedUrl.host),
            pageKind: inferPageKind(parsedUrl.url)
          }
        })

      return {
        endpointUrl: this.endpointUrl,
        connected: true,
        error: null,
        tabs
      }
    } catch (error) {
      return {
        endpointUrl: this.endpointUrl,
        connected: false,
        error: error instanceof Error ? error.message : 'unknown_error',
        tabs: []
      }
    }
  }

  private parseUrl(value: string) {
    try {
      const parsed = new URL(value)
      return {
        url: parsed.toString(),
        host: parsed.host
      }
    } catch {
      return {
        url: value,
        host: ''
      }
    }
  }
}
