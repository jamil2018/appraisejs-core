import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createRequire } from 'node:module'

import type { CoordinatorOptions } from '../coordinator-client.js'
import { registerAppraiseOperations } from './registry.js'
import { createCoordinatorApiClient } from './shared.js'

export async function createAppraiseMcpServer(options: CoordinatorOptions): Promise<McpServer> {
  const api = await createCoordinatorApiClient(options)
  const packageJson = createRequire(import.meta.url)('../../package.json') as { version: string }
  const server = new McpServer({ name: 'appraisejs', version: packageJson.version })
  registerAppraiseOperations({ server, api, options })
  return server
}
