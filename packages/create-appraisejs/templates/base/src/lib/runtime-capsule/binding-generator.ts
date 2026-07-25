import { canonicalRuntimeCapsuleJson } from './contracts'

export function generateExecutableBindings(input: {
  bindings: unknown
  selectors: Record<string, string>
  sealedDefinitions: unknown
  extensionModules: Record<string, string>
  runtimeImport: string
}) {
  return `import { Given, When, Then, dispatchStepInvocation } from '${input.runtimeImport}'

const cases = ${canonicalRuntimeCapsuleJson(input.bindings)}
const selectors = ${canonicalRuntimeCapsuleJson(input.selectors)}
const sealedDefinitions = ${canonicalRuntimeCapsuleJson(input.sealedDefinitions)}
const extensionModules = Object.fromEntries(Object.entries(${canonicalRuntimeCapsuleJson(input.extensionModules)}).map(([key, value]) => [key, new URL(value, import.meta.url).href]))
const registrations = { Given, When, Then, And: Given }
const locatorName = reference => typeof reference === 'string' ? reference : reference?.id
const resolveLocator = (world, reference) => {
  const selector = selectors[locatorName(reference)]
  if (!selector) throw new Error('Reviewed locator could not be resolved.')
  return world.page.locator(selector)
}
const resolveSelector = reference => selectors[locatorName(reference)] ?? null
const dispatch = async (world, step) => {
  const baseUrl = process.env.APPRAISE_BASE_URL ?? 'http://localhost'
  await dispatchStepInvocation({
    invocation: step.invocation,
    sealedDefinitions,
    context: {
      world,
      resolveLocator: reference => resolveLocator(world, reference),
      resolveSelector,
      extensionModules,
      baseUrl,
      environment: { baseUrl },
    },
  })
}
const registeredExpressions = new Map()
for (const testCase of cases) for (const step of testCase.steps) {
  const keyword = step.keywordText.slice(0, step.keywordText.indexOf(' '))
  const expressionText = step.keywordText.slice(step.keywordText.indexOf(' ') + 1)
  const signature = JSON.stringify({ invocation: step.invocation })
  const existingSignature = registeredExpressions.get(expressionText)
  if (existingSignature !== undefined) {
    if (existingSignature !== signature) throw new Error(\`Reviewed steps reuse "\${expressionText}" with different invocations.\`)
    continue
  }
  registeredExpressions.set(expressionText, signature)
  const expression = expressionText.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')
  registrations[keyword](new RegExp(\`^\${expression}$\`), async function () { await dispatch(this, step) })
}
`
}
