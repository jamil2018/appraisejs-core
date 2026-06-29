#!/usr/bin/env node

import { resolveMcpConfig } from './mcp-config.mjs'

const config = resolveMcpConfig()

console.log(`AppraiseJS MCP HTTP endpoint:\n${config.endpoint}\n`)
console.log('Use this URL with MCP clients that support Streamable HTTP.')
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
