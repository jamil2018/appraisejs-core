import { describe, expect, it } from 'vitest'

import { resolveMcpConfig } from './mcp-config.mjs'

describe('MCP setup config', () => {
  it('shares endpoint and stdio registration details for MCP and agent setup', () => {
    const config = resolveMcpConfig('/tmp/appraise-hub', {
      APPRAISE_MCP_HOST: '127.0.0.1',
      APPRAISE_MCP_PORT: '3999',
      APPRAISE_MCP_PATH: 'custom-mcp',
      APPRAISE_MCP_BASE_URL: 'http://127.0.0.1:3998',
    })

    expect(config.endpoint).toBe('http://127.0.0.1:3999/custom-mcp')
    expect(config.directStdioConfig).toEqual({
      command: 'appraisejs',
      args: ['mcp', '--cwd', '/tmp/appraise-hub', '--base-url', 'http://127.0.0.1:3998'],
    })
    expect(config.skillPath).toBe('/tmp/appraise-hub/.agents/skills/appraise-project-from-brief')
  })
})
