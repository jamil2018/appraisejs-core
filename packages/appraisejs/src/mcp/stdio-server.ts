import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import type { CoordinatorOptions } from '../coordinator-client.js'
import { createAppraiseMcpServer } from './server-factory.js'

export async function runAppraiseMcp(options: CoordinatorOptions): Promise<void> {
  const server = await createAppraiseMcpServer(options)
  await server.connect(new StdioServerTransport())
}
