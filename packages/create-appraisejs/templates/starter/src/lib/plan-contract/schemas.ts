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
    validations: z
      .array(
        z.object({
          id: idSchema,
          taskIds: z.array(idSchema).min(1),
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
            }),
          ),
        }),
      )
      .transform(items => uniqueIds(items, 'validations')),
    approvals: z.array(approvalSchema),
    baselineDecision: z.enum(['pending', 'accepted', 'changes-requested']),
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
