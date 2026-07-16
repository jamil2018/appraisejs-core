import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { coordinatorOperationRegistry } from '../../src/services/coordinator/coordinator-operation-registry'
import { generateCoordinatorReference, referenceForMcpTool } from '../generate-coordinator-reference'

const fixture = JSON.parse(readFileSync('packages/appraisejs/src/mcp-contract.fixture.json', 'utf8'))

describe('public coordinator operation reference', () => {
  it('classifies every canonical MCP tool against a coordinator operation or local boundary', () => {
    const operationIds = new Set(coordinatorOperationRegistry.definitions.map(item => item.id))
    for (const definition of fixture.providerNative.filter((item: { kind: string }) => item.kind === 'tool')) {
      const reference = referenceForMcpTool(definition.name)
      if (reference.kind === 'coordinator') expect(operationIds.has(reference.operation), definition.name).toBe(true)
      else expect(reference.reason.length, definition.name).toBeGreaterThan(0)
    }
  })

  it('emits one generated inventory containing both route and MCP boundaries', () => {
    const output = generateCoordinatorReference(fixture)
    expect(output).toContain('<!-- GENERATED')
    expect(output).toContain('`plan-create`')
    expect(output).toContain('`planning_session_create`')
    expect(output).not.toContain('validation_decide')
  })
})
