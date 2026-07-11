import type { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { buildLocatorGraph, queryLocatorGraph, readLocatorGraphVisualProjection } from './locator-graph-service'

const client = {
  locatorGroup: {
    findMany: async () => [
      {
        id: 'group-one',
        name: 'Meditation page',
        route: '/meditate',
        moduleId: 'module-one',
        createdAt: new Date(),
        updatedAt: new Date(),
        module: { id: 'module-one', name: 'Meditation' },
        locators: [
          {
            id: 'start-button',
            name: 'Start button',
            value: '[data-testid="start"]',
            locatorGroupId: 'group-one',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
    ],
  },
} as unknown as PrismaClient

describe('locator graph discovery', () => {
  it('builds deterministic surface, group, locator, and visual projections', async () => {
    const graph = await buildLocatorGraph(client)
    expect(graph.nodes.map(node => node.type)).toEqual(['surface', 'locator-group', 'locator'])
    expect(graph.edges).toHaveLength(2)
    await expect(readLocatorGraphVisualProjection(client)).resolves.toMatchObject({ graphHash: graph.contentHash })
  })

  it('returns bounded traversal pages', async () => {
    const graph = await buildLocatorGraph(client)
    const surface = graph.nodes.find(node => node.type === 'surface')!
    await expect(queryLocatorGraph({ fromId: surface.id, depth: 2, limit: 2 }, client)).resolves.toMatchObject({
      nodes: expect.any(Array),
      nextCursor: expect.any(String),
    })
    await expect(queryLocatorGraph({ fromId: surface.id, limit: 101 }, client)).rejects.toThrow()
  })
})
