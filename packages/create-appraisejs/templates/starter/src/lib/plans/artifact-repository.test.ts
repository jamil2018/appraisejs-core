import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { PlanArtifactRepository, PlanRepositoryError } from './artifact-repository'

const workspaces: string[] = []

async function createWorkspace() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-plan-repository-'))
  workspaces.push(workspace)
  await fs.writeFile(path.join(workspace, 'package.json'), '{}')
  return workspace
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

describe('PlanArtifactRepository', () => {
  it('creates, reads, lists, and compare-and-writes artifacts atomically', async () => {
    const workspace = await createWorkspace()
    const repository = new PlanArtifactRepository(workspace)

    const created = await repository.create('plan', 'checkout-flow', 'version: "1"\n')
    expect(await repository.read('plan', 'checkout-flow')).toEqual(created)
    expect(await repository.list()).toEqual([created])

    await expect(repository.compareAndWrite('plan', 'checkout-flow', 'sha256:stale', 'changed')).rejects.toMatchObject({
      code: 'stale-write',
    })

    const updated = await repository.compareAndWrite(
      'plan',
      'checkout-flow',
      created.hash,
      'version: "1"\nrevision: 2\n',
    )
    expect(updated.hash).not.toBe(created.hash)
    expect(await fs.readFile(updated.absolutePath, 'utf8')).toBe('version: "1"\nrevision: 2\n')
  })

  it('rejects traversal, absolute IDs, and symlink escapes', async () => {
    const workspace = await createWorkspace()
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-plan-outside-'))
    workspaces.push(outside)
    const repository = new PlanArtifactRepository(workspace)

    await expect(repository.read('plan', '../escape')).rejects.toBeInstanceOf(PlanRepositoryError)
    await expect(repository.read('plan', 'C:\\escape')).rejects.toBeInstanceOf(PlanRepositoryError)

    await fs.mkdir(path.join(workspace, 'appraise'), { recursive: true })
    await fs.symlink(outside, path.join(workspace, 'appraise', 'plans'))
    await expect(repository.create('plan', 'checkout-flow', 'unsafe')).rejects.toMatchObject({
      code: 'path-escape',
    })
  })

  it('rejects a lock directory symlink before writing outside the plans root', async () => {
    const workspace = await createWorkspace()
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-lock-outside-'))
    workspaces.push(outside)
    const repository = new PlanArtifactRepository(workspace)
    await fs.mkdir(path.join(workspace, 'appraise', 'plans'), { recursive: true })
    await fs.symlink(outside, path.join(workspace, 'appraise', 'plans', '.locks'))

    await expect(repository.create('plan', 'checkout-flow', 'unsafe')).rejects.toMatchObject({
      code: 'path-escape',
    })
    expect(await fs.readdir(outside)).toEqual([])
  })

  it('recovers stale lock files and serializes writes per plan', async () => {
    const workspace = await createWorkspace()
    const repository = new PlanArtifactRepository(workspace, { staleLockMs: 10 })
    const lockPath = path.join(workspace, 'appraise', 'plans', '.locks', 'checkout-flow.lock')
    await fs.mkdir(path.dirname(lockPath), { recursive: true })
    await fs.writeFile(lockPath, 'stale')
    await fs.utimes(lockPath, new Date(0), new Date(0))

    await repository.create('plan', 'checkout-flow', 'first')
    await expect(repository.create('review', 'checkout-flow', 'second')).resolves.toMatchObject({
      planId: 'checkout-flow',
    })
    await expect(fs.access(lockPath)).rejects.toThrow()
  })
})
