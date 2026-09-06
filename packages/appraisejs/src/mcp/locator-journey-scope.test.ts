import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAppraiseMcpServer } from './server-factory.js'

const workspaces: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(workspaces.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

describe('Journey-scoped locator MCP tools', () => {
  it('sends journeyId to every locator operation and searches only the Journey route', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-mcp-locator-journey-'))
    workspaces.push(cwd)
    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"mcp-locator-journey-test"}')
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const server = await createAppraiseMcpServer({ cwd, baseUrl: 'http://127.0.0.1:3999', coordinatorId: 'test' })
    const client = new Client({ name: 'locator-journey-test', version: '1' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await server.connect(serverTransport)
      await client.connect(clientTransport)

      await client.callTool({
        name: 'locator_search',
        arguments: { target: 'target-1', journeyId: 'journey-1', query: 'checkout' },
      })
      await client.callTool({
        name: 'locator_graph_query',
        arguments: { target: 'target-1', journeyId: 'journey-1', fromId: 'locator-1' },
      })
      await client.callTool({
        name: 'locator_ensure',
        arguments: {
          target: 'target-1',
          journeyId: 'journey-1',
          group: { mode: 'existing', id: 'group-1' },
          locator: { name: 'checkout', selector: '[data-test=checkout]' },
        },
      })

      expect(fetchMock.mock.calls[0]?.[0]).toContain(
        '/api/internal/coordinator/quality/journeys/journey-1/locators?target=target-1&query=checkout&limit=25',
      )
      expect(fetchMock.mock.calls[1]?.[0]).toContain(
        '/api/internal/coordinator/locator-graph?target=target-1&journeyId=journey-1&fromId=locator-1',
      )
      expect(fetchMock.mock.calls[2]?.[0]).toContain('/api/internal/coordinator/locators/ensure')
      expect(JSON.parse(fetchMock.mock.calls[2]?.[1].body)).toMatchObject({
        target: 'target-1',
        journeyId: 'journey-1',
      })
    } finally {
      await client.close()
      await server.close()
    }
  })
})
