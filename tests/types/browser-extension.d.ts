declare module '../../../browser-extension/delivery-menu-inspector/dom-snapshot.mjs' {
  export interface CollectDomSnapshotInput {
    document: Document
    href: string
    pageTitle: string
    capturedAt: string
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

  export interface CollectDomSnapshotResult {
    platformCode: 'baemin' | 'coupangeats' | 'ddangyo'
    pageUrl: string
    pageTitle: string
    host: string
    capturedAt: string
    textSnippet: string
    menuNames: string[]
    optionGroupNames: string[]
    buttonLabels: string[]
    inputHints: string[]
    fields: Array<{
      name: string
      value: string
      source: 'input'
    }>
    apiEvents: CollectDomSnapshotInput['apiEvents']
    screenshotDataUrl?: string | null
  }

  export const collectDomSnapshot: (
    input: CollectDomSnapshotInput
  ) => CollectDomSnapshotResult
}
