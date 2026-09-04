import { describe, expect, it } from 'vitest'

import { automationMaterializationInput as mcpAutomationMaterializationInput } from '../../../packages/appraisejs/src/mcp/domains/quality-journey.js'
import { automationMaterializationRequestSchema } from './automation-contracts'

const digest = (character: string) => `sha256:${character.repeat(64)}`

function request() {
  return {
    journeyId: 'journey-1',
    targetProjectId: 'target-1',
    workItemId: 'work-1',
    attemptId: 'attempt-1',
    leaseId: 'lease-1',
    ownerToken: 'owner-token',
    idempotencyKey: 'materialize-1',
    expectedInputHash: digest('a'),
    expectedScopeHash: digest('b'),
    scenarios: [
      {
        scenarioRevisionId: 'scenario-1',
        steps: [
          {
            sourceScenarioStepId: 'step-1',
            stepDefinition: { id: 'definition-1', version: '1', definitionHash: digest('c') },
            operation: {
              id: 'operation-1',
              version: '1',
              handler: { id: 'handler-1', version: '1', contentHash: digest('d') },
            },
            parameters: [],
            testData: [],
            locatorRequirements: [{ requirementId: 'locator-1', parameterName: 'selector', runtimeParameter: true }],
          },
        ],
      },
    ],
    result: {
      schemaVersion: 'appraise.quality-journey/v1',
      assignmentId: 'assignment-1',
      workItemId: 'work-1',
      attemptId: 'attempt-1',
      roleContractDigest: digest('e'),
      inputHash: digest('a'),
      role: 'AUTOMATOR',
      status: 'COMPLETED',
      outputs: [],
      evidenceReceipts: [],
      assumptions: [],
      blockers: [],
      unresolvedQuestions: [],
      submittedAt: '2026-09-05T00:00:00.000Z',
    },
  }
}

type AutomationRequestFixture = {
  targetProjectId: string
  scenarios: Array<{
    scenarioRevisionId: string
    steps: Array<{
      parameters: Array<{ name: string; type: string; value: unknown }>
      locatorRequirements: Array<{
        requirementId: string
        parameterName: string
        runtimeParameter?: boolean
        locatorId?: string
      }>
    }>
  }>
  [key: string]: unknown
}

function mutableRequest(): AutomationRequestFixture {
  return structuredClone(request()) as unknown as AutomationRequestFixture
}

const corpus: ReadonlyArray<{ name: string; accepted: boolean; value: () => unknown }> = [
  { name: 'canonical request', accepted: true, value: request },
  {
    name: 'missing locator binding',
    accepted: false,
    value: () => {
      const value = mutableRequest()
      value.scenarios[0]!.steps[0]!.locatorRequirements = [{ requirementId: 'locator-1', parameterName: 'selector' }]
      return value
    },
  },
  {
    name: 'duplicate scenario revision',
    accepted: false,
    value: () => {
      const value = mutableRequest()
      value.scenarios.push({ ...value.scenarios[0]! })
      return value
    },
  },
  {
    name: 'step parameter above bounded maximum',
    accepted: false,
    value: () => {
      const value = mutableRequest()
      value.scenarios[0]!.steps[0]!.parameters = Array.from({ length: 129 }, (_, index) => ({
        name: `input-${index}`,
        type: 'string',
        value: 'value',
      }))
      return value
    },
  },
  {
    name: 'non-Automator role',
    accepted: false,
    value: () => ({ ...request(), result: { ...request().result, role: 'SCOUT' } }),
  },
  {
    name: 'non-completed Automator result',
    accepted: false,
    value: () => ({ ...request(), result: { ...request().result, status: 'BLOCKED' } }),
  },
  {
    name: 'forbidden Automator output kind',
    accepted: false,
    value: () => ({
      ...request(),
      result: {
        ...request().result,
        outputs: [{ kind: 'SCENARIO_REVISION', artifactId: 'scenario-1', contentHash: digest('f') }],
      },
    }),
  },
  {
    name: '85 scenarios retain all 255 materialization outputs',
    accepted: true,
    value: () => capacityRequest(85),
  },
  {
    name: '86 scenarios retain all 258 materialization outputs',
    accepted: true,
    value: () => capacityRequest(86),
  },
  {
    name: '512 scenarios retain all 1536 materialization outputs',
    accepted: true,
    value: () => capacityRequest(512),
  },
  {
    name: 'output count above the 512-scenario materialization maximum',
    accepted: false,
    value: () => ({
      ...request(),
      result: {
        ...request().result,
        outputs: Array.from({ length: 1537 }, (_, index) => ({
          kind: 'TEST_CASE',
          artifactId: `case-${index}`,
          contentHash: digest('f'),
        })),
      },
    }),
  },
]

function capacityRequest(scenarios: number) {
  const value = request()
  const prototype = value.scenarios[0]!
  value.scenarios = Array.from({ length: scenarios }, (_, index) => ({
    ...prototype,
    scenarioRevisionId: `scenario-${index}`,
  }))
  ;(value.result as unknown as { outputs: unknown }).outputs = Array.from({ length: scenarios }, (_, index) => [
    { kind: 'TEST_SUITE', artifactId: `suite-${index}`, contentHash: digest('f') },
    { kind: 'TEST_CASE', artifactId: `case-${index}`, contentHash: digest('f') },
    { kind: 'RUNTIME_CAPSULE', artifactId: `capsule-${index}`, contentHash: digest('f') },
  ]).flat()
  return value
}

describe('Automator materialization MCP ingress parity', () => {
  it.each(corpus)('$name has the same canonical and MCP acceptance', ({ accepted, value }) => {
    const canonical = value()
    const fixture = canonical as AutomationRequestFixture
    const { targetProjectId, ...mcpRequest } = fixture
    const mcp = { ...mcpRequest, target: targetProjectId }
    expect(automationMaterializationRequestSchema.safeParse(canonical).success).toBe(accepted)
    expect(mcpAutomationMaterializationInput.safeParse(mcp).success).toBe(accepted)
  })
})
