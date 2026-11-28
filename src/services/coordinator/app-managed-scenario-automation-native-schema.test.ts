import { describe, expect, it } from 'vitest'
import {
  appManagedPreparationNativeSchema,
  bindClaudeManagedAutomatorScenarioChoices,
  bindManagedScenarioObservationChoices,
} from './app-managed-scenario-automation-native-schema'
import { appManagedScenarioAutomationOutputSchema } from './app-managed-scenario-automation-contract'

describe('managed preparation native schema', () => {
  it.each(['TEST_SCENARIO_DESIGNER', 'AUTOMATOR'] as const)(
    'closes every %s object and requires every property without references',
    role => {
      const { schema } = appManagedPreparationNativeSchema(role)
      const visit = (node: Record<string, unknown>) => {
        expect(node).not.toHaveProperty('$ref')
        if (node.type === 'object') {
          expect(node.additionalProperties).toBe(false)
          expect(node.required).toEqual(Object.keys(node.properties as object))
          Object.values(node.properties as Record<string, Record<string, unknown>>).forEach(visit)
        }
        if (node.type === 'array') visit(node.items as Record<string, unknown>)
        if (node.anyOf) (node.anyOf as Record<string, unknown>[]).forEach(visit)
      }
      expect(schema.type).toBe('object')
      visit(schema)
    },
  )
  it('normalizes optional native null fields while preserving actual nullable parameter values', () => {
    const native = appManagedPreparationNativeSchema('AUTOMATOR')
    const output = native.normalize({
      toolName: 'quality_journey_automation_materialize',
      arguments: {
        idempotencyKey: 'fixed',
        scenarios: [
          {
            scenarioKey: 'scenario-1',
            steps: [
              {
                bindingId: 'binding-1',
                parameters: [{ name: 'body', type: 'json', value: null }],
                testData: [],
                locatorRequirements: [
                  { requirementId: 'locator-param', parameterName: 'locator', locatorId: null, runtimeParameter: true },
                ],
              },
            ],
          },
        ],
      },
    })
    const parsed = appManagedScenarioAutomationOutputSchema.parse(output)
    expect(parsed.arguments).toMatchObject({
      scenarios: [{ steps: [{ parameters: [{ value: null }], locatorRequirements: [{ runtimeParameter: true }] }] }],
    })
    expect(JSON.stringify(parsed)).not.toContain('locatorId')
    expect(() =>
      appManagedScenarioAutomationOutputSchema.parse({
        toolName: 'quality_journey_automation_materialize',
        arguments: {},
      }),
    ).toThrow()
  })
  it('enforces canonical array bounds and the selected captured observation choices before generation', () => {
    const result = bindManagedScenarioObservationChoices(
      appManagedPreparationNativeSchema('TEST_SCENARIO_DESIGNER').schema,
      ['observation-b', 'observation-a'],
    )
    const schema = result as {
      properties: {
        arguments: {
          properties: {
            portfolio: {
              properties: {
                scenarios: {
                  minItems: number
                  items: { properties: { enrichment: { properties: { observationIds: unknown } } } }
                }
              }
            }
          }
        }
      }
    }
    expect(schema.properties.arguments.properties.portfolio.properties.scenarios.minItems).toBe(1)
    expect(
      schema.properties.arguments.properties.portfolio.properties.scenarios.items.properties.enrichment.properties
        .observationIds,
    ).toEqual({
      type: 'array',
      minItems: 1,
      maxItems: 512,
      items: { type: 'string', enum: ['observation-a', 'observation-b'] },
    })
    expect(() => bindManagedScenarioObservationChoices(result, [])).toThrow('requires captured')
  })

  it('binds all 512 approved Claude Automator aliases in one provider-sized schema with reusable steps', () => {
    const keys = Array.from({ length: 512 }, (_, index) => `scenario-${index + 1}`)
    const { schema } = bindClaudeManagedAutomatorScenarioChoices(appManagedPreparationNativeSchema('AUTOMATOR'), keys)
    const argumentsProperties = (schema.properties as { arguments: { properties: Record<string, unknown> } }).arguments
      .properties
    const scenarios = argumentsProperties.scenarios as {
      type: string
      additionalProperties: boolean
      required: string[]
      properties: Record<string, unknown>
    }
    expect(scenarios.type).toBe('object')
    expect(scenarios.additionalProperties).toBe(false)
    expect(scenarios.required).toEqual(keys)
    expect(Object.keys(scenarios.properties)).toEqual(keys)
    expect(scenarios.properties['scenario-1']).toEqual({ $ref: '#/$defs/scenarioSteps' })
    expect(scenarios.properties['scenario-512']).toEqual(scenarios.properties['scenario-1'])
    expect((schema.$defs as { scenarioSteps: { type: string } }).scenarioSteps.type).toBe('array')
    expect(Buffer.byteLength(JSON.stringify(schema), 'utf8')).toBeLessThanOrEqual(65_536)
    const visit = (node: unknown) => {
      if (!node || typeof node !== 'object') return
      if (!Array.isArray(node)) {
        expect(node).not.toHaveProperty('maxItems')
        if ('minItems' in node) expect((node as { minItems: number }).minItems).toBeLessThanOrEqual(1)
      }
      Object.values(node).forEach(visit)
    }
    visit(schema)
  })

  it('rejects altered Claude scenario keys and shape before canonical array normalization', () => {
    const native = appManagedPreparationNativeSchema('AUTOMATOR')
    const keys = ['scenario-1', 'scenario-2']
    const bound = bindClaudeManagedAutomatorScenarioChoices(native, keys)
    keys.push('scenario-3')
    const step = {
      bindingId: 'binding-1',
      parameters: [{ name: 'body', type: 'json', value: null }],
      testData: [],
      locatorRequirements: [
        { requirementId: 'locator-param', parameterName: 'locator', locatorId: null, runtimeParameter: true },
      ],
    }
    const response = (scenarios: unknown) => ({
      toolName: 'quality_journey_automation_materialize',
      arguments: { idempotencyKey: 'fixed', scenarios },
    })
    const output = bound.normalize(response({ 'scenario-2': [step], 'scenario-1': [step] }))
    const parsed = appManagedScenarioAutomationOutputSchema.parse(output)
    if (parsed.toolName !== 'quality_journey_automation_materialize') throw new Error('Invalid Automator fixture')
    expect(parsed.arguments.scenarios.map(scenario => scenario.scenarioKey)).toEqual(['scenario-1', 'scenario-2'])
    expect(JSON.stringify(parsed)).not.toContain('locatorId')
    for (const scenarios of [
      { 'scenario-1': [step] },
      { 'scenario-1': [step], 'scenario-2': [step], 'scenario-3': [step] },
      [{ scenarioKey: 'scenario-1', steps: [step] }],
      { 'scenario-1': [step], 'scenario-2': null },
      { 'scenario-1': [step], 'scenario-2': { steps: [step] } },
      { 'scenario-1': [step], 'scenario-2': [null] },
      null,
    ])
      expect(() => bound.normalize(response(scenarios))).toThrow()
    expect(() =>
      bound.normalize({ ...response({ 'scenario-1': [step], 'scenario-2': [step] }), extra: true }),
    ).toThrow()
    expect(() => bound.normalize({ toolName: 'quality_journey_automation_materialize', arguments: {} })).toThrow()
    expect(() => bindClaudeManagedAutomatorScenarioChoices(native, ['scenario-1', 'scenario-1'])).toThrow()
    expect(() => bindClaudeManagedAutomatorScenarioChoices(native, ['scenario-2', 'scenario-1'])).toThrow()
    expect(native.schema).toMatchObject({ properties: { arguments: { properties: { scenarios: { type: 'array' } } } } })
  })
})
