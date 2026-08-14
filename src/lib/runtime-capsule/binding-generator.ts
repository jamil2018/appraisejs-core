import { canonicalRuntimeCapsuleJson } from './contracts'

type GeneratedBindingStep = {
  keywordText: string
  invocation: { presentation?: unknown; [key: string]: unknown }
  locatorCardinalities?: Record<string, 'exactlyOne' | 'collection'>
}

function registrationLines(bindings: unknown): string {
  if (!Array.isArray(bindings)) return ''
  const expressions = new Set<string>()
  return bindings
    .flatMap(testCase =>
      testCase && typeof testCase === 'object' && Array.isArray((testCase as { steps?: unknown }).steps)
        ? (testCase as { steps: GeneratedBindingStep[] }).steps
        : [],
    )
    .flatMap(step => {
      const separator = step.keywordText.indexOf(' ')
      const keyword = step.keywordText.slice(0, separator)
      const expressionText = step.keywordText.slice(separator + 1)
      if (expressions.has(expressionText)) return []
      expressions.add(expressionText)
      const expression = expressionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return [
        `registrations[${JSON.stringify(keyword)}](new RegExp(${JSON.stringify(`^${expression}$`)}), async function () { await dispatch(this, ${canonicalRuntimeCapsuleJson(step)}) })`,
      ]
    })
    .join('\n')
}

export function generateExecutableBindings(input: {
  bindings: unknown
  selectors: Record<string, string>
  operationCardinalities?: Record<string, Record<string, 'exactlyOne' | 'collection'>>
  sealedDefinitions: unknown
  extensionModules: Record<string, string>
  runtimeImport: string
}) {
  const staticRegistrations = registrationLines(input.bindings)
  return `import { Given, When, Then, dispatchStepInvocation } from '${input.runtimeImport}'

const cases = ${canonicalRuntimeCapsuleJson(input.bindings)}
const selectors = ${canonicalRuntimeCapsuleJson(input.selectors)}
const operationCardinalities = ${canonicalRuntimeCapsuleJson(input.operationCardinalities ?? {})}
const sealedDefinitions = ${canonicalRuntimeCapsuleJson(input.sealedDefinitions)}
const extensionModules = Object.fromEntries(Object.entries(${canonicalRuntimeCapsuleJson(input.extensionModules)}).map(([key, value]) => [key, new URL(value, import.meta.url).href]))
const registrations = { Given, When, Then, And: Given }
const locatorName = reference => typeof reference === 'string' ? reference : reference?.id
const locatorNames = reference => {
  const name = locatorName(reference)
  if (typeof name !== 'string') return []
  return name.startsWith('locator_') ? [name, name.slice('locator_'.length)] : [name, 'locator_' + name]
}
const reviewedSelector = reference => locatorNames(reference).map(name => selectors[name]).find(Boolean) ?? null
const resolveLocator = (world, reference) => {
  const selector = reviewedSelector(reference)
  if (!selector) throw new Error('Reviewed locator could not be resolved.')
  return world.page.locator(selector)
}
const resolveSelector = reference => reviewedSelector(reference)
const dispatch = async (world, step) => {
  const baseUrl = process.env.APPRAISE_BASE_URL ?? 'http://localhost'
  await dispatchStepInvocation({
    invocation: step.invocation,
    sealedDefinitions,
    context: {
      world,
      resolveLocator: reference => resolveLocator(world, reference),
      resolveSelector,
      locatorCardinalities: step.locatorCardinalities,
      operationCardinalities,
      extensionModules,
      baseUrl,
      environment: { baseUrl },
    },
  })
}
const registeredExpressions = new Map()
for (const testCase of cases) for (const step of testCase.steps) {
  const expressionText = step.keywordText.slice(step.keywordText.indexOf(' ') + 1)
  const { presentation: _presentation, ...executionInvocation } = step.invocation
  const signature = JSON.stringify({ invocation: executionInvocation })
  const existingSignature = registeredExpressions.get(expressionText)
  if (existingSignature !== undefined) {
    if (existingSignature !== signature) throw new Error(\`Reviewed steps reuse "\${expressionText}" with different invocations.\`)
    continue
  }
  registeredExpressions.set(expressionText, signature)
}
${staticRegistrations}
`
}
