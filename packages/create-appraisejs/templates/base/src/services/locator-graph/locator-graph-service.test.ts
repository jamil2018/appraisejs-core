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

const scopedClient = {
  locatorGroup: {
    findMany: async () => [
      {
        id: 'project-group',
        name: 'Checkout',
        route: '/checkout',
        moduleId: 'module-checkout',
        targetProjectId: 'target-one',
        createdAt: new Date(),
        updatedAt: new Date(),
        module: { id: 'module-checkout', name: 'Checkout' },
        locators: [
          {
            id: 'checkout-button',
            name: 'Checkout button',
            value: '#checkout',
            locatorGroupId: 'project-group',
            targetProjectId: 'target-one',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
    ],
  },
  projectResourceOwnership: {
    findMany: async () => [],
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

  it('keeps directly project-scoped locators visible while ownership receipts are absent', async () => {
    const graph = await buildLocatorGraph(scopedClient, 'target-one')

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'locator-group', persistentId: 'project-group' }),
        expect.objectContaining({ type: 'locator', persistentId: 'checkout-button' }),
      ]),
    )
  })
})
