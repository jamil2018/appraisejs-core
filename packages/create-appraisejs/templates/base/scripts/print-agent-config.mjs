#!/usr/bin/env node

import { existsSync } from 'node:fs'

import { resolveMcpConfig } from './mcp-config.mjs'

const config = resolveMcpConfig()
const skillExists = existsSync(config.skillPath)
const expectedCapabilities = {
  tools: ['planning_session_create'],
  resources: ['appraise://agent-guide', 'appraise://workflow/planning', 'appraise://workflow/standby'],
}
const staleCapabilityRecovery = [
  'Restart or reconnect the MCP/agent client.',
  'Restart the Appraise MCP sidecar.',
  'Rerun npm run setup:mcp and npm run setup:agent, then call project_diagnostic.',
]
const toolsNotVisibleRecovery = [
  'Register the Streamable HTTP endpoint or the stdio command with the agent client.',
  'Restart or reconnect the client after changing MCP registration.',
  'Run appraisejs agent setup --json and inspect httpMcpEndpoint, stdioFallback, and expectedCapabilities.',
  'Verify HTTP endpoint reachability, then read appraise://agent-guide after reconnect.',
  'If native tools still are not visible, stop and ask the user to reconnect or restart the client.',
]

console.log(`AppraiseJS agent setup\n`)
console.log(`HTTP MCP endpoint:\n${config.endpoint}\n`)
console.log('Stdio fallback command config:')
console.log(JSON.stringify({ appraisejs: config.directStdioConfig }, null, 2))
console.log(`\nCurrent bound hub project:\n${config.resolvedProjectPath}`)
console.log(
  `\nGlobal skill/plugin guidance:\n${
    skillExists
      ? `Install or point your agent client at ${config.skillPath}.`
      : `Skill path was not found at ${config.skillPath}; reinstall AppraiseJS or use appraise://agent-guide.`
  }`,
)
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
console.log(
  'Standby warning: after plan_review_ready, call plan_wait_for_approval and remain resumable; do not terminate while approval is pending.',
)
