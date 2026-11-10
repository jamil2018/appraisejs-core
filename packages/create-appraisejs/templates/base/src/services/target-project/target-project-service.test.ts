import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'


const {
  mockEnvironmentUpsert,
  mockTargetProjectCreate,
  mockTargetProjectFindMany,
  mockTargetProjectFindUnique,
  mockTargetProjectUpdate,
} = vi.hoisted(() => ({
  mockEnvironmentUpsert: vi.fn(),
  mockTargetProjectCreate: vi.fn(),
  mockTargetProjectFindMany: vi.fn(),
  mockTargetProjectFindUnique: vi.fn().mockResolvedValue(null),
  mockTargetProjectUpdate: vi.fn(),
}))

vi.mock('@/config/db-config', () => {
  const emptyCollection = { findFirst: vi.fn().mockResolvedValue(null) }
  const client = {
    $transaction: (effect: (tx: unknown) => unknown) => effect(client),
    environment: { upsert: mockEnvironmentUpsert },
    targetProject: {
      create: mockTargetProjectCreate,
      findMany: mockTargetProjectFindMany,
      findUnique: mockTargetProjectFindUnique,
      update: mockTargetProjectUpdate,
    },
    qualityJourneySharedResourceCoverage: { ...emptyCollection, create: vi.fn() },
    qualityJourneySharedResourceGuard: emptyCollection,
    qualityJourneySharedResourceUse: emptyCollection,
    qualityJourneySharedResourceClaim: emptyCollection,
    qualityJourneyLocatorEnsureReceipt: emptyCollection,
    qualityJourney: emptyCollection,
    module: emptyCollection,
    locatorGroup: emptyCollection,
    locator: emptyCollection,
    testSuite: emptyCollection,
    testCase: emptyCollection,
  }
  return { default: client }
})

import {
  initializeTargetGitRepository,
  listTargetProjects,
  renameTargetProject,
  resolveActiveProject,
  registerTargetProject,
  readTargetProjectLaunchMetadata,
  resolveTargetProject,
  writeTargetProjectMarker,
} from './target-project-service'

const workspaces: string[] = []

afterEach(async () => {
  vi.clearAllMocks()
  mockTargetProjectFindUnique.mockReset().mockResolvedValue(null)
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
    mockTargetProjectCreate.mockImplementation(async args => ({ id: 'target-1', ...args.data }))

    const result = await registerTargetProject({ path: workspace })

    expect(result).toMatchObject({
      canonicalPath: await fs.realpath(workspace),
      displayName: 'target-app',
      packageName: 'target-app',
    })
    expect(mockTargetProjectCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: `path:${await fs.realpath(workspace)}`,
          packageJson: expect.stringContaining('"scripts"'),
          fingerprint: expect.stringMatching(/^sha256:/),
        }),
      }),
    )
    await expect(fs.access(path.join(workspace, '.appraisejs'))).rejects.toBeTruthy()
  })

  it('registers empty writable directories as planning targets', async () => {
    const workspace = await createWorkspace(null)
    mockTargetProjectCreate.mockImplementation(async args => ({ id: 'target-empty', ...args.data }))

    const result = await registerTargetProject({ path: workspace, displayName: 'Empty target' })

    expect(result).toMatchObject({
      canonicalPath: await fs.realpath(workspace),
      displayName: 'Empty target',
      packageName: undefined,
    })
    expect(mockTargetProjectCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          packageJson: expect.stringContaining('"scripts":{}'),
          fingerprint: expect.stringMatching(/^sha256:/),
        }),
      }),
    )
  })

  it('normalizes a remote target origin and creates its initial environment', async () => {
    mockTargetProjectCreate.mockResolvedValue({ id: 'remote-target', kind: 'REMOTE_BLACK_BOX' })

    await expect(
      registerTargetProject({ url: 'https://example.test/path?ignored=true', displayName: 'Example' }),
    ).resolves.toMatchObject({ id: 'remote-target' })

    expect(mockTargetProjectCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'REMOTE_BLACK_BOX',
          canonicalIdentity: 'url:https://example.test',
          normalizedRemoteOrigin: 'https://example.test',
        }),
      }),
    )
    expect(mockEnvironmentUpsert).toHaveBeenCalledWith({
      where: { targetProjectId_name: { targetProjectId: 'remote-target', name: 'default' } },
      create: { targetProjectId: 'remote-target', name: 'default', baseUrl: 'https://example.test' },
      update: { baseUrl: 'https://example.test', scopeVersion: { increment: 1 } },
    })
  })

  it.each(['ftp://example.test', 'https://user:pass@example.test', 'https://example.test/#fragment'])(
    'rejects an unsafe remote target URL: %s',
    async url => {
      await expect(registerTargetProject({ url })).rejects.toMatchObject({ code: 'VALIDATION', statusCode: 400 })
    },
  )

  it('initializes Git only when explicitly requested for an empty target', async () => {
    const workspace = await createWorkspace(null)

    await expect(initializeTargetGitRepository(workspace, false)).resolves.toEqual({ status: 'skipped' })
    await expect(initializeTargetGitRepository(workspace, true)).resolves.toEqual({
      status: 'initialized',
      branch: 'main',
    })
    await expect(fs.access(path.join(workspace, '.git'))).resolves.toBeUndefined()
    await expect(initializeTargetGitRepository(workspace, true)).resolves.toEqual({ status: 'already_present' })
  })

  it('refuses automatic Git initialization for a non-empty target', async () => {
    const workspace = await createWorkspace()
    await expect(initializeTargetGitRepository(workspace, true)).rejects.toMatchObject({
      code: 'VALIDATION',
      statusCode: 400,
    })
  })

  it('reads launch metadata created after an empty target was registered', async () => {
    const workspace = await createWorkspace(null)
    mockTargetProjectCreate.mockImplementation(async args => ({ id: 'target-empty', ...args.data }))
    const targetProject = await registerTargetProject({ path: workspace, displayName: 'Empty target' })
    await fs.writeFile(
      path.join(workspace, 'package.json'),
      JSON.stringify({ scripts: { dev: 'vite' }, packageManager: 'npm@11.0.0' }),
    )

    await expect(readTargetProjectLaunchMetadata(targetProject)).resolves.toEqual({
      packageManager: 'npm@11.0.0',
      scripts: { dev: 'vite' },
    })
  })

  it('writes and refreshes the Appraise continuity marker independently from registration', async () => {
    const workspace = await createWorkspace()
    const canonicalPath = await fs.realpath(workspace)
    const targetProject = {
      id: 'target-1',
      kind: 'LOCAL_WORKSPACE',
      canonicalPath,
      displayName: 'Target app',
      fingerprint: 'sha256:target',
    } as Parameters<typeof writeTargetProjectMarker>[0]

    await expect(writeTargetProjectMarker(targetProject, 'sha256:hub')).resolves.toMatchObject({
      status: 'written',
      path: path.join(canonicalPath, '.appraisejs', 'project.json'),
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
      kind: 'LOCAL_WORKSPACE',
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
      orderBy: [{ displayName: 'asc' }, { canonicalIdentity: 'asc' }],
    })
  })

  it('resolves an existing target by id, fingerprint, display name, or path', async () => {
    mockTargetProjectFindMany.mockResolvedValue([{ id: 'target-1', canonicalPath: '/repo' }])

    await expect(resolveTargetProject('target-1')).resolves.toMatchObject({ id: 'target-1' })
  })

  it('resolves URL project scope before cookie scope without silently falling back', async () => {
    mockTargetProjectFindUnique.mockResolvedValueOnce({
      id: 'url-project',
      kind: 'REMOTE_BLACK_BOX',
      displayName: 'URL',
      canonicalIdentity: 'url:https://example.test',
      canonicalPath: null,
      normalizedRemoteOrigin: 'https://example.test',
    })

    await expect(
      resolveActiveProject({ urlProjectId: 'url-project', cookieProjectId: 'cookie-project' }),
    ).resolves.toMatchObject({ id: 'url-project', kind: 'REMOTE_BLACK_BOX', source: 'url' })
    expect(mockTargetProjectFindUnique).toHaveBeenCalledWith({
      where: { id: 'url-project' },
      select: expect.objectContaining({ id: true, kind: true, canonicalIdentity: true, canonicalPath: true }),
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
