#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { createManagedWorkerRegistrationProfile } from '../../../src/lib/quality-journey/managed-worker-gateway.js'
import { createAttemptScopedWorkerMcpServer } from '../src/mcp/managed-worker-server.js'
import { registerAppraiseOperations } from '../src/mcp/registry.js'

const role = 'REQUIREMENT_ANALYZER'
const definitions = registerAppraiseOperations({
  server: { registerTool: () => ({}), registerResource: () => ({}) } as never,
  api: new Proxy({}, { get: () => async () => ({}) }) as never,
  options: {
    cwd: process.cwd(),
    baseUrl: 'http://127.0.0.1:3000',
    coordinatorId: 'phase0-exact-tool-inspection',
  },
})
const profile = createManagedWorkerRegistrationProfile(role, definitions)
const server = createAttemptScopedWorkerMcpServer({
  profile,
  expectedProfileDigest: profile.contractDigest,
  sealedGrant: 'no-call-during-phase0-inspection',
  callGateway: async () => {
    throw new Error('P0.R2 no-model inspection must not call the worker gateway.')
  },
})

await server.connect(new StdioServerTransport())
