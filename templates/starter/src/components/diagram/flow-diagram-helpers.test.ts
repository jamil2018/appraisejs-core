import { StepParameterType } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  buildFlowNodeData,
  createAddNodePromptNode,
  determineNodeOrders,
  determineStartNodeIds,
  generateInitialNodesAndEdges,
  getFlowBlockBounds,
  getFlowBlockMembershipMap,
  hasOrphanedFlowNode,
  normalizeFlowBlocks,
  isAddNodePromptNode,
  isEdgeWithinSameFlowBlock,
  isValidDiagramConnection,
  removeOrphanedEdges,
  searchFlowNodesByLabel,
} from './flow-diagram-helpers'

describe('flow-diagram helpers', () => {
  it('returns add-node prompt when node order is empty', () => {
    const { nodes, edges } = generateInitialNodesAndEdges({}, [], false)

    expect(nodes).toHaveLength(1)
    expect(isAddNodePromptNode(nodes[0]!)).toBe(true)
    expect(nodes[0]!.draggable).toBe(false)
    expect(edges).toEqual([])
  })

  it('does not serialize add-node prompt into node order map', () => {
    const prompt = createAddNodePromptNode()
    const orders = determineNodeOrders([prompt] as never, [])

    expect(orders).toEqual({})
  })

  it('searches real node labels case-insensitively after three trimmed characters', () => {
    const nodes = [
      createAddNodePromptNode(),
      {
        id: 'node-1',
        data: {
          label: 'Open Checkout',
          gherkinStep: 'Given the cart page',
          parameters: [{ name: 'target', value: 'cart', type: StepParameterType.STRING, order: 1 }],
        },
      },
      {
        id: 'node-2',
        data: {
          label: 'Submit payment',
          gherkinStep: 'When checkout is submitted',
          parameters: [{ name: 'card', value: 'visa', type: StepParameterType.STRING, order: 1 }],
        },
      },
    ] as never

    expect(searchFlowNodesByLabel(nodes, ' che ')).toEqual([{ id: 'node-1', label: 'Open Checkout' }])
    expect(searchFlowNodesByLabel(nodes, 'PAY')).toEqual([{ id: 'node-2', label: 'Submit payment' }])
    expect(searchFlowNodesByLabel(nodes, 'pa')).toEqual([])
    expect(searchFlowNodesByLabel(nodes, 'cart')).toEqual([])
    expect(searchFlowNodesByLabel(nodes, 'visa')).toEqual([])
  })

  it('hydrates initial nodes and edges from ordered node maps', () => {
    const { nodes, edges } = generateInitialNodesAndEdges(
      {
        'node-1': {
          order: 1,
          label: 'First',
          gherkinStep: 'Given first step',
          parameters: [],
          templateStepId: 'step-1',
        },
        'node-2': {
          order: 2,
          label: 'Second',
          gherkinStep: 'When second step',
          parameters: [],
          templateStepId: 'step-2',
        },
      },
      [],
      false,
    )

    expect(nodes).toHaveLength(2)
    expect(edges).toEqual([
      expect.objectContaining({
        id: 'node-1-node-2',
        source: 'node-1',
        target: 'node-2',
      }),
    ])
  })

  it('marks missing parameters when mandatory step params are absent', () => {
    const nodeData = buildFlowNodeData(
      {
        order: 1,
        label: 'Step',
        parameters: [],
        templateStepId: 'step-1',
      },
      [
        {
          id: 'param-1',
          name: 'locator',
          type: StepParameterType.STRING,
          order: 1,
          isMandatory: true,
          templateStepId: 'step-1',
        } as never,
      ],
      false,
    )

    expect(nodeData.isMissingParams).toBe(true)
  })

  it('recomputes node orders and isolated nodes correctly', () => {
    const orders = determineNodeOrders(
      [
        {
          id: 'node-1',
          data: { label: 'First', parameters: [], templateStepId: 'step-1' },
        },
        {
          id: 'node-2',
          data: { label: 'Second', parameters: [], templateStepId: 'step-2' },
        },
        {
          id: 'node-3',
          data: { label: 'Isolated', parameters: [], templateStepId: 'step-3' },
        },
      ] as never,
      [
        {
          source: 'node-1',
          target: 'node-2',
        },
      ] as never,
    )

    expect(orders['node-1']?.order).toBe(1)
    expect(orders['node-2']?.order).toBe(2)
    expect(orders['node-3']?.order).toBe(-1)
  })

  it('detects connected start nodes and excludes isolated nodes', () => {
    const startNodeIds = determineStartNodeIds(
      [
        {
          id: 'node-1',
          data: { label: 'First', parameters: [], templateStepId: 'step-1' },
        },
        {
          id: 'node-2',
          data: { label: 'Second', parameters: [], templateStepId: 'step-2' },
        },
        {
          id: 'node-3',
          data: { label: 'Isolated', parameters: [], templateStepId: 'step-3' },
        },
      ] as never,
      [
        {
          source: 'node-1',
          target: 'node-2',
        },
      ] as never,
    )

    expect(startNodeIds.has('node-1')).toBe(true)
    expect(startNodeIds.has('node-2')).toBe(false)
    expect(startNodeIds.has('node-3')).toBe(false)
  })

  it('does not mark any first node when the start is ambiguous', () => {
    const startNodeIds = determineStartNodeIds(
      [
        {
          id: 'node-1',
          data: { label: 'First chain root', parameters: [], templateStepId: 'step-1' },
        },
        {
          id: 'node-2',
          data: { label: 'First chain child', parameters: [], templateStepId: 'step-2' },
        },
        {
          id: 'node-3',
          data: { label: 'Second chain root', parameters: [], templateStepId: 'step-3' },
        },
        {
          id: 'node-4',
          data: { label: 'Second chain child', parameters: [], templateStepId: 'step-4' },
        },
      ] as never,
      [
        {
          source: 'node-1',
          target: 'node-2',
        },
        {
          source: 'node-3',
          target: 'node-4',
        },
      ] as never,
    )

    expect(startNodeIds.size).toBe(0)
  })

  it('does not mark a lone disconnected node as a start node', () => {
    const startNodeIds = determineStartNodeIds(
      [
        {
          id: 'node-1',
          data: { label: 'Only', parameters: [], templateStepId: 'step-1' },
        },
      ] as never,
      [],
    )

    expect(startNodeIds.size).toBe(0)
  })

  it('validates single in/out connections and removes orphaned edges', () => {
    const edges = [
      { source: 'node-1', target: 'node-2' },
      { source: 'node-2', target: 'missing-node' },
    ] as never

    expect(isValidDiagramConnection(edges, { source: 'node-1', target: 'node-3' } as never)).toBe(false)
    expect(isValidDiagramConnection(edges, { source: 'node-3', target: 'node-4' } as never)).toBe(true)

    expect(removeOrphanedEdges([{ id: 'node-1' }, { id: 'node-2' }] as never, edges)).toEqual([
      { source: 'node-1', target: 'node-2' },
    ])
  })

  it('normalizes block payloads and computes bounds from real nodes only', () => {
    expect(
      normalizeFlowBlocks(
        [
          { id: 'block-1', name: '  ', nodeIds: ['node-1', 'node-1', 'node-2', 'missing'] },
          { id: 'block-2', name: 'Too small', nodeIds: ['node-1'] },
        ],
        new Set(['node-1', 'node-2']),
      ),
    ).toEqual([{ id: 'block-1', name: 'Untitled block', nodeIds: ['node-1', 'node-2'] }])

    expect(
      getFlowBlockBounds(
        [
          createAddNodePromptNode(),
          { id: 'node-1', position: { x: 100, y: 50 }, data: {}, width: 200, height: 100 },
          { id: 'node-2', position: { x: 360, y: 80 }, data: {}, width: 160, height: 90 },
        ] as never,
        [{ id: 'block-1', name: 'Checkout', nodeIds: ['node-1', 'node-2', 'missing'] }],
      ),
    ).toEqual([
      {
        id: 'block-1',
        name: 'Checkout',
        nodeIds: ['node-1', 'node-2'],
        x: 68,
        y: 18,
        width: 484,
        height: 184,
      },
    ])
  })

  it('detects orphaned nodes before block creation', () => {
    const nodes = [
      { id: 'node-1', data: {} },
      { id: 'node-2', data: {} },
      { id: 'node-3', data: {} },
    ] as never

    expect(hasOrphanedFlowNode(nodes, [{ source: 'node-1', target: 'node-2' }] as never)).toBe(true)
    expect(
      hasOrphanedFlowNode(nodes, [
        { source: 'node-1', target: 'node-2' },
        { source: 'node-2', target: 'node-3' },
      ] as never),
    ).toBe(false)
    expect(hasOrphanedFlowNode([createAddNodePromptNode()] as never, [])).toBe(false)
  })

  it('blocks only edge mutations inside the same flow block', () => {
    const membership = getFlowBlockMembershipMap([{ id: 'block-1', name: 'Checkout', nodeIds: ['node-1', 'node-2'] }])

    expect(isEdgeWithinSameFlowBlock({ source: 'node-1', target: 'node-2' } as never, membership)).toBe(true)
    expect(isEdgeWithinSameFlowBlock({ source: 'node-2', target: 'node-3' } as never, membership)).toBe(false)
  })
})
