import { canonicalRuntimeCapsuleJson } from './contracts'

export function generateExecutableBindings(input: {
  bindings: unknown
  selectors: Record<string, string>
  runtimeImport: string
}) {
  return `import { Given, When, Then, executeBrowserOperation } from '${input.runtimeImport}'

const cases = ${canonicalRuntimeCapsuleJson(input.bindings)}
const selectors = ${canonicalRuntimeCapsuleJson(input.selectors)}
const registrations = { Given, When, Then, And: Given }
const allowedOperationRefs = new Set(cases.flatMap(testCase => testCase.steps.map(step => step.operation)))
const parseValue = value => {
  try { return JSON.parse(value) } catch { return value }
}
const valueOf = parameters => Object.fromEntries(parameters.map(parameter => [
  parameter.name,
  parameter.locatorName ? { id: parameter.locatorName } : parseValue(parameter.value),
]))
const locatorName = reference => typeof reference === 'string' ? reference : reference?.id
const resolveLocator = (world, reference) => {
  const selector = selectors[locatorName(reference)]
  if (!selector) throw new Error('Reviewed locator could not be resolved.')
  return world.page.locator(selector)
}
const resolveSelector = reference => selectors[locatorName(reference)] ?? null
const dispatch = async (world, step) => {
  await executeBrowserOperation(step.operation, {
    world,
    inputs: valueOf(step.parameters),
    resolveLocator: reference => resolveLocator(world, reference),
    resolveSelector,
    baseUrl: process.env.APPRAISE_BASE_URL ?? 'http://localhost',
  }, allowedOperationRefs)
}
const registeredExpressions = new Map()
for (const testCase of cases) for (const step of testCase.steps) {
  const keyword = step.keywordText.slice(0, step.keywordText.indexOf(' '))
  const expressionText = step.keywordText.slice(step.keywordText.indexOf(' ') + 1)
  const signature = JSON.stringify({ operation: step.operation, parameters: step.parameters })
  const existingSignature = registeredExpressions.get(expressionText)
  if (existingSignature !== undefined) {
    if (existingSignature !== signature) throw new Error(\`Reviewed steps reuse "\${expressionText}" with different bindings.\`)
    continue
  }
  registeredExpressions.set(expressionText, signature)
  const expression = expressionText.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')
  registrations[keyword](new RegExp(\`^\${expression}$\`), async function () { await dispatch(this, step) })
}
`
}
