import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  deriveCoordinatorProjectIdentity: vi.fn(),
  initializeTargetGitRepository: vi.fn(),
  registerTargetProject: vi.fn(),
  revalidatePath: vi.fn(),
  writeTargetProjectMarker: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/headers', () => ({ cookies: mocks.cookies }))
vi.mock('@/lib/coordinator-api/project-identity', () => ({
  deriveCoordinatorProjectIdentity: mocks.deriveCoordinatorProjectIdentity,
}))
vi.mock('@/services/target-project/target-project-service', () => ({
  initializeTargetGitRepository: mocks.initializeTargetGitRepository,
  registerTargetProject: mocks.registerTargetProject,
  writeTargetProjectMarker: mocks.writeTargetProjectMarker,
}))

import { registerTargetProjectAction } from './target-project-actions'

const cookieStore = { set: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cookies.mockResolvedValue(cookieStore)
  mocks.deriveCoordinatorProjectIdentity.mockResolvedValue({
    canonicalProjectPath: '/appraisejs',
    projectFingerprint: 'sha256:hub',
  })
  mocks.initializeTargetGitRepository.mockResolvedValue({ status: 'skipped' })
  mocks.registerTargetProject.mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000001',
    kind: 'LOCAL_WORKSPACE',
    canonicalPath: '/target-project',
  })
  mocks.writeTargetProjectMarker.mockResolvedValue({
    status: 'written',
    path: '/target-project/.appraisejs/project.json',
  })
})

describe('target-project actions', () => {
  it('uses the hub identity to bind a registered target marker', async () => {
    await expect(
      registerTargetProjectAction({ path: '/target-project', displayName: 'Target Project' }),
    ).resolves.toMatchObject({ status: 200, success: true })

    expect(mocks.deriveCoordinatorProjectIdentity).toHaveBeenCalledWith(process.cwd())
    expect(mocks.writeTargetProjectMarker).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalPath: '/target-project' }),
      'sha256:hub',
    )
  })
})
