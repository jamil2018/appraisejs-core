import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { CoordinatorOptions } from '../coordinator-client.js'
import { registerAppraiseOperations } from './registry.js'
import { createCoordinatorApiClient } from './shared.js'

export async function createAppraiseMcpServer(options: CoordinatorOptions): Promise<McpServer> {
  const api = await createCoordinatorApiClient(options)
  const server = new McpServer({ name: 'appraisejs', version: '0.5.0' })
  registerAppraiseOperations({ server, api, options })
  return server
}
