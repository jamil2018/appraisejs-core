import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { SpawnedProcess } from '@/lib/process/task-spawner'
import { ServiceError } from '@/services/shared/errors'

type SpawnTraceViewer = (tracePath: string) => Promise<SpawnedProcess>

export async function spawnTraceViewerFromSnapshot(
  bytes: Buffer,
  spawn: SpawnTraceViewer,
  appraiseRoot = path.join(process.cwd(), '.appraise'),
) {
  const snapshotRoot = path.join(appraiseRoot, 'tmp', 'trace-viewers')
  await fs.mkdir(snapshotRoot, { recursive: true, mode: 0o700 })
  const realAppraiseRoot = await fs.realpath(appraiseRoot)
  const expectedSnapshotRoot = path.join(realAppraiseRoot, 'tmp', 'trace-viewers')
  if ((await fs.realpath(snapshotRoot)) !== expectedSnapshotRoot)
    throw new ServiceError('Trace snapshot root containment is corrupt.', 'CONFLICT', 409)
  await fs.chmod(snapshotRoot, 0o700)

  const snapshotDirectory = await fs.mkdtemp(path.join(snapshotRoot, 'trace-'))
  const snapshotPath = path.join(snapshotDirectory, 'trace.zip')
  const snapshot = await fs.open(snapshotPath, 'wx', 0o600)
  try {
    await snapshot.writeFile(bytes)
  } finally {
    await snapshot.close()
  }

  const cleanup = () => void fs.rm(snapshotDirectory, { recursive: true, force: true }).catch(() => undefined)
  try {
    const spawnedProcess = await spawn(snapshotPath)
    spawnedProcess.process.once('exit', cleanup)
    spawnedProcess.process.once('error', cleanup)
    if (spawnedProcess.exitCode !== null && spawnedProcess.exitCode !== undefined) cleanup()
    return spawnedProcess
  } catch (error) {
    cleanup()
    throw error
  }
}
