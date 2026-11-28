import {
  appManagedScenarioAutomationPromptTool,
  type AppManagedScenarioAutomationRole,
} from './app-managed-scenario-automation-contract'

type Schema = Record<string, unknown>

export type ManagedPreparationOutputReason =
  | 'OUTPUT_TOO_LARGE'
  | 'OUTPUT_NOT_JSON'
  | 'CLAUDE_ENVELOPE_MISMATCH'
  | 'CLAUDE_SCENARIOS_NOT_KEYED'
  | 'CLAUDE_SCENARIO_COVERAGE_MISMATCH'
  | 'CLAUDE_STEPS_INVALID'
  | 'SUBMISSION_IDENTITY_MISMATCH'

/** Stable guard identity only; no provider text is retained in the rejection. */
export class ManagedPreparationOutputError extends Error {
  constructor(readonly reason: ManagedPreparationOutputReason) {
    super('Preparation output did not satisfy the exact submission contract.')
    this.name = 'ManagedPreparationOutputError'
  }
}

/** Derive a provider-compatible closed schema while preserving the separate canonical validator. */
export function appManagedPreparationNativeSchema(role: AppManagedScenarioAutomationRole) {
  const tool = appManagedScenarioAutomationPromptTool(role)
  const original: Schema = {
    type: 'object',
    properties: { toolName: { type: 'string', enum: [tool.name] }, arguments: tool.inputSchema },
    required: ['toolName', 'arguments'],
    additionalProperties: false,
  }
  function close(input: Schema): Schema {
    if ('$ref' in input) throw new Error('Native preparation schema must not contain references.')
    if (input.anyOf) return { anyOf: (input.anyOf as Schema[]).map(close) }
    if (input.type === 'object') {
      if (!input.properties || typeof input.properties !== 'object' || input.additionalProperties !== false)
        throw new Error('Native preparation objects must be closed.')
      const required = new Set((input.required ?? []) as string[])
      const properties = Object.fromEntries(
        Object.entries(input.properties as Record<string, Schema>).map(([key, value]) => {
          const child = close(value)
          return [key, required.has(key) ? child : { anyOf: [child, { type: 'null' }] }]
        }),
      )
      return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
    }
    if (input.type === 'array')
      return {
        type: 'array',
        items: close(input.items as Schema),
        ...(typeof input.minItems === 'number' ? { minItems: input.minItems } : {}),
        ...(typeof input.maxItems === 'number' ? { maxItems: input.maxItems } : {}),
      }
    if (!['string', 'number', 'integer', 'boolean', 'null'].includes(String(input.type)))
      throw new Error('Native preparation schema contains an unsupported unconstrained value.')
    return {
      type: input.type,
      ...(input.enum ? { enum: input.enum } : {}),
      ...('const' in input ? { enum: [input.const] } : {}),
    }
  }
  const schema = close(original)
  function normalize(value: unknown, input: Schema = original): unknown {
    if (input.anyOf) return value
    if (Array.isArray(value)) return value.map(item => normalize(item, input.items as Schema))
    if (value && typeof value === 'object' && !input.anyOf) {
      const required = new Set((input.required ?? []) as string[])
      const properties = (input.properties ?? {}) as Record<string, Schema>
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key, child]) => !(child === null && key in properties && !required.has(key)))
          .map(([key, child]) => [key, properties[key] ? normalize(child, properties[key]) : child]),
      )
    }
    return value
  }
  return { schema, normalize }
}

/** Bind observation choices at the last trusted assignment boundary, before a native request. */
export function bindManagedScenarioObservationChoices(schema: Schema, observationIds: string[]) {
  const copy = structuredClone(schema)
  if (!observationIds.length) throw new Error('Scenario design requires captured Discovery observations.')
  const properties = copy.properties as Record<string, Schema>
  const argumentsProperties = properties.arguments.properties as Record<string, Schema>
  const portfolioProperties = argumentsProperties.portfolio.properties as Record<string, Schema>
  const scenario = portfolioProperties.scenarios.items as Schema
  const scenarioProperties = scenario.properties as Record<string, Schema>
  const enrichmentProperties = scenarioProperties.enrichment.properties as Record<string, Schema>
  enrichmentProperties.observationIds = {
    ...enrichmentProperties.observationIds,
    minItems: 1,
    items: { type: 'string', enum: [...new Set(observationIds)].sort() },
  }
  return copy
}

/** Bind Claude's Automator response to every approved alias without changing the canonical array contract. */
export function bindClaudeManagedAutomatorScenarioChoices(
  native: ReturnType<typeof appManagedPreparationNativeSchema>,
  scenarioKeys: string[],
) {
  const approvedScenarioKeys = [...scenarioKeys]
  if (
    !approvedScenarioKeys.length ||
    approvedScenarioKeys.length > 512 ||
    approvedScenarioKeys.some((key, index) => key !== `scenario-${index + 1}`)
  )
    throw new Error('Claude Automator requires the exact approved scenario aliases.')

  // Claude's native schema supports local references, but not array maxItems or minItems above one.
  // The canonical parser retains every original bound after native output is normalized.
  function claudeCompatible(node: Schema): Schema {
    if (node.anyOf) return { ...node, anyOf: (node.anyOf as Schema[]).map(claudeCompatible) }
    if (node.type === 'array') {
      return {
        type: 'array',
        items: claudeCompatible(node.items as Schema),
        ...(typeof node.minItems === 'number' && node.minItems <= 1 ? { minItems: node.minItems } : {}),
      }
    }
    if (node.type === 'object')
      return {
        ...node,
        properties: Object.fromEntries(
          Object.entries(node.properties as Record<string, Schema>).map(([key, value]) => [
            key,
            claudeCompatible(value),
          ]),
        ),
      }
    return node
  }
  const schema = claudeCompatible(native.schema)
  const root = schema.properties as Record<string, Schema>
  const argumentsProperties = root.arguments.properties as Record<string, Schema>
  const scenarioArray = argumentsProperties.scenarios
  if (scenarioArray.type !== 'array') throw new Error('Automator native schema lost its canonical scenario array.')
  const scenario = scenarioArray.items as Schema
  const steps = (scenario.properties as Record<string, Schema>).steps
  if (!steps || steps.type !== 'array') throw new Error('Automator native schema lost its steps.')
  schema.$defs = { scenarioSteps: steps }
  argumentsProperties.scenarios = {
    type: 'object',
    properties: Object.fromEntries(approvedScenarioKeys.map(key => [key, { $ref: '#/$defs/scenarioSteps' }])),
    required: [...approvedScenarioKeys],
    additionalProperties: false,
  }
  if (Buffer.byteLength(JSON.stringify(schema), 'utf8') > 65_536)
    throw new Error('Claude Automator native schema exceeds the provider size limit.')

  function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
  }
  function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
    const keys = Object.keys(value)
    return keys.length === expected.length && expected.every(key => Object.hasOwn(value, key))
  }
  function normalize(value: unknown) {
    if (!record(value) || !hasExactKeys(value, ['toolName', 'arguments']) || !record(value.arguments))
      throw new ManagedPreparationOutputError('CLAUDE_ENVELOPE_MISMATCH')
    const args = value.arguments
    if (!hasExactKeys(args, ['idempotencyKey', 'scenarios']) || !record(args.scenarios))
      throw new ManagedPreparationOutputError('CLAUDE_SCENARIOS_NOT_KEYED')
    const scenarios = args.scenarios
    if (!hasExactKeys(scenarios, approvedScenarioKeys))
      throw new ManagedPreparationOutputError('CLAUDE_SCENARIO_COVERAGE_MISMATCH')
    const rows = approvedScenarioKeys.map(scenarioKey => {
      const steps = scenarios[scenarioKey]
      if (!Array.isArray(steps) || !steps.length || steps.some(step => !record(step)))
        throw new ManagedPreparationOutputError('CLAUDE_STEPS_INVALID')
      return { scenarioKey, steps }
    })
    return native.normalize({
      toolName: value.toolName,
      arguments: { idempotencyKey: args.idempotencyKey, scenarios: rows },
    })
  }
  return { schema, normalize }
}
