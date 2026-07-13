import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  locatorGraphQuerySchema,
  locatorGraphSchema,
  locatorGraphVisualProjection,
  type LocatorGraph,
} from '@/lib/locator-graph'
import { readVisibleResourceOwnerships } from '@/services/project-resource/project-resource-ownership-service'

const hash = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
const routeId = (route: string) => `surface_${createHash('sha256').update(route).digest('hex').slice(0, 16)}`
const edgeId = (fromId: string, toId: string) =>
  `edge_${createHash('sha256').update(`${fromId}:${toId}`).digest('hex').slice(0, 16)}`

export async function buildLocatorGraph(
  client: PrismaClient = prisma,
  targetProjectId?: string,
): Promise<LocatorGraph> {
  const allGroups = await client.locatorGroup.findMany({
    include: { module: true, locators: true },
    orderBy: { id: 'asc' },
  })
  const ownerships = targetProjectId
    ? await readVisibleResourceOwnerships(targetProjectId, ['locator-group', 'locator'], client)
    : null
  const groups = allGroups
    .filter(group => !ownerships || ownerships.has(`locator-group:${group.id}`))
    .map(group => ({
      ...group,
      locators: group.locators.filter(locator => !ownerships || ownerships.has(`locator:${locator.id}`)),
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

export async function queryLocatorGraph(value: unknown, client: PrismaClient = prisma) {
  const query = locatorGraphQuerySchema.parse(value)
  const graph = await buildLocatorGraph(client)
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
    graphHash: graph.contentHash,
    nodes,
    edges: graph.edges.filter(edge => nodeIds.has(edge.fromId) && nodeIds.has(edge.toId)),
    nextCursor: offset + nodes.length < candidates.length ? String(offset + nodes.length) : null,
  }
}

export async function readLocatorGraphVisualProjection(client: PrismaClient = prisma) {
  return locatorGraphVisualProjection(await buildLocatorGraph(client))
}
