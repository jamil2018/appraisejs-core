import { describe, expect, it } from 'vitest'

import type { ValidationArtifact } from '@/lib/plan-contract'

import {
  assessBaselineAcceptance,
  classifyBaselineResult,
  extractCucumberEvidence,
  hashFailureSignatures,
  requiredBaselineCombinations,
} from './baseline'

const hash = `sha256:${'a'.repeat(64)}`
const appraiseArtifacts = {
  modules: [{ id: 'checkout-module', name: 'Checkout' }],
  testSuites: [
    {
      id: 'checkout-suite',
      name: 'Checkout suite',
      moduleId: 'checkout-module',
      testCaseIds: ['case-one'],
    },
  ],
  testCases: [
    {
      id: 'case-one',
      title: 'Checkout succeeds',
      description: 'AppraiseJS-authored checkout validation.',
      steps: [
        {
          id: 'when-submit',
          order: 0,
          label: 'Submit checkout',
          gherkinStep: 'When I submit checkout',
          parameters: [],
        },
      ],
    },
  ],
  locatorGroups: [],
  locators: [],
}
const validation = {
  version: '1',
  planId: 'checkout',
  revision: 1,
  baseRevision: { gitCommit: 'abc123', snapshotHash: hash, reducedAssurance: false },
  classificationOverrides: [],
  validations: [
    {
      id: 'new-behavior',
      taskIds: ['task-one'],
      required: true,
      testCaseIds: ['case-one'],
      appraiseArtifacts,
      gherkinPaths: ['automation/features/case-one.feature'],
      stepPaths: ['automation/steps/case-one.ts'],
      executable: { path: 'automation/features/case-one.feature' },
      matrix: [
        { browser: 'chromium', environment: 'local' },
        { browser: 'firefox', environment: 'local' },
      ],
      expectedFailures: [
        {
          browser: 'chromium',
          environment: 'local',
          signature: 'Then checkout succeeds: expected enabled to be true',
          order: 0,
          lastPassingStepId: 'when-submit',
        },
      ],
    },
  ],
  approvals: [],
  validationDecisions: [],
  files: [],
  manifestPaths: [],
  baselineAttempts: [],
  baselineAcknowledgements: [],
  baselineDecision: 'pending',
} satisfies ValidationArtifact

describe('baseline execution contract', () => {
  it('extracts ordered failure signatures and passed setup steps from Cucumber JSON', () => {
    expect(
      extractCucumberEvidence([
        {
          elements: [
            {
              steps: [
                { keyword: 'Given ', name: 'a cart', result: { status: 'passed' } },
                {
                  keyword: 'Then ',
                  name: 'checkout succeeds',
                  result: { status: 'failed', error_message: ' exact\nrun-specific stack path' },
                },
              ],
            },
          ],
        },
      ]),
    ).toEqual({
      failureSignatures: ['exact'],
      completedStepIds: ['a cart', 'Given a cart'],
    })
  })

  it('expands every required browser and environment combination', () => {
    expect(requiredBaselineCombinations(validation)).toEqual([
      { validationId: 'new-behavior', browser: 'chromium', environment: 'local' },
      { validationId: 'new-behavior', browser: 'firefox', environment: 'local' },
    ])
  })

  it('accepts only ordered exact expected failures after the required setup step', () => {
    expect(
      classifyBaselineResult(validation.validations[0], requiredBaselineCombinations(validation)[0], {
        result: 'failed',
        failureSignatures: ['Then checkout succeeds: expected enabled to be true'],
        completedStepIds: ['given-cart', 'when-submit'],
      }).classification,
    ).toBe('expected_product_failure')

    expect(
      classifyBaselineResult(validation.validations[0], requiredBaselineCombinations(validation)[0], {
        result: 'failed',
        failureSignatures: ['Then checkout succeeds: expected enabled to be true'],
        completedStepIds: ['given-cart'],
      }).classification,
    ).toBe('authoring_failure')
  })

  it('blocks harness failures and classifies unmatched failures as unrelated', () => {
    expect(
      classifyBaselineResult(validation.validations[0], requiredBaselineCombinations(validation)[0], {
        result: 'failed',
        failureSignatures: ['BeforeAll timed out after 30000ms'],
        completedStepIds: [],
      }).classification,
    ).toBe('authoring_failure')
    expect(
      classifyBaselineResult(validation.validations[0], requiredBaselineCombinations(validation)[0], {
        result: 'failed',
        failureSignatures: ['The run appears to have used a placeholder or fallback Cucumber binary.'],
        completedStepIds: [],
      }).classification,
    ).toBe('authoring_failure')
    expect(
      classifyBaselineResult(validation.validations[0], requiredBaselineCombinations(validation)[0], {
        result: 'failed',
        failureSignatures: ['Existing search test failed'],
        completedStepIds: ['when-submit'],
      }).classification,
    ).toBe('unrelated_existing_failure')
  })

  it.each([
    'invalid_empty_run',
    'invalid_missing_test_cases',
    'invalid_missing_report',
    'invalid_placeholder_binary',
    'invalid_unmatched_scenarios',
    'invalid_stale_runtime',
    'infrastructure_failure',
  ] as const)('classifies durable %s evidence health without reparsing blocker text', evidenceHealth => {
    expect(
      classifyBaselineResult(validation.validations[0], requiredBaselineCombinations(validation)[0], {
        result: 'failed',
        evidenceHealth,
        blockers: ['A deliberately non-matching blocker message.'],
        failureSignatures: ['A deliberately non-matching blocker message.'],
        completedStepIds: ['when-submit'],
      }).classification,
    ).toBe(evidenceHealth === 'infrastructure_failure' ? 'infrastructure_failure' : 'authoring_failure')
  })

  it('requires every combination plus regression justification and current-signature acknowledgement', () => {
    const attempts: ValidationArtifact['baselineAttempts'] = [
      {
        id: 'attempt-one',
        validationId: 'new-behavior',
        browser: 'chromium',
        environment: 'local',
        testRunId: 'run-one',
        status: 'completed',
        classification: 'unrelated_existing_failure',
        signatureHash: hashFailureSignatures(['Existing search test failed']),
        evidence: {
          logsUrl: '/api/test-runs/run-one/logs',
          reportUrl: '/test-runs/run-one',
          traceUrls: [],
          screenshotUrls: [],
        },
        createdAt: '2026-06-10T00:00:00Z',
        completedAt: '2026-06-10T00:01:00Z',
      },
      {
        id: 'attempt-two',
        validationId: 'new-behavior',
        browser: 'firefox',
        environment: 'local',
        testRunId: 'run-two',
        status: 'completed',
        classification: 'unexpected_pass',
        signatureHash: hashFailureSignatures([]),
        evidence: {
          logsUrl: '/api/test-runs/run-two/logs',
          reportUrl: '/test-runs/run-two',
          traceUrls: [],
          screenshotUrls: [],
        },
        createdAt: '2026-06-10T00:00:00Z',
        completedAt: '2026-06-10T00:01:00Z',
      },
    ]
    expect(assessBaselineAcceptance({ ...validation, baselineAttempts: attempts }).ready).toBe(false)
    expect(
      assessBaselineAcceptance({
        ...validation,
        baselineAttempts: [{ ...attempts[0] }, { ...attempts[1], regressionJustification: 'Guards a regression.' }],
        baselineAcknowledgements: [
          {
            attemptId: 'attempt-one',
            signatureHash: attempts[0].signatureHash!,
            acknowledgedBy: 'user',
            acknowledgedAt: '2026-06-10T00:02:00Z',
          },
        ],
      }),
    ).toEqual({ ready: true, blockers: [] })
  })
})
