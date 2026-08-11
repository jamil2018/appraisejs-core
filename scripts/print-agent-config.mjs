#!/usr/bin/env node

import expectedCapabilities from '../packages/appraisejs/src/agent-setup-capabilities.json' with { type: 'json' }
import { resolveMcpConfig } from './mcp-config.mjs'

const config = resolveMcpConfig()
const staleCapabilityRecovery = [
  'Restart or reconnect the MCP/agent client.',
  'Restart the Appraise MCP sidecar.',
  'Rerun npm run setup:mcp and npm run setup:agent, then call project_diagnostic.',
]
const toolsNotVisibleRecovery = [
  'Register the Streamable HTTP endpoint or the stdio command with the agent client.',
  'Restart or reconnect the client after changing MCP registration.',
  'Run appraisejs agent setup --json and inspect httpMcpEndpoint, stdioFallback, and expectedCapabilities.',
  'Verify HTTP endpoint reachability after reconnect.',
  'If native tools still are not visible, stop and ask the user to reconnect or restart the client.',
]

console.log(`AppraiseJS agent setup\n`)
console.log(`HTTP MCP endpoint:\n${config.endpoint}\n`)
console.log('Stdio fallback command config:')
console.log(JSON.stringify({ appraisejs: config.directStdioConfig }, null, 2))
console.log(`\nCurrent bound hub project:\n${config.resolvedProjectPath}`)
console.log('\nExpected MCP capabilities after reconnect:')
console.log(JSON.stringify(expectedCapabilities, null, 2))
console.log('\nAfter changing MCP or skill registration, restart or reconnect the agent client.')
console.log(
  'Health check: run npm run setup:mcp for transport details, then call project_diagnostic after reconnecting.',
)
console.log('\nIf expected capabilities are missing:')
for (const step of staleCapabilityRecovery) console.log(`- ${step}`)
console.log('\nIf setup text is visible but native MCP tools are not:')
for (const step of toolsNotVisibleRecovery) console.log(`- ${step}`)
