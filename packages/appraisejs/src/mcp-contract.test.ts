import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'

import { createAppraiseMcpServer, mcpContractForServer } from './mcp.js'
import { assertUniqueMcpDefinitions, type McpContractDefinition } from './mcp/registry.js'

type ContractFixture = {
  schemaVersion: 1
  default: McpContractDefinition[]
  providerNative: McpContractDefinition[]
}

async function fixture(): Promise<ContractFixture> {
  return JSON.parse(await readFile(new URL('./mcp-contract.fixture.json', import.meta.url), 'utf8'))
}

async function definitions(providerNativeRuns: boolean) {
  process.env.APPRAISE_EXPERIMENTAL_PROVIDER_RUNS = providerNativeRuns ? '1' : '0'
  const server = await createAppraiseMcpServer({ cwd: process.cwd(), baseUrl: 'http://127.0.0.1:3000' })
  const contract = [...mcpContractForServer(server)].sort(
    (left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name),
  )
  await server.close()
  return contract
}

describe('canonical MCP contract registry', () => {
  afterEach(() => delete process.env.APPRAISE_EXPERIMENTAL_PROVIDER_RUNS)
  it('matches the complete default names and schemas without depending on registration order', async () => {
    const expected = await fixture()
    await expect(definitions(false)).resolves.toEqual(expected.default)
    expect(expected.default.filter(definition => definition.kind === 'tool')).toHaveLength(76)
    expect(expected.default.filter(definition => definition.kind === 'resource')).toHaveLength(18)
  })

  it('accounts explicitly for the provider-native feature surface', async () => {
    const expected = await fixture()
    await expect(definitions(true)).resolves.toEqual(expected.providerNative)
    expect(expected.providerNative.filter(definition => definition.kind === 'tool')).toHaveLength(83)
    expect(expected.providerNative.filter(definition => definition.kind === 'resource')).toHaveLength(20)
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
