#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const modeIndex = process.argv.indexOf('--mode')
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : 'healthy'

if (mode === 'unhealthy') process.exit(19)

const launchNonce = process.env.APPRAISE_PHASE0_LAUNCH_NONCE
if (!launchNonce) process.exit(20)

const server = new Server({ name: 'appraise-phase0-synthetic-mcp', version: '1.0.0' }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'fixture_observe',
      description: 'Return a deterministic account-free Phase 0 fixture receipt.',
      inputSchema: {
        type: 'object',
        properties: { probe: { type: 'string', const: 'phase0' } },
        required: ['probe'],
        additionalProperties: false,
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async request => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        fixture: true,
        launchNoncePresent: Boolean(launchNonce),
        tool: request.params.name,
      }),
    },
  ],
}))

await server.connect(new StdioServerTransport())
