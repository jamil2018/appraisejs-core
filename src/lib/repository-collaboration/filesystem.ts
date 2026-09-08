import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { CollaborationSnapshotFiles } from './snapshot'
import { readCollaborationSnapshot } from './reader'

const COLLABORATION_PATH = path.join('appraise', 'collaboration')

function contained(root: string, candidate: string): void {
  const relative = path.relative(root, candidate)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Collaboration destination escapes the repository root')
  }
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await fs.lstat(candidate)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export interface CollaborationFilesystemBoundary {
  boundary: 'STAGED' | 'PREVIOUS_BACKED_UP' | 'INSTALLED' | 'BACKUP_REMOVED'
  stagingPath: string
  backupPath: string
}

export interface CollaborationFilesystemRecovery {
  status: 'NO_RECOVERY_NEEDED' | 'RESTORED_BACKUP' | 'INSTALLED_STAGING' | 'MANUAL_RECOVERY_REQUIRED'
  stagingPath: string
  backupPath: string
}

async function resolveDestination(repositoryRootInput: string): Promise<{
  destination: string
  parent: string
}> {
  const repositoryRoot = await fs.realpath(repositoryRootInput)
  const destination = path.resolve(repositoryRoot, COLLABORATION_PATH)
  contained(repositoryRoot, destination)
  const parent = path.dirname(destination)
  await fs.mkdir(parent, { recursive: true })
  if ((await fs.realpath(parent)) !== parent) throw new Error('Collaboration destination has a symlinked parent')
  return { destination, parent }
}

async function readCurrentSnapshotHash(
  destination: string,
): Promise<
  | { status: 'read'; snapshotHash: string | null }
  | { status: 'conflict'; currentSnapshotHash: null; reason: 'UNSAFE_OR_CHANGED_DESTINATION' }
> {
  if (!(await exists(destination))) return { status: 'read', snapshotHash: null }
  const stat = await fs.lstat(destination)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Collaboration destination is unsafe')
  try {
    return { status: 'read', snapshotHash: (await readCollaborationSnapshot(destination)).snapshotHash }
  } catch {
    return { status: 'conflict', currentSnapshotHash: null, reason: 'UNSAFE_OR_CHANGED_DESTINATION' }
  }
}

/**
 * Reads the installed strict snapshot without changing it. Preparation stores
 * this value and installation compares against it again, so a second valid
 * publication is permitted while out-of-band edits are rejected.
 */
export async function observeCollaborationSnapshot(input: {
  repositoryRoot: string
}): Promise<{ snapshotHash: string | null }> {
  const { destination } = await resolveDestination(input.repositoryRoot)
  const current = await readCurrentSnapshotHash(destination)
  // Invalid content is intentionally represented as no accepted strict
  // snapshot. Installation will observe it again and block, rather than
  // allowing preparation to erase evidence of an external edit.
  return { snapshotHash: current.status === 'read' ? current.snapshotHash : null }
}

async function writeStagedSnapshot(stagingPath: string, snapshot: CollaborationSnapshotFiles): Promise<void> {
  await fs.mkdir(stagingPath, { mode: 0o700 })
  for (const [filePath, bytes] of snapshot.files) {
    const target = path.resolve(stagingPath, filePath)
    contained(stagingPath, target)
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
    await fs.writeFile(target, bytes, { flag: 'wx', mode: 0o600 })
  }
}

async function swapStagedSnapshot(input: {
  destination: string
  stagingPath: string
  backupPath: string
  onBoundary?: (boundary: CollaborationFilesystemBoundary) => Promise<void>
}): Promise<void> {
  let previousMoved = false
  if (await exists(input.destination)) {
    await fs.rename(input.destination, input.backupPath)
    previousMoved = true
    await input.onBoundary?.({
      boundary: 'PREVIOUS_BACKED_UP',
      stagingPath: input.stagingPath,
      backupPath: input.backupPath,
    })
  }
  try {
    await fs.rename(input.stagingPath, input.destination)
    await input.onBoundary?.({
      boundary: 'INSTALLED',
      stagingPath: input.stagingPath,
      backupPath: input.backupPath,
    })
  } catch (error) {
    if (previousMoved) await fs.rename(input.backupPath, input.destination)
    throw error
  }
  if (!previousMoved) return
  await fs.rm(input.backupPath, { recursive: true })
  await input.onBoundary?.({
    boundary: 'BACKUP_REMOVED',
    stagingPath: input.stagingPath,
    backupPath: input.backupPath,
  })
}

export async function installCollaborationSnapshot(input: {
  repositoryRoot: string
  operationId?: string
  snapshot: CollaborationSnapshotFiles
  expectedPreviousSnapshotHash: string | null
  allowReplaceChangedSnapshot?: boolean
  onBoundary?: (boundary: CollaborationFilesystemBoundary) => Promise<void>
}) {
  const { destination, parent } = await resolveDestination(input.repositoryRoot)
  const current = await readCurrentSnapshotHash(destination)
  if (current.status === 'conflict') return current
  const currentSnapshotHash = current.snapshotHash
  if (
    currentSnapshotHash !== input.expectedPreviousSnapshotHash &&
    !(input.allowReplaceChangedSnapshot && input.expectedPreviousSnapshotHash !== null)
  ) {
    return { status: 'conflict' as const, currentSnapshotHash }
  }

  const suffix = input.operationId ?? randomUUID()
  const stagingPath = path.join(parent, `.collaboration-staging-${suffix}`)
  const backupPath = path.join(parent, `.collaboration-backup-${suffix}`)
  if ((await exists(stagingPath)) || (await exists(backupPath))) {
    throw new Error('Collaboration recovery artifacts already exist for this operation')
  }
  await writeStagedSnapshot(stagingPath, input.snapshot)
  try {
    await input.onBoundary?.({ boundary: 'STAGED', stagingPath, backupPath })
    await swapStagedSnapshot({ destination, stagingPath, backupPath, onBoundary: input.onBoundary })
    return { status: 'succeeded' as const, previousSnapshotHash: currentSnapshotHash }
  } finally {
    if (await exists(stagingPath)) await fs.rm(stagingPath, { recursive: true })
  }
}

/**
 * Recovers the only two interrupted rename states produced by
 * {@link installCollaborationSnapshot}. The paths must be its sibling
 * operation paths; arbitrary paths are deliberately rejected.
 */
export async function recoverCollaborationSnapshot(input: {
  repositoryRoot: string
  operationId: string
  stagingPath: string
  backupPath: string
}): Promise<CollaborationFilesystemRecovery> {
  const { destination, parent } = await resolveDestination(input.repositoryRoot)
  const expectedStaging = path.join(parent, `.collaboration-staging-${input.operationId}`)
  const expectedBackup = path.join(parent, `.collaboration-backup-${input.operationId}`)
  if (input.stagingPath !== expectedStaging || input.backupPath !== expectedBackup) {
    throw new Error('Collaboration recovery paths do not belong to this operation')
  }
  const [destinationExists, stagingExists, backupExists] = await Promise.all([
    exists(destination),
    exists(input.stagingPath),
    exists(input.backupPath),
  ])
  if (destinationExists && !stagingExists && !backupExists) {
    return { status: 'NO_RECOVERY_NEEDED', stagingPath: input.stagingPath, backupPath: input.backupPath }
  }
  if (!destinationExists && backupExists && !stagingExists) {
    await fs.rename(input.backupPath, destination)
    return { status: 'RESTORED_BACKUP', stagingPath: input.stagingPath, backupPath: input.backupPath }
  }
  if (!destinationExists && stagingExists && !backupExists) {
    await fs.rename(input.stagingPath, destination)
    return { status: 'INSTALLED_STAGING', stagingPath: input.stagingPath, backupPath: input.backupPath }
  }
  return { status: 'MANUAL_RECOVERY_REQUIRED', stagingPath: input.stagingPath, backupPath: input.backupPath }
}
