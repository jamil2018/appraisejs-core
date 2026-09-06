import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import { createAppraiseMcpServer } from './mcp/server-factory.js'
import {
  assertCanonicalMcpDefinitions,
  assertUniqueMcpDefinitions,
  mcpContractForServer,
  type McpContractDefinition,
} from './mcp/registry.js'
import {
  canonicalMcpResourceAnnotations,
  canonicalMcpResourceNames,
  canonicalMcpToolAnnotations,
  canonicalMcpToolNames,
} from './mcp/contract.js'

type ContractFixture = { schemaVersion: 2; default: McpContractDefinition[] }

async function fixture(): Promise<ContractFixture> {
  return JSON.parse(await readFile(new URL('./mcp-contract.fixture.json', import.meta.url), 'utf8'))
}

async function definitions() {
  const server = await createAppraiseMcpServer({ cwd: process.cwd(), baseUrl: 'http://127.0.0.1:3000' })
  const contract = [...mcpContractForServer(server)].sort(
    (left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name),
  )
  await server.close()
  return contract
}

describe('canonical MCP contract registry', () => {
  it('matches the complete Journey-only names and schemas without depending on registration order', async () => {
    const expected = await fixture()
    await expect(definitions()).resolves.toEqual(expected.default)
    expect(expected.default.filter(definition => definition.kind === 'tool')).toHaveLength(canonicalMcpToolNames.length)
    expect(expected.default.filter(definition => definition.kind === 'resource')).toHaveLength(
      canonicalMcpResourceNames.length,
    )
  })

  it('has the exact Journey allowlist, real handlers, and annotations', async () => {
    const contract = await definitions()
    expect(() => assertCanonicalMcpDefinitions(contract)).not.toThrow()
    for (const definition of contract) {
      expect(definition.annotations).toBeDefined()
      if (definition.kind === 'tool')
        expect(definition.annotations).toEqual(canonicalMcpToolAnnotations[definition.name])
      else expect(definition.annotations).toEqual(canonicalMcpResourceAnnotations[definition.name])
    }
  })

  it('excludes every retired Quality Plan and Assessment MCP operation and resource', async () => {
    const names = new Set((await definitions()).map(definition => definition.name))
    for (const retired of [
      'requirements_submit_source',
      'requirement_analysis_propose',
      'validation_design_propose',
      'assessment_preflight',
      'assessment_run',
      'assessment_decide',
      'evaluation_subject_remote_scope_create',
      'execution_consent_decide',
      'methodology_list',
      'quality_journey_compatibility_read',
      'workflow-quality-design',
      'workflow-assessment',
      'quality-methodology',
      'validation-ast-contract',
    ])
      expect(names).not.toContain(retired)
  })

  it('exposes Journey-scoped locator inputs and no legacy qualityPlanId input', async () => {
    const contract = await definitions()
    for (const name of ['locator_search', 'locator_graph_query', 'locator_ensure']) {
      const schema = contract.find(definition => definition.name === name)?.inputSchema as {
        properties?: Record<string, unknown>
      }
      expect(schema.properties).toHaveProperty('journeyId')
      expect(schema.properties).not.toHaveProperty('qualityPlanId')
    }
  })

  it('fails fast for duplicate, invalid, and unknown definitions', () => {
    const tool = { kind: 'tool', name: 'duplicate' } as const
    expect(() => assertUniqueMcpDefinitions([tool, tool])).toThrow('Duplicate or invalid MCP definition')
    expect(() => assertUniqueMcpDefinitions([{ kind: 'tool', name: '' }])).toThrow(
      'Duplicate or invalid MCP definition',
    )
    expect(() => assertUniqueMcpDefinitions([{ kind: 'unknown', name: 'operation' } as never])).toThrow(
      'Unknown MCP definition kind',
    )
  })
})
