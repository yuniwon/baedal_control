import type { BrowserInspectionApiEvent } from '../../../shared/contracts'
import { isProvenFullCollectionEvent } from '../browser-catalog/collection-event-proof'

export const isDeliverySpecialFullMenuCollectionEvent = (event: BrowserInspectionApiEvent) =>
  isProvenFullCollectionEvent(event, {
    urlTerms: ['menu', 'product', 'item'],
    collectionKeys: ['menus', 'menuItems', 'products', 'items']
  })

export const isDeliverySpecialFullOptionCollectionEvent = (event: BrowserInspectionApiEvent) =>
  isProvenFullCollectionEvent(event, {
    urlTerms: ['option'],
    collectionKeys: ['options', 'optionGroups', 'optionGroupList']
  })
