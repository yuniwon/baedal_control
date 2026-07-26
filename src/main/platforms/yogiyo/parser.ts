import type { BrowserInspectionApiEvent } from '../../../shared/contracts'
import { isProvenFullCollectionEvent } from '../browser-catalog/collection-event-proof'

export const isYogiyoFullMenuCollectionEvent = (event: BrowserInspectionApiEvent) =>
  isProvenFullCollectionEvent(event, {
    urlTerms: ['menu', 'dish', 'product'],
    collectionKeys: ['menus', 'menuItems', 'dishes', 'products']
  })

export const isYogiyoFullOptionCollectionEvent = (event: BrowserInspectionApiEvent) =>
  isProvenFullCollectionEvent(event, {
    urlTerms: ['option'],
    collectionKeys: ['options', 'optionGroups', 'optionGroupList']
  })
