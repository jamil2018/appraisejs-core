import { z } from 'zod'

import { PlanContractError } from './errors'
import { PLAN_LIFECYCLE_STATES } from './lifecycle'

export const PLAN_CONTRACT_VERSION = '1' as const

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Expected a lowercase kebab-case ID')
const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const timestampSchema = z.string().datetime({ offset: true })
const lifecycleSchema = z.enum(PLAN_LIFECYCLE_STATES)
const artifactHeaderSchema = z.object({
  version: z.literal(PLAN_CONTRACT_VERSION),
  planId: idSchema,
})

const uniqueIds = <T extends { id: string }>(items: T[], path: string): T[] => {
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new PlanContractError('duplicate-id', `Duplicate ID "${item.id}"`, [path])
    }
    seen.add(item.id)
  }
  return items
}

const remarkTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('plan') }),
  z.object({ type: z.literal('task'), taskId: idSchema }),
  z.object({ type: z.literal('validation'), validationId: idSchema }),
  z.object({ type: z.literal('result'), resultId: idSchema }),
  z.object({ type: z.literal('file'), path: z.string().min(1) }),
])

export const approvalSchema = z.object({
  id: idSchema,
  revision: z.number().int().positive(),
  contentHash: hashSchema,
  relevantHashes: z.record(z.string(), hashSchema),
  approvedBy: z.string().min(1),
  approvedAt: timestampSchema,
})

export const planArtifactSchema = artifactHeaderSchema
  .extend({
    revision: z.number().int().positive(),
    lifecycle: lifecycleSchema,
    goal: z.string().min(1),
    tasks: z
      .array(
        z.object({
          id: idSchema,
          title: z.string().min(1),
          description: z.string().min(1),
          acceptanceCriteria: z.array(z.string().min(1)).min(1),
          validationIntent: z.string().min(1),
        }),
      )
      .transform(items => uniqueIds(items, 'tasks')),
    edges: z.array(
      z.object({
        from: idSchema,
        to: idSchema,
        type: z.enum(['depends-on', 'blocks', 'relates-to']),
      }),
    ),
    implementationGroups: z
      .array(
        z.object({
          id: idSchema,
          taskIds: z.array(idSchema).min(1),
        }),
      )
      .transform(items => uniqueIds(items, 'implementationGroups')),
  })
  .strict()

const remarkEventSchema = z.object({
  id: idSchema,
  action: z.enum(['created', 'addressed', 'disputed', 'resolved', 'dismissed', 'downgraded']),
  actor: z.string().min(1),
  createdAt: timestampSchema,
  body: z.string().min(1).optional(),
})

export const reviewArtifactSchema = artifactHeaderSchema
  .extend({
    threads: z
      .array(
        z.object({
          id: idSchema,
          target: remarkTargetSchema,
          blocking: z.boolean(),
          events: z.array(remarkEventSchema).min(1),
        }),
      )
      .transform(items => uniqueIds(items, 'threads')),
    planApprovals: z.array(approvalSchema),
    fileApprovals: z.array(
      z.object({
        path: z.string().min(1),
        contentHash: hashSchema,
        approvedBy: z.string().min(1),
        approvedAt: timestampSchema,
      }),
    ),
    finalSignOff: approvalSchema.optional(),
  })
  .strict()

export const validationArtifactSchema = artifactHeaderSchema
  .extend({
    revision: z.number().int().positive(),
    baseRevision: z.object({
      gitCommit: z.string().min(1).nullable(),
      snapshotHash: hashSchema,
      reducedAssurance: z.boolean(),
    }),
    classificationOverrides: z
      .array(
        z.object({
          pattern: z.string().min(1),
          classification: z.enum(['test_only', 'test_infrastructure', 'production', 'requires_review']),
        }),
      )
      .default([]),
    validations: z
      .array(
        z.object({
          id: idSchema,
          taskIds: z.array(idSchema).min(1),
          required: z.boolean(),
          testCaseIds: z.array(idSchema).min(1),
          gherkinPaths: z.array(z.string().min(1)).min(1),
          stepPaths: z.array(z.string().min(1)).min(1),
          executable: z.object({
            path: z.string().min(1),
            selector: z.string().min(1).optional(),
          }),
          matrix: z
            .array(
              z.object({
                browser: z.string().min(1),
                environment: z.string().min(1),
              }),
            )
            .min(1),
          expectedFailures: z.array(
            z.object({
              browser: z.string().min(1),
              environment: z.string().min(1),
              signature: z.string().min(1),
              order: z.number().int().nonnegative(),
              lastPassingStepId: idSchema,
            }),
          ),
        }),
      )
      .transform(items => uniqueIds(items, 'validations')),
    approvals: z.array(approvalSchema),
    validationDecisions: z.array(
      z.object({
        validationId: idSchema,
        decision: z.enum(['approved', 'rejected', 'deferred']),
        contentHash: hashSchema,
        decidedBy: z.string().min(1),
        decidedAt: timestampSchema,
      }),
    ),
    files: z.array(
      z.object({
        path: z.string().min(1),
        classification: z.enum(['test_only', 'test_infrastructure', 'production', 'requires_review']),
        rationale: z.string().min(1),
        status: z.enum(['added', 'modified', 'deleted']),
        beforeHash: hashSchema.nullable(),
        contentHash: hashSchema.nullable(),
        patch: z.string(),
        declared: z.boolean(),
      }),
    ),
    manifestPaths: z.array(z.string().min(1)),
    reviewSubmittedAt: timestampSchema.optional(),
    baselineAttempts: z
      .array(
        z.object({
          id: idSchema,
          validationId: idSchema,
          browser: z.string().min(1),
          environment: z.string().min(1),
          testRunId: z.string().min(1),
          status: z.enum(['scheduled', 'running', 'completed', 'cancelled', 'interrupted']),
          classification: z
            .enum([
              'expected_behavioral_failure',
              'accepted_regression_pass',
              'pre_existing_unrelated_failure',
              'invalid_baseline_failure',
            ])
            .optional(),
          signatureHash: hashSchema.optional(),
          regressionJustification: z.string().min(1).optional(),
          evidence: z.object({
            logsUrl: z.string().min(1),
            reportUrl: z.string().min(1),
            traceUrls: z.array(z.string().min(1)).default([]),
            screenshotUrls: z.array(z.string().min(1)).default([]),
          }),
          createdAt: timestampSchema,
          completedAt: timestampSchema.optional(),
        }),
      )
      .default([]),
    baselineAcknowledgements: z
      .array(
        z.object({
          attemptId: idSchema,
          signatureHash: hashSchema,
          acknowledgedBy: z.string().min(1),
          acknowledgedAt: timestampSchema,
        }),
      )
      .default([]),
    baselineDecision: z.enum(['pending', 'accepted', 'changes-requested']),
    implementation: z
      .object({
        taskStates: z.record(idSchema, z.enum(['pending', 'in_progress', 'implemented', 'verified'])),
        approvedGroupIds: z.array(idSchema),
        pausedTaskIds: z.array(idSchema),
        checkpoint: z
          .object({
            type: z.enum([
              'before_task',
              'after_task',
              'before_group',
              'after_group',
              'before_validation',
              'before_completion',
            ]),
            taskIds: z.array(idSchema),
            queuedFeedbackCount: z.number().int().nonnegative(),
            reachedAt: timestampSchema,
          })
          .optional(),
        validationRuns: z.array(
          z.object({
            id: idSchema,
            validationId: idSchema,
            taskIds: z.array(idSchema).min(1),
            required: z.boolean(),
            status: z.enum(['passed', 'failed', 'cancelled', 'infrastructure_failure']),
            fresh: z.boolean(),
            commitHash: z.string().min(1),
            evidenceUrls: z.array(z.string().min(1)),
            failureSignatureHash: hashSchema.optional(),
            acknowledgedAt: timestampSchema.optional(),
            completedAt: timestampSchema,
          }),
        ),
        commits: z.array(
          z.object({
            hash: z.string().min(1),
            taskIds: z.array(idSchema).min(1),
            createdAt: timestampSchema,
          }),
        ),
        evidenceProtected: z.boolean(),
      })
      .optional(),
  })
  .strict()

export const layoutArtifactSchema = artifactHeaderSchema
  .extend({
    positions: z.record(
      idSchema,
      z.object({
        x: z.number().finite(),
        y: z.number().finite(),
      }),
    ),
  })
  .strict()

export const artifactSchemas = {
  plan: planArtifactSchema,
  review: reviewArtifactSchema,
  validation: validationArtifactSchema,
  layout: layoutArtifactSchema,
} as const

export type ArtifactKind = keyof typeof artifactSchemas
export type PlanArtifact = z.infer<typeof planArtifactSchema>
export type ReviewArtifact = z.infer<typeof reviewArtifactSchema>
export type ValidationArtifact = z.infer<typeof validationArtifactSchema>
export type LayoutArtifact = z.infer<typeof layoutArtifactSchema>
