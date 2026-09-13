import { describe, expect, it, vi } from 'vitest'
import { registerQualityJourneyOperations } from './domains/quality-journey.js'
import { registerQualityJourneyTriageOperations } from './domains/quality-journey-triage.js'
import { parseMcpToolArguments } from '../mcp-call.js'
import type { McpRegistryContext } from './registry.js'

function harness() {
  const handlers = new Map<string, (input: unknown) => Promise<unknown>>()
  const schemas = new Map<string, { inputSchema?: z.ZodRawShape }>()
  const request = vi.fn().mockResolvedValue({ ok: true })
  registerQualityJourneyOperations({
    server: {
      registerTool: (
        name: string,
        config: { inputSchema?: z.ZodRawShape },
        handler: (input: unknown) => Promise<unknown>,
      ) => {
        schemas.set(name, config)
        handlers.set(name, handler)
      },
      registerResource: vi.fn(),
    },
    api: { request },
  } as unknown as McpRegistryContext)
  registerQualityJourneyTriageOperations({
    server: {
      registerTool: (
        name: string,
        config: { inputSchema?: z.ZodRawShape },
        handler: (input: unknown) => Promise<unknown>,
      ) => {
        schemas.set(name, config)
        handlers.set(name, handler)
      },
    },
    api: { request },
  } as unknown as McpRegistryContext)
  return { handlers, schemas, request }
}

const assignment = {
  target: 'target-1',
  journeyId: 'journey-1',
  role: 'REQUIREMENT_ANALYZER',
  workItemId: 'work-1',
  attemptId: 'attempt-1',
  assignmentId: 'assignment-1',
  assignmentGeneration: 1,
  leaseId: 'lease-1',
  assignmentSecret: 'a'.repeat(43),
  idempotencyKey: 'key-1',
}

describe('external Analyzer MCP contract', () => {
  it('uses caller-secret Analyzer compatibility operations without caller principals', async () => {
    const { handlers, request } = harness()
    const analyzerAssignment = {
      target: assignment.target,
      journeyId: assignment.journeyId,
      workItemId: assignment.workItemId,
      attemptId: assignment.attemptId,
      assignmentId: assignment.assignmentId,
      assignmentGeneration: assignment.assignmentGeneration,
      leaseId: assignment.leaseId,
      assignmentSecret: assignment.assignmentSecret,
      idempotencyKey: assignment.idempotencyKey,
    }
    await handlers.get('quality_journey_external_analyzer_claim_v1')!({
      target: assignment.target,
      journeyId: assignment.journeyId,
      assignmentSecret: assignment.assignmentSecret,
      idempotencyKey: assignment.idempotencyKey,
    })
    await handlers.get('quality_journey_external_analyzer_admit_v1')!(analyzerAssignment)
    expect(request).toHaveBeenNthCalledWith(1, 'quality/journeys/journey-1/external-analyzer/claim', {
      method: 'POST',
      body: JSON.stringify({
        target: 'target-1',
        assignmentSecret: assignment.assignmentSecret,
        idempotencyKey: assignment.idempotencyKey,
      }),
    })
    expect(request).toHaveBeenNthCalledWith(2, 'quality/journeys/journey-1/external-analyzer/admissions', {
      method: 'POST',
      body: JSON.stringify({ ...analyzerAssignment, target: 'target-1', journeyId: undefined }),
    })
  })

  it.each([
    'REQUIREMENT_ANALYZER',
    'SCOUT',
    'RESOURCE_EXPLORER',
    'TEST_SCENARIO_DESIGNER',
    'AUTOMATOR',
    'TRIAGER',
  ] as const)('exposes the same caller-secret claim and admission contract for %s', async role => {
    const { handlers, request } = harness()
    await handlers.get('quality_journey_external_work_claim_v1')!({
      target: assignment.target,
      journeyId: assignment.journeyId,
      role,
      assignmentSecret: assignment.assignmentSecret,
      idempotencyKey: assignment.idempotencyKey,
    })
    await handlers.get('quality_journey_external_work_admit_v1')!({ ...assignment, role })
    expect(request).toHaveBeenNthCalledWith(1, 'quality/journeys/journey-1/external-work/claim', {
      method: 'POST',
      body: JSON.stringify({
        target: 'target-1',
        role,
        assignmentSecret: assignment.assignmentSecret,
        idempotencyKey: assignment.idempotencyKey,
      }),
    })
    expect(request).toHaveBeenNthCalledWith(2, 'quality/journeys/journey-1/external-work/admissions', {
      method: 'POST',
      body: JSON.stringify({ ...assignment, role, target: 'target-1', journeyId: undefined }),
    })
  })

  it('sends the generic CLI mcp-call JSON through the exact native MCP claim schema', async () => {
    const { handlers, request } = harness()
    const cliArguments = parseMcpToolArguments(
      JSON.stringify({
        target: assignment.target,
        journeyId: assignment.journeyId,
        role: 'TRIAGER',
        assignmentSecret: assignment.assignmentSecret,
        idempotencyKey: assignment.idempotencyKey,
      }),
    )
    await handlers.get('quality_journey_external_work_claim_v1')!(cliArguments)
    expect(request).toHaveBeenCalledWith('quality/journeys/journey-1/external-work/claim', {
      method: 'POST',
      body: JSON.stringify({
        target: 'target-1',
        role: 'TRIAGER',
        assignmentSecret: assignment.assignmentSecret,
        idempotencyKey: assignment.idempotencyKey,
      }),
    })
  })

  it('registers specialized external submission contracts for every graph role without caller principals', () => {
    const { schemas } = harness()
    const matrix = [
      'quality_journey_external_analyzer_analysis_submit_v1',
      'quality_journey_external_scout_target_observation_submit_v1',
      'quality_journey_external_resource_explorer_resolution_submit_v1',
      'quality_journey_external_scenarios_submit_v1',
      'quality_journey_external_automator_materialize_v1',
      'quality_journey_external_triage_submit_v1',
    ] as const
    for (const tool of matrix) {
      const shape = schemas.get(tool)?.inputSchema
      expect(shape, tool).toBeDefined()
      expect(shape).not.toHaveProperty('principal')
      expect(shape).not.toHaveProperty('principalId')
      expect(shape).toHaveProperty('assignmentId')
      expect(shape).toHaveProperty('assignmentGeneration')
      expect(shape).toHaveProperty('assignmentSecret')
    }
  })

  it('does not expose a client principal field', () => {
    const { schemas } = harness()
    const shape = schemas.get('quality_journey_external_analyzer_admit_v1')!.inputSchema!
    expect(shape).not.toHaveProperty('principal')
    expect(shape).not.toHaveProperty('principalId')
  })
})
