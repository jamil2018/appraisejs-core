import type { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { basicValidationAstSubmission } from '@/test/validation-ast-test-fixtures'
import type { ValidationAstSubmission } from '@/lib/validation-ast'
import {
  checkValidationAstForPlan,
  previewValidationAstForPlan,
  readValidationAstExtensionPolicyForPlan,
} from './validation-ast-operation-service'

const planHash = `sha256:${'a'.repeat(64)}`
const client = {
  planProjection: {
    findUnique: async () => ({
      planId: 'plan-one',
      revision: 1,
      lifecycle: 'preparing_validations',
      sourceHash: planHash,
      tasks: [{ taskId: 'task-one', position: 0 }],
      targetProject: { id: 'project-one', fingerprint: `sha256:${'b'.repeat(64)}` },
    }),
  },
  locatorGroup: { findMany: async () => [] },
  environment: { findMany: async () => [{ name: 'local' }] },
} as unknown as PrismaClient

const submission = basicValidationAstSubmission(planHash)

describe('Validation AST operational context', () => {
  it('checks and previews against authoritative plan, target, catalog, graph, and environment hashes', async () => {
    await expect(checkValidationAstForPlan('plan-one', submission, client)).resolves.toMatchObject({
      valid: true,
      contextHash: expect.stringMatching(/^sha256:/),
    })
    await expect(previewValidationAstForPlan('plan-one', submission, client)).resolves.toMatchObject({
      valid: true,
      previewHash: expect.stringMatching(/^sha256:/),
      receiptHash: expect.stringMatching(/^sha256:/),
      commandReceipt: {
        catalogHash: expect.stringMatching(/^sha256:/),
        locatorGraphHash: expect.stringMatching(/^sha256:/),
      },
    })
  })

  it('accepts every capability advertised by built-in keyboard and viewport actions', async () => {
    const capabilitySubmission = structuredClone(submission) as ValidationAstSubmission
    capabilitySubmission.ast.scenarios[0].steps.push(
      {
        id: 'press-tab',
        keyword: 'When',
        description: 'the user presses Tab',
        action: { id: 'browser.keyboard.press', version: '1', inputs: { key: 'Tab' } },
      },
      {
        id: 'mobile-viewport',
        keyword: 'Then',
        description: 'the viewport is mobile sized',
        action: { id: 'browser.viewport.set', version: '1', inputs: { width: 390, height: 844 } },
      },
    )

    const checked = await checkValidationAstForPlan('plan-one', capabilitySubmission, client)

    expect(checked.blockers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'capability-unavailable' })]),
    )
    expect(checked.valid).toBe(true)
  })

  it('discovers a bounded versioned policy bound to the authoritative project', async () => {
    await expect(readValidationAstExtensionPolicyForPlan('plan-one', client)).resolves.toEqual({
      version: '1',
      projectId: 'project-one',
      projectFingerprint: `sha256:${'b'.repeat(64)}`,
      capabilityImports: { browser: ['@playwright/test'] },
      compilerVersion: expect.any(String),
      declarationHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })
  })
})
