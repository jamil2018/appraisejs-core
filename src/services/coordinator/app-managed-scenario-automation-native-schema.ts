import {
  appManagedScenarioAutomationPromptTool,
  type AppManagedScenarioAutomationRole,
} from './app-managed-scenario-automation-contract'

type Schema = Record<string, unknown>

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
