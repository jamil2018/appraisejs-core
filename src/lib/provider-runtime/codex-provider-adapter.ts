import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import type {
  NormalizedProviderEvent,
  ProviderAdapter,
  ProviderLaunchInput,
  ProviderLaunchResult,
  ProviderProbeInput,
  ProviderProbeResult,
} from './provider-adapter'
import { planningOnlyCapabilitySnapshot } from './provider-adapter'

type ProcessResult = {
  exitCode: number | null
  stdout: string
  stderr: string
}

function providerCommand(input?: ProviderProbeInput | Pick<ProviderLaunchInput, 'executablePath'>) {
  return input?.executablePath?.trim() || 'codex'
}

function runProcess(command: string, args: string[], options: { cwd?: string; input?: string } = {}) {
  return new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', exitCode => resolve({ exitCode, stdout, stderr }))
    if (options.input) child.stdin.end(options.input)
    else child.stdin.end()
  })
}

export function buildCodexMcpArgs(input: Pick<ProviderLaunchInput, 'hubProjectPath' | 'baseUrl'>) {
  return ['mcp', '--cwd', input.hubProjectPath, '--base-url', input.baseUrl ?? 'http://127.0.0.1:3000']
}

function buildCodexMcpCommandConfig(input: Pick<ProviderLaunchInput, 'hubProjectPath' | 'baseUrl'>) {
  const localCliPath = path.join(input.hubProjectPath, 'packages', 'appraisejs', 'dist', 'cli.js')
  if (fs.existsSync(localCliPath)) {
    return { command: process.execPath, args: [localCliPath, ...buildCodexMcpArgs(input)] }
  }
  return { command: 'appraisejs', args: buildCodexMcpArgs(input) }
}

const codexPlanningMcpTools = [
  'project_diagnostic',
  'project_add',
  'project_list',
  'planning_session_create',
  'plan_create',
  'plan_review_loop',
  'plan_wait_for_review',
  'plan_review_read',
  'plan_revise',
]

export function buildCodexExecArgs(input: ProviderLaunchInput) {
  const mcpConfig = buildCodexMcpCommandConfig(input)
  const args = [
    'exec',
    '--json',
    '--cd',
    input.targetProjectPath,
    '--sandbox',
    'read-only',
    '--ignore-user-config',
    '--skip-git-repo-check',
    '-c',
    `mcp_servers.appraisejs.command=${JSON.stringify(mcpConfig.command)}`,
    '-c',
    `mcp_servers.appraisejs.args=${JSON.stringify(mcpConfig.args)}`,
    '-c',
    'mcp_servers.appraisejs.approval_mode="approve"',
  ]
  for (const toolName of codexPlanningMcpTools) {
    args.push('-c', `mcp_servers.appraisejs.tools.${toolName}.approval_mode="approve"`)
  }
  if (input.providerModel) args.push('--model', input.providerModel)
  args.push('-')
  return args
}

export function buildCodexPlanningPrompt(input: ProviderLaunchInput) {
  return [
    input.appraiseInstructions,
    '',
    `Lifecycle phase: ${input.lifecyclePhase}.`,
    `Target project path: ${input.targetProjectPath}.`,
    '',
    'Use the Appraise MCP tools to create or revise a durable target-bound Appraise plan.',
    'Stop after Appraise returns the created or revised plan link and awaiting-plan-review lifecycle evidence.',
    'Do not wait for plan review, wait for approval, approve, validate, baseline, implement, or complete lifecycle gates.',
    '',
    'User brief:',
    input.launchPrompt,
  ].join('\n')
}

function parseCodexEvents(stdout: string, stderr: string): NormalizedProviderEvent[] {
  const events: NormalizedProviderEvent[] = []
  for (const line of stdout.split('\n').filter(Boolean)) {
    try {
      events.push({ type: 'provider_event_streamed', payload: JSON.parse(line) as Record<string, unknown> })
    } catch {
      events.push({ type: 'provider_event_streamed', stream: line, payload: { channel: 'stdout' } })
    }
  }
  if (stderr.trim()) {
    events.push({ type: 'provider_event_streamed', stream: stderr.trim(), payload: { channel: 'stderr' } })
  }
  return events
}

async function probeCodexProvider(input: ProviderProbeInput = {}): Promise<ProviderProbeResult> {
  const command = providerCommand(input)
  try {
    const result = await runProcess(command, ['--version'])
    const output = `${result.stdout}\n${result.stderr}`.trim()
    if (result.exitCode !== 0) {
      return {
        status: 'error',
        message: output || `Codex probe exited with code ${result.exitCode}.`,
        executablePath: command,
        launchEnabled: false,
      }
    }
    return {
      status: 'installed',
      message: output || 'Codex CLI is available.',
      detectedVersion: output || undefined,
      executablePath: command,
      launchEnabled: true,
    }
  } catch (error) {
    return {
      status: 'missing',
      message: error instanceof Error ? error.message : String(error),
      executablePath: command,
      launchEnabled: false,
    }
  }
}

export const codexProviderAdapter: ProviderAdapter = {
  key: 'codex',
  displayName: 'Codex',
  providerKind: 'codex',
  adapterVersion: 'planning-v1',
  capabilities: planningOnlyCapabilitySnapshot,
  defaultExecutable: 'codex',
  defaultProfile: 'planning-default',
  defaultModel: 'gpt-5.5',
  setupMessage: 'Install and sign in to the Codex CLI. Appraise stores no provider secrets.',
  launchableWhenProbed: true,
  probe: probeCodexProvider,
  async launch(input): Promise<ProviderLaunchResult> {
    const command = providerCommand(input)
    const result = await runProcess(command, buildCodexExecArgs(input), {
      cwd: input.targetProjectPath,
      input: buildCodexPlanningPrompt(input),
    })
    const events = parseCodexEvents(result.stdout, result.stderr)
    events.push({
      type: result.exitCode === 0 ? 'provider_run_completed' : 'provider_run_failed',
      payload: { exitCode: result.exitCode, lifecycleAuthority: 'appraise', nextGate: 'plan_review_ready' },
    })
    return {
      status: result.exitCode === 0 ? 'completed' : 'failed',
      providerProcessId: command,
      events,
    }
  },
  async cancel() {
    return [
      {
        type: 'provider_run_cancelled',
        payload: { termination: 'process_exit_requested', lifecycleAuthority: 'appraise' },
      },
    ]
  },
}
