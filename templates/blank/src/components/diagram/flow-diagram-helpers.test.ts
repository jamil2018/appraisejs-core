import { StepParameterType } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  buildFlowNodeData,
  determineNodeOrders,
  generateInitialNodesAndEdges,
  isValidDiagramConnection,
  removeOrphanedEdges,
} from './flow-diagram-helpers'

describe('flow-diagram helpers', () => {
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

  it('validates single in/out connections and removes orphaned edges', () => {
    const edges = [
      { source: 'node-1', target: 'node-2' },
      { source: 'node-2', target: 'missing-node' },
    ] as never

    expect(isValidDiagramConnection(edges, { source: 'node-1', target: 'node-3' } as never)).toBe(false)
    expect(isValidDiagramConnection(edges, { source: 'node-3', target: 'node-4' } as never)).toBe(true)

    expect(
      removeOrphanedEdges(
        [
          { id: 'node-1' },
          { id: 'node-2' },
        ] as never,
        edges,
      ),
    ).toEqual([{ source: 'node-1', target: 'node-2' }])
  })
})
