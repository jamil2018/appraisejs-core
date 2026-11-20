import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { automationScenarioMaterializationSchema, scenarioPortfolioSchema } from '@/lib/quality-journey'
import type { CanonicalMcpDefinition } from '@/lib/quality-journey/managed-worker-gateway'

export const appManagedScenarioAutomationRoleSchema = z.enum(['TEST_SCENARIO_DESIGNER', 'AUTOMATOR'])
export type AppManagedScenarioAutomationRole = z.infer<typeof appManagedScenarioAutomationRoleSchema>
const idempotencyKey = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const scenarioArguments = z
  .object({
    idempotencyKey,
    portfolio: scenarioPortfolioSchema.innerType().omit({ journeyId: true, targetProjectId: true }),
  })
  .strict()
const automationArguments = z
  .object({
    idempotencyKey,
    scenarios: z.array(automationScenarioMaterializationSchema).min(1).max(512),
  })
  .strict()
const canonicalScenario = scenarioPortfolioSchema.innerType().shape.scenarios.element
const intent = canonicalScenario.shape.behavioralIntent.innerType()
const graph = scenarioPortfolioSchema.innerType().shape.graph
const managedScenarioContentSchema = z
  .object({
    coverageRationale: scenarioPortfolioSchema.innerType().shape.coverageRationale,
    scenarios: z
      .array(
        z
          .object({
            scenarioKey: idempotencyKey,
            behavioralIntent: intent
              .omit({ steps: true, requirementIds: true })
              .extend({
                requirementIds: z.array(idempotencyKey).max(512).optional(),
                steps: z
                  .array(intent.shape.steps.element.omit({ stepId: true }))
                  .min(1)
                  .max(128),
              })
              .strict(),
            enrichment: canonicalScenario.shape.enrichment.extend({
              observationIds: z.array(idempotencyKey).min(1).max(512),
              resourceAssumptionIds: z.array(idempotencyKey).max(512),
            }),
          })
          .strict(),
      )
      .min(1)
      .max(512),
    graph: z
      .object({
        edges: z
          .array(
            graph.shape.edges.element
              .omit({ sourceScenarioRevisionId: true, targetScenarioRevisionId: true })
              .extend({ sourceScenarioKey: idempotencyKey, targetScenarioKey: idempotencyKey })
              .strict(),
          )
          .max(2048),
        sharedSetup: z
          .array(
            z
              .object({
                setupKey: idempotencyKey,
                label: z.string().min(1).max(8000),
                scenarioKeys: z.array(idempotencyKey).min(2),
              })
              .strict(),
          )
          .max(512),
      })
      .strict(),
  })
  .strict()
const canonicalMapping = automationScenarioMaterializationSchema.shape.steps.element
// Arbitrary JSON is represented as an encoded string so the native schema can remain closed.
const managedPreparationValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.object({ ref: z.literal('environment'), key: idempotencyKey }).strict(),
  z.object({ ref: z.literal('stored'), name: idempotencyKey }).strict(),
  z.object({ json: z.string().min(1).max(64_000) }).strict(),
])
const managedAutomationContentSchema = z
  .array(
    z
      .object({
        scenarioKey: idempotencyKey,
        steps: z
          .array(
            canonicalMapping
              .omit({ stepDefinition: true, operation: true, sourceScenarioStepId: true })
              .extend({
                sourceStepIndex: z.number().int().min(0).max(127).optional(),
                bindingId: idempotencyKey,
                parameters: z
                  .array(
                    canonicalMapping.shape.parameters.element.extend({ value: managedPreparationValueSchema }).strict(),
                  )
                  .max(128),
                testData: z
                  .array(
                    canonicalMapping.shape.testData.element.extend({ value: managedPreparationValueSchema }).strict(),
                  )
                  .max(128),
              })
              .strict(),
          )
          .min(1)
          .max(128),
      })
      .strict(),
  )
  .min(1)
  .max(512)
export const appManagedScenarioAutomationOutputSchema = z.discriminatedUnion('toolName', [
  z
    .object({
      toolName: z.literal('quality_journey_scenarios_submit'),
      arguments: z.object({ idempotencyKey, portfolio: managedScenarioContentSchema }).strict(),
    })
    .strict(),
  z
    .object({
      toolName: z.literal('quality_journey_automation_materialize'),
      arguments: z.object({ idempotencyKey, scenarios: managedAutomationContentSchema }).strict(),
    })
    .strict(),
])
export function appManagedScenarioAutomationPromptTool(role: AppManagedScenarioAutomationRole) {
  const schema =
    role === 'TEST_SCENARIO_DESIGNER'
      ? z.object({ idempotencyKey, portfolio: managedScenarioContentSchema }).strict()
      : z.object({ idempotencyKey, scenarios: managedAutomationContentSchema }).strict()
  return {
    name: appManagedScenarioAutomationTools[role].submit,
    inputSchema: zodToJsonSchema(schema, { $refStrategy: 'none' }),
  }
}
export const appManagedScenarioAutomationTools = {
  TEST_SCENARIO_DESIGNER: { read: 'quality_journey_scenarios_get', submit: 'quality_journey_scenarios_submit' },
  AUTOMATOR: { read: 'quality_journey_automation_context_get', submit: 'quality_journey_automation_materialize' },
} as const
export const appManagedScenarioAutomationDefinitions: readonly CanonicalMcpDefinition[] = [
  ...Object.values(appManagedScenarioAutomationTools).map(({ read }) => ({
    kind: 'tool' as const,
    name: read,
    inputSchema: zodToJsonSchema(z.object({}).strict()),
  })),
  { kind: 'tool', name: 'quality_journey_scenarios_submit', inputSchema: zodToJsonSchema(scenarioArguments) },
  { kind: 'tool', name: 'quality_journey_automation_materialize', inputSchema: zodToJsonSchema(automationArguments) },
]
