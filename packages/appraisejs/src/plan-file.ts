import { promises as fs } from 'node:fs'
import path from 'node:path'

import { isAlias, parseDocument, visit } from 'yaml'
import { z } from 'zod'

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const planIdSchema = z.string().regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*|pln_[0-9a-hjkmnp-tv-z]{26})$/)
const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const timestampSchema = z.string().datetime({ offset: true })
const approvalSchema = z.object({
  id: idSchema,
  revision: z.number().int().positive(),
  contentHash: hashSchema,
  relevantHashes: z.record(z.string(), hashSchema),
  approvedBy: z.string().min(1),
  approvedAt: timestampSchema,
})
const implementationValidationRunSchema = z.object({
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
})
const validationReusableRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  groupId: z.string().min(1).optional(),
  groupName: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
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
    .default([])
    .describe('AppraiseJS modules that own generated suites and locator groups.'),
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
    .min(1)
    .describe('AppraiseJS test suites generated for this validation.'),
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
    .min(1)
    .describe('AppraiseJS test cases and ordered steps users can review and later execute.'),
  locatorGroups: z
    .array(
      z.object({
        id: idSchema,
        name: z.string().min(1),
        route: z.string().min(1),
        moduleId: idSchema,
      }),
    )
    .default([])
    .describe('AppraiseJS locator groups used by the generated test cases.'),
  locators: z
    .array(
      z.object({
        id: idSchema,
        name: z.string().min(1),
        value: z.string().min(1),
        locatorGroupId: idSchema,
      }),
    )
    .default([])
    .describe('AppraiseJS locators used by test case step parameters.'),
})
const planArtifactBaseSchema = z
  .object({
    version: z.literal('1'),
    planId: planIdSchema,
    revision: z.number().int().positive(),
    lifecycle: z.enum([
      'draft',
      'awaiting_plan_review',
      'changes_requested',
      'plan_approved',
      'preparing_validations',
      'awaiting_validation_review',
      'validation_changes_requested',
      'validations_approved',
      'baseline_running',
      'baseline_review',
      'baseline_changes_requested',
      'baseline_accepted',
      'in_progress',
      'paused',
      'ready_for_validation',
      'validating',
      'failed_validation',
      'validation_passed',
      'completed',
      'cancelled',
    ]),
    goal: z
      .string()
      .min(1)
      .max(80)
      .describe('Short plan title, limited to 80 characters. Put supporting detail in description.'),
    description: z.string().min(1).describe('Concise summary of the plan scope, intent, and expected outcome.'),
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
      .min(1),
    edges: z.array(
      z.object({
        from: idSchema,
        to: idSchema,
        type: z.enum(['depends-on', 'blocks', 'relates-to']),
      }),
    ),
    implementationGroups: z.array(z.object({ id: idSchema, taskIds: z.array(idSchema).min(1) })),
  })
  .strict()

function validatePlanReferences(plan: z.infer<typeof planArtifactBaseSchema>, context: z.RefinementCtx): void {
  const taskIds = new Set(plan.tasks.map(task => task.id))
  if (taskIds.size !== plan.tasks.length) {
    context.addIssue({ code: 'custom', path: ['tasks'], message: 'Plan task IDs must be unique.' })
  }
  for (const [index, edge] of plan.edges.entries()) {
    if (!taskIds.has(edge.from) || !taskIds.has(edge.to)) {
      context.addIssue({
        code: 'custom',
        path: ['edges', index],
        message: 'Plan edges must reference existing tasks.',
      })
    }
  }
  for (const [index, group] of plan.implementationGroups.entries()) {
    if (group.taskIds.some(taskId => !taskIds.has(taskId))) {
      context.addIssue({
        code: 'custom',
        path: ['implementationGroups', index, 'taskIds'],
        message: 'Implementation groups must reference existing tasks.',
      })
    }
  }
}

export const planCreateInputSchema = planArtifactBaseSchema
  .omit({ planId: true })
  .extend({ planId: planIdSchema.optional() })
  .superRefine((plan, context) => validatePlanReferences({ ...plan, planId: plan.planId ?? 'draft-plan' }, context))

export const planArtifactSchema = planArtifactBaseSchema.superRefine(validatePlanReferences)

export type PlanFile = z.infer<typeof planArtifactSchema>

export const validationArtifactSchema = z
  .object({
    version: z.literal('1').describe('Validation artifact contract version.'),
    planId: planIdSchema.describe('The same plan ID passed to validation_publish.'),
    revision: z.number().int().positive().describe('Plan revision that these validations cover.'),
    baseRevision: z
      .object({
        gitCommit: z.string().min(1).nullable(),
        snapshotHash: hashSchema,
        reducedAssurance: z.boolean(),
      })
      .describe('Source snapshot used when validation artifacts were prepared.'),
    classificationOverrides: z
      .array(
        z.object({
          pattern: z.string().min(1),
          classification: z.enum(['test_only', 'test_infrastructure', 'production', 'requires_review']),
        }),
      )
      .default([])
      .describe('Optional file classification overrides used for changed-file evidence.'),
    validations: z
      .array(
        z.object({
          id: idSchema.describe('Stable lowercase kebab-case validation node ID.'),
          taskIds: z.array(idSchema).min(1).describe('Plan task IDs covered by this validation.'),
          required: z.boolean().describe('Required validations must be approved before baseline can start.'),
          testCaseIds: z.array(idSchema).min(1).describe('Authored AppraiseJS test case IDs exercised.'),
          appraiseArtifacts: validationAppraiseArtifactsSchema.describe(
            'The AppraiseJS-native suites, test cases, steps, and locators generated for review and later execution.',
          ),
          gherkinPaths: z.array(z.string().min(1)).min(1).describe('Generated or reused Gherkin feature paths.'),
          stepPaths: z
            .array(z.string().min(1))
            .describe('Custom per-case step definition paths. All-reusable cases may use shared resource refs only.'),
          executable: z
            .object({
              path: z.string().min(1),
              selector: z.string().min(1).optional(),
            })
            .describe('Runnable command target, usually the feature file plus optional selector.'),
          matrix: z
            .array(
              z.object({
                browser: z.string().min(1),
                environment: z.string().min(1),
              }),
            )
            .min(1)
            .describe('Browser/environment combinations this validation covers.'),
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
      .min(1)
      .describe('Validation nodes shown in validation review.'),
    approvals: z
      .array(approvalSchema)
      .describe('Historical validation-level approvals; usually empty at publish time.'),
    reusedStepPaths: z
      .array(z.string().min(1))
      .optional()
      .describe('Registry/template step paths reused before creating any custom steps.'),
    reusedTemplateStepRefs: z
      .array(validationReusableRefSchema)
      .optional()
      .describe('Template step resources reused by validation authoring, with generated shared group paths.'),
    reusedStepBlockRefs: z
      .array(validationReusableRefSchema)
      .optional()
      .describe('Reusable step block resources expanded into validation test steps.'),
    newStepPaths: z.array(z.string().min(1)).optional().describe('New custom step paths created for validation prep.'),
    customStepJustifications: z
      .array(
        z.object({
          path: z.string().min(1),
          missingCapability: z.string().min(1),
          whyLocatorsAndExistingStepsAreInsufficient: z.string().min(1),
        }),
      )
      .optional()
      .describe('Required for each custom step path when registry/template steps are insufficient.'),
    runtimeProjections: z
      .array(runtimeProjectionSchema)
      .optional()
      .describe('Evidence-to-runtime file projections materialized by Appraise before review and baseline.'),
    runtimePreflight: runtimePreflightSchema
      .optional()
      .describe('Latest runtime importability and step-discovery preflight status.'),
    validationDecisions: z
      .array(
        z.object({
          validationId: idSchema,
          decision: z.enum(['approved', 'rejected', 'deferred']),
          contentHash: hashSchema,
          decidedBy: z.string().min(1),
          decidedAt: timestampSchema,
        }),
      )
      .describe('Hash-bound user decisions; usually empty at publish time.'),
    files: z
      .array(
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
      )
      .describe('Changed-file evidence shown to the reviewer.'),
    manifestPaths: z.array(z.string().min(1)).describe('Every path intentionally changed for validation prep.'),
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
      .default([])
      .describe('Baseline execution attempts; empty when publishing initial validation artifacts.'),
    baselineAcknowledgements: z
      .array(
        z.object({
          attemptId: idSchema,
          signatureHash: hashSchema,
          acknowledgedBy: z.string().min(1),
          acknowledgedAt: timestampSchema,
        }),
      )
      .default([])
      .describe('Baseline acknowledgements; empty when publishing initial validation artifacts.'),
    baselineDecision: z
      .enum(['pending', 'accepted', 'changes-requested'])
      .describe('Use pending when publishing validation artifacts before baseline execution.'),
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
        evidenceProtected: z.boolean(),
      })
      .optional()
      .describe('Implementation evidence; omit during initial validation preparation.'),
  })
  .strict()

export type ValidationFile = z.infer<typeof validationArtifactSchema>

function assertNoYamlReferences(document: ReturnType<typeof parseDocument>): void {
  let blockedReference: 'anchor' | 'alias' | undefined
  visit(document, {
    Alias() {
      blockedReference = 'alias'
      return visit.BREAK
    },
    Node(_, node) {
      if (node && 'anchor' in node && node.anchor) {
        blockedReference = 'anchor'
        return visit.BREAK
      }
      if (isAlias(node)) {
        blockedReference = 'alias'
        return visit.BREAK
      }
    },
  })
  if (blockedReference) throw new Error(`YAML ${blockedReference}s are not allowed.`)
}

async function readPlanFile(file: string): Promise<PlanFile> {
  const source = await fs.readFile(file, 'utf8')
  if (Buffer.byteLength(source, 'utf8') > 1_048_576) throw new Error('Plan file exceeds the 1 MB limit.')
  const document = parseDocument(source, { prettyErrors: false, strict: true, uniqueKeys: true })
  if (document.errors.length) throw new Error(`Invalid plan file: ${document.errors[0]?.message ?? 'YAML parse error'}`)
  assertNoYamlReferences(document)
  return planArtifactSchema.parse(document.toJS({ maxAliasCount: 0 }))
}

export async function validatePlanFile(file: string) {
  const plan = await readPlanFile(path.resolve(file))
  return {
    ok: true as const,
    schema: 'appraise.plan/v1',
    file: path.resolve(file),
    planId: plan.planId,
    revision: plan.revision,
    lifecycle: plan.lifecycle,
    taskCount: plan.tasks.length,
  }
}

export async function createOfflineDraft(file: string, cwd: string) {
  const validation = await validatePlanFile(file)
  if (validation.lifecycle !== 'draft') throw new Error('Offline plan creation requires the draft lifecycle.')
  const destination = path.join(path.resolve(cwd), 'appraise', 'plans', `${validation.planId}.yaml`)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.copyFile(path.resolve(file), destination, fs.constants.COPYFILE_EXCL)
  return {
    ok: true as const,
    mode: 'offline' as const,
    planId: validation.planId,
    lifecycle: validation.lifecycle,
    path: destination,
    warning: 'Offline drafts are not registered with AppraiseJS. Start the app and create the plan online to continue.',
  }
}

export async function readValidatedPlan(file: string): Promise<PlanFile> {
  await validatePlanFile(file)
  return readPlanFile(path.resolve(file))
}
