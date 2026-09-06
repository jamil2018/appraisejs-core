import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'

import prisma from '@/config/db-config'
import {
  locatorGraphQuerySchema,
  locatorGraphSchema,
  locatorGraphVisualProjection,
  type LocatorGraph,
} from '@/lib/locator-graph'
import { readVisibleResourceOwnerships } from '@/services/project-resource/project-resource-ownership-service'
import { ServiceError } from '@/services/shared/errors'

const hash = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
const routeId = (route: string) => `surface_${createHash('sha256').update(route).digest('hex').slice(0, 16)}`
const edgeId = (fromId: string, toId: string) =>
  `edge_${createHash('sha256').update(`${fromId}:${toId}`).digest('hex').slice(0, 16)}`

export async function buildLocatorGraph(
  client: PrismaClient = prisma,
  targetProjectId?: string,
): Promise<LocatorGraph> {
  const ownerships = targetProjectId
    ? await readVisibleResourceOwnerships(targetProjectId, ['locator-group', 'locator'], client)
    : null
  const visibleIds = (entityType: 'locator-group' | 'locator') =>
    ownerships
      ? [...ownerships.keys()]
          .filter(key => key.startsWith(`${entityType}:`))
          .map(key => key.slice(`${entityType}:`.length))
      : []
  const visibleGroupIds = visibleIds('locator-group')
  const visibleLocatorIds = visibleIds('locator')
  const locatorGroupWhere: Prisma.LocatorGroupWhereInput | undefined = targetProjectId
    ? {
        OR: [
          { targetProjectId },
          ...(visibleGroupIds.length ? [{ id: { in: visibleGroupIds } }] : []),
          ...(visibleLocatorIds.length ? [{ locators: { some: { id: { in: visibleLocatorIds } } } }] : []),
        ],
      }
    : undefined
  const allGroups = await client.locatorGroup.findMany({
    ...(locatorGroupWhere ? { where: locatorGroupWhere } : {}),
    include: {
      module: true,
      locators: targetProjectId
        ? {
            where: {
              OR: [{ targetProjectId }, ...(visibleLocatorIds.length ? [{ id: { in: visibleLocatorIds } }] : [])],
            },
          }
        : true,
    },
    orderBy: { id: 'asc' },
  })
  // Keep the ownership predicate as defense in depth for non-Prisma test
  // adapters and stale replica reads; the database predicate above is the
  // primary isolation boundary and avoids loading unrelated targets.
  const groups = allGroups
    .filter(
      group => !ownerships || group.targetProjectId === targetProjectId || ownerships.has(`locator-group:${group.id}`),
    )
    .map(group => ({
      ...group,
      locators: group.locators.filter(
        locator =>
          !ownerships || locator.targetProjectId === targetProjectId || ownerships.has(`locator:${locator.id}`),
      ),
    }))
  const routes = [...new Set(groups.map(group => group.route))].sort()
  const nodes: LocatorGraph['nodes'] = routes.map(route => ({
    id: routeId(route),
    version: '1',
    title: route,
    type: 'surface',
    kind: 'page',
    route,
  }))
  const edges: LocatorGraph['edges'] = []
  for (const group of groups) {
    const groupId = `group_${group.id}`
    const surfaceId = routeId(group.route)
    nodes.push({
      id: groupId,
      persistentId: group.id,
      astRef: groupId,
      version: '1',
      title: group.name,
      type: 'locator-group',
      targetProjectId: group.targetProjectId ?? undefined,
      moduleId: group.moduleId,
      moduleName: group.module.name,
      surfaceId,
    })
    edges.push({ id: edgeId(surfaceId, groupId), fromId: surfaceId, toId: groupId, relation: 'contains' })
    for (const locator of group.locators.sort((a, b) => a.id.localeCompare(b.id))) {
      const id = `locator_${locator.id}`
      const descriptor = {
        id,
        persistentId: locator.id,
        astRef: id,
        version: '1' as const,
        title: locator.name,
        type: 'locator' as const,
        groupId,
        locatorGroupId: group.id,
        targetProjectId: locator.targetProjectId ?? undefined,
        moduleId: group.moduleId,
        scope: { surfaceId, availableStates: [] },
        strategy: { type: 'css' as const, value: { selector: locator.value } },
        compatibleActionCategories: [],
        sourceEvidence: undefined,
      }
      nodes.push({ ...descriptor, contentHash: hash(descriptor) })
      edges.push({ id: edgeId(groupId, id), fromId: groupId, toId: id, relation: 'contains' })
    }
  }
  const graph = { version: '1' as const, contentHash: hash({ nodes, edges }), nodes, edges }
  return locatorGraphSchema.parse(graph)
}

async function resolveJourneyTarget(client: PrismaClient, journeyId: string, expectedTargetProjectId?: string) {
  const journey = await client.qualityJourney.findFirst({
    where: { id: journeyId },
    select: { id: true, targetProjectId: true },
  })
  if (!journey || (expectedTargetProjectId && journey.targetProjectId !== expectedTargetProjectId))
    throw new ServiceError('Quality Journey not found for the requested target.', 'NOT_FOUND')
  return journey.targetProjectId
}

const journeyScopeSchema = z.object({ journeyId: z.string().min(1) })

export async function queryLocatorGraph(value: unknown, client: PrismaClient = prisma, targetProjectId?: string) {
  const { journeyId } = journeyScopeSchema.parse(value)
  const query = locatorGraphQuerySchema.parse(value)
  const journeyTargetProjectId = await resolveJourneyTarget(client, journeyId, targetProjectId)
  const graph = await buildLocatorGraph(client, journeyTargetProjectId)
  const reached = new Set([query.fromId])
  let frontier = [query.fromId]
  for (let depth = 0; depth < query.depth; depth += 1) {
    const next = graph.edges
      .filter(edge => frontier.includes(edge.fromId) && (!query.relation || edge.relation === query.relation))
      .map(edge => edge.toId)
    next.forEach(id => reached.add(id))
    frontier = next
  }
  const candidates = graph.nodes.filter(node => reached.has(node.id) && (!query.toType || node.type === query.toType))
  const offset = query.cursor ? Number.parseInt(query.cursor, 10) : 0
  const nodes = candidates.slice(offset, offset + query.limit)
  const nodeIds = new Set(nodes.map(node => node.id))
  return {
    journeyId,
    graphHash: graph.contentHash,
    nodes,
    edges: graph.edges.filter(edge => nodeIds.has(edge.fromId) && nodeIds.has(edge.toId)),
    nextCursor: offset + nodes.length < candidates.length ? String(offset + nodes.length) : null,
  }
}

/**
 * Canonical bounded locator discovery for a Journey's resolved target. Search
 * deliberately operates on the already target-filtered graph, so a foreign
 * target cannot become visible through a group, module, route, or selector
 * match.
 */
export async function searchLocatorGraph(
  input: { journeyId: string; query: string; cursor?: string; limit?: number },
  client: PrismaClient = prisma,
  targetProjectId?: string,
) {
  const journeyTargetProjectId = await resolveJourneyTarget(client, input.journeyId, targetProjectId)
  const query = input.query.trim().toLocaleLowerCase()
  const graph = await buildLocatorGraph(client, journeyTargetProjectId)
  const groups = new Map(
    graph.nodes
      .filter(
        (node): node is Extract<(typeof graph.nodes)[number], { type: 'locator-group' }> =>
          node.type === 'locator-group',
      )
      .map(node => [node.id, node]),
  )
  const surfaces = new Map(
    graph.nodes
      .filter((node): node is Extract<(typeof graph.nodes)[number], { type: 'surface' }> => node.type === 'surface')
      .map(node => [node.id, node]),
  )
  const matches = graph.nodes
    .filter((node): node is Extract<(typeof graph.nodes)[number], { type: 'locator' }> => node.type === 'locator')
    .map(locator => {
      const group = groups.get(locator.groupId)
      const surface = surfaces.get(locator.scope.surfaceId)
      const selector = Object.values(locator.strategy.value).map(String).join(' ')
      const searchable = [locator.title, selector, group?.title, group?.moduleName, surface?.route, surface?.title]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
      return { locator, group, surface, matched: searchable.includes(query) }
    })
    .filter(item => item.matched)
    .sort((left, right) => left.locator.id.localeCompare(right.locator.id))
  const offset = input.cursor ? Number.parseInt(input.cursor, 10) : 0
  const limit = input.limit ?? 25
  const page = matches.slice(offset, offset + limit)
  return {
    journeyId: input.journeyId,
    targetProjectId: journeyTargetProjectId,
    graphHash: graph.contentHash,
    locators: page.map(({ locator, group, surface }) => {
      if (!locator.persistentId) throw new Error('Locator graph locator is missing its persistent ID.')
      if (group && !group.persistentId) throw new Error('Locator graph group is missing its persistent ID.')
      return {
        // `locator_search` is a binding-discovery boundary, not a graph
        // traversal boundary. Return the persistent locator identity in `id`
        // so an agent can place it directly in compact validation bindings and
        // locator-valued Step inputs. Keep the graph projection identifier in
        // its own explicit field for callers that subsequently traverse the
        // graph with `locator_graph_query`.
        id: locator.persistentId,
        presentationId: locator.id,
        persistentId: locator.persistentId,
        name: locator.title,
        selector: locator.strategy.value,
        group: group
          ? {
              id: group.persistentId,
              presentationId: group.id,
              persistentId: group.persistentId,
              name: group.title,
            }
          : undefined,
        module: group?.moduleId ? { id: group.moduleId, name: group.moduleName } : undefined,
        route: surface?.route ?? surface?.title,
      }
    }),
    page: {
      cursor: input.cursor ?? null,
      limit,
      maxLimit: 100,
      nextCursor: offset + page.length < matches.length ? String(offset + page.length) : null,
    },
  }
}

export async function readLocatorGraphVisualProjection(client: PrismaClient = prisma) {
  return locatorGraphVisualProjection(await buildLocatorGraph(client))
}
