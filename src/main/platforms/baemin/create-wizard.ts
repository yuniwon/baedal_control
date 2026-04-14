export interface BaeminCreateWizardGroupOption {
  value: string
  label: string
}

const preferredAdvanceLabels = ['다음', '적용하기', '확인'] as const
const prioritizedVisibleControlPatterns = [/^메뉴 추가$/u, /^다음$/u, /^적용하기$/u, /^확인$/u] as const

export const pickBaeminCreateWizardAdvanceButtonLabel = (labels: string[]) => {
  for (const preferredLabel of preferredAdvanceLabels) {
    if (labels.includes(preferredLabel)) {
      return preferredLabel
    }
  }

  return null
}

export const pickBaeminCreateWizardGroupOptionValue = (
  options: BaeminCreateWizardGroupOption[]
) => {
  const normalizedOptions = options.filter((option) => option.value.trim().length > 0)
  if (normalizedOptions.length === 0) {
    return null
  }

  const preferredOption = normalizedOptions.find((option) =>
    /소스\s*추가|소스추가/u.test(option.label)
  )

  return preferredOption?.value ?? normalizedOptions[0].value
}

export const prioritizeBaeminCreateWizardVisibleControlLabels = (
  labels: string[],
  limit = 10
) => {
  const dedupedLabels = labels.filter(
    (label, index) => label.trim().length > 0 && labels.indexOf(label) === index
  )
  const prioritized: string[] = []

  for (const pattern of prioritizedVisibleControlPatterns) {
    const matchedLabel = dedupedLabels.find((label) => pattern.test(label))
    if (matchedLabel) {
      prioritized.push(matchedLabel)
    }
  }

  for (const label of dedupedLabels) {
    if (prioritized.includes(label)) {
      continue
    }

    prioritized.push(label)
  }

  return prioritized.slice(0, limit)
}
