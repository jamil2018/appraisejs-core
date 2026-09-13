import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAttemptScopedWorkerMcpServer, createTrustedCanonicalIngressBridge } from './managed-worker-server.js'

const workspaces: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(workspaces.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

const profileSubject = {
  role: 'REQUIREMENT_ANALYZER',
  tools: [
    {
      name: 'quality_journey_analysis_get',
      description: 'Read analysis through the scoped gateway.',
      inputSchema: { type: 'object', properties: { includeAnswers: { type: 'boolean' } }, additionalProperties: false },
    },
  ],
} as const
const profile = { ...profileSubject, contractDigest: hash(profileSubject) } as const

describe('attempt-scoped worker MCP server', () => {
  it('registers only the supplied profile and delegates calls with its sealed grant', async () => {
    const callGateway = vi
      .fn()
      .mockResolvedValue({ result: { revisionId: 'analysis-1' }, receipt: { id: 'receipt-1' } })
    const server = createAttemptScopedWorkerMcpServer({
      profile,
      expectedProfileDigest: profile.contractDigest,
      sealedGrant: 'sealed-grant',
      callGateway,
    })
    const client = new Client({ name: 'worker-gateway-test', version: '1' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await server.connect(serverTransport)
      await client.connect(clientTransport)
      expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(['quality_journey_analysis_get'])
      const result = await client.callTool({
        name: 'quality_journey_analysis_get',
        arguments: { includeAnswers: true },
      })
      expect(callGateway).toHaveBeenCalledWith({
        sealedGrant: 'sealed-grant',
        profileDigest: profile.contractDigest,
        toolName: 'quality_journey_analysis_get',
        arguments: { includeAnswers: true },
      })
      expect(result.structuredContent).toEqual({
        result: { revisionId: 'analysis-1' },
        receipt: { id: 'receipt-1' },
      })
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('rejects full-MCP tools that are absent from the worker profile', async () => {
    const server = createAttemptScopedWorkerMcpServer({
      profile,
      expectedProfileDigest: profile.contractDigest,
      sealedGrant: 'sealed-grant',
      callGateway: vi.fn(),
    })
    const client = new Client({ name: 'worker-gateway-test', version: '1' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await server.connect(serverTransport)
      await client.connect(clientTransport)
      await expect(client.callTool({ name: 'quality_journey_execution_start', arguments: {} })).rejects.toThrow(
        'not registered for this worker role',
      )
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('rejects arguments outside the derived worker schema before the gateway', async () => {
    const callGateway = vi.fn()
    const server = createAttemptScopedWorkerMcpServer({
      profile,
      expectedProfileDigest: profile.contractDigest,
      sealedGrant: 'sealed-grant',
      callGateway,
    })
    const client = new Client({ name: 'worker-gateway-test', version: '1' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await server.connect(serverTransport)
      await client.connect(clientTransport)
      await expect(
        client.callTool({ name: 'quality_journey_analysis_get', arguments: { ownerToken: 'forbidden' } }),
      ).rejects.toThrow('failed the scoped schema')
      expect(callGateway).not.toHaveBeenCalled()
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('rejects a fabricated profile before exposing its tool list', () => {
    const fabricated = {
      ...profile,
      tools: [...profile.tools, { ...profile.tools[0], name: 'quality_journey_execution_start' }],
    }
    expect(() =>
      createAttemptScopedWorkerMcpServer({
        profile: fabricated,
        expectedProfileDigest: profile.contractDigest,
        sealedGrant: 'sealed-grant',
        callGateway: vi.fn(),
      }),
    ).toThrow('not the trusted launch profile')
  })

  it('keeps canonical coordinator handlers and the project bearer on a trusted in-memory bridge', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-managed-worker-bridge-'))
    workspaces.push(cwd)
    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"managed-worker-bridge-test"}')
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ revisionId: 'analysis-1' })))
    vi.stubGlobal('fetch', fetch)
    const bridge = await createTrustedCanonicalIngressBridge({
      cwd,
      baseUrl: 'http://127.0.0.1:3999',
      coordinatorId: 'managed-worker-bridge-test',
    })
    try {
      await expect(
        bridge.invoke({
          toolName: 'quality_journey_analysis_get',
          arguments: { target: 'target-1', journeyId: 'journey-1' },
        }),
      ).resolves.toEqual({ revisionId: 'analysis-1' })
      expect(fetch).toHaveBeenCalledOnce()
      const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
      expect(url).toContain('/api/internal/coordinator/quality/journeys/journey-1/analysis?target=target-1')
      expect((init.headers as Record<string, string>).authorization).toMatch(/^Bearer /)
    } finally {
      await bridge.close()
    }
  })
})

function hash(value: unknown) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalValue(value)))
    .digest('hex')}`
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalValue(nested)]),
  )
}
