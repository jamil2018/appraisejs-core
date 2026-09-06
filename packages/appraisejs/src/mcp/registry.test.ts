import { describe, expect, it } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { CoordinatorRequestError } from './coordinator-call.js'
import { mcpContractForServer, registerAppraiseOperations, withStructuredCoordinatorErrors } from './registry.js'
import { canonicalMcpResourceNames, canonicalMcpToolAnnotations, canonicalMcpToolNames } from './contract.js'
import { genericQualityJourneyCommandSchema, scenarioPortfolioSchema } from './domains/quality-journey.js'

describe('MCP tool registration', () => {
  it('accepts only canonical Scenario Portfolio shape at the MCP ingress', () => {
    const portfolio = {
      schemaVersion: 'appraise.quality-journey/v1',
      portfolioId: 'portfolio-1',
      portfolioRevisionId: 'portfolio-r1',
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      cycleId: 'cycle-1',
      discoveryRevisionId: 'discovery-r1',
      discoveryCompletionHash: `sha256:${'a'.repeat(64)}`,
      coverageRationale: 'Covers the checkout requirement.',
      graph: { edges: [], sharedSetup: [] },
      scenarios: [
        {
          stableScenarioId: 'scenario-1',
          scenarioRevisionId: 'scenario-r1',
          behavioralIntent: {
            title: 'Checkout',
            narrative: 'A shopper checks out.',
            requirementIds: ['REQ-1'],
            expectedSignals: ['Confirmation'],
            steps: [{ stepId: 'step-1', action: 'Submit', expected: 'Confirmation' }],
          },
          enrichment: { observationIds: ['observation-1'], resourceAssumptionIds: [], feasibilityNotes: [] },
          layout: { x: 0, y: 0, sequence: 0 },
        },
      ],
    }
    expect(scenarioPortfolioSchema.safeParse(portfolio).success).toBe(true)
    expect(scenarioPortfolioSchema.safeParse({ ...portfolio, scenarios: [] }).success).toBe(false)
    expect(
      scenarioPortfolioSchema.safeParse({
        ...portfolio,
        scenarios: [
          {
            ...portfolio.scenarios[0],
            behavioralIntent: { ...portfolio.scenarios[0].behavioralIntent, requirementIds: [] },
          },
        ],
      }).success,
    ).toBe(false)
  })
  it('exposes only the canonical Quality Journey surface', () => {
    const server = new McpServer({ name: 'contract-test', version: '0.0.0' })
    const request = async () => ({})
    const api = {
      request,
      listTargetProjects: async () => [],
      readLocatorGraphVisual: request,
      listOperationCategories: async () => ({}),
      project: { canonicalProjectPath: '/tmp/appraise-contract-test' },
    } as never

    const definitions = registerAppraiseOperations({
      server,
      api,
      options: { cwd: '/tmp/appraise-contract-test', baseUrl: 'http://127.0.0.1:3000', coordinatorId: 'test' },
    })

    expect(mcpContractForServer(server)).toBe(definitions)
    const names = new Set(definitions.map(definition => definition.name))

    expect([...names].sort()).toEqual([...canonicalMcpToolNames, ...canonicalMcpResourceNames].sort())
    expect(definitions.every(definition => definition.annotations)).toBe(true)
    expect(names).toContain('quality_journey_create')
    expect(names).not.toContain('assessment_run')
    expect(names).not.toContain('quality_journey_compatibility_read')
  })

  it('assigns the narrow analysis-review annotation class to each Phase 3 operation', () => {
    const expected = {
      quality_journey_analysis_get: { readOnlyHint: true, openWorldHint: false },
      quality_journey_analysis_submit: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      quality_journey_analysis_answer: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      quality_journey_analysis_publish: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      quality_journey_analysis_revision_request: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      quality_journey_analysis_decide: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    }
    for (const [name, annotation] of Object.entries(expected)) {
      expect(canonicalMcpToolNames).toContain(name)
      expect(canonicalMcpToolAnnotations[name]).toEqual(annotation)
    }
  })

  it('assigns exact discovery annotations to each Phase 4 specialized operation', () => {
    const durableMutation = {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    }
    const expected = {
      quality_journey_discovery_get: { readOnlyHint: true, openWorldHint: false },
      quality_journey_target_observation_submit: durableMutation,
      quality_journey_resource_resolution_submit: durableMutation,
      quality_journey_discovery_retry: durableMutation,
      quality_journey_discovery_revalidate: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    }
    for (const [name, annotation] of Object.entries(expected)) {
      expect(canonicalMcpToolNames).toContain(name)
      expect(canonicalMcpToolAnnotations[name]).toEqual(annotation)
    }
  })

  it('rejects specialized analysis and discovery commands from the generic Quality Journey MCP tool', () => {
    for (const command of [
      'PUBLISH_ANALYSIS',
      'REQUEST_ANALYSIS_REVISION',
      'DECIDE_ANALYSIS',
      'RETRY_DISCOVERY',
      'PUBLISH_SCENARIO_PORTFOLIO',
      'DECIDE_SCENARIOS',
      'REQUEST_SCENARIO_REVISION',
    ])
      expect(() => genericQualityJourneyCommandSchema.parse({ command })).toThrow(
        'Specialized Quality Journey commands require their dedicated MCP tool.',
      )
    expect(genericQualityJourneyCommandSchema.parse({ command: 'SUBMIT_REQUIREMENT' })).toMatchObject({
      command: 'SUBMIT_REQUIREMENT',
    })
  })

  it('embeds the exact coordinator failure envelope in every registered tool error', async () => {
    const handler = withStructuredCoordinatorErrors(async () => {
      throw new CoordinatorRequestError(409, undefined, {
        schema: 'appraise.error/v1',
        errorId: '11111111-1111-4111-8111-111111111111',
        occurredAt: '2026-08-07T00:00:00.000Z',
        classification: 'state_conflict',
        code: 'state_conflict',
        message: 'Loopback origin is reserved.',
        httpStatus: 409,
        operation: { name: 'target-projects' },
        operationOutcome: 'not_committed',
        targetOutcome: 'not_evaluated',
        retry: {
          safe: true,
          strategy: 'read_state_then_retry',
          nextAction: { tool: 'coordinator_error_recovery', reason: 'Repropose with the suggested base URL.' },
        },
        details: { constraint: 'loopback_origin' },
      })
    })

    const result = (await handler()) as { isError: boolean; content: Array<{ type: string; text: string }> }

    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      schema: 'appraise.error/v1',
      errorId: '11111111-1111-4111-8111-111111111111',
      occurredAt: '2026-08-07T00:00:00.000Z',
      classification: 'state_conflict',
      code: 'state_conflict',
      message: 'Loopback origin is reserved.',
      httpStatus: 409,
      operation: { name: 'target-projects' },
      operationOutcome: 'not_committed',
      targetOutcome: 'not_evaluated',
      retry: {
        safe: true,
        strategy: 'read_state_then_retry',
        nextAction: { tool: 'coordinator_error_recovery', reason: 'Repropose with the suggested base URL.' },
      },
      details: {
        constraint: 'loopback_origin',
      },
    })
  })

  it('returns an endpoint-mismatch envelope from project_list without reporting target evaluation', async () => {
    const handler = withStructuredCoordinatorErrors(async () => {
      throw new CoordinatorRequestError(404, '<!doctype html>', {
        schema: 'appraise.error/v1',
        errorId: '11111111-1111-4111-8111-111111111111',
        occurredAt: '2026-08-22T00:00:00.000Z',
        classification: 'infrastructure_failure',
        code: 'coordinator_endpoint_mismatch',
        message: 'The configured coordinator endpoint is not an AppraiseJS hub.',
        httpStatus: 404,
        operation: { name: 'target-projects' },
        operationOutcome: 'not_started',
        targetOutcome: 'not_evaluated',
        retry: {
          safe: true,
          strategy: 'repair_appraise_then_resume',
          nextAction: {
            tool: 'coordinator_error_recovery',
            reason: 'Verify --base-url points to the AppraiseJS hub, then reconnect the MCP client.',
          },
        },
        details: { source: 'client_transport' },
      })
    })

    const result = (await handler()) as { isError: boolean; content: Array<{ type: string; text: string }> }

    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({
      code: 'coordinator_endpoint_mismatch',
      operation: { name: 'target-projects' },
      operationOutcome: 'not_started',
      targetOutcome: 'not_evaluated',
    })
  })

  it('does not expose unknown internal errors as coordinator envelopes', async () => {
    const handler = withStructuredCoordinatorErrors(async () => {
      throw new Error('private internal detail')
    })

    await expect(handler()).rejects.toThrow('private internal detail')
  })
})
