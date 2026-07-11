import { createHash } from 'node:crypto'
import { z } from 'zod'

import { catalogEntityIdSchema } from '@/lib/catalog-contracts'
import { canonicalContractJson } from '@/lib/catalog-contracts'

export const LOCATOR_GRAPH_CONTRACT_VERSION = '1' as const
export const LOCATOR_GRAPH_MAX_PAGE_SIZE = 100
export const LOCATOR_GRAPH_MAX_DEPTH = 4

const id = catalogEntityIdSchema
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const nodeBase = z.object({ id, version: z.literal(LOCATOR_GRAPH_CONTRACT_VERSION), title: z.string().trim().min(1) })

export const surfaceNodeSchema = nodeBase.extend({
  type: z.literal('surface'),
  kind: z.enum(['application', 'global', 'page']),
  route: z.string().trim().min(1).optional(),
})
export const componentNodeSchema = nodeBase.extend({ type: z.literal('component'), surfaceId: id })
export const stateNodeSchema = nodeBase.extend({ type: z.literal('state'), surfaceId: id, componentId: id.optional() })
export const locatorGroupNodeSchema = nodeBase.extend({
  type: z.literal('locator-group'),
  surfaceId: id,
  componentId: id.optional(),
})

export const locatorStrategySchema = z.object({
  type: z.enum(['role', 'label', 'test-id', 'placeholder', 'text', 'css']),
  value: z.record(z.string(), z.unknown()).refine(value => Object.keys(value).length > 0, 'Strategy value is required'),
})
export const locatorDescriptorSchema = nodeBase.extend({
  type: z.literal('locator'),
  groupId: id,
  scope: z.object({ surfaceId: id, componentId: id.optional(), availableStates: z.array(id).default([]) }),
  strategy: locatorStrategySchema,
  compatibleActionCategories: z.array(id).default([]),
  sourceEvidence: z
    .object({ file: z.string().trim().min(1).optional(), symbol: id.optional(), attribute: id.optional() })
    .optional(),
  contentHash: hash,
})

export const locatorGraphNodeSchema = z.discriminatedUnion('type', [
  surfaceNodeSchema,
  componentNodeSchema,
  stateNodeSchema,
  locatorGroupNodeSchema,
  locatorDescriptorSchema,
])
export const locatorGraphNodeTypeSchema = z.enum(['surface', 'component', 'state', 'locator-group', 'locator'])
export const locatorGraphRelationSchema = z.enum([
  'contains',
  'belongs-to',
  'available-when',
  'requires',
  'produces',
  'compatible-with',
  'transitions-to',
  'conflicts-with',
  'deprecated-by',
])
export const locatorGraphEdgeSchema = z.object({
  id,
  fromId: id,
  toId: id,
  relation: locatorGraphRelationSchema,
})

export const locatorGraphSchema = z
  .object({
    version: z.literal(LOCATOR_GRAPH_CONTRACT_VERSION),
    contentHash: hash,
    nodes: z.array(locatorGraphNodeSchema),
    edges: z.array(locatorGraphEdgeSchema),
  })
  .superRefine((graph, context) => {
    const nodeIds = new Set<string>()
    const edgeIds = new Set<string>()
    const nodesById = new Map(graph.nodes.map(node => [node.id, node]))
    const requireType = (
      value: string | undefined,
      types: Array<(typeof graph.nodes)[number]['type']>,
      path: Array<string | number>,
    ) => {
      if (!value) return
      const target = nodesById.get(value)
      if (!target || !types.includes(target.type)) {
        context.addIssue({ code: 'custom', path, message: `Expected reference to ${types.join(' or ')}` })
      }
    }
    graph.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id))
        context.addIssue({ code: 'custom', path: ['nodes', index, 'id'], message: 'Duplicate node ID' })
      nodeIds.add(node.id)
      if (node.type === 'component') requireType(node.surfaceId, ['surface'], ['nodes', index, 'surfaceId'])
      if (node.type === 'state') {
        requireType(node.surfaceId, ['surface'], ['nodes', index, 'surfaceId'])
        requireType(node.componentId, ['component'], ['nodes', index, 'componentId'])
      }
      if (node.type === 'locator-group') {
        requireType(node.surfaceId, ['surface'], ['nodes', index, 'surfaceId'])
        requireType(node.componentId, ['component'], ['nodes', index, 'componentId'])
      }
      if (node.type === 'locator') {
        requireType(node.groupId, ['locator-group'], ['nodes', index, 'groupId'])
        requireType(node.scope.surfaceId, ['surface'], ['nodes', index, 'scope', 'surfaceId'])
        requireType(node.scope.componentId, ['component'], ['nodes', index, 'scope', 'componentId'])
        node.scope.availableStates.forEach((stateId, stateIndex) =>
          requireType(stateId, ['state'], ['nodes', index, 'scope', 'availableStates', stateIndex]),
        )
      }
    })
    graph.edges.forEach((edge, index) => {
      if (edgeIds.has(edge.id))
        context.addIssue({ code: 'custom', path: ['edges', index, 'id'], message: 'Duplicate edge ID' })
      edgeIds.add(edge.id)
      if (!nodeIds.has(edge.fromId) || !nodeIds.has(edge.toId)) {
        context.addIssue({
          code: 'custom',
          path: ['edges', index],
          message: 'Edge endpoints must reference graph nodes',
        })
      }
    })
  })

export const locatorGraphQuerySchema = z.object({
  fromId: id,
  relation: locatorGraphRelationSchema.optional(),
  toType: locatorGraphNodeTypeSchema.optional(),
  cursor: z.string().regex(/^\d+$/, 'Cursor must be a non-negative integer.').optional(),
  limit: z.number().int().positive().max(LOCATOR_GRAPH_MAX_PAGE_SIZE).default(25),
  depth: z.number().int().positive().max(LOCATOR_GRAPH_MAX_DEPTH).default(1),
})

export const locatorGraphPageSchema = z.object({
  graphHash: hash,
  nodes: z.array(locatorGraphNodeSchema).max(LOCATOR_GRAPH_MAX_PAGE_SIZE),
  edges: z.array(locatorGraphEdgeSchema),
  nextCursor: z.string().min(1).nullable(),
})

export type LocatorGraph = z.infer<typeof locatorGraphSchema>
export type SurfaceNode = z.infer<typeof surfaceNodeSchema>
export type ComponentNode = z.infer<typeof componentNodeSchema>
export type StateNode = z.infer<typeof stateNodeSchema>
export type LocatorGroupNode = z.infer<typeof locatorGroupNodeSchema>
export type LocatorDescriptor = z.infer<typeof locatorDescriptorSchema>
export type LocatorGraphEdge = z.infer<typeof locatorGraphEdgeSchema>
export type LocatorGraphQuery = z.infer<typeof locatorGraphQuerySchema>
export type LocatorGraphPage = z.infer<typeof locatorGraphPageSchema>

export function createLocatorGraph(input: Omit<LocatorGraph, 'contentHash'>): LocatorGraph {
  const ordered = {
    ...input,
    nodes: [...input.nodes].sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...input.edges].sort((left, right) => left.id.localeCompare(right.id)),
  }
  const contentHash = `sha256:${createHash('sha256').update(canonicalContractJson(ordered)).digest('hex')}`
  return locatorGraphSchema.parse({ ...ordered, contentHash })
}

export function locatorGraphVisualProjection(graph: LocatorGraph) {
  return {
    graphHash: graph.contentHash,
    nodes: graph.nodes.map(node => ({ id: node.id, label: node.title, type: node.type })),
    edges: graph.edges.map(edge => ({ id: edge.id, source: edge.fromId, target: edge.toId, label: edge.relation })),
  }
}
