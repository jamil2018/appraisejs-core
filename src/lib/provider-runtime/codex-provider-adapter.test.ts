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
  providerModel: 'gpt-5.5',
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
      '--ignore-user-config',
      '--skip-git-repo-check',
      '-c',
      'mcp_servers.appraisejs.command="appraisejs"',
      '-c',
      'mcp_servers.appraisejs.args=["mcp","--cwd","/tmp/appraise-hub","--base-url","http://127.0.0.1:3000"]',
      '-c',
      'mcp_servers.appraisejs.approval_mode="approve"',
      '-c',
      'mcp_servers.appraisejs.tools.project_diagnostic.approval_mode="approve"',
      '-c',
      'mcp_servers.appraisejs.tools.project_add.approval_mode="approve"',
      '-c',
      'mcp_servers.appraisejs.tools.project_list.approval_mode="approve"',
      '-c',
      'mcp_servers.appraisejs.tools.planning_session_create.approval_mode="approve"',
      '-c',
      'mcp_servers.appraisejs.tools.plan_create.approval_mode="approve"',
      '-c',
      'mcp_servers.appraisejs.tools.plan_review_loop.approval_mode="approve"',
      '-c',
      'mcp_servers.appraisejs.tools.plan_wait_for_review.approval_mode="approve"',
      '-c',
      'mcp_servers.appraisejs.tools.plan_review_read.approval_mode="approve"',
      '-c',
      'mcp_servers.appraisejs.tools.plan_revise.approval_mode="approve"',
      '--model',
      'gpt-5.5',
      '-',
    ])
  })

  it('prompts Codex to stop at Appraise-owned plan review', () => {
    expect(buildCodexPlanningPrompt(launchInput)).toContain('Use the Appraise MCP tools')
    expect(buildCodexPlanningPrompt(launchInput)).toContain(
      'Do not wait for plan review, wait for approval, approve, validate, baseline, implement, or complete',
    )
    expect(buildCodexPlanningPrompt(launchInput)).toContain('Draft a checkout plan.')
  })
})
