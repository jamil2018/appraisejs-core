#!/usr/bin/env node

import { resolveMcpConfig } from './mcp-config.mjs'

const config = resolveMcpConfig()

console.log(`AppraiseJS MCP HTTP endpoint:\n${config.endpoint}\n`)
console.log('Use this URL with MCP clients that support Streamable HTTP.')
console.log('\nCodex registration or refresh:\n')
console.log(config.codex.inspectCommand)
console.log(`# If the URL or transport is stale:\n${config.codex.removeCommand}`)
console.log(config.codex.addCommand)
console.log(config.codex.verifyCommand)
console.log(
  '\nThen restart or reconnect Codex. MCP capabilities are captured when the task starts and do not refresh inside an already-running task.',
)
console.log('\nFor stdio-only clients, register one of these command configs:\n')
console.log(
  JSON.stringify(
    {
      appraisejs: config.directStdioConfig,
    },
    null,
    2,
  ),
)
console.log(`\nResolved project path:\n${config.resolvedProjectPath}`)
