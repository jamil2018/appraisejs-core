import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { CoordinatorOptions } from '../coordinator-client.js'
import { registerAppraiseOperations } from './registry.js'
import { createCoordinatorApiClient, type PlanSnapshot } from './shared.js'

export async function createAppraiseMcpServer(options: CoordinatorOptions): Promise<McpServer> {
  const api = await createCoordinatorApiClient(options)
  const server = new McpServer({ name: 'appraisejs', version: '0.5.0' })
  const readSnapshot = (planId: string) => api.request(`plans/${planId}`) as Promise<PlanSnapshot>
  registerAppraiseOperations({ server, api, options, readSnapshot })
  return server
}
