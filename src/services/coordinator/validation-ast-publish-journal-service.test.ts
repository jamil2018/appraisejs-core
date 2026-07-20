import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { createCustomExtensionPolicy } from '@/lib/validation-ast/extension-policy'
import {
  advanceValidationAstPublish,
  prepareValidationAstPublish,
  validationAstPublishOperationId,
} from './validation-ast-publish-journal-service'

describe('Validation AST publish journal', () => {
  it('prepares immutable reviews idempotently and advances phases once', async () => {
    const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`
    const contractDigest = (value: unknown) => digest(canonicalContractJson(value))
    const receiptHash = digest('receipt')
    const operationId = validationAstPublishOperationId(receiptHash)
    const operation = {
      id: operationId,
      planId: 'plan',
      idempotencyKey: 'key',
      phase: 'prepared',
      validationHash: 'vh',
      reviewHash: 'rh',
    }
    const tx = {
      validationAstPublishOperation: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(operation),
      },
      validationExtensionReview: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    }
    const client = {
      $transaction: (fn: (value: unknown) => unknown) => fn(tx),
      validationAstPublishOperation: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ ...operation, phase: 'artifacts_written' }),
      },
    } as never
    const actions = [
      { id: 'action', version: '1', contentHash: digest('action') },
      { id: 'assertion', version: '1', contentHash: digest('assertion') },
    ]
    const projection = {
      validationNode: {
        id: 'ast',
        matrix: [{ browser: 'chromium', environment: 'local' }],
        testCaseIds: ['case'],
        appraiseArtifacts: {
          locators: [],
          testCases: [
            {
              id: 'case',
              steps: [
                { id: 'step', templateStepName: 'action@1' },
                { id: 'step-two', templateStepName: 'assertion@1' },
              ],
            },
          ],
        },
      },
      gherkin: ['Scenario: one'],
    }
    const compilerReceipt = {
      schemaVersion: '1' as const,
      catalogHash: digest('catalog'),
      locatorGraphHash: digest('graph'),
      environments: ['local'],
      browsers: ['chromium'],
      runtimes: ['browser'],
    }
    const runtimeInput = {
      schemaVersion: '1' as const,
      targetProjectId: 'target',
      targetFingerprint: digest('target'),
      astId: 'ast',
      astHash: digest('ast'),
      contextHash: digest('context'),
      previewHash: digest('preview'),
      receiptHash,
      compilerReceipt: { ...compilerReceipt, contentHash: contractDigest(compilerReceipt) },
      extensionPolicy: createCustomExtensionPolicy({
        projectId: 'target',
        projectFingerprint: digest('target'),
        capabilityImports: {},
      }),
      actions,
      locators: [],
      extensions: [],
      matrix: projection.validationNode.matrix,
      expected: {
        scenarios: [{ scenarioId: 'scenario', caseId: 'case', stepIds: ['step', 'step-two'] }],
        scenarioCount: 1,
      },
      gherkinHash: contractDigest(projection.gherkin),
    }
    const input = {
      id: operationId,
      planId: 'plan',
      planProjectionId: 'projection',
      targetProjectId: 'target',
      targetFingerprint: digest('target'),
      idempotencyKey: 'key',
      expectedPlanHash: digest('old-plan'),
      expectedPlanArtifactHash: digest('old-plan-file'),
      expectedReviewHash: digest('old-review'),
      planHash: digest('{}'),
      validationHash: digest('{}'),
      reviewHash: digest('{}'),
      planContent: '{}',
      validationContent: '{}',
      reviewContent: '{}',
      astId: 'ast',
      astHash: digest('ast'),
      contextHash: digest('context'),
      previewHash: digest('preview'),
      receiptHash,
      projectionHash: contractDigest(projection),
      projectionJson: canonicalContractJson(projection),
      validationProjectionJson: '{}',
      runtimeInputHash: contractDigest(runtimeInput),
      runtimeInputJson: canonicalContractJson(runtimeInput),
      extensionReviews: [],
    }
    await expect(prepareValidationAstPublish(input, client)).resolves.toMatchObject({ id: operationId })
    await expect(prepareValidationAstPublish({ ...input, id: 'astpub_wrong' }, client)).rejects.toThrow(
      /id does not match/,
    )
    await expect(
      prepareValidationAstPublish({ ...input, runtimeInputJson: 'x'.repeat(1024 * 1024 + 1) }, client),
    ).rejects.toThrow(/exceeds 1 MiB/)
    await expect(
      prepareValidationAstPublish({ ...input, runtimeInputHash: digest('tampered') }, client),
    ).rejects.toThrow(/hash does not match/)
    const missingLastOperation = { ...runtimeInput, actions: runtimeInput.actions.slice(0, -1) }
    await expect(
      prepareValidationAstPublish(
        {
          ...input,
          runtimeInputJson: canonicalContractJson(missingLastOperation),
          runtimeInputHash: contractDigest(missingLastOperation),
        },
        client,
      ),
    ).rejects.toThrow(/operations do not match/)
    const missingLastStep = {
      ...runtimeInput,
      expected: {
        ...runtimeInput.expected,
        scenarios: [{ ...runtimeInput.expected.scenarios[0]!, stepIds: ['step'] }],
      },
    }
    await expect(
      prepareValidationAstPublish(
        {
          ...input,
          runtimeInputJson: canonicalContractJson(missingLastStep),
          runtimeInputHash: contractDigest(missingLastStep),
        },
        client,
      ),
    ).rejects.toThrow(/steps do not match/)
    await expect(
      prepareValidationAstPublish({ ...input, runtimeInputJson: JSON.stringify(runtimeInput, null, 2) }, client),
    ).rejects.toThrow(/runtime input is invalid/i)
    const injectedProjection = { ...projection, gherkin: ['Scenario: safe\n@injected'] }
    const injectedRuntimeInput = { ...runtimeInput, gherkinHash: contractDigest(injectedProjection.gherkin) }
    await expect(
      prepareValidationAstPublish(
        {
          ...input,
          projectionJson: canonicalContractJson(injectedProjection),
          projectionHash: contractDigest(injectedProjection),
          runtimeInputJson: canonicalContractJson(injectedRuntimeInput),
          runtimeInputHash: contractDigest(injectedRuntimeInput),
        },
        client,
      ),
    ).rejects.toThrow(/runtime input is invalid/i)
    expect(tx.validationExtensionReview.createMany).toHaveBeenCalledWith({ data: [] })
    await expect(
      advanceValidationAstPublish({ operationId, from: 'prepared', to: 'artifacts_written' }, client),
    ).resolves.toMatchObject({ phase: 'artifacts_written' })
  })
})
