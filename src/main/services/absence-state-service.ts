import type { CatalogPresenceStatus } from '../../shared/contracts'

export const nextPresenceState = ({
  previousStatus,
  previousMissingStreak,
  isSeenInCurrentImport
}: {
  previousStatus: CatalogPresenceStatus
  previousMissingStreak: number
  isSeenInCurrentImport: boolean
}) => {
  if (isSeenInCurrentImport) {
    return {
      missingStreak: 0,
      presenceStatus:
        previousStatus === 'missing_suspected' || previousStatus === 'absent_confirmed'
          ? 'resurfaced'
          : 'present'
    } as const
  }

  const missingStreak = previousMissingStreak + 1

  return {
    missingStreak,
    presenceStatus: missingStreak >= 2 ? 'absent_confirmed' : 'missing_suspected'
  } as const
}
