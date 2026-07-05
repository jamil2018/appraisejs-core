import { describe, expect, it } from 'vitest'

import type { PlanArtifact, ValidationArtifact } from '@/lib/plan-contract'

import {
  analyzeBlockingFeedback,
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
  edges: [{ from: 'foundation', to: 'api', type: 'depends-on' }],
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
    evidenceProtected: true,
  },
} satisfies ValidationArtifact

describe('implementation checkpoint protocol', () => {
  it('runs approved independent tasks while typed dependencies remain blocked', () => {
    expect(runnableTasks(plan, {}, ['core', 'documentation'])).toEqual(['foundation', 'docs'])
    expect(runnableTasks(plan, { foundation: 'verified' }, ['core', 'documentation'])).toEqual(['api', 'docs'])
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
    expect(canCompleteImplementation(plan, validation)).toEqual({ ready: true, blockers: [] })
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

  it('carries forward only unchanged pre-existing failure acknowledgements', () => {
    const signature = `sha256:${'b'.repeat(64)}`
    expect(carriedFailureAcknowledgementIsValid(signature, signature, '2026-06-11T00:00:00.000Z')).toBe(true)
    expect(
      carriedFailureAcknowledgementIsValid(signature, `sha256:${'c'.repeat(64)}`, '2026-06-11T00:00:00.000Z'),
    ).toBe(false)
  })
})
