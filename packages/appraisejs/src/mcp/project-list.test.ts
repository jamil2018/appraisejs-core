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

describe('coordinator-backed project surfaces', () => {
  it('returns the endpoint-mismatch contract for project_list and target-projects resource reads', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-mcp-project-list-'))
    workspaces.push(cwd)
    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"mcp-project-list-test"}')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html>', { status: 404 })))

    const server = await createAppraiseMcpServer({ cwd, baseUrl: 'http://127.0.0.1:3999', coordinatorId: 'test' })
    const client = new Client({ name: 'project-list-test', version: '1' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await server.connect(serverTransport)
      await client.connect(clientTransport)

      const result = await client.callTool({ name: 'project_list', arguments: {} })
      const toolPayload = JSON.parse((result.content[0] as { text: string }).text)
      const resource = await client.readResource({ uri: 'appraise://target-projects' })
      const resourcePayload = JSON.parse((resource.contents[0] as { text: string }).text)

      expect(result.isError).toBe(true)
      for (const payload of [toolPayload, resourcePayload]) {
        expect(payload).toMatchObject({
          classification: 'infrastructure_failure',
          code: 'coordinator_endpoint_mismatch',
          operation: { name: 'target-projects' },
          operationOutcome: 'not_started',
          targetOutcome: 'not_evaluated',
          retry: expect.any(Object),
        })
        expect(JSON.stringify(payload)).not.toContain('<!doctype html>')
      }
      expect(resourcePayload).not.toHaveProperty('details')
    } finally {
      await client.close()
      await server.close()
    }
  })
})
