import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

type Check = {
  id: string
  status: 'ok' | 'warning' | 'error'
  message: string
  recovery?: string
}

async function gitStatus(cwd: string): Promise<{ available: boolean; dirty: boolean }> {
  return new Promise(resolve => {
    const child = spawn('git', ['status', '--porcelain'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
    let output = ''
    child.stdout.on('data', chunk => {
      output += String(chunk)
    })
    child.on('error', () => resolve({ available: false, dirty: false }))
    child.on('close', code => resolve({ available: code === 0, dirty: code === 0 && output.trim().length > 0 }))
  })
}

export async function diagnoseProject(options: { cwd: string; baseUrl: string }) {
  const cwd = path.resolve(options.cwd)
  const checks: Check[] = []
  const git = await gitStatus(cwd)
  checks.push(
    git.available
      ? {
          id: 'git',
          status: git.dirty ? 'warning' : 'ok',
          message: git.dirty
            ? 'Git worktree has uncommitted files; artifact reproducibility is reduced.'
            : 'Git worktree is clean.',
        }
      : {
          id: 'git',
          status: 'warning',
          message: 'This is not a Git worktree; filesystem snapshots provide reduced reproducibility.',
        },
  )

  const identityPath = path.join(cwd, '.appraisejs', 'coordinator.json')
  try {
    await fs.access(identityPath)
    checks.push({ id: 'identity', status: 'ok', message: 'Coordinator identity exists.' })
  } catch {
    checks.push({
      id: 'identity',
      status: 'warning',
      message: 'Coordinator identity is not initialized.',
      recovery: 'Start AppraiseJS once, then rerun appraisejs doctor.',
    })
  }

  try {
    const response = await fetch(options.baseUrl, { signal: AbortSignal.timeout(2_000) })
    checks.push({
      id: 'application',
      status: response.ok || response.status < 500 ? 'ok' : 'error',
      message: `AppraiseJS responded with HTTP ${response.status}.`,
    })
  } catch {
    checks.push({
      id: 'application',
      status: 'error',
      message: `AppraiseJS is not reachable at ${options.baseUrl}.`,
      recovery: 'Start the local application and verify --base-url.',
    })
  }

  return { ok: checks.every(check => check.status !== 'error'), cwd, baseUrl: options.baseUrl, checks }
}

export function formatMcpBootstrapError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return [
    `AppraiseJS MCP bootstrap failed: ${message}`,
    'No CLI fallback was attempted.',
    'Run `appraisejs doctor --json` and fix the reported identity or application issue before reconnecting.',
  ].join('\n')
}
