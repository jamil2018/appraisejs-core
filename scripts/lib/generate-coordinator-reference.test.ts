import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { coordinatorOperationRegistry } from '../../src/services/coordinator/coordinator-operation-registry'
import { generateCoordinatorReference, referenceForMcpTool } from '../generate-coordinator-reference'

const fixture = JSON.parse(readFileSync('packages/appraisejs/src/mcp-contract.fixture.json', 'utf8'))

describe('public coordinator operation reference', () => {
  it('classifies every canonical MCP tool against a coordinator operation or local boundary', () => {
    const operationIds = new Set(coordinatorOperationRegistry.definitions.map(item => item.id))
    for (const definition of fixture.default.filter((item: { kind: string }) => item.kind === 'tool')) {
      const reference = referenceForMcpTool(definition.name)
      if (reference.kind === 'coordinator') expect(operationIds.has(reference.operation), definition.name).toBe(true)
      else expect(reference.reason.length, definition.name).toBeGreaterThan(0)
    }
  })

  it('classifies Step Definition reads before the generic write prefix', () => {
    const expectedReferences = {
      step_definition_draft_read: 'step-definitions-read',
      quality_journey_factory_evidence_inspect: 'quality-read',
    } as const

    for (const [tool, operation] of Object.entries(expectedReferences))
      expect(referenceForMcpTool(tool)).toEqual({ kind: 'coordinator', operation })
  })

  it('emits one generated inventory containing both route and MCP boundaries', () => {
    const output = generateCoordinatorReference(fixture)
    expect(output).toContain('<!-- GENERATED')
    expect(output).toContain('`quality-write`')
    expect(output).toContain('`assessment_decide`')
  })
})
