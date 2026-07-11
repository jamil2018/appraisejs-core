import { describe, expect, it } from 'vitest'

import {
  LOCATOR_GRAPH_MAX_DEPTH,
  createLocatorGraph,
  locatorGraphQuerySchema,
  locatorGraphSchema,
  locatorGraphVisualProjection,
} from './contracts'

const hash = `sha256:${'a'.repeat(64)}`
const graph = {
  version: '1',
  contentHash: hash,
  nodes: [
    { id: 'checkout', version: '1', title: 'Checkout', type: 'surface', kind: 'page', route: '/checkout' },
    { id: 'payment', version: '1', title: 'Payment', type: 'component', surfaceId: 'checkout' },
    { id: 'ready', version: '1', title: 'Ready', type: 'state', surfaceId: 'checkout', componentId: 'payment' },
    { id: 'payment-fields', version: '1', title: 'Payment fields', type: 'locator-group', surfaceId: 'checkout' },
    {
      id: 'pay-button',
      version: '1',
      title: 'Pay',
      type: 'locator',
      groupId: 'payment-fields',
      scope: { surfaceId: 'checkout', componentId: 'payment', availableStates: ['ready'] },
      strategy: { type: 'role', value: { role: 'button', name: 'Pay' } },
      compatibleActionCategories: ['interaction'],
      contentHash: hash,
    },
  ],
  edges: [
    { id: 'checkout-payment', fromId: 'checkout', toId: 'payment', relation: 'contains' },
    { id: 'pay-ready', fromId: 'pay-button', toId: 'ready', relation: 'available-when' },
  ],
} as const

describe('locator graph contracts', () => {
  it('accepts a surface/component/state/group/locator graph and derives its visual from the same data', () => {
    const parsed = locatorGraphSchema.parse(graph)
    const visual = locatorGraphVisualProjection(parsed)
    expect(visual.graphHash).toBe(hash)
    expect(visual.nodes).toContainEqual({ id: 'checkout', label: 'Checkout', type: 'surface' })
    expect(visual.edges).toContainEqual({
      id: 'checkout-payment',
      source: 'checkout',
      target: 'payment',
      label: 'contains',
    })
  })

  it('rejects dangling compatibility edges and duplicate node IDs', () => {
    expect(() => locatorGraphSchema.parse({ ...graph, edges: [{ ...graph.edges[0], toId: 'missing' }] })).toThrow()
    expect(() => locatorGraphSchema.parse({ ...graph, nodes: [...graph.nodes, graph.nodes[0]] })).toThrow()
    expect(() => locatorGraphSchema.parse({ ...graph, edges: [...graph.edges, graph.edges[0]] })).toThrow()
  })

  it('rejects missing and wrong-type embedded references', () => {
    const locatorIndex = graph.nodes.findIndex(node => node.type === 'locator')
    const nodes = [...graph.nodes]
    nodes[locatorIndex] = { ...graph.nodes[locatorIndex], groupId: 'checkout' } as (typeof graph.nodes)[number]
    expect(() => locatorGraphSchema.parse({ ...graph, nodes })).toThrow(/locator-group/)

    const missingStateNodes = graph.nodes.filter(node => node.id !== 'ready')
    expect(() => locatorGraphSchema.parse({ ...graph, nodes: missingStateNodes })).toThrow(/state/)
  })

  it('builds stable graph hashes independent of input order and changes them with content', () => {
    const definition = { version: graph.version, nodes: graph.nodes, edges: graph.edges }
    const first = createLocatorGraph(definition)
    const reordered = createLocatorGraph({
      ...definition,
      nodes: [...definition.nodes].reverse(),
      edges: [...definition.edges].reverse(),
    })
    const changed = createLocatorGraph({
      ...definition,
      nodes: definition.nodes.map(node => (node.id === 'checkout' ? { ...node, title: 'Cart' } : node)),
    })
    expect(reordered.contentHash).toBe(first.contentHash)
    expect(changed.contentHash).not.toBe(first.contentHash)
  })

  it('bounds query depth and page size', () => {
    expect(locatorGraphQuerySchema.parse({ fromId: 'checkout' })).toMatchObject({ limit: 25, depth: 1 })
    expect(() => locatorGraphQuerySchema.parse({ fromId: 'checkout', depth: LOCATOR_GRAPH_MAX_DEPTH + 1 })).toThrow()
    expect(() => locatorGraphQuerySchema.parse({ fromId: 'checkout', limit: 101 })).toThrow()
    expect(() => locatorGraphQuerySchema.parse({ fromId: 'checkout', cursor: 'not-a-cursor' })).toThrow()
  })
})
