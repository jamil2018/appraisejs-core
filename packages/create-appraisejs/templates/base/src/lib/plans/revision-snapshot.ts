import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { StoredPlanArtifact } from './artifact-repository'

const execFileAsync = promisify(execFile)

export type PlanRevisionSnapshot = {
  gitCommit: string | null
  dirtyHashes: Record<string, string>
  snapshot: Record<string, string> | null
  reducedAssurance: boolean
  historyTampered: boolean
}

function hash(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

async function runGit(projectRoot: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: projectRoot })
    return stdout.trim()
  } catch {
    return null
  }
}

export async function capturePlanRevision(
  projectRoot: string,
  artifacts: StoredPlanArtifact[],
  previousGitCommit?: string | null,
): Promise<PlanRevisionSnapshot> {
  const gitCommit = await runGit(projectRoot, ['rev-parse', 'HEAD'])
  if (!gitCommit) {
    return {
      gitCommit: null,
      dirtyHashes: {},
      snapshot: Object.fromEntries(artifacts.map(artifact => [artifact.relativePath, artifact.content])),
      reducedAssurance: true,
      historyTampered: false,
    }
  }

  const dirtyOutput = (await runGit(projectRoot, ['status', '--porcelain', '--', 'appraise/plans'])) ?? ''
  const dirtyPaths = dirtyOutput
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => line.slice(3).trim())
  const artifactByPath = new Map(artifacts.map(artifact => [artifact.relativePath, artifact]))
  const dirtyHashes = Object.fromEntries(
    dirtyPaths.map(relativePath => [relativePath, hash(artifactByPath.get(relativePath)?.content ?? '<deleted>')]),
  )
  const ancestorCheck = previousGitCommit
    ? await runGit(projectRoot, ['merge-base', '--is-ancestor', previousGitCommit, gitCommit])
    : ''

  return {
    gitCommit,
    dirtyHashes,
    snapshot: null,
    reducedAssurance: false,
    historyTampered: Boolean(previousGitCommit && ancestorCheck === null),
  }
}
