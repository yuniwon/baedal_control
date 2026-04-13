import { describe, expect, it } from 'vitest'
import { nextPresenceState } from '../../../src/main/services/absence-state-service'

describe('nextPresenceState', () => {
  it('marks the first miss as missing_suspected', () => {
    expect(
      nextPresenceState({
        previousStatus: 'present',
        previousMissingStreak: 0,
        isSeenInCurrentImport: false
      })
    ).toEqual({
      missingStreak: 1,
      presenceStatus: 'missing_suspected'
    })
  })

  it('marks the second consecutive miss as absent_confirmed', () => {
    expect(
      nextPresenceState({
        previousStatus: 'missing_suspected',
        previousMissingStreak: 1,
        isSeenInCurrentImport: false
      })
    ).toEqual({
      missingStreak: 2,
      presenceStatus: 'absent_confirmed'
    })
  })

  it('marks a reappearance from absent_confirmed as resurfaced', () => {
    expect(
      nextPresenceState({
        previousStatus: 'absent_confirmed',
        previousMissingStreak: 2,
        isSeenInCurrentImport: true
      })
    ).toEqual({
      missingStreak: 0,
      presenceStatus: 'resurfaced'
    })
  })

  it('marks a reappearance from missing_suspected as resurfaced', () => {
    expect(
      nextPresenceState({
        previousStatus: 'missing_suspected',
        previousMissingStreak: 1,
        isSeenInCurrentImport: true
      })
    ).toEqual({
      missingStreak: 0,
      presenceStatus: 'resurfaced'
    })
  })

  it('keeps a normally seen row as present', () => {
    expect(
      nextPresenceState({
        previousStatus: 'present',
        previousMissingStreak: 0,
        isSeenInCurrentImport: true
      })
    ).toEqual({
      missingStreak: 0,
      presenceStatus: 'present'
    })
  })
})
