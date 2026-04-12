export const normalizeMenuName = (value: string) =>
  value.toLowerCase().replace(/[\s()\-_/]/g, '')

export const scoreMenuMatch = (left: string, right: string) => {
  const normalizedLeft = normalizeMenuName(left)
  const normalizedRight = normalizeMenuName(right)

  if (normalizedLeft === normalizedRight) {
    return 1
  }

  if (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  ) {
    return 0.9
  }

  const overlap = [...new Set(normalizedLeft)].filter((character) =>
    normalizedRight.includes(character)
  ).length

  return overlap / Math.max(normalizedLeft.length, normalizedRight.length, 1)
}
