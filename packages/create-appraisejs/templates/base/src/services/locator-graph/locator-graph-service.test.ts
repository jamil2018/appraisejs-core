import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import {
  buildLocatorGraph,
  queryLocatorGraph,
  readLocatorGraphVisualProjection,
  searchLocatorGraph,
} from './locator-graph-service'

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

  it('pushes target visibility into the locator and group Prisma query before graph construction', async () => {
    const findMany = vi.fn(async () => [])
    const scopedClient = {
      locatorGroup: { findMany },
      projectResourceOwnership: {
        findMany: async () => [
          {
            entityType: 'locator-group',
            entityId: 'shared-group',
            imports: [],
            scope: 'project',
            targetProjectId: 'target-one',
            origin: 'test',
            contentHash: 'sha256:group',
          },
          {
            entityType: 'locator',
            entityId: 'shared-locator',
            imports: [],
            scope: 'project',
            targetProjectId: 'target-one',
            origin: 'test',
            contentHash: 'sha256:locator',
          },
        ],
      },
    } as unknown as PrismaClient

    await buildLocatorGraph(scopedClient, 'target-one')

    expect(findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { targetProjectId: 'target-one' },
          { id: { in: ['shared-group'] } },
          { locators: { some: { id: { in: ['shared-locator'] } } } },
        ],
      },
      include: {
        module: true,
        locators: {
          where: {
            OR: [{ targetProjectId: 'target-one' }, { id: { in: ['shared-locator'] } }],
          },
        },
      },
      orderBy: { id: 'asc' },
    })
  })

  it('applies an explicit target scope to graph traversal', async () => {
    const client = {
      locatorGroup: {
        findMany: async () => [
          ...((await (
            scopedClient as unknown as { locatorGroup: { findMany(): Promise<unknown[]> } }
          ).locatorGroup.findMany()) as unknown[]),
          {
            id: 'foreign-group',
            name: 'Foreign',
            route: '/foreign',
            moduleId: 'foreign-module',
            targetProjectId: 'target-two',
            createdAt: new Date(),
            updatedAt: new Date(),
            module: { id: 'foreign-module', name: 'Foreign' },
            locators: [],
          },
        ],
      },
      projectResourceOwnership: { findMany: async () => [] },
    } as unknown as PrismaClient
    const graph = await buildLocatorGraph(client, 'target-one')
    const surface = graph.nodes.find(node => node.type === 'surface')!

    await expect(
      queryLocatorGraph({ fromId: surface.id, depth: 2, limit: 10 }, client, 'target-one'),
    ).resolves.toMatchObject({
      nodes: expect.arrayContaining([expect.objectContaining({ persistentId: 'checkout-button' })]),
    })
    expect(graph.nodes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ persistentId: 'foreign-group' })]),
    )
  })

  it('searches names, selectors, groups, modules, and routes within one target only', async () => {
    const client = {
      locatorGroup: {
        findMany: async () => [
          {
            id: 'login-group',
            name: 'Login form',
            route: '/login',
            moduleId: 'auth-module',
            targetProjectId: 'target-one',
            createdAt: new Date(),
            updatedAt: new Date(),
            module: { id: 'auth-module', name: 'Authentication' },
            locators: [
              {
                id: 'email-input',
                name: 'Email address',
                value: '[data-testid="email"]',
                locatorGroupId: 'login-group',
                targetProjectId: 'target-one',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          },
          {
            id: 'foreign-group',
            name: 'Foreign login',
            route: '/login',
            moduleId: 'foreign-module',
            targetProjectId: 'target-two',
            createdAt: new Date(),
            updatedAt: new Date(),
            module: { id: 'foreign-module', name: 'Authentication' },
            locators: [
              {
                id: 'foreign-email',
                name: 'Email address',
                value: '[data-testid="email"]',
                locatorGroupId: 'foreign-group',
                targetProjectId: 'target-two',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          },
        ],
      },
      projectResourceOwnership: { findMany: async () => [] },
    } as unknown as PrismaClient

    for (const query of ['email address', 'data-testid', 'login form', 'authentication', '/login']) {
      const result = await searchLocatorGraph({ qualityPlanId: 'plan-one', query }, client, 'target-one')
      expect(result.locators).toEqual([
        expect.objectContaining({
          persistentId: 'email-input',
          route: '/login',
          module: expect.objectContaining({ name: 'Authentication' }),
        }),
      ])
      expect(result.page).toMatchObject({ maxLimit: 100, nextCursor: null })
    }
  })
})
