import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import { createAppraiseMcpServer, mcpContractForServer } from './mcp.js'
import {
  assertCanonicalMcpDefinitions,
  assertUniqueMcpDefinitions,
  type McpContractDefinition,
} from './mcp/registry.js'
import {
  canonicalMcpResourceAnnotations,
  canonicalMcpResourceNames,
  canonicalMcpToolAnnotations,
  canonicalMcpToolNames,
} from './mcp/contract.js'

type ContractFixture = {
  schemaVersion: 2
  default: McpContractDefinition[]
}

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
  it('matches the complete default names and schemas without depending on registration order', async () => {
    const expected = await fixture()
    await expect(definitions()).resolves.toEqual(expected.default)
    expect(expected.default.filter(definition => definition.kind === 'tool')).toHaveLength(canonicalMcpToolNames.length)
    expect(expected.default.filter(definition => definition.kind === 'resource')).toHaveLength(
      canonicalMcpResourceNames.length,
    )
  })

  it('has the exact quality allowlist, real handlers, and annotations', async () => {
    const contract = await definitions()
    expect(() => assertCanonicalMcpDefinitions(contract)).not.toThrow()

    for (const definition of contract) {
      expect(definition.annotations).toBeDefined()
      if (definition.kind === 'tool') {
        expect(definition.annotations).toEqual(canonicalMcpToolAnnotations[definition.name])
      } else {
        expect(definition.annotations).toEqual(canonicalMcpResourceAnnotations[definition.name])
      }
    }

    const names = new Set(contract.map(definition => definition.name))
    expect(names.size).toBe(canonicalMcpToolNames.length + canonicalMcpResourceNames.length)
  })

  it('exposes only compact, explicit preparation bindings and summary identities', async () => {
    const contract = await definitions()
    const preparation = contract.find(definition => definition.name === 'assessment_prepare_run')
    const schema = preparation?.inputSchema as {
      properties?: {
        validationBindings?: { items?: { properties?: Record<string, unknown> } }
        environment?: { properties?: Record<string, unknown> }
      }
    }
    const binding = schema.properties?.validationBindings?.items?.properties
    const step = (binding?.steps as { items?: { properties?: Record<string, unknown> } } | undefined)?.items?.properties

    expect(binding).toMatchObject({ validationId: expect.any(Object), locatorIds: expect.any(Object) })
    expect(step).toMatchObject({ stepId: expect.any(Object), version: expect.any(Object), inputs: expect.any(Object) })
    expect(step).not.toHaveProperty('definitionHash')
    for (const forbidden of ['locators', 'locatorGroups', 'locatorName', 'locatorValue', 'definitionHash'])
      expect(binding).not.toHaveProperty(forbidden)
    expect(schema.properties?.environment).toHaveProperty('properties')
  })

  it('defaults assessment_review to the compact summary response mode', async () => {
    const contract = await definitions()
    const review = contract.find(definition => definition.name === 'assessment_review')
    const schema = review?.inputSchema as { properties?: { responseMode?: { default?: unknown } } }

    expect(schema.properties?.responseMode?.default).toBe('summary')
  })

  it('explicitly rejects the removed standalone assessment subject', async () => {
    const contract = await definitions()
    const run = contract.find(definition => definition.name === 'assessment_run')
    const schema = run?.inputSchema as { properties?: { subject?: unknown } }

    expect(schema.properties?.subject).toEqual({ not: {} })
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

  it('returns an immutable per-server contract backed by the shared static registry', async () => {
    const server = await createAppraiseMcpServer({ cwd: process.cwd(), baseUrl: 'http://127.0.0.1:3000' })
    const secondServer = await createAppraiseMcpServer({ cwd: process.cwd(), baseUrl: 'http://127.0.0.1:3000' })
    const contract = mcpContractForServer(server)
    expect(Object.isFrozen(contract)).toBe(true)
    expect(contract.every(Object.isFrozen)).toBe(true)
    expect(mcpContractForServer(secondServer)).toBe(contract)
    expect(contract.every(definition => !Object.values(definition).includes(undefined))).toBe(true)
    await server.close()
    await secondServer.close()
  })
})
