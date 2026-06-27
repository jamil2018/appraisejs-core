#!/usr/bin/env node

import path from 'node:path'

const cwd = process.cwd()
const endpointPath = process.env.APPRAISE_MCP_PATH ?? '/mcp'
const host = process.env.APPRAISE_MCP_HOST ?? '127.0.0.1'
const port = process.env.APPRAISE_MCP_PORT ?? '3010'
const baseUrl = process.env.APPRAISE_MCP_BASE_URL ?? 'http://127.0.0.1:3000'
const endpoint = `http://${host}:${port}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`

const directStdioConfig = {
  command: 'appraisejs',
  args: ['mcp', '--cwd', cwd, '--base-url', baseUrl],
}

console.log(`AppraiseJS MCP HTTP endpoint:\n${endpoint}\n`)
console.log('Use this URL with MCP clients that support Streamable HTTP.')
console.log('\nFor stdio-only clients, register one of these command configs:\n')
console.log(
  JSON.stringify(
    {
      appraisejs: directStdioConfig,
    },
    null,
    2,
  ),
)
console.log(`\nResolved project path:\n${path.resolve(cwd)}`)
