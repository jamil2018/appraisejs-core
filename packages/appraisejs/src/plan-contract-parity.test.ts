import { describe, expect, it } from 'vitest'

import { planArtifactSchema, validationArtifactSchema } from './plan-file.js'

const validPlan = {
  version: '1',
  planId: 'contract-parity',
  revision: 1,
  lifecycle: 'awaiting_plan_review',
  goal: 'Keep CLI, API, and MCP plan inputs aligned',
  description: 'Verify every plan entry point accepts and rejects the same artifact shape.',
  tasks: [
    {
      id: 'publish-plan',
      title: 'Publish plan',
      description: 'Publish one valid plan.',
      acceptanceCriteria: ['The plan is accepted.'],
      validationIntent: 'Run contract parity tests.',
    },
  ],
  edges: [],
  implementationGroups: [{ id: 'publication', taskIds: ['publish-plan'] }],
}

const validValidation = {
  version: '1',
  planId: 'contract-parity',
  revision: 1,
  baseRevision: {
    gitCommit: null,
    snapshotHash: `sha256:${'a'.repeat(64)}`,
    reducedAssurance: true,
  },
  classificationOverrides: [],
  validations: [
    {
      id: 'primary-workflow',
      taskIds: ['publish-plan'],
      required: true,
      testCaseIds: ['primary-workflow'],
      appraiseArtifacts: {
        modules: [{ id: 'core-module', name: 'Core workflow' }],
        testSuites: [
          {
            id: 'primary-suite',
            name: 'Primary workflow',
            description: 'End-to-end reviewable workflow generated for validation.',
            moduleId: 'core-module',
            testCaseIds: ['primary-workflow'],
          },
        ],
        testCases: [
          {
            id: 'primary-workflow',
            title: 'Complete the primary workflow',
            description: 'Verifies the reviewed user path through AppraiseJS-authored steps.',
            steps: [
              {
                id: 'open-page',
                order: 0,
                label: 'Open the app',
                gherkinStep: 'Given I open the application',
                templateStepName: 'Navigate to URL',
                parameters: [{ name: 'url', value: '/', type: 'TEXT' }],
              },
            ],
          },
        ],
        locatorGroups: [{ id: 'core-page', name: 'Core page', route: '/', moduleId: 'core-module' }],
        locators: [
          {
            id: 'primary-action',
            name: 'Primary action',
            value: '[data-testid="primary-action"]',
            locatorGroupId: 'core-page',
          },
        ],
      },
      gherkinPaths: ['automation/features/primary-workflow.feature'],
      stepPaths: ['automation/steps/primary-workflow.steps.ts'],
      executable: { path: 'automation/features/primary-workflow.feature', selector: 'Primary workflow' },
      matrix: [{ browser: 'chromium', environment: 'local' }],
      expectedFailures: [],
    },
  ],
  approvals: [],
  reusedStepPaths: ['automation/steps/templates/navigation.steps.ts'],
  newStepPaths: [],
  customStepJustifications: [],
  validationDecisions: [],
  files: [
    {
      path: 'automation/features/primary-workflow.feature',
      classification: 'test_only',
      rationale: 'Validation artifact for reviewed plan behavior.',
      status: 'added',
      beforeHash: null,
      contentHash: `sha256:${'b'.repeat(64)}`,
      patch: 'diff --git a/automation/features/primary-workflow.feature b/automation/features/primary-workflow.feature',
      declared: true,
    },
  ],
  manifestPaths: ['automation/features/primary-workflow.feature'],
  baselineAttempts: [],
  baselineAcknowledgements: [],
  baselineDecision: 'pending',
}

describe('plan input contract parity', () => {
  it('accepts the shared successful fixture', () => {
    expect(planArtifactSchema.safeParse(validPlan).success).toBe(true)
  })

  it.each(['plan_approved', 'validations_approved', 'baseline_accepted', 'in_progress'])(
    'accepts current app lifecycle state %s',
    lifecycle => {
      expect(planArtifactSchema.safeParse({ ...validPlan, lifecycle }).success).toBe(true)
    },
  )

  it.each([
    [{ ...validPlan, description: '' }, 'description'],
    [{ ...validPlan, goal: 'a'.repeat(81) }, 'goal'],
    [{ ...validPlan, tasks: [{ ...validPlan.tasks[0], validationIntent: '' }] }, 'tasks.0.validationIntent'],
    [
      { ...validPlan, implementationGroups: [{ id: 'publication', taskIds: ['missing-task'] }] },
      'implementationGroups.0.taskIds',
    ],
  ])('rejects an invalid fixture with a stable field path', (fixture, expectedPath) => {
    const result = planArtifactSchema.safeParse(fixture)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]?.path.join('.')).toBe(expectedPath)
  })
})

describe('validation input contract parity', () => {
  it('accepts the shared validation artifact fixture used by MCP discovery', () => {
    expect(validationArtifactSchema.safeParse(validValidation).success).toBe(true)
  })

  it.each([
    [{ ...validValidation, validations: [] }, 'validations'],
    [
      {
        ...validValidation,
        validations: [{ ...validValidation.validations[0], gherkinPaths: [] }],
      },
      'validations.0.gherkinPaths',
    ],
    [
      {
        ...validValidation,
        validations: [
          {
            ...validValidation.validations[0],
            appraiseArtifacts: { ...validValidation.validations[0].appraiseArtifacts, testSuites: [] },
          },
        ],
      },
      'validations.0.appraiseArtifacts.testSuites',
    ],
    [{ ...validValidation, files: [{ ...validValidation.files[0], rationale: '' }] }, 'files.0.rationale'],
    [{ ...validValidation, baselineDecision: 'approved' }, 'baselineDecision'],
  ])('rejects an invalid validation fixture with a stable field path', (fixture, expectedPath) => {
    const result = validationArtifactSchema.safeParse(fixture)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]?.path.join('.')).toBe(expectedPath)
  })
})
