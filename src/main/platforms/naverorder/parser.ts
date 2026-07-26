import type { BrowserInspectionApiEvent } from '../../../shared/contracts'
import { isProvenFullCollectionEvent } from '../browser-catalog/collection-event-proof'

export const isNaverOrderFullMenuCollectionEvent = (event: BrowserInspectionApiEvent) =>
  isProvenFullCollectionEvent(event, {
    urlTerms: ['menu', 'product', 'item'],
    collectionKeys: ['menus', 'menuItems', 'products', 'items']
  })

export const isNaverOrderFullOptionCollectionEvent = (event: BrowserInspectionApiEvent) =>
  isProvenFullCollectionEvent(event, {
    urlTerms: ['option'],
    collectionKeys: ['options', 'optionGroups', 'optionGroupList']
  })
