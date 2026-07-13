import type { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { inadequateFreshTargetAuditSubmission } from '@/test/validation-ast-test-fixtures'
import { checkValidationAstForPlan } from './validation-ast-operation-service'
import { readValidationContext } from './validation-authoring-context-service'

const planHash = `sha256:${'a'.repeat(64)}`

function auditClient() {
  const project = { id: 'project-a', displayName: 'Project A', canonicalPath: '/tmp/project-a', fingerprint: planHash }
  return {
    planProjection: {
      findUnique: async () => ({
        planId: 'plan-a',
        revision: 1,
        lifecycle: 'preparing_validations',
        sourceHash: planHash,
        targetProjectId: project.id,
        targetProject: project,
        tasks: ['task-create', 'task-complete', 'task-filter', 'task-persist', 'task-responsive'].map(
          (taskId, position) => ({ taskId, position, title: taskId, description: taskId, validationIntent: taskId }),
        ),
      }),
    },
    module: { findMany: async () => [{ id: 'foreign-module', name: 'Foreign', parentId: null }] },
    testSuite: { findMany: async () => [] },
    testCase: { findMany: async () => [] },
    templateStep: { findMany: async () => [] },
    stepBlock: { findMany: async () => [] },
    locatorGroup: { findMany: async () => [] },
    locator: { findMany: async () => [] },
    environment: {
      findMany: async () => [{ id: 'environment-a', name: 'local', baseUrl: 'http://localhost:3000' }],
    },
  } as unknown as PrismaClient
}

describe('managed validation integrity audit fixtures', () => {
  it.fails('does not expose unrelated resources in a fresh target context', async () => {
    const context = await readValidationContext('plan-a', { client: auditClient(), projectDirectory: process.cwd() })
    expect(context.resources.modules).toEqual([])
  })

  it.fails('accepts the exact stable environment reference returned by context', async () => {
    const context = await readValidationContext('plan-a', { client: auditClient(), projectDirectory: process.cwd() })
    const environment = context.resources.environments[0] as { reference: string }
    const submission = inadequateFreshTargetAuditSubmission(planHash)
    submission.ast.matrix[0]!.environmentId = environment.reference
    await expect(checkValidationAstForPlan('plan-a', submission, auditClient())).resolves.toMatchObject({ valid: true })
  })

  it.fails('rejects broad task and quality claims without a reviewable coverage argument', async () => {
    await expect(
      checkValidationAstForPlan('plan-a', inadequateFreshTargetAuditSubmission(planHash), auditClient()),
    ).resolves.toMatchObject({ valid: false })
  })
})
