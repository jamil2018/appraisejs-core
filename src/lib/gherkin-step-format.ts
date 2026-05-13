type OrderedGherkinStep = {
  gherkinStep?: string | null
  order: number
}

const GHERKIN_KEYWORDS = ['given', 'when', 'then', 'and', 'but'] as const
const THEN_LIKE_PREFIXES = ['should', 'must', 'will'] as const

type StepFormatState = {
  hasThenInPrevious: boolean
  hasWhenInPrevious: boolean
}

function splitGherkinStep(gherkinStep: string) {
  const trimmedStep = gherkinStep.trim()
  const [firstWord = '', ...rest] = trimmedStep.split(' ')
  const normalizedFirstWord = firstWord.toLowerCase()

  return {
    firstWord: normalizedFirstWord,
    text: GHERKIN_KEYWORDS.includes(normalizedFirstWord as (typeof GHERKIN_KEYWORDS)[number])
      ? rest.join(' ')
      : trimmedStep,
  }
}

function isThenStatement(firstWord: string, stepText: string) {
  const normalizedStep = stepText.toLowerCase()
  return firstWord === 'then' || THEN_LIKE_PREFIXES.some(prefix => normalizedStep.startsWith(prefix))
}

function formatFollowingStep(
  stepText: string,
  isThenLike: boolean,
  state: StepFormatState,
  resetWhenAfterThen: boolean,
) {
  if (!state.hasThenInPrevious) {
    if (isThenLike) {
      state.hasThenInPrevious = true
      return `Then ${stepText}`
    }

    if (!state.hasWhenInPrevious) {
      state.hasWhenInPrevious = true
      return `When ${stepText}`
    }

    return `And ${stepText}`
  }

  if (isThenLike) {
    return `And ${stepText}`
  }

  state.hasThenInPrevious = false
  state.hasWhenInPrevious = !resetWhenAfterThen
  return `When ${stepText}`
}

export function formatOrderedGherkinSteps(
  steps: OrderedGherkinStep[],
  options: { resetWhenAfterThen?: boolean } = {},
): string[] {
  const sortedSteps = [...steps].sort((left, right) => left.order - right.order)
  const state: StepFormatState = {
    hasThenInPrevious: false,
    hasWhenInPrevious: false,
  }

  return sortedSteps.map((step, index) => {
    const { firstWord, text } = splitGherkinStep(step.gherkinStep ?? '')

    if (index === 0) {
      return `Given ${text}`
    }

    return formatFollowingStep(text, isThenStatement(firstWord, text), state, options.resetWhenAfterThen ?? false)
  })
}
