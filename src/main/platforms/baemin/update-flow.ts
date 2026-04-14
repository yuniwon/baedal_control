type BaeminSearchCandidate = {
  platformMenuId?: string | null
  buttonText: string
  contextText: string
}

type BaeminSearchTarget = {
  platformMenuId?: string | null
  previousName: string
  platformMenuBindingSummary?: string | null
  platformMenuPriceSummary?: string | null
}

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
const compact = (value: string) => normalize(value).replaceAll('·', '').replace(/\s+/g, '')

const hasBindingText = (value: string) => /\[[^\]]+\]/.test(value)
const isNoBindingSummary = (value?: string | null) =>
  Boolean(value && /(연결.*없음|가게.*없음)/.test(normalize(value)))

const buildPriceTokens = (summary?: string | null) =>
  (summary ?? '')
    .split(/[\/·]/)
    .map((token) => compact(token))
    .filter((token) => token.length > 0)

export const pickBaeminSearchResult = <T extends BaeminSearchCandidate>(
  candidates: T[],
  target: BaeminSearchTarget
) => {
  if (target.platformMenuId) {
    const matchedById = candidates.filter(
      (candidate) => candidate.platformMenuId === target.platformMenuId
    )

    if (matchedById.length === 1) {
      return matchedById[0]
    }

    if (matchedById.length > 1) {
      candidates = matchedById
    }
  }

  const namedCandidates = candidates.filter((candidate) =>
    normalize(candidate.contextText).includes(normalize(target.previousName))
  )

  if (namedCandidates.length === 0) {
    throw new Error('baemin_menu_match_not_found')
  }

  let narrowed = namedCandidates

  if (target.platformMenuBindingSummary) {
    const matchedBinding = isNoBindingSummary(target.platformMenuBindingSummary)
      ? namedCandidates.filter((candidate) => !hasBindingText(candidate.contextText))
      : namedCandidates.filter((candidate) =>
          normalize(candidate.contextText).includes(normalize(target.platformMenuBindingSummary ?? ''))
        )

    if (matchedBinding.length > 0) {
      narrowed = matchedBinding
    }
  } else {
    const noBindingCandidates = namedCandidates.filter(
      (candidate) => !hasBindingText(candidate.contextText)
    )

    if (noBindingCandidates.length > 0) {
      narrowed = noBindingCandidates
    }
  }

  if (narrowed.length === 1) {
    return narrowed[0]
  }

  const priceTokens = buildPriceTokens(target.platformMenuPriceSummary)
  if (priceTokens.length > 0) {
    const matchedPrice = narrowed.filter((candidate) => {
      const normalizedContext = compact(candidate.contextText)
      return priceTokens.every((token) => normalizedContext.includes(token))
    })

    if (matchedPrice.length === 1) {
      return matchedPrice[0]
    }

    if (matchedPrice.length > 0) {
      narrowed = matchedPrice
    }
  }

  if (narrowed.length === 1) {
    return narrowed[0]
  }

  throw new Error('baemin_menu_match_ambiguous')
}
