export const formatSyncSummary = (value?: string | null) => {
  if (!value) {
    return ''
  }

  const legacyMatch = value.match(/^(\d+)\s+succeeded,\s+(\d+)\s+failed$/i)
  if (!legacyMatch) {
    return value
  }

  const [, successCount, failureCount] = legacyMatch
  return `성공 ${successCount}건, 실패 ${failureCount}건`
}
