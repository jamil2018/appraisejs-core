import { z } from 'zod'

import { PlanContractError } from './errors'
import { PLAN_LIFECYCLE_STATES } from './lifecycle'

export const PLAN_CONTRACT_VERSION = '1' as const

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Expected a lowercase kebab-case ID')
export const planIdSchema = z
  .string()
  .regex(
    /^(?:[a-z0-9]+(?:-[a-z0-9]+)*|pln_[0-9a-hjkmnp-tv-z]{26})$/,
    'Expected a legacy kebab-case ID or opaque plan ID',
  )
const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const timestampSchema = z.string().datetime({ offset: true })
const lifecycleSchema = z.enum(PLAN_LIFECYCLE_STATES)
const artifactHeaderSchema = z.object({
  version: z.literal(PLAN_CONTRACT_VERSION),
  planId: planIdSchema,
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

export const implementationValidationRunSchema = z.object({
  id: idSchema,
  validationId: idSchema,
  taskIds: z.array(idSchema).min(1),
  required: z.boolean(),
  status: z.enum(['running', 'passed', 'failed', 'cancelled', 'infrastructure_failure']),
  fresh: z.boolean(),
  commitHash: z.string().min(1),
  evidenceSource: z.enum(['managed', 'manual']).default('manual'),
  assurance: z.enum(['full', 'reduced']).default('reduced'),
  testRunId: z.string().min(1).optional(),
  browser: z.string().min(1).optional(),
  environment: z.string().min(1).optional(),
  tagExpression: z.string().min(1).optional(),
  runtimePaths: z
    .object({
      gherkinPaths: z.array(z.string().min(1)).default([]),
      stepPaths: z.array(z.string().min(1)).default([]),
      executablePath: z.string().min(1).optional(),
    })
    .optional(),
  evidenceUrls: z.array(z.string().min(1)),
  evidence: z
    .object({
      logsUrl: z.string().min(1).optional(),
      reportUrl: z.string().min(1).optional(),
      traceUrls: z.array(z.string().min(1)).default([]),
      screenshotUrls: z.array(z.string().min(1)).default([]),
    })
    .optional(),
  failureSignatureHash: hashSchema.optional(),
  acknowledgedAt: timestampSchema.optional(),
  completedAt: timestampSchema.optional(),
})

const validationAppraiseArtifactsSchema = z.object({
  modules: z
    .array(
      z.object({
        id: idSchema,
        name: z.string().min(1),
        parentId: idSchema.nullable().optional(),
      }),
    )
    .default([]),
  testSuites: z
    .array(
      z.object({
        id: idSchema,
        name: z.string().min(1),
        description: z.string().min(1).optional(),
        moduleId: idSchema,
        testCaseIds: z.array(idSchema).min(1),
      }),
    )
    .min(1),
  testCases: z
    .array(
      z.object({
        id: idSchema,
        title: z.string().min(1),
        description: z.string().min(1),
        steps: z.array(
          z.object({
            id: idSchema,
            order: z.number().int().nonnegative(),
            label: z.string().min(1),
            gherkinStep: z.string().min(1),
            templateStepId: idSchema.optional(),
            templateStepName: z.string().min(1).optional(),
            parameters: z
              .array(
                z.object({
                  name: z.string().min(1),
                  value: z.string(),
                  type: z.string().min(1).optional(),
                  locatorId: idSchema.optional(),
                  locatorName: z.string().min(1).optional(),
                }),
              )
              .default([]),
          }),
        ),
      }),
    )
    .min(1),
  locatorGroups: z
    .array(
      z.object({
        id: idSchema,
        name: z.string().min(1),
        route: z.string().min(1),
        moduleId: idSchema,
      }),
    )
    .default([]),
  locators: z
    .array(
      z.object({
        id: idSchema,
        name: z.string().min(1),
        value: z.string().min(1),
        locatorGroupId: idSchema,
      }),
    )
    .default([]),
})

const validationBaseRevisionSchema = z.object({
  gitCommit: z.string().min(1).nullable(),
  snapshotHash: hashSchema,
  reducedAssurance: z.boolean(),
})

const fileClassificationSchema = z.enum(['test_only', 'test_infrastructure', 'production', 'requires_review'])
const validationClassificationOverrideSchema = z.object({
  pattern: z.string().min(1),
  classification: fileClassificationSchema,
})

const validationNodeSchema = z.object({
  id: idSchema,
  taskIds: z.array(idSchema).min(1),
  required: z.boolean(),
  testCaseIds: z.array(idSchema).min(1),
  appraiseArtifacts: validationAppraiseArtifactsSchema,
  gherkinPaths: z.array(z.string().min(1)).min(1),
  stepPaths: z.array(z.string().min(1)).default([]),
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
})

const validationNodesSchema = z.array(validationNodeSchema).transform(items => uniqueIds(items, 'validations'))

const customStepJustificationSchema = z.object({
  path: z.string().min(1),
  missingCapability: z.string().min(1),
  whyLocatorsAndExistingStepsAreInsufficient: z.string().min(1),
})

const validationStepProposalParameterSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  type: z.string().min(1).optional(),
  locatorRef: z.string().min(1).optional(),
})

const validationReusableRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  groupId: z.string().min(1).optional(),
  groupName: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
})

const validationStepBlockProposalSchema = z.object({
  blockRef: z.string().min(1).optional(),
  intent: z.string().min(1),
  parameters: z.record(z.string(), z.string()).default({}),
})

export const validationTestCaseProposalSchema = z.object({
  title: z.string().min(1),
  behavior: z.string().min(1),
  coveredTaskIds: z.array(idSchema).min(1),
  suiteRef: z.string().min(1).optional(),
  steps: z
    .array(
      z.object({
        intent: z.string().min(1),
        gherkinText: z.string().min(1),
        templateStepRef: z.string().min(1).optional(),
        stepBlockRef: z.string().min(1).optional(),
        customStepProposal: z
          .object({
            path: z.string().min(1).optional(),
            missingCapability: z.string().min(1).optional(),
            whyLocatorsAndExistingStepsAreInsufficient: z.string().min(1).optional(),
          })
          .optional(),
        parameters: z.array(validationStepProposalParameterSchema).default([]),
      }),
    )
    .min(1),
  stepBlocks: z.array(validationStepBlockProposalSchema).default([]),
  gherkinPath: z.string().min(1).optional(),
  stepPath: z.string().min(1).optional(),
  browser: z.string().min(1).optional(),
  environment: z.string().min(1).optional(),
})

const validationDraftBlockerSchema = z.object({
  code: z.string().min(1),
  path: z.array(z.union([z.string(), z.number()])),
  phrase: z.string().min(1).optional(),
  message: z.string().min(1),
  recovery: z.string().min(1),
})

const runtimeProjectionSchema = z.object({
  role: z.enum(['gherkin', 'step', 'executable', 'manifest', 'file']),
  declaredPath: z.string().min(1),
  targetPath: z.string().min(1),
  runtimePath: z.string().min(1),
  materialization: z.enum(['generated', 'copied', 'reused', 'declared']),
  contentHash: hashSchema.nullable(),
})

const runtimePreflightSchema = z.object({
  status: z.enum(['passed', 'blocked']),
  checkedAt: timestampSchema,
  blockers: z.array(validationDraftBlockerSchema),
  runtimePreparation: z
    .object({ owner: z.literal('appraise'), binary: z.string().min(1), targetFilesChanged: z.boolean() })
    .optional(),
  executionPackets: z
    .array(
      z.object({
        validationId: idSchema,
        browser: z.string().min(1),
        environment: z.string().min(1),
        targetRoot: z.string().min(1),
        featurePaths: z.array(z.string().min(1)),
        importPaths: z.array(z.string().min(1)),
        tagExpression: z.string().min(1),
        expectedScenarioCount: z.number().int().positive(),
        reportPath: z.string().min(1),
      }),
    )
    .optional(),
})

const validationChangedFileSchema = z.object({
  path: z.string().min(1),
  classification: fileClassificationSchema,
  rationale: z.string().min(1),
  status: z.enum(['added', 'modified', 'deleted']),
  beforeHash: hashSchema.nullable(),
  contentHash: hashSchema.nullable(),
  patch: z.string(),
  declared: z.boolean(),
})

export const validationDraftSchema = artifactHeaderSchema
  .extend({
    draftId: idSchema,
    revision: z.number().int().positive(),
    status: z.enum(['draft', 'ready_for_review', 'published', 'changes_requested', 'discarded']),
    targetProjectId: z.string().min(1).nullable(),
    sourceHash: hashSchema,
    baseRevision: validationBaseRevisionSchema,
    classificationOverrides: z.array(validationClassificationOverrideSchema).default([]),
    validations: validationNodesSchema,
    files: z.array(validationChangedFileSchema),
    manifestPaths: z.array(z.string().min(1)),
    reusedStepPaths: z.array(z.string().min(1)).default([]),
    reusedTemplateStepRefs: z.array(validationReusableRefSchema).default([]),
    reusedStepBlockRefs: z.array(validationReusableRefSchema).default([]),
    newStepPaths: z.array(z.string().min(1)).default([]),
    customStepJustifications: z.array(customStepJustificationSchema).default([]),
    runtimeProjections: z.array(runtimeProjectionSchema).default([]),
    runtimePreflight: runtimePreflightSchema.optional(),
    blockers: z.array(validationDraftBlockerSchema).default([]),
    warnings: z.array(z.string().min(1)).default([]),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()

export const planArtifactSchema = artifactHeaderSchema
  .extend({
    revision: z.number().int().positive(),
    lifecycle: lifecycleSchema,
    goal: z.string().min(1).max(80),
    description: z.string().min(1),
    requirementAssessment: z
      .object({
        domainCandidates: z.array(
          z.object({ domain: z.string().min(1), confidence: z.number().min(0).max(1), evidence: z.array(z.string()) }),
        ),
        selectedDomain: z.string().min(1).optional(),
        requirements: z.array(
          z.object({
            id: z.string().min(1),
            text: z.string().min(1),
            kind: z.enum(['functional', 'data', 'quality', 'validation', 'constraint']),
            coveredBy: z.array(
              z.object({
                taskId: idSchema,
                surface: z.enum(['description', 'acceptanceCriteria', 'validationIntent']),
              }),
            ),
          }),
        ),
        uncoveredRequirementIds: z.array(z.string().min(1)),
        warnings: z.array(z.object({ code: z.string().min(1), message: z.string().min(1) })),
      })
      .optional(),
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
    baseRevision: validationBaseRevisionSchema,
    classificationOverrides: z.array(validationClassificationOverrideSchema).default([]),
    validations: validationNodesSchema,
    approvals: z.array(approvalSchema),
    reusedStepPaths: z.array(z.string().min(1)).optional(),
    reusedTemplateStepRefs: z.array(validationReusableRefSchema).optional(),
    reusedStepBlockRefs: z.array(validationReusableRefSchema).optional(),
    newStepPaths: z.array(z.string().min(1)).optional(),
    customStepJustifications: z.array(customStepJustificationSchema).optional(),
    runtimeProjections: z.array(runtimeProjectionSchema).optional(),
    runtimePreflight: runtimePreflightSchema.optional(),
    validationDecisions: z.array(
      z.object({
        validationId: idSchema,
        decision: z.enum(['approved', 'rejected', 'deferred']),
        contentHash: hashSchema,
        decidedBy: z.string().min(1),
        decidedAt: timestampSchema,
      }),
    ),
    files: z.array(validationChangedFileSchema),
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
              'validation_harness_failure',
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
        validationRuns: z.array(implementationValidationRunSchema),
        commits: z.array(
          z.object({
            hash: z.string().min(1),
            taskIds: z.array(idSchema).min(1),
            createdAt: timestampSchema,
          }),
        ),
        reconciliationReceipts: z
          .array(
            z.object({
              idempotencyKey: z.string().min(1),
              runIds: z.array(idSchema),
              verifiedTaskIds: z.array(idSchema),
              reconciledAt: timestampSchema,
            }),
          )
          .default([]),
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
export type ValidationDraft = z.infer<typeof validationDraftSchema>
export type LayoutArtifact = z.infer<typeof layoutArtifactSchema>
