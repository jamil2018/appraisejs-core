import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

import { CoordinatorRequestError, createCoordinatorClient } from './coordinator-client.js'

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

export async function diagnoseProject(options: { cwd: string; baseUrl: string; coordinatorId?: string }) {
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

  let remote:
    | {
        project?: { fingerprint?: string }
        contractVersion?: string
        checks?: Check[]
        warnings?: string[]
        recoveryActions?: string[]
        links?: Record<string, string>
      }
    | undefined
  try {
    const client = await createCoordinatorClient({
      ...options,
      coordinatorId: options.coordinatorId ?? 'diagnostic',
    })
    remote = (await client.diagnose()) as typeof remote
    checks.push(...(remote?.checks ?? []))
  } catch (error) {
    const requestError = error instanceof CoordinatorRequestError ? error : undefined
    checks.push({
      id: requestError?.status === 401 ? 'authentication' : 'application',
      status: 'error',
      message: requestError?.message ?? `AppraiseJS is not reachable at ${options.baseUrl}.`,
      recovery:
        requestError?.recovery ??
        'Start the local application, verify the configured base URL, and confirm the project identity.',
    })
  }

  const warnings = checks.filter(check => check.status === 'warning').map(check => check.message)
  return {
    ok: checks.every(check => check.status !== 'error'),
    project: {
      cwd,
      fingerprint: remote?.project?.fingerprint,
    },
    contractVersion: remote?.contractVersion,
    baseUrl: options.baseUrl,
    checks,
    warnings,
    recoveryActions: [
      ...checks.flatMap(check => (check.recovery ? [check.recovery] : [])),
      ...(remote?.recoveryActions ?? []),
    ],
    links: remote?.links ?? { application: options.baseUrl },
  }
}

export function formatMcpBootstrapError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return [
    `AppraiseJS MCP bootstrap failed: ${message}`,
    'No CLI fallback was attempted.',
    'Run `appraisejs doctor --json` and fix the reported identity or application issue before reconnecting.',
  ].join('\n')
}
