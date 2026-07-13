import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockTargetProjectUpsert, mockTargetProjectFindMany, mockTargetProjectFindUnique, mockTargetProjectUpdate } =
  vi.hoisted(() => ({
    mockTargetProjectUpsert: vi.fn(),
    mockTargetProjectFindMany: vi.fn(),
    mockTargetProjectFindUnique: vi.fn(),
    mockTargetProjectUpdate: vi.fn(),
  }))

vi.mock('@/config/db-config', () => ({
  default: {
    targetProject: {
      upsert: mockTargetProjectUpsert,
      findMany: mockTargetProjectFindMany,
      findUnique: mockTargetProjectFindUnique,
      update: mockTargetProjectUpdate,
    },
  },
}))

import {
  listTargetProjects,
  renameTargetProject,
  resolveActiveProject,
  registerTargetProject,
  resolveTargetProject,
  writeTargetProjectMarker,
} from './target-project-service'

const workspaces: string[] = []

afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(workspaces.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function createWorkspace(
  packageJson: { name: string; version: string; scripts: Record<string, string> } | null = {
    name: 'target-app',
    version: '1.0.0',
    scripts: { test: 'vitest' },
  },
) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-target-'))
  workspaces.push(workspace)
  if (packageJson) await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify(packageJson))
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

  it('registers empty writable directories as planning targets', async () => {
    const workspace = await createWorkspace(null)
    mockTargetProjectUpsert.mockImplementation(async args => ({ id: 'target-empty', ...args.create }))

    const result = await registerTargetProject({ projectPath: workspace, displayName: 'Empty target' })

    expect(result).toMatchObject({
      canonicalPath: await fs.realpath(workspace),
      displayName: 'Empty target',
      packageName: undefined,
    })
    expect(mockTargetProjectUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          packageJson: expect.stringContaining('"scripts":{}'),
          fingerprint: expect.stringMatching(/^sha256:/),
        }),
      }),
    )
  })

  it('writes and refreshes the Appraise continuity marker independently from registration', async () => {
    const workspace = await createWorkspace()
    const targetProject = {
      id: 'target-1',
      canonicalPath: await fs.realpath(workspace),
      displayName: 'Target app',
      fingerprint: 'sha256:target',
    } as Parameters<typeof writeTargetProjectMarker>[0]

    await expect(writeTargetProjectMarker(targetProject, 'sha256:hub')).resolves.toMatchObject({
      status: 'written',
      path: path.join(targetProject.canonicalPath, '.appraisejs', 'project.json'),
    })
    await expect(writeTargetProjectMarker(targetProject, 'sha256:hub')).resolves.toMatchObject({
      status: 'refreshed',
    })

    const marker = JSON.parse(await fs.readFile(path.join(workspace, '.appraisejs', 'project.json'), 'utf8')) as {
      hubFingerprint: string
      targetProjectId: string
      guidance: string
    }
    expect(marker).toMatchObject({
      hubFingerprint: 'sha256:hub',
      targetProjectId: 'target-1',
      guidance: expect.stringContaining('Future AppraiseJS plans for this workspace'),
    })
  })

  it('reports marker write failures as skipped without failing registration callers', async () => {
    const workspace = await createWorkspace()
    const blockedPath = path.join(workspace, 'package.json')
    const targetProject = {
      id: 'target-1',
      canonicalPath: blockedPath,
      displayName: 'Target app',
      fingerprint: 'sha256:target',
    } as Parameters<typeof writeTargetProjectMarker>[0]

    await expect(writeTargetProjectMarker(targetProject, 'sha256:hub')).resolves.toMatchObject({
      status: 'skipped',
      warning: expect.stringContaining('Target project was registered'),
    })
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

  it('resolves URL project scope before cookie scope without silently falling back', async () => {
    mockTargetProjectFindUnique.mockResolvedValueOnce({ id: 'url-project', displayName: 'URL', canonicalPath: '/url' })

    await expect(
      resolveActiveProject({ urlProjectId: 'url-project', cookieProjectId: 'cookie-project' }),
    ).resolves.toEqual({ id: 'url-project', displayName: 'URL', canonicalPath: '/url', source: 'url' })
    expect(mockTargetProjectFindUnique).toHaveBeenCalledWith({
      where: { id: 'url-project' },
      select: { id: true, displayName: true, canonicalPath: true },
    })

    mockTargetProjectFindUnique.mockResolvedValueOnce(null)
    await expect(
      resolveActiveProject({ urlProjectId: 'missing-project', cookieProjectId: 'cookie-project' }),
    ).resolves.toBeNull()
  })

  it('renames only the display name and preserves project identity', async () => {
    const existing = {
      id: 'target-1',
      canonicalPath: '/repo',
      fingerprint: 'sha256:target',
      displayName: 'Old name',
    }
    mockTargetProjectFindUnique.mockResolvedValue(existing)
    mockTargetProjectUpdate.mockResolvedValue({ ...existing, displayName: 'New name' })

    await expect(
      renameTargetProject({ targetProjectId: 'target-1', displayName: ' New name ' }),
    ).resolves.toMatchObject({
      id: 'target-1',
      canonicalPath: '/repo',
      fingerprint: 'sha256:target',
      displayName: 'New name',
    })
    expect(mockTargetProjectUpdate).toHaveBeenCalledWith({
      where: { id: 'target-1' },
      data: { displayName: 'New name' },
    })
  })
})
