import { describe, expect, it } from 'vitest'

import type { ValidationArtifact } from '@/lib/plan-contract'

import { featureTextForPath, projectCompiledValidationArtifacts } from './validation-runtime-projection-service'
import type { PrismaClient } from '@prisma/client'

const baseValidation = {
  version: '1',
  planId: 'projection-tags',
  revision: 1,
  baseRevision: { gitCommit: null, snapshotHash: `sha256:${'a'.repeat(64)}`, reducedAssurance: true },
  classificationOverrides: [],
  validations: [
    {
      id: 'quote-display',
      taskIds: ['show-quote'],
      required: true,
      testCaseIds: ['quote-case'],
      appraiseArtifacts: {
        modules: [{ id: 'quote-module', name: 'Quotes' }],
        testSuites: [{ id: 'quote-suite', name: 'Quote suite', moduleId: 'quote-module', testCaseIds: ['quote-case'] }],
        testCases: [
          {
            id: 'quote-case',
            title: 'Display a quote',
            description: 'Shows one motivation quote.',
            steps: [
              {
                id: 'quote-step',
                order: 0,
                label: 'See quote',
                gherkinStep: 'Then I see a motivation quote',
                parameters: [],
              },
            ],
          },
        ],
        locatorGroups: [],
        locators: [],
      },
      gherkinPaths: ['automation/features/quotes.feature'],
      stepPaths: ['automation/steps/quotes.steps.ts'],
      executable: { path: 'automation/features/quotes.feature' },
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
  baselineDecision: 'pending',
} satisfies ValidationArtifact

describe('validation runtime projection tags', () => {
  it('emits the same suite and case identifiers required by partial-suite baseline selection', () => {
    const feature = featureTextForPath(baseValidation.planId, baseValidation, 'automation/features/quotes.feature')
    const selectedScenarioTags = '@ts_quote-suite and @tc_quote-case'

    expect(feature).toContain('@appraise_validation_quote-display @ts_quote-suite @tc_quote-case')
    expect(selectedScenarioTags.split(' and ').every(tag => feature.includes(tag))).toBe(true)
    expect(feature.match(/Scenario:/g)).toHaveLength(1)
  })

  it('rejects a projected case without a suite assignment', () => {
    const invalid = structuredClone(baseValidation)
    invalid.validations[0].appraiseArtifacts.testSuites[0].testCaseIds = []

    expect(() => featureTextForPath(invalid.planId, invalid, 'automation/features/quotes.feature')).toThrow(
      'is not assigned to a suite',
    )
  })

  it('runs the compilation CAS before any projection write', async () => {
    let projectionAccessed = false
    const transaction = new Proxy(
      {},
      {
        get() {
          projectionAccessed = true
          throw new Error('projection write accessed')
        },
      },
    )
    const client = {
      $transaction: async (operation: (value: unknown) => unknown) => operation(transaction),
    } as unknown as PrismaClient
    await expect(
      projectCompiledValidationArtifacts(
        {
          planId: baseValidation.planId,
          validation: baseValidation,
          astId: 'ast-one',
          astHash: `sha256:${'b'.repeat(64)}`,
          compiledExtensions: [],
          assertCurrent: async () => {
            throw new Error('stale context')
          },
        },
        client,
      ),
    ).rejects.toThrow('stale context')
    expect(projectionAccessed).toBe(false)
  })
})
