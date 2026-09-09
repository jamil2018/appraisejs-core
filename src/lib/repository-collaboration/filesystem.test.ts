import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { CollaborationRecord } from './contracts'
import { installCollaborationSnapshot, recoverCollaborationSnapshot } from './filesystem'
import { buildCollaborationSnapshotFiles } from './snapshot'

function snapshot(name: string) {
  const record: CollaborationRecord = {
    format: 'appraise.repository-collaboration/v1',
    portableProjectId: 'portable-project',
    portableId: 'module-one',
    version: 1,
    archived: false,
    kind: 'module',
    payload: { name, parentPortableId: null },
  }
  return buildCollaborationSnapshotFiles([record])
}

describe('collaboration filesystem publication', () => {
  it('installs through journaled sibling staging and preserves external edits', async () => {
    const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'appraise-collaboration-fs-'))
    const first = snapshot('First')
    const boundaries: string[] = []
    await expect(
      installCollaborationSnapshot({
        repositoryRoot,
        operationId: 'first',
        snapshot: first,
        expectedPreviousSnapshotHash: null,
        onBoundary: async boundary => void boundaries.push(boundary.boundary),
      }),
    ).resolves.toMatchObject({ status: 'succeeded' })
    expect(boundaries).toEqual(['STAGED', 'INSTALLED'])

    const recordPath = path.join(repositoryRoot, 'appraise/collaboration/modules/module-one.json')
    await writeFile(recordPath, `${await readFile(recordPath, 'utf8')}\nexternal edit`)
    await expect(
      installCollaborationSnapshot({
        repositoryRoot,
        operationId: 'second',
        snapshot: snapshot('Second'),
        expectedPreviousSnapshotHash: first.snapshotHash,
      }),
    ).resolves.toMatchObject({ status: 'conflict', reason: 'UNSAFE_OR_CHANGED_DESTINATION' })
    expect(await readFile(recordPath, 'utf8')).toContain('external edit')
  })

  it('recovers the durable backup boundary without accepting arbitrary paths', async () => {
    const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'appraise-collaboration-fs-recovery-'))
    const resolvedRoot = await realpath(repositoryRoot)
    const parent = path.join(resolvedRoot, 'appraise')
    const backupPath = path.join(parent, '.collaboration-backup-crash')
    const stagingPath = path.join(parent, '.collaboration-staging-crash')
    await mkdir(path.join(backupPath, 'modules'), { recursive: true })
    await writeFile(path.join(backupPath, 'modules', 'preserved.json'), 'before image')
    await expect(
      recoverCollaborationSnapshot({ repositoryRoot: resolvedRoot, operationId: 'crash', stagingPath, backupPath }),
    ).resolves.toMatchObject({ status: 'RESTORED_BACKUP' })
    await expect(
      readFile(path.join(resolvedRoot, 'appraise', 'collaboration', 'modules', 'preserved.json'), 'utf8'),
    ).resolves.toBe('before image')
    await expect(
      recoverCollaborationSnapshot({
        repositoryRoot: resolvedRoot,
        operationId: 'crash',
        stagingPath: path.join(resolvedRoot, 'outside'),
        backupPath,
      }),
    ).rejects.toThrow('do not belong')
  })
})
