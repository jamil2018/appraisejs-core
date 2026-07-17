import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveMcpConfig } from '../mcp-config.mjs'

describe('MCP setup config', () => {
  it('shares endpoint and stdio registration details for MCP and agent setup', () => {
    const config = resolveMcpConfig('/tmp/appraise-hub', {
      APPRAISE_MCP_HOST: '127.0.0.1',
      APPRAISE_MCP_PORT: '3999',
      APPRAISE_MCP_PATH: 'custom-mcp',
      APPRAISE_MCP_BASE_URL: 'http://127.0.0.1:3998',
    })
    const cliPath = path.join('/tmp/appraise-hub', 'packages', 'appraisejs', 'dist', 'cli.js')

    expect(config.endpoint).toBe('http://127.0.0.1:3999/custom-mcp')
    expect(config.directStdioConfig).toEqual({
      command: process.execPath,
      args: [cliPath, 'mcp', '--cwd', '/tmp/appraise-hub', '--base-url', 'http://127.0.0.1:3998'],
    })
    expect(config.codex).toEqual({
      inspectCommand: 'codex mcp get appraisejs',
      removeCommand: 'codex mcp remove appraisejs',
      addCommand: `codex mcp add appraisejs -- '${process.execPath}' '${cliPath}' 'mcp' '--cwd' '/tmp/appraise-hub' '--base-url' 'http://127.0.0.1:3998'`,
      verifyCommand: 'codex mcp get appraisejs',
    })
    expect(config.skillPath).toBe('/tmp/appraise-hub/.agents/skills/appraise-project-from-brief')
  })

  it('shell-quotes registration arguments from the resolved workspace path', () => {
    const config = resolveMcpConfig("/tmp/appraise'$workspace")

    expect(config.codex.addCommand).toContain("'/tmp/appraise'\"'\"'$workspace/packages/appraisejs/dist/cli.js'")
    expect(config.codex.addCommand).toContain("'--cwd' '/tmp/appraise'\"'\"'$workspace'")
  })
})
