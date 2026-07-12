import { describe, expect, it } from 'vitest'
import type { CapsuleCommandReceiptV1 } from './command-receipt-contract'
import { parseAndReconcileCucumberDryRun } from './cucumber-dry-run-report'

const selection = {
  tagExpression: '@tc_case-one',
  browser: 'chromium',
  environmentId: 'env-one',
  expectedCases: [
    { validationId: 'validation-one', suiteId: 'suite-one', caseId: 'case-one', scenarioId: 'scenario-one' },
  ],
  expectedScenarioCount: 1,
  expectedCaseCount: 1,
  expectedIdentifierTags: ['@appraise_validation_validation-one', '@tc_case-one', '@ts_suite-one'],
  correlationTagKind: 'case-id',
} satisfies CapsuleCommandReceiptV1['selection']

function report(overrides: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify([
      {
        elements: [
          {
            name: 'Scenario',
            tags: [
              { name: '@appraise_validation_validation-one' },
              { name: '@ts_suite-one' },
              { name: '@tc_case-one' },
            ],
            steps: [{ result: { status: 'skipped' } }],
            ...overrides,
          },
        ],
      },
    ]),
  )
}

describe('Cucumber dry-run report reconciliation', () => {
  it('matches one exact expected case and scenario', () => {
    expect(parseAndReconcileCucumberDryRun(report(), selection, 10_000)).toEqual({ selectedScenarioCount: 1 })
  })

  it('rejects bounded, duplicate, unexpected, and undefined evidence', () => {
    expect(() => parseAndReconcileCucumberDryRun(report(), selection, 2)).toThrow(/byte limit/)
    expect(() => parseAndReconcileCucumberDryRun(Buffer.from('{'), selection, 10_000)).toThrow()
    expect(() =>
      parseAndReconcileCucumberDryRun(
        Buffer.from(
          JSON.stringify([
            {
              elements: [
                JSON.parse(report().toString())[0].elements[0],
                JSON.parse(report().toString())[0].elements[0],
              ],
            },
          ]),
        ),
        selection,
        10_000,
      ),
    ).toThrow(/duplicate/)
    expect(() =>
      parseAndReconcileCucumberDryRun(report({ tags: [{ name: '@tc_foreign' }] }), selection, 10_000),
    ).toThrow(/exactly one/)
    expect(() =>
      parseAndReconcileCucumberDryRun(report({ steps: [{ result: { status: 'undefined' } }] }), selection, 10_000),
    ).toThrow(/undefined/)
  })
})
