declare module '*.mjs' {
  export interface CollectDomSnapshotInput {
    document: Document
    href: string
    pageTitle: string
    capturedAt: string
    captureMode?: 'viewport' | 'full_scroll'
    apiEvents?: Array<{
      url: string
      method: string
      status?: number | null
      capturedAt: string
      requestPreview?: string | null
      responsePreview?: string | null
    }>
    screenshotDataUrl?: string | null
  }

  export interface CollectDomSnapshotMenuItem {
    name: string
    priceText?: string | null
    categoryName?: string | null
  }

  export interface CollectDomSnapshotResult {
    platformCode: 'baemin' | 'coupangeats' | 'ddangyo'
    pageUrl: string
    pageTitle: string
    pageKind: 'menu_list' | 'option_list' | 'menu_detail' | 'unknown'
    captureMode: 'viewport' | 'full_scroll'
    host: string
    capturedAt: string
    textSnippet: string
    menuNames: string[]
    menuItems: CollectDomSnapshotMenuItem[]
    optionGroupNames: string[]
    buttonLabels: string[]
    inputHints: string[]
    fields: Array<{
      name: string
      value: string
      source: 'dom' | 'input' | 'button' | 'text' | 'api'
    }>
    apiEvents: CollectDomSnapshotInput['apiEvents']
    screenshotDataUrl?: string | null
  }

  export const collectDomSnapshot: (
    input: CollectDomSnapshotInput
  ) => CollectDomSnapshotResult

  export const mergeDomSnapshots: (
    snapshots: CollectDomSnapshotResult[]
  ) => CollectDomSnapshotResult | null
}
