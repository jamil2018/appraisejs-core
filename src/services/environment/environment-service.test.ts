import { describe, expect, it, vi } from 'vitest'
import { environmentSchema } from '@/constants/form-opts/environment-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import {
  checkEnvironmentNameUnique,
  createEnvironment,
  deleteEnvironments,
  getEnvironmentByIdOrThrow,
  listEnvironments,
  updateEnvironment,
} from './environment-service'

vi.mock('@/config/db-config', () => ({
  default: {
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

vi.mock('@/lib/automation/projection-service', () => ({
  automationProjectionService: {
    syncEnvironments: vi.fn().mockResolvedValue(undefined),
  },
}))

import prisma from '@/config/db-config'

const basePayload = environmentSchema.parse({
  name: 'Dev',
  baseUrl: 'https://example.com',
  apiBaseUrl: '',
  username: '',
  password: '',
})

describe('getEnvironmentByIdOrThrow', () => {
  it('throws when environment is missing', async () => {
    vi.mocked(prisma.environment.findUnique).mockResolvedValue(null)
    await expect(getEnvironmentByIdOrThrow('missing')).rejects.toMatchObject({
      message: 'Environment not found',
      statusCode: 404,
    })
  })
})

describe('createEnvironment', () => {
  it('throws when name already exists', async () => {
    vi.mocked(prisma.environment.findFirst).mockResolvedValue({ id: 'e1' } as never)
    await expect(createEnvironment(basePayload)).rejects.toMatchObject({
      message: expect.stringContaining('already exists'),
      statusCode: 400,
    })
    expect(prisma.environment.create).not.toHaveBeenCalled()
  })

  it('creates and returns environment when name is unique', async () => {
    vi.mocked(prisma.environment.findFirst).mockResolvedValue(null)
    const created = { id: 'new-id', name: 'Dev' }
    vi.mocked(prisma.environment.create).mockResolvedValue(created as never)

    await expect(createEnvironment(basePayload)).resolves.toEqual(created)
    expect(prisma.environment.create).toHaveBeenCalledWith({
      data: {
        name: 'Dev',
        baseUrl: 'https://example.com',
        apiBaseUrl: null,
        username: null,
        password: null,
      },
    })
    expect(automationProjectionService.syncEnvironments).toHaveBeenCalled()
  })
})

describe('listEnvironments', () => {
  it('loads environments and syncs the projection file', async () => {
    vi.mocked(prisma.environment.findMany).mockResolvedValue([{ id: 'env-1' }] as never)

    await expect(listEnvironments()).resolves.toEqual([{ id: 'env-1' }])
    expect(prisma.environment.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    })
    expect(automationProjectionService.syncEnvironments).toHaveBeenCalled()
  })
})

describe('deleteEnvironments', () => {
  it('deletes environments and syncs projection output', async () => {
    vi.mocked(prisma.environment.deleteMany).mockResolvedValue({ count: 1 } as never)

    await deleteEnvironments(['env-1'])

    expect(prisma.environment.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['env-1'] } },
    })
    expect(automationProjectionService.syncEnvironments).toHaveBeenCalled()
  })
})

describe('updateEnvironment', () => {
  it('updates the environment, normalizes blank fields, and syncs projections', async () => {
    vi.mocked(prisma.environment.findUnique)
      .mockResolvedValueOnce({ name: 'Old Name' } as never)
      .mockResolvedValueOnce({ id: 'env-1' } as never)
    vi.mocked(prisma.environment.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.environment.update).mockResolvedValue({ id: 'env-1', name: 'Dev' } as never)

    const result = await updateEnvironment(
      'env-1',
      environmentSchema.parse({
        name: 'Dev',
        baseUrl: 'https://example.com',
        apiBaseUrl: '',
        username: '',
        password: '',
      }),
    )

    expect(result).toEqual({ id: 'env-1', name: 'Dev' })
    expect(prisma.environment.update).toHaveBeenCalledWith({
      where: { id: 'env-1' },
      data: {
        name: 'Dev',
        baseUrl: 'https://example.com',
        apiBaseUrl: null,
        username: null,
        password: null,
      },
    })
    expect(automationProjectionService.syncEnvironments).toHaveBeenCalled()
  })
})

describe('checkEnvironmentNameUnique', () => {
  it('returns false when name is taken', async () => {
    vi.mocked(prisma.environment.findFirst).mockResolvedValue({ id: 'x' } as never)
    await expect(checkEnvironmentNameUnique('Taken')).resolves.toBe(false)
  })

  it('returns true when name is free', async () => {
    vi.mocked(prisma.environment.findFirst).mockResolvedValue(null)
    await expect(checkEnvironmentNameUnique('Free')).resolves.toBe(true)
  })
})
