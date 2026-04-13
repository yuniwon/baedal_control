import { describe, expect, it } from 'vitest'
import { diffCatalogRows } from '../../../src/main/services/catalog-diff-service'

describe('diffCatalogRows', () => {
  it('emits created, comparable change, and missing_suspected changes in one run', () => {
    const result = diffCatalogRows({
      platformCode: 'baemin',
      importRunId: 'run-1',
      entityType: 'menu',
      comparableChangeType: 'price_changed',
      previousRows: [
        {
          key: 'menu-a',
          name: '감자피자',
          comparable: { price: 19900 },
          previousMissingStreak: 0,
          previousPresenceStatus: 'present'
        },
        {
          key: 'menu-b',
          name: '불고기피자',
          comparable: { price: 20900 },
          previousMissingStreak: 0,
          previousPresenceStatus: 'present'
        }
      ],
      currentRows: [
        {
          key: 'menu-a',
          name: '감자피자',
          comparable: { price: 21900 }
        },
        {
          key: 'menu-c',
          name: '새우피자',
          comparable: { price: 23900 }
        }
      ]
    })

    expect(result.changes.map((change) => change.changeType)).toEqual([
      'price_changed',
      'created',
      'missing_suspected'
    ])
    expect(result.presenceUpdates).toEqual([
      { key: 'menu-a', missingStreak: 0, presenceStatus: 'present' },
      { key: 'menu-c', missingStreak: 0, presenceStatus: 'present' },
      { key: 'menu-b', missingStreak: 1, presenceStatus: 'missing_suspected' }
    ])
  })

  it('promotes a second missing row to absent_confirmed', () => {
    const result = diffCatalogRows({
      platformCode: 'baemin',
      importRunId: 'run-2',
      entityType: 'menu',
      comparableChangeType: 'price_changed',
      previousRows: [
        {
          key: 'menu-a',
          name: '감자피자',
          comparable: { price: 19900 },
          previousMissingStreak: 1,
          previousPresenceStatus: 'missing_suspected'
        }
      ],
      currentRows: []
    })

    expect(result.changes).toEqual([
      expect.objectContaining({
        importRunId: 'run-2',
        platformCode: 'baemin',
        entityType: 'menu',
        entityKey: 'menu-a',
        entityName: '감자피자',
        changeType: 'absent_confirmed',
        presenceStatus: 'absent_confirmed'
      })
    ])
    expect(result.presenceUpdates).toEqual([
      { key: 'menu-a', missingStreak: 2, presenceStatus: 'absent_confirmed' }
    ])
  })

  it('emits resurfaced for a row that reappears and resets the streak', () => {
    const result = diffCatalogRows({
      platformCode: 'baemin',
      importRunId: 'run-3',
      entityType: 'option_group',
      comparableChangeType: 'option_signature_changed',
      previousRows: [
        {
          key: 'group-a',
          name: '사이즈 선택',
          comparable: { signature: 'm|l' },
          previousMissingStreak: 2,
          previousPresenceStatus: 'absent_confirmed'
        }
      ],
      currentRows: [
        {
          key: 'group-a',
          name: '사이즈 선택',
          comparable: { signature: 'm|l' }
        }
      ]
    })

    expect(result.changes).toEqual([
      expect.objectContaining({
        importRunId: 'run-3',
        platformCode: 'baemin',
        entityType: 'option_group',
        entityKey: 'group-a',
        changeType: 'resurfaced',
        presenceStatus: 'resurfaced'
      })
    ])
    expect(result.presenceUpdates).toEqual([
      { key: 'group-a', missingStreak: 0, presenceStatus: 'resurfaced' }
    ])
  })

  it('emits resurfaced when a missing_suspected row reappears unchanged', () => {
    const result = diffCatalogRows({
      platformCode: 'baemin',
      importRunId: 'run-3b',
      entityType: 'menu',
      comparableChangeType: 'price_changed',
      previousRows: [
        {
          key: 'menu-a',
          name: '감자피자',
          comparable: {
            tags: ['x', 'y'],
            meta: { b: 2, a: 1 },
            price: 19900
          },
          previousMissingStreak: 1,
          previousPresenceStatus: 'missing_suspected'
        }
      ],
      currentRows: [
        {
          key: 'menu-a',
          name: '감자피자',
          comparable: {
            price: 19900,
            meta: { a: 1, b: 2 },
            tags: ['x', 'y']
          }
        }
      ]
    })

    expect(result.changes).toEqual([
      expect.objectContaining({
        importRunId: 'run-3b',
        platformCode: 'baemin',
        entityType: 'menu',
        entityKey: 'menu-a',
        changeType: 'resurfaced',
        presenceStatus: 'resurfaced',
        beforeJson: '{"meta":{"a":1,"b":2},"price":19900,"tags":["x","y"]}',
        afterJson: '{"meta":{"a":1,"b":2},"price":19900,"tags":["x","y"]}'
      })
    ])
    expect(result.presenceUpdates).toEqual([
      { key: 'menu-a', missingStreak: 0, presenceStatus: 'resurfaced' }
    ])
  })

  it('returns a present presence update for an unchanged seen row without a change record', () => {
    const result = diffCatalogRows({
      platformCode: 'baemin',
      importRunId: 'run-4',
      entityType: 'menu',
      comparableChangeType: 'price_changed',
      previousRows: [
        {
          key: 'menu-a',
          name: '감자피자',
          comparable: { price: 19900 },
          previousMissingStreak: 0,
          previousPresenceStatus: 'present'
        }
      ],
      currentRows: [
        {
          key: 'menu-a',
          name: '감자피자',
          comparable: { price: 19900 }
        }
      ]
    })

    expect(result.changes).toEqual([])
    expect(result.presenceUpdates).toEqual([
      { key: 'menu-a', missingStreak: 0, presenceStatus: 'present' }
    ])
  })

  it('returns the same ordered outputs for equivalent input permutations', () => {
    const left = diffCatalogRows({
      platformCode: 'baemin',
      importRunId: 'run-5',
      entityType: 'menu',
      comparableChangeType: 'price_changed',
      previousRows: [
        {
          key: 'menu-b',
          name: '불고기피자',
          comparable: { price: 22000 },
          previousMissingStreak: 0,
          previousPresenceStatus: 'present'
        },
        {
          key: 'menu-a',
          name: '감자피자',
          comparable: { price: 19000 },
          previousMissingStreak: 1,
          previousPresenceStatus: 'missing_suspected'
        },
        {
          key: 'menu-d',
          name: '페퍼로니',
          comparable: { price: 24000 },
          previousMissingStreak: 0,
          previousPresenceStatus: 'present'
        }
      ],
      currentRows: [
        {
          key: 'menu-c',
          name: '새우피자',
          comparable: { price: 25000 }
        },
        {
          key: 'menu-a',
          name: '감자피자',
          comparable: { price: 20000 }
        },
        {
          key: 'menu-b',
          name: '불고기피자',
          comparable: { price: 23000 }
        }
      ]
    })
    const right = diffCatalogRows({
      platformCode: 'baemin',
      importRunId: 'run-5',
      entityType: 'menu',
      comparableChangeType: 'price_changed',
      previousRows: [
        {
          key: 'menu-d',
          name: '페퍼로니',
          comparable: { price: 24000 },
          previousMissingStreak: 0,
          previousPresenceStatus: 'present'
        },
        {
          key: 'menu-a',
          name: '감자피자',
          comparable: { price: 19000 },
          previousMissingStreak: 1,
          previousPresenceStatus: 'missing_suspected'
        },
        {
          key: 'menu-b',
          name: '불고기피자',
          comparable: { price: 22000 },
          previousMissingStreak: 0,
          previousPresenceStatus: 'present'
        }
      ],
      currentRows: [
        {
          key: 'menu-b',
          name: '불고기피자',
          comparable: { price: 23000 }
        },
        {
          key: 'menu-a',
          name: '감자피자',
          comparable: { price: 20000 }
        },
        {
          key: 'menu-c',
          name: '새우피자',
          comparable: { price: 25000 }
        }
      ]
    })

    expect(left).toEqual(right)
    expect(left.changes.map((change) => `${change.entityKey}:${change.changeType}`)).toEqual([
      'menu-a:resurfaced',
      'menu-a:price_changed',
      'menu-b:price_changed',
      'menu-c:created',
      'menu-d:missing_suspected'
    ])
    expect(left.presenceUpdates).toEqual([
      { key: 'menu-a', missingStreak: 0, presenceStatus: 'resurfaced' },
      { key: 'menu-b', missingStreak: 0, presenceStatus: 'present' },
      { key: 'menu-c', missingStreak: 0, presenceStatus: 'present' },
      { key: 'menu-d', missingStreak: 1, presenceStatus: 'missing_suspected' }
    ])
  })

  it('throws a clear error when previousRows contains duplicate keys', () => {
    expect(() =>
      diffCatalogRows({
        platformCode: 'baemin',
        importRunId: 'run-6',
        entityType: 'menu',
        comparableChangeType: 'price_changed',
        previousRows: [
          {
            key: 'menu-a',
            name: '감자피자',
            comparable: { price: 19900 },
            previousMissingStreak: 0,
            previousPresenceStatus: 'present'
          },
          {
            key: 'menu-a',
            name: '감자피자 복제',
            comparable: { price: 20900 },
            previousMissingStreak: 0,
            previousPresenceStatus: 'present'
          }
        ],
        currentRows: []
      })
    ).toThrow('Duplicate key in previousRows: menu-a')
  })

  it('throws a clear error when currentRows contains duplicate keys', () => {
    expect(() =>
      diffCatalogRows({
        platformCode: 'baemin',
        importRunId: 'run-7',
        entityType: 'menu',
        comparableChangeType: 'price_changed',
        previousRows: [],
        currentRows: [
          {
            key: 'menu-a',
            name: '감자피자',
            comparable: { price: 19900 }
          },
          {
            key: 'menu-a',
            name: '감자피자 복제',
            comparable: { price: 20900 }
          }
        ]
      })
    ).toThrow('Duplicate key in currentRows: menu-a')
  })
})
