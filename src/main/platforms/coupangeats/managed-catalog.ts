export const expandCoupangEatsOptionPayload = (
  optionPayload: unknown,
  detailPayloads: unknown[]
): unknown => {
  const asRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  const root = asRecord(optionPayload)
  const optionGroups = Array.isArray(root?.data) ? root.data : []
  const detailByOptionId = new Map<string, Record<string, unknown>>()

  for (const payload of detailPayloads) {
    const detail = asRecord(asRecord(payload)?.data)
    if (detail?.optionId != null) {
      detailByOptionId.set(String(detail.optionId), detail)
    }
  }

  const expandedGroups = optionGroups.map((groupValue) => {
    const group = asRecord(groupValue)
    if (!group || group.optionId == null) return groupValue
    const detail = detailByOptionId.get(String(group.optionId))
    const mappingDishes = Array.isArray(detail?.mappingDishes)
      ? detail.mappingDishes
      : Array.isArray(group.mappingDishes)
        ? group.mappingDishes
        : []
    return {
      ...group,
      ...(detail ?? {}),
      mappingDishes,
      mappingDishCount: mappingDishes.length
    }
  })

  return root ? { ...root, data: expandedGroups } : optionPayload
}
