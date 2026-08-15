import path from 'node:path'
import { spawn } from 'node:child_process'

import { CoordinatorRequestError, createCoordinatorClient } from './coordinator-client.js'

type Check = {
  id: string
  status: 'ok' | 'warning' | 'error'
  message: string
  recovery?: string
  code?: string
  details?: Record<string, unknown>
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

const gitlessBaseRevisionGuidance = {
  gitCommit: null,
  snapshotHash: 'sha256:<hash filesystem evidence for the planned artifacts>',
  reducedAssurance: true,
  guidance:
    'Non-git target workspaces are valid with reduced assurance. Use this shape for validation baseRevision and call out the reduced reproducibility in the validation handoff.',
}

export async function diagnoseProject(
  options: { cwd: string; baseUrl: string; coordinatorId?: string },
  mcpContract?: { mcpSurfaceVersion: string; mcpContractHash: string },
) {
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

  let remote:
    | {
        project?: { fingerprint?: string; canonicalPath?: string }
        hubProject?: { fingerprint?: string; canonicalPath?: string }
        targetProjects?: unknown[]
        contractVersion?: string
        checks?: Check[]
        warnings?: string[]
        recoveryActions?: string[]
        links?: Record<string, string>
        mcpContractNegotiation?: unknown
      }
    | undefined
  try {
    const client = await createCoordinatorClient({
      ...options,
      coordinatorId: options.coordinatorId ?? 'diagnostic',
    })
    checks.push({
      id: 'identity',
      status: 'ok',
      message: 'Coordinator identity is initialized.',
      code: 'identity-ready',
      details: { fingerprint: client.identity.projectFingerprint },
    })
    remote = (await client.diagnose(mcpContract)) as typeof remote
    checks.push(...(remote?.checks ?? []))
  } catch (error) {
    const requestError = error instanceof CoordinatorRequestError ? error : undefined
    const coordinatorFailure = requestError?.envelope
    checks.push({
      id:
        coordinatorFailure?.classification === 'infrastructure_failure'
          ? 'transport'
          : coordinatorFailure?.details?.boundary === 'project_identity'
            ? 'project'
            : coordinatorFailure?.classification === 'authorization_failure'
              ? 'authentication'
              : coordinatorFailure
                ? 'http'
                : 'identity',
      status: 'error',
      message: requestError?.message ?? (error instanceof Error ? error.message : String(error)),
      code: coordinatorFailure?.classification ?? 'identity-bootstrap-failed',
      recovery:
        coordinatorFailure?.retry.nextAction?.reason ??
        'Verify the project directory and package.json, then rerun `appraisejs doctor --json`.',
      details: coordinatorFailure
        ? { errorId: coordinatorFailure.errorId, ...(coordinatorFailure.details ?? {}) }
        : undefined,
    })
  }

  const warnings = checks.filter(check => check.status === 'warning').map(check => check.message)
  return {
    ok: checks.every(check => check.status !== 'error'),
    hubProject: {
      cwd,
      fingerprint: remote?.hubProject?.fingerprint ?? remote?.project?.fingerprint,
      canonicalPath: remote?.hubProject?.canonicalPath ?? remote?.project?.canonicalPath,
    },
    project: {
      cwd,
      fingerprint: remote?.project?.fingerprint,
    },
    targetProjects: remote?.targetProjects ?? [],
    contractVersion: remote?.contractVersion,
    mcpContractNegotiation: remote?.mcpContractNegotiation,
    baseUrl: options.baseUrl,
    checks,
    warnings,
    recommendedValidationBaseRevision: git.available && !git.dirty ? undefined : gitlessBaseRevisionGuidance,
    recoveryActions: [
      ...checks.flatMap(check => (check.recovery ? [check.recovery] : [])),
      ...(remote?.recoveryActions ?? []),
    ],
    links: remote?.links ?? { application: options.baseUrl },
  }
}

export function formatMcpBootstrapError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const classification = error instanceof CoordinatorRequestError ? error.envelope.classification : 'bootstrap-failed'
  return [
    `AppraiseJS MCP bootstrap failed [${classification}]: ${message}`,
    'No CLI fallback was attempted.',
    'Run `appraisejs doctor --json`, fix the reported category, then restart or reconnect the MCP client.',
  ].join('\n')
}
