import { EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import type { SpawnedProcess } from '@/lib/process/task-spawner'
import { spawnTraceViewerFromSnapshot } from './trace-viewer-snapshot-service'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

function spawnedProcess(process: EventEmitter): SpawnedProcess {
  return {
    process: process as ChildProcess,
    pid: 1,
    name: 'trace-viewer-test',
    output: { stdout: [], stderr: [] },
    isRunning: true,
    exitCode: null,
    startTime: new Date(),
    endTime: null,
  }
}

describe('spawnTraceViewerFromSnapshot', () => {
  it('spawns from an exclusive private snapshot and removes it after exit', async () => {
    const appraiseRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-trace-snapshot-'))
    roots.push(appraiseRoot)
    const child = new EventEmitter()
    let receivedPath = ''

    await spawnTraceViewerFromSnapshot(
      Buffer.from('PK trace bytes'),
      async snapshotPath => {
        receivedPath = snapshotPath
        expect(await fs.readFile(snapshotPath, 'utf8')).toBe('PK trace bytes')
        expect((await fs.stat(snapshotPath)).mode & 0o777).toBe(0o600)
        expect((await fs.stat(path.dirname(snapshotPath))).mode & 0o777).toBe(0o700)
        return spawnedProcess(child)
      },
      appraiseRoot,
    )

    child.emit('exit', 0)
    await expect
      .poll(async () =>
        fs.access(receivedPath).then(
          () => true,
          () => false,
        ),
      )
      .toBe(false)
  })

  it('removes the snapshot when spawning fails', async () => {
    const appraiseRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-trace-snapshot-'))
    roots.push(appraiseRoot)
    let receivedPath = ''

    await expect(
      spawnTraceViewerFromSnapshot(
        Buffer.from('PK trace bytes'),
        async snapshotPath => {
          receivedPath = snapshotPath
          throw new Error('spawn failed')
        },
        appraiseRoot,
      ),
    ).rejects.toThrow('spawn failed')
    await expect
      .poll(async () =>
        fs.access(receivedPath).then(
          () => true,
          () => false,
        ),
      )
      .toBe(false)
  })
})
