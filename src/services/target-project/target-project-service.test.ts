import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockTargetProjectUpsert, mockTargetProjectFindMany, mockTargetProjectFindUnique } = vi.hoisted(() => ({
  mockTargetProjectUpsert: vi.fn(),
  mockTargetProjectFindMany: vi.fn(),
  mockTargetProjectFindUnique: vi.fn(),
}))

vi.mock('@/config/db-config', () => ({
  default: {
    targetProject: {
      upsert: mockTargetProjectUpsert,
      findMany: mockTargetProjectFindMany,
      findUnique: mockTargetProjectFindUnique,
    },
  },
}))

import { listTargetProjects, registerTargetProject, resolveTargetProject } from './target-project-service'

const workspaces: string[] = []

afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(workspaces.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function createWorkspace(packageJson = { name: 'target-app', version: '1.0.0', scripts: { test: 'vitest' } }) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-target-'))
  workspaces.push(workspace)
  await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify(packageJson))
  return workspace
}

describe('target project service', () => {
  it('registers a canonical target project without writing into the target repo', async () => {
    const workspace = await createWorkspace()
    mockTargetProjectUpsert.mockImplementation(async args => ({ id: 'target-1', ...args.create }))

    const result = await registerTargetProject({ projectPath: workspace })

    expect(result).toMatchObject({
      canonicalPath: await fs.realpath(workspace),
      displayName: 'target-app',
      packageName: 'target-app',
    })
    expect(mockTargetProjectUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { canonicalPath: await fs.realpath(workspace) },
        create: expect.objectContaining({
          packageJson: expect.stringContaining('"scripts"'),
          fingerprint: expect.stringMatching(/^sha256:/),
        }),
      }),
    )
    await expect(fs.access(path.join(workspace, '.appraisejs'))).rejects.toBeTruthy()
  })

  it('lists target projects in service-defined order', async () => {
    mockTargetProjectFindMany.mockResolvedValue([{ id: 'target-1' }])

    await expect(listTargetProjects()).resolves.toEqual([{ id: 'target-1' }])
    expect(mockTargetProjectFindMany).toHaveBeenCalledWith({
      orderBy: [{ displayName: 'asc' }, { canonicalPath: 'asc' }],
    })
  })

  it('resolves an existing target by id, fingerprint, display name, or path', async () => {
    mockTargetProjectFindMany.mockResolvedValue([{ id: 'target-1', canonicalPath: '/repo' }])

    await expect(resolveTargetProject('target-1')).resolves.toMatchObject({ id: 'target-1' })
  })
})
