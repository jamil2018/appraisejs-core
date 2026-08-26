import { describe, expect, it, vi } from 'vitest'
import { environmentSchema } from '@/constants/form-opts/environment-form-opts'
import {
  createEnvironment,
  deleteEnvironments,
  ensureEnvironment,
  environmentRegistryHash,
  getEnvironmentByIdOrThrow,
  listEnvironments,
  updateEnvironment,
} from './environment-service'

vi.mock('@/config/db-config', () => ({
  default: {
    $transaction: vi.fn(),
    environment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import prisma from '@/config/db-config'
const targetProjectId = 'project-1'

vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(prisma as never) as never)

const basePayload = environmentSchema.parse({
  name: 'Dev',
  baseUrl: 'https://example.com',
  apiBaseUrl: '',
  username: '',
  passwordEnvironmentVariable: '',
})

describe('getEnvironmentByIdOrThrow', () => {
  it('throws when environment is missing', async () => {
    vi.mocked(prisma.environment.findFirst).mockResolvedValue(null)
    await expect(getEnvironmentByIdOrThrow('missing', targetProjectId)).rejects.toMatchObject({
      message: 'Environment not found',
      statusCode: 404,
    })
  })
})

describe('createEnvironment', () => {
  it('throws when name already exists', async () => {
    vi.mocked(prisma.environment.findFirst).mockResolvedValue({ id: 'e1' } as never)
    await expect(createEnvironment(basePayload, targetProjectId)).rejects.toMatchObject({
      message: expect.stringContaining('already exists'),
      statusCode: 400,
    })
    expect(prisma.environment.create).not.toHaveBeenCalled()
  })

  it('creates and returns environment when name is unique', async () => {
    vi.mocked(prisma.environment.findFirst).mockResolvedValue(null)
    const created = { id: 'new-id', name: 'Dev' }
    vi.mocked(prisma.environment.create).mockResolvedValue(created as never)

    await expect(createEnvironment(basePayload, targetProjectId)).resolves.toEqual(created)
    expect(prisma.environment.create).toHaveBeenCalledWith({
      data: {
        name: 'Dev',
        baseUrl: 'https://example.com',
        expectedPageTitle: null,
        apiBaseUrl: null,
        username: null,
        passwordEnvironmentVariable: null,
        credentialState: 'NONE',
        targetProjectId,
      },
    })
  })
})

describe('listEnvironments', () => {
  it('loads environments without writing target files', async () => {
    vi.mocked(prisma.environment.findMany).mockResolvedValue([{ id: 'env-1' }] as never)

    await expect(listEnvironments(targetProjectId)).resolves.toEqual([{ id: 'env-1' }])
    expect(prisma.environment.findMany).toHaveBeenCalledWith({
      where: { targetProjectId },
      orderBy: { createdAt: 'desc' },
    })
  })
})

describe('environment coordinator preparation helpers', () => {
  it('returns a stable redacted registry hash', () => {
    expect(
      environmentRegistryHash([
        {
          id: 'env-1',
          name: 'Dev',
          baseUrl: 'https://example.com',
          expectedPageTitle: null,
          apiBaseUrl: null,
          username: 'operator',
          passwordEnvironmentVariable: 'APP_PASSWORD',
          credentialState: 'REFERENCE_CONFIGURED',
        } as never,
      ]),
    ).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('resolves an explicit target environment without creating it', async () => {
    vi.mocked(prisma.environment.findFirst).mockResolvedValue({ id: 'env-1', name: 'Dev' } as never)
    await expect(ensureEnvironment({ environmentId: 'env-1' }, targetProjectId)).resolves.toMatchObject({
      outcome: 'resolved',
      environment: { id: 'env-1' },
    })
    expect(prisma.environment.create).not.toHaveBeenCalled()
  })

  it('replays an identical explicit proposal without creating a duplicate', async () => {
    vi.mocked(prisma.environment.findFirst).mockResolvedValue({
      id: 'env-1',
      name: 'Dev',
      baseUrl: 'https://example.com',
      expectedPageTitle: null,
      apiBaseUrl: null,
      username: null,
      passwordEnvironmentVariable: null,
    } as never)

    await expect(
      ensureEnvironment({ allowCreate: true, proposal: basePayload }, targetProjectId),
    ).resolves.toMatchObject({ outcome: 'replayed', environment: { id: 'env-1' } })
    expect(prisma.environment.create).not.toHaveBeenCalled()
  })

  it('rejects implicit environment creation before writing', async () => {
    await expect(ensureEnvironment({}, targetProjectId)).rejects.toMatchObject({ statusCode: 400 })
    expect(prisma.environment.create).not.toHaveBeenCalled()
  })
})

describe('deleteEnvironments', () => {
  it('deletes environments without projection output', async () => {
    vi.mocked(prisma.environment.deleteMany).mockResolvedValue({ count: 1 } as never)

    await deleteEnvironments(['env-1'], targetProjectId)

    expect(prisma.environment.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['env-1'] }, targetProjectId },
    })
  })
})

describe('updateEnvironment', () => {
  it('updates the environment and normalizes blank fields without projection output', async () => {
    vi.mocked(prisma.environment.findFirst)
      .mockResolvedValueOnce({ name: 'Old Name' } as never)
      .mockResolvedValueOnce(null)
    vi.mocked(prisma.environment.update).mockResolvedValue({ id: 'env-1', name: 'Dev' } as never)

    const result = await updateEnvironment(
      'env-1',
      environmentSchema.parse({
        name: 'Dev',
        baseUrl: 'https://example.com',
        expectedPageTitle: '',
        apiBaseUrl: '',
        username: '',
        passwordEnvironmentVariable: '',
      }),
      targetProjectId,
    )

    expect(result).toEqual({ id: 'env-1', name: 'Dev' })
    expect(prisma.environment.update).toHaveBeenCalledWith({
      where: { id: 'env-1' },
      data: {
        name: 'Dev',
        baseUrl: 'https://example.com',
        expectedPageTitle: null,
        apiBaseUrl: null,
        username: null,
        passwordEnvironmentVariable: null,
        credentialState: 'NONE',
        scopeVersion: { increment: 1 },
      },
    })
  })
})
