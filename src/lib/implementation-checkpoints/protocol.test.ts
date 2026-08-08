import { describe, expect, it } from 'vitest'

import type { PlanArtifact, ValidationArtifact } from '@/lib/plan-contract'

import {
  analyzeBlockingFeedback,
  analyzeExecutionOrder,
  canCompleteImplementation,
  carriedFailureAcknowledgementIsValid,
  queuedFeedbackMessage,
  runnableTasks,
} from './protocol'

const plan = {
  version: '1',
  planId: 'implementation-plan',
  revision: 1,
  lifecycle: 'in_progress',
  goal: 'Implement safely',
  description: 'Coordinate implementation tasks through explicit checkpoints.',
  tasks: ['foundation', 'api', 'docs'].map(id => ({
    id,
    title: id,
    description: id,
    acceptanceCriteria: ['done'],
    validationIntent: 'verify',
  })),
  edges: [{ from: 'foundation', to: 'api', type: 'blocks' }],
  implementationGroups: [
    { id: 'core', taskIds: ['foundation', 'api'] },
    { id: 'documentation', taskIds: ['docs'] },
  ],
} satisfies PlanArtifact

const validation = {
  version: '1',
  planId: plan.planId,
  revision: 1,
  baseRevision: { gitCommit: 'abc', snapshotHash: `sha256:${'a'.repeat(64)}`, reducedAssurance: false },
  classificationOverrides: [],
  validations: [
    {
      id: 'core-validation',
      taskIds: ['foundation', 'api'],
      required: true,
      testCaseIds: ['test-one'],
      appraiseArtifacts: {
        modules: [{ id: 'implementation-module', name: 'Implementation' }],
        testSuites: [
          {
            id: 'implementation-suite',
            name: 'Implementation suite',
            moduleId: 'implementation-module',
            testCaseIds: ['test-one'],
          },
        ],
        testCases: [
          {
            id: 'test-one',
            title: 'Validate implementation',
            description: 'AppraiseJS-authored implementation validation.',
            steps: [
              {
                id: 'run-validation',
                order: 0,
                label: 'Run validation',
                gherkinStep: 'Given I run validation',
                parameters: [],
              },
            ],
          },
        ],
        locatorGroups: [],
        locators: [],
      },
      gherkinPaths: ['test.feature'],
      stepPaths: ['steps.ts'],
      executable: { path: 'test.ts' },
      matrix: [{ browser: 'chromium', environment: 'local' }],
      expectedFailures: [],
    },
  ],
  approvals: [],
  validationDecisions: [],
  files: [],
  manifestPaths: [],
  baselineAttempts: [],
  baselineAcknowledgements: [],
  baselineDecision: 'accepted',
  implementation: {
    taskStates: { foundation: 'verified', api: 'verified', docs: 'verified' },
    approvedGroupIds: ['core', 'documentation'],
    pausedTaskIds: [],
    validationRuns: [
      {
        id: 'run-one',
        validationId: 'core-validation',
        publicationId: 'publication-one',
        taskIds: ['foundation', 'api'],
        required: true,
        status: 'passed',
        fresh: true,
        commitHash: 'abc',
        evidenceSource: 'managed',
        assurance: 'full',
        testRunId: 'test-run-one',
        evidenceUrls: ['/reports/run-one'],
        completedAt: '2026-06-11T00:00:00.000Z',
      },
    ],
    commits: [],
    reconciliationReceipts: [],
    evidenceProtected: true,
  },
} satisfies ValidationArtifact

describe('implementation checkpoint protocol', () => {
  it('runs approved independent tasks while typed dependencies remain blocked', () => {
    expect(runnableTasks(plan, {}, ['core', 'documentation'])).toEqual(['foundation', 'docs'])
    expect(runnableTasks(plan, { foundation: 'verified' }, ['core', 'documentation'])).toEqual(['api', 'docs'])
  })

  it('interprets depends-on from the dependent task to its prerequisite', () => {
    const dependsOnPlan = {
      ...plan,
      edges: [{ from: 'api', to: 'foundation', type: 'depends-on' as const }],
    }

    expect(runnableTasks(dependsOnPlan, {}, ['core', 'documentation'])).toEqual(['foundation', 'docs'])
    expect(runnableTasks(dependsOnPlan, { foundation: 'verified' }, ['core', 'documentation'])).toEqual(['api', 'docs'])
  })

  it('shows the deterministic execution order and rejects dependency cycles', () => {
    expect(analyzeExecutionOrder(plan)).toMatchObject({ valid: true, orderedTaskIds: ['foundation', 'docs', 'api'] })
    expect(
      analyzeExecutionOrder({
        ...plan,
        edges: [
          { from: 'foundation', to: 'api', type: 'blocks' },
          { from: 'api', to: 'foundation', type: 'blocks' },
        ],
      }),
    ).toMatchObject({ valid: false, blockedTaskIds: ['foundation', 'api'] })
  })

  it('pauses affected tasks and transitive dependents without stopping independent work', () => {
    expect(analyzeBlockingFeedback(plan, validation, ['foundation'], ['core', 'documentation'])).toEqual({
      affectedTaskIds: ['foundation'],
      transitiveDependentIds: ['api'],
      approvalsRequiringConfirmation: ['core'],
      independentTaskIds: ['docs'],
      impactedValidationIds: ['core-validation'],
    })
  })

  it('states when queued feedback will be acknowledged', () => {
    expect(queuedFeedbackMessage('after_group')).toBe(
      'Feedback queued and will be acknowledged at the next after group checkpoint.',
    )
  })

  it('requires verified tasks, fresh passing required validations, and protected evidence', () => {
    expect(canCompleteImplementation(plan, validation)).toMatchObject({
      ready: true,
      blockers: [],
      structuredBlockers: [],
      runState: 'passed',
      activeRunIds: [],
    })
    expect(
      canCompleteImplementation(
        { ...plan, lifecycle: 'completed' },
        {
          ...validation,
          implementation: { ...validation.implementation, evidenceProtected: false },
        },
      ),
    ).toMatchObject({ ready: true, blockers: [], runState: 'passed' })
    expect(
      canCompleteImplementation(plan, {
        ...validation,
        implementation: {
          ...validation.implementation,
          taskStates: { ...validation.implementation.taskStates, api: 'implemented' },
          validationRuns: validation.implementation.validationRuns.map(run => ({ ...run, fresh: false })),
          evidenceProtected: false,
        },
      }),
    ).toMatchObject({ ready: false, blockers: expect.arrayContaining([expect.stringContaining('api')]) })
  })

  it('keeps required active runs typed and distinct from terminal failures', () => {
    const active = canCompleteImplementation(plan, {
      ...validation,
      implementation: {
        ...validation.implementation,
        validationRuns: validation.implementation.validationRuns.map(run => ({
          ...run,
          status: 'running' as const,
          assurance: 'reduced' as const,
          completedAt: undefined,
        })),
      },
    })
    expect(active).toMatchObject({
      ready: false,
      runState: 'active',
      activeRunIds: ['run-one'],
      structuredBlockers: [expect.objectContaining({ validationId: 'core-validation', state: 'active' })],
    })

    const invalid = canCompleteImplementation(plan, {
      ...validation,
      implementation: {
        ...validation.implementation,
        validationRuns: validation.implementation.validationRuns.map(run => ({
          ...run,
          status: 'invalid_evidence' as const,
          assurance: 'reduced' as const,
        })),
      },
    })
    expect(invalid).toMatchObject({ ready: false, runState: 'invalid_evidence', activeRunIds: [] })
  })

  it('carries forward only unchanged pre-existing failure acknowledgements', () => {
    const signature = `sha256:${'b'.repeat(64)}`
    expect(carriedFailureAcknowledgementIsValid(signature, signature, '2026-06-11T00:00:00.000Z')).toBe(true)
    expect(
      carriedFailureAcknowledgementIsValid(signature, `sha256:${'c'.repeat(64)}`, '2026-06-11T00:00:00.000Z'),
    ).toBe(false)
  })
})
