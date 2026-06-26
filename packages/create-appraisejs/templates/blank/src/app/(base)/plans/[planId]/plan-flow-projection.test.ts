import { describe, expect, it } from 'vitest'

import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

import { projectPlanFlow } from './plan-flow-projection'

type Graph = PlanReviewDetail['graph']

const task = (id: string): Graph['nodes'][number] => ({
  id,
  title: id,
  description: `${id} description`,
  acceptanceCriteria: [],
  validationIntent: `${id} validation`,
  status: 'ready',
})

const graph = (ids: string[], edges: Graph['edges'] = []): Graph => ({
  nodes: ids.map(task),
  edges,
})

const dependsOn = (from: string, to: string, index = 0): Graph['edges'][number] => ({
  id: `${from}-depends-on-${to}-${index}`,
  from,
  to,
  type: 'depends-on',
})

describe('projectPlanFlow', () => {
  it('numbers a dependency chain from prerequisite to dependent and reverses its visual edges', () => {
    const result = projectPlanFlow(
      graph(['third', 'first', 'second'], [dependsOn('second', 'first'), dependsOn('third', 'second')]),
    )

    expect(result.tasks.map(({ id, step, stage }) => ({ id, step, stage }))).toEqual([
      { id: 'first', step: 1, stage: 0 },
      { id: 'second', step: 2, stage: 1 },
      { id: 'third', step: 3, stage: 2 },
    ])
    expect(result.edges.map(({ source, target }) => ({ source, target }))).toEqual([
      { source: 'first', target: 'second' },
      { source: 'second', target: 'third' },
    ])
  })

  it('groups branches in parallel and places a merge in a later stage', () => {
    const result = projectPlanFlow(
      graph(
        ['root', 'branch-b', 'branch-a', 'merge'],
        [
          dependsOn('branch-a', 'root'),
          dependsOn('branch-b', 'root'),
          dependsOn('merge', 'branch-a'),
          dependsOn('merge', 'branch-b'),
        ],
      ),
    )

    expect(result.tasks.map(({ id, step, stage, position }) => ({ id, step, stage, position }))).toEqual([
      { id: 'root', step: 1, stage: 0, position: { x: 0, y: 0 } },
      { id: 'branch-b', step: 2, stage: 1, position: { x: 340, y: 0 } },
      { id: 'branch-a', step: 3, stage: 1, position: { x: 340, y: 150 } },
      { id: 'merge', step: 4, stage: 2, position: { x: 680, y: 0 } },
    ])
  })

  it('keeps disconnected tasks deterministic and ignores non-sequencing relationships for ordering', () => {
    const result = projectPlanFlow(
      graph(
        ['related', 'blocked', 'dependent', 'prerequisite'],
        [
          { id: 'related-relates-to-dependent-0', from: 'related', to: 'dependent', type: 'relates-to' },
          { id: 'blocked-blocks-prerequisite-0', from: 'blocked', to: 'prerequisite', type: 'blocks' },
          dependsOn('dependent', 'prerequisite'),
        ],
      ),
    )

    expect(result.tasks.map(task => task.id)).toEqual(['related', 'blocked', 'prerequisite', 'dependent'])
    expect(result.tasks.map(task => task.stage)).toEqual([0, 0, 0, 1])
    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'relates-to', source: 'related', target: 'dependent' }),
        expect.objectContaining({ type: 'blocks', source: 'blocked', target: 'prerequisite' }),
      ]),
    )
  })

  it('uses canonical order as the stable tie-breaker', () => {
    const result = projectPlanFlow(graph(['parallel-b', 'parallel-a', 'later'], [dependsOn('later', 'parallel-a')]))

    expect(result.tasks.map(task => task.id)).toEqual(['parallel-b', 'parallel-a', 'later'])
  })

  it('falls back deterministically for cycles and invalid edges without crashing', () => {
    const result = projectPlanFlow(
      graph(
        ['outside', 'cycle-b', 'cycle-a'],
        [dependsOn('cycle-a', 'cycle-b'), dependsOn('cycle-b', 'cycle-a'), dependsOn('outside', 'missing')],
      ),
    )

    expect(result.hasCycle).toBe(true)
    expect(result.tasks.map(task => task.id)).toEqual(['outside', 'cycle-b', 'cycle-a'])
    expect(result.tasks.map(task => task.step)).toEqual([1, 2, 3])
    expect(result.tasks.slice(1).map(task => task.stage)).toEqual([1, 1])
  })
})
