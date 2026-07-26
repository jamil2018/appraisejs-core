import { describe, expect, it } from 'vitest'

import {
  builtInStepDefinitions,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions'
import { buildValidationAstReviewPreview, parseValidationAstReviewPreview } from './review-preview'

describe('Validation AST review preview', () => {
  it('creates a bounded browser projection and parses its durable event payload', () => {
    const definition = builtInStepDefinitions.find(item => item.identity.id === 'browser.navigation.goto')!
    const preview = buildValidationAstReviewPreview({
      submission: {
        expectedPlanHash: `sha256:${'a'.repeat(64)}`,
        ast: {
          schemaVersion: 2,
          id: 'navigation',
          title: 'Navigation',
          purpose: 'Open home.',
          coversTaskIds: ['task-one'],
          matrix: [{ browser: 'chromium', environmentId: 'local' }],
          expectedFailures: [],
          scenarios: [
            {
              id: 'open-home',
              title: 'Open home',
              steps: [
                {
                  id: 'open',
                  invocation: {
                    step: {
                      id: definition.identity.id,
                      version: definition.identity.version,
                      definitionHash: computeStepReferenceHash(definition),
                    },
                    inputs: { url: '/' },
                    presentation: { keyword: 'When', description: 'the user opens home' },
                  },
                },
              ],
            },
          ],
          qualityConcerns: [],
          customExtensions: [],
        },
        customExtensionProposals: [],
      },
      valid: true,
      previewHash: `sha256:${'b'.repeat(64)}`,
      receiptHash: `sha256:${'c'.repeat(64)}`,
      warnings: [{ code: 'semantic-warning', message: 'x'.repeat(500), stepId: 'step-one' }],
      blockers: [],
    })
    expect(preview.warnings[0]!.message).toHaveLength(240)
    expect(preview.scenarios[0]!.steps[0]).toEqual(expect.objectContaining({ actionId: expect.stringMatching(/@1$/) }))
    expect(parseValidationAstReviewPreview(JSON.stringify(preview))).toEqual(preview)
  })
})
