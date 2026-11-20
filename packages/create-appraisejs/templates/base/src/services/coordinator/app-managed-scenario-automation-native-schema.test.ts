import { describe, expect, it } from 'vitest'
import {
  appManagedPreparationNativeSchema,
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
})
