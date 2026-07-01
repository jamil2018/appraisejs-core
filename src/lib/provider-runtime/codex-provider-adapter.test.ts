import { describe, expect, it } from 'vitest'

import { buildCodexExecArgs, buildCodexMcpArgs, buildCodexPlanningPrompt } from './codex-provider-adapter'

const launchInput = {
  runId: 'run-1',
  targetProjectPath: '/tmp/target',
  hubProjectPath: '/tmp/appraise-hub',
  launchPrompt: 'Draft a checkout plan.',
  appraiseInstructions: 'Appraise owns lifecycle gates.',
  lifecyclePhase: 'planning',
  baseUrl: 'http://127.0.0.1:3000',
  executablePath: 'codex',
  providerProfile: 'planning',
  providerModel: 'gpt-5',
  settings: {},
}

describe('codex provider adapter', () => {
  it('builds a read-only planning command with Appraise MCP injection', () => {
    expect(buildCodexMcpArgs(launchInput)).toEqual([
      'mcp',
      '--cwd',
      '/tmp/appraise-hub',
      '--base-url',
      'http://127.0.0.1:3000',
    ])

    expect(buildCodexExecArgs(launchInput)).toEqual([
      'exec',
      '--json',
      '--cd',
      '/tmp/target',
      '--sandbox',
      'read-only',
      '-c',
      'mcp_servers.appraisejs.command="appraisejs"',
      '-c',
      'mcp_servers.appraisejs.args=["mcp","--cwd","/tmp/appraise-hub","--base-url","http://127.0.0.1:3000"]',
      '--model',
      'gpt-5',
      '-',
    ])
  })

  it('prompts Codex to stop at Appraise-owned plan review', () => {
    expect(buildCodexPlanningPrompt(launchInput)).toContain('Use the Appraise MCP tools')
    expect(buildCodexPlanningPrompt(launchInput)).toContain(
      'Do not approve, validate, baseline, implement, or complete',
    )
    expect(buildCodexPlanningPrompt(launchInput)).toContain('Draft a checkout plan.')
  })
})
