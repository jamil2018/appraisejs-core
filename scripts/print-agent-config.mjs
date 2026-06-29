#!/usr/bin/env node

import { existsSync } from 'node:fs'

import { resolveMcpConfig } from './mcp-config.mjs'

const config = resolveMcpConfig()
const skillExists = existsSync(config.skillPath)

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
console.log('\nAfter changing MCP or skill registration, restart or reconnect the agent client.')
console.log(
  'Health check: run npm run setup:mcp for transport details, then call project_diagnostic after reconnecting.',
)
console.log(
  'Standby warning: after plan_review_ready, call plan_wait_for_approval and remain resumable; do not terminate while approval is pending.',
)
