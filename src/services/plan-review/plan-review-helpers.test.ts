import { describe, expect, it } from 'vitest'

import type { PlanArtifact, ReviewArtifact } from '@/lib/plan-contract'

import {
  canApprovePlan,
  derivePlanGraph,
  diffPlanTasks,
  evaluateGraphReadiness,
  getBlockingThreads,
  getOrphanedThreads,
  hasSuspiciousReplacement,
} from './plan-review-helpers'

const plan = (tasks: PlanArtifact['tasks'], revision = 1): PlanArtifact => ({
  version: '1',
  planId: 'review-plan',
  revision,
  lifecycle: 'awaiting_plan_review',
  goal: 'Review a plan',
  tasks,
  edges: [],
  implementationGroups: [],
})

const task = (id: string, title = id): PlanArtifact['tasks'][number] => ({
  id,
  title,
  description: `${title} description`,
  acceptanceCriteria: [`${title} accepted`],
  validationIntent: `${title} validated`,
})

const review = (targetId: string, blocking = true): ReviewArtifact => ({
  version: '1',
  planId: 'review-plan',
  threads: [
    {
      id: 'remark-one',
      target: { type: 'task', taskId: targetId },
      blocking,
      events: [
        {
          id: 'event-one',
          action: 'created',
          actor: 'reviewer',
          createdAt: '2026-06-09T00:00:00.000Z',
          body: 'Please revise this.',
        },
      ],
    },
  ],
  planApprovals: [],
  fileApprovals: [],
})

describe('plan review helpers', () => {
  it('derives stable graph nodes and typed edges', () => {
    const value = plan([task('first'), task('second')])
    value.edges = [{ from: 'first', to: 'second', type: 'blocks' }]
    expect(derivePlanGraph(value)).toMatchObject({
      nodes: [
        { id: 'first', status: 'ready' },
        { id: 'second', status: 'blocked' },
      ],
      edges: [{ id: 'first-blocks-second-0', type: 'blocks' }],
    })
  })

  it('keeps non-blocking remarks approvable and blocks open blocking remarks', () => {
    expect(getBlockingThreads(review('first', false))).toHaveLength(0)
    expect(getBlockingThreads(review('first', true))).toHaveLength(1)
  })

  it('surfaces removed-node remarks as orphaned', () => {
    expect(getOrphanedThreads(plan([task('remaining')]), review('removed'))).toHaveLength(1)
  })

  it('detects suspicious same-title node replacement', () => {
    const diff = diffPlanTasks(plan([task('old-id', 'Same task')]), plan([task('new-id', 'Same task')], 2))
    expect(hasSuspiciousReplacement(diff)).toBe(true)
  })

  it('rejects stale approval while allowing a ready exact revision', () => {
    expect(
      canApprovePlan({
        displayedRevision: 1,
        currentRevision: 2,
        conflicted: false,
        representationReady: true,
        blockingThreads: 0,
        orphanedThreads: 0,
        suspiciousReplacement: false,
        suspiciousReplacementConfirmed: false,
      }),
    ).toEqual({ allowed: false, reason: 'The displayed revision is stale.' })
    expect(
      canApprovePlan({
        displayedRevision: 2,
        currentRevision: 2,
        conflicted: false,
        representationReady: true,
        blockingThreads: 0,
        orphanedThreads: 0,
        suspiciousReplacement: false,
        suspiciousReplacementConfirmed: false,
      }),
    ).toEqual({ allowed: true })
  })

  it('times out a stale graph worker and permits retry', () => {
    expect(
      evaluateGraphReadiness(
        [{ type: 'plan_graph_processing_started', createdAt: new Date('2026-06-09T00:00:00.000Z') }],
        new Date('2026-06-09T00:01:00.000Z'),
      ),
    ).toEqual({ ready: false, listFallback: false, staleWorker: true, retryAllowed: true })
  })

  it('enables list fallback after repeated graph failure', () => {
    expect(
      evaluateGraphReadiness([
        { type: 'plan_graph_failed', createdAt: new Date('2026-06-09T00:00:00.000Z') },
        { type: 'plan_graph_failed', createdAt: new Date('2026-06-09T00:00:10.000Z') },
      ]),
    ).toMatchObject({ ready: true, listFallback: true, retryAllowed: true })
  })
})
