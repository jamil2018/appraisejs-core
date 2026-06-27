import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tagSchema } from '@/constants/form-opts/tag-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { createTag, getTagByIdOrThrow, updateTag } from './tag-service'

vi.mock('@/config/db-config', () => ({
  default: {
    tag: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/automation/projection-service', () => ({
  automationProjectionService: {
    regenerateAllFeatures: vi.fn().mockResolvedValue(undefined),
  },
}))

import prisma from '@/config/db-config'

const basePayload = tagSchema.parse({
  name: 'Smoke',
  tagExpression: '@smoke',
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.tag.findFirst).mockReset()
  vi.mocked(prisma.tag.findUnique).mockReset()
  vi.mocked(prisma.tag.create).mockReset()
  vi.mocked(prisma.tag.update).mockReset()
  vi.mocked(automationProjectionService.regenerateAllFeatures).mockResolvedValue([])
})

describe('getTagByIdOrThrow', () => {
  it('throws when tag missing', async () => {
    vi.mocked(prisma.tag.findUnique).mockResolvedValue(null)
    await expect(getTagByIdOrThrow('id')).rejects.toMatchObject({
      message: 'Tag not found',
      statusCode: 404,
    })
  })
})

describe('createTag', () => {
  it('throws when tag name already exists', async () => {
    vi.mocked(prisma.tag.findFirst).mockResolvedValueOnce({ id: 'tag-1' } as never)

    await expect(createTag(basePayload)).rejects.toMatchObject({
      message: expect.stringContaining('tag name'),
      statusCode: 400,
    })

    expect(prisma.tag.create).not.toHaveBeenCalled()
  })

  it('throws when tag expression already exists', async () => {
    vi.mocked(prisma.tag.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'tag-1' } as never)

    await expect(createTag(basePayload)).rejects.toMatchObject({
      message: expect.stringContaining('tag expression'),
      statusCode: 400,
    })

    expect(prisma.tag.create).not.toHaveBeenCalled()
  })

  it('creates and returns a tag when tag expression is unique', async () => {
    const created = { id: 'tag-2', name: 'Smoke', tagExpression: '@smoke' }

    vi.mocked(prisma.tag.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.tag.create).mockResolvedValue(created as never)

    await expect(createTag(basePayload)).resolves.toEqual(created)
    expect(prisma.tag.create).toHaveBeenCalledWith({ data: basePayload })
    expect(automationProjectionService.regenerateAllFeatures).toHaveBeenCalled()
  })
})

describe('updateTag', () => {
  it('throws when tag name already exists on another tag', async () => {
    vi.mocked(prisma.tag.findUnique).mockResolvedValue({ name: 'Old Smoke', tagExpression: '@old-smoke' } as never)
    vi.mocked(prisma.tag.findFirst).mockResolvedValueOnce({ id: 'tag-2' } as never)

    await expect(
      updateTag(
        'tag-1',
        tagSchema.parse({
          name: 'Regression',
          tagExpression: '@old-smoke',
        }),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('tag name'),
      statusCode: 400,
    })

    expect(prisma.tag.update).not.toHaveBeenCalled()
  })

  it('throws when tag expression already exists on another tag', async () => {
    vi.mocked(prisma.tag.findUnique).mockResolvedValue({ name: 'Smoke', tagExpression: '@old-smoke' } as never)
    vi.mocked(prisma.tag.findFirst).mockResolvedValueOnce({ id: 'tag-2' } as never)

    await expect(
      updateTag(
        'tag-1',
        tagSchema.parse({
          name: 'Smoke',
          tagExpression: '@regression',
        }),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('tag expression'),
      statusCode: 400,
    })

    expect(prisma.tag.update).not.toHaveBeenCalled()
  })

  it('updates the tag when the tag expression remains unchanged', async () => {
    const updated = { id: 'tag-1', name: 'Smoke Updated', tagExpression: '@smoke' }

    vi.mocked(prisma.tag.findUnique).mockResolvedValue({ name: 'Smoke', tagExpression: '@smoke' } as never)
    vi.mocked(prisma.tag.findFirst).mockResolvedValueOnce(null)
    vi.mocked(prisma.tag.update).mockResolvedValue(updated as never)

    await expect(
      updateTag(
        'tag-1',
        tagSchema.parse({
          name: 'Smoke Updated',
          tagExpression: '@smoke',
        }),
      ),
    ).resolves.toEqual(updated)

    expect(prisma.tag.findFirst).toHaveBeenCalledTimes(1)
    expect(prisma.tag.findFirst).toHaveBeenCalledWith({
      where: {
        name: 'Smoke Updated',
        id: { not: 'tag-1' },
      },
    })
    expect(prisma.tag.update).toHaveBeenCalledWith({
      where: { id: 'tag-1' },
      data: {
        name: 'Smoke Updated',
        tagExpression: '@smoke',
      },
    })
    expect(automationProjectionService.regenerateAllFeatures).toHaveBeenCalled()
  })
})
