import { createHash } from 'node:crypto'

import { z } from 'zod'

import { defaultOperationRegistry } from '@/lib/operation-catalog'
import { canonicalStepDiscoveryText, stepDiscoveryTerms } from '@/lib/step-discovery'

import {
  coordinatorContractVersion,
  coordinatorError,
  CoordinatorPostCommitSerializationError,
  planLinks,
  zodCoordinatorError,
} from '@/lib/coordinator-api/contracts'
import { parseValidationResourceTypes } from '@/lib/coordinator-api/validation-context-query'
import { isProviderNativeRunsEnabled } from '@/lib/feature-flags'
import { locatorGraphPageSchema, locatorGraphSchema } from '@/lib/locator-graph'
import { runtimeCapsuleDiagnosticV1Schema } from '@/lib/runtime-capsule'
import { guardCoordinatorRequest, readCoordinatorJson } from '@/lib/coordinator-api/request-guard'
import {
  implementationValidationRunSchema,
  parseYamlArtifact,
  planArtifactSchema,
  planIdSchema,
  reviewArtifactSchema,
  validationArtifactSchema,
} from '@/lib/plan-contract'
import { createOpaquePlanId } from '@/lib/plans/plan-identity'
import {
  cancelProviderWorkflowRun,
  createProviderWorkflowRun,
  getProviderWorkflowRun,
  listProviderRegistrations,
  listProviderWorkflowRuns,
  probeProviderRegistration,
  recordProviderPermissionDecision,
  updateProviderRegistration,
} from '@/services/coordinator/coordinator-provider-run-service'
import {
  acknowledgePlanEvent,
  acknowledgePlanEventsThrough,
  ensureProjectIdentity,
  ensurePlanReviewReadyEvent,
  heartbeatCoordinator,
  readPlanEvents,
  registerCoordinator,
  waitForPlanEvents,
} from '@/services/coordinator/coordinator-service'
import {
  createCoordinatorPlan,
  readCoordinatorPlan,
  reviseCoordinatorPlan,
  startCoordinatorPlan,
  updateCoordinatorTask,
} from '@/services/coordinator/coordinator-plan-service'
import {
  createContinuationPackage,
  createLifecycleSnapshot,
  createObjective,
  evaluateCoordinationSlo,
} from '@/services/coordinator/coordinator-scaling-service'
import {
  approveValidationFile,
  decideValidationNode,
  submitValidationFeedback,
  submitValidationReview,
} from '@/services/coordinator/coordinator-validation-service'
import {
  readValidationContext,
  resolveReusableValidationSteps,
} from '@/services/coordinator/validation-authoring-context-service'
import {
  applyBlockingFeedback,
  approveImplementationGroups,
  approveImplementationCompletion,
  controlImplementation,
  reachImplementationCheckpoint,
  recordImplementationValidation,
  reconcileImplementationValidation,
  readImplementationValidationReadiness,
  reviewImplementationCompletion,
  startImplementationValidation,
  readImplementationLifecycleHealth,
  updateImplementationTask,
} from '@/services/coordinator/coordinator-implementation-service'
import {
  acceptBaseline,
  acknowledgeBaselineFailure,
  cancelBaselineExecution,
  justifyBaselineRegressionPass,
  reconcileBaselineExecution,
  retryBaselineAfterRepair,
  startBaselineExecution,
  startImplementation,
} from '@/services/coordinator/coordinator-baseline-service'
import { readPlanReviewSummary } from '@/services/plan-review/plan-review-service'
import { queryLocatorGraph, readLocatorGraphVisualProjection } from '@/services/locator-graph/locator-graph-service'
import { ServiceError } from '@/services/shared/errors'
import { coordinatorAcknowledgement, coordinatorAcknowledgementSchema } from '@/services/shared/errors'
import {
  completeCoordinatorOperation,
  prepareCoordinatorOperation,
  readCoordinatorOperationResult,
  recordCoordinatorOperationOutcome,
  resolveCoordinatorOperationFailure,
} from '@/services/coordinator/coordinator-operation-receipt-service'
import { coordinatorStepDefinitionService } from '@/services/coordinator/coordinator-step-definition-service'
import {
  coordinatorOperationRegistry,
  type CoordinatorOperationId,
} from '@/services/coordinator/coordinator-operation-registry'
import { enqueueRepositoryExport, runRepositoryExportJob } from '@/services/repository-export/repository-export-service'
import { submitDelegatedValidationAst } from '@/services/coordinator/delegated-validation-ast-service'
import {
  createDelegatedCoordinatorReceipt,
  DELEGATED_COORDINATOR_PERMISSIONS,
  delegatedCoordinatorClaimsSchema,
  readDelegatedCoordinatorReceipt,
  revokeDelegatedCoordinatorReceipt,
  verifyDelegatedCoordinatorReceipt,
} from '@/services/coordinator/delegated-coordinator-service'
import {
  abandonValidationResourceProposal,
  cleanupValidationResourceProposal,
  proposeValidationResources,
} from '@/services/coordinator/validation-resource-proposal-service'
import { reconcileManagedValidationReviewState } from '@/services/coordinator/managed-validation-review-state'
import {
  checkValidationAstForPlan,
  compileValidationAstForPlan,
  previewValidationAstForPlan,
  readValidationAstExtensionPolicyForPlan,
  readValidationAstExtensionReviewsForPlan,
} from '@/services/coordinator/validation-ast-operation-service'
import {
  createStandaloneTargetTestRun,
  diagnoseTestRunEvidence,
  preflightStandaloneTargetTestRun,
  readTestRunEvidenceSummary,
} from '@/services/test-run/test-run-service'
import {
  initializeTargetGitRepository,
  listTargetProjects,
  registerTargetProject,
  resolveTargetProject,
  writeTargetProjectMarker,
} from '@/services/target-project/target-project-service'
import { recordAgentPreflightReceipt } from '@/services/agent-preflight/agent-preflight-service'
import { projectLifecycleNotifications } from '@/lib/plans/plan-lifecycle-insights'
import { recordCoordinatorResponseMetric } from '@/services/coordinator/plan-observability-service'
import { recordCoordinatorFailureReceipt } from '@/services/coordinator/coordinator-failure-receipt-service'
import {
  answerQualityRequirementQueries,
  approveQualityRequirements,
  approveQualityValidationDesign,
  compileQualityValidations,
  createQualityAssessment,
  decideQualityAssessment,
  publishQualityValidations,
  proposeQualityValidationDesign,
  readQualityRequirementGraph,
  readQualityAssessment,
  submitQualityRequirementSource,
} from '@/services/coordinator/quality-design-service'
import { operationDescriptorSchema } from '../../../../../../packages/cucumber-runtime/src/operations/contracts'
import {
  stepDefinitionSchema,
  stepPublicationReceiptSchema,
} from '../../../../../../packages/cucumber-runtime/src/step-definitions/contracts'

export const runtime = 'nodejs'

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const routePlanIdSchema = planIdSchema
const astReviewBindingSchema = z.object({
  operationHash: z.string().startsWith('sha256:').optional(),
  reviewStateHash: z.string().startsWith('sha256:').optional(),
  extensionArtifactHashes: z.array(z.string().startsWith('sha256:')).optional(),
})
const reviewTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('plan') }),
  z.object({ type: z.literal('task'), taskId: idSchema }),
  z.object({ type: z.literal('validation'), validationId: idSchema }),
  z.object({ type: z.literal('result'), resultId: idSchema }),
  z.object({ type: z.literal('file'), path: z.string().min(1) }),
])
type RouteContext = { params: Promise<{ operation: string[] }> }

const validationReceiptOperationNames: Record<string, string> = {
  feedback: 'route_validation_feedback',
  submit: 'route_validation_review_submit',
  reconcile: 'route_validation_review_reconcile',
  nodes: 'route_validation_node_decide',
  files: 'route_validation_file_approve',
}

function validationReceiptOperationName(action: string | undefined, detail: string | undefined) {
  if (action === 'resources') return detail ? `route_validation_resources_${detail}` : undefined
  if (action === 'ast') return detail === 'compile' ? 'route_validation_ast_compile' : undefined
  return action ? validationReceiptOperationNames[action] : undefined
}

function routeReceiptOperationName(operation: string[]) {
  if (operation[0] !== 'plans') return undefined
  const lifecycle = operation[2]
  if (lifecycle === 'baseline' || lifecycle === 'implementation')
    return `route_${lifecycle}_${operation.slice(3).join('_')}`
  return lifecycle === 'validations' ? validationReceiptOperationName(operation[3], operation[4]) : undefined
}

function recordBody(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
}

function bodyPlanId(source: Record<string, unknown> | undefined) {
  if (typeof source?.planId === 'string') return source.planId
  const plan = recordBody(source?.plan)
  return typeof plan?.planId === 'string' ? plan.planId : undefined
}

function operationPlanId(operation: string[]) {
  return operation[0] === 'plans' ? operation[1] || undefined : undefined
}

function contextPlanId(operation: string[], source: Record<string, unknown> | undefined) {
  return operationPlanId(operation) ?? bodyPlanId(source)
}

function contextIdempotencyKey(request: Request, source: Record<string, unknown> | undefined) {
  const header = request.headers.get('idempotency-key')
  if (header !== null) return header
  return typeof source?.idempotencyKey === 'string' ? source.idempotencyKey : undefined
}

export function coordinatorErrorContext(request: Request, operation: string[], body?: unknown) {
  const source = recordBody(body)
  const operationName = routeReceiptOperationName(operation)
  const planId = contextPlanId(operation, source)
  const idempotencyKey = contextIdempotencyKey(request, source)
  return {
    operation: operation.join('/') || 'unknown',
    ...(operationName ? { operationName } : {}),
    ...(planId ? { planId } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
  }
}

async function responseError(error: unknown, context: ReturnType<typeof coordinatorErrorContext>): Promise<Response> {
  console.error('Coordinator API failed', error)
  const operationOutcome = await resolveCoordinatorOperationFailure(context).catch(() => undefined)
  const resolvedContext = operationOutcome ? { ...context, operationOutcome } : context
  const response =
    error instanceof z.ZodError ? zodCoordinatorError(error, resolvedContext) : coordinatorError(error, resolvedContext)
  await recordCoordinatorFailureReceipt(response.body).catch(receiptError =>
    console.warn('Coordinator failure receipt could not be persisted.', receiptError),
  )
  return Response.json(response.body, { status: response.status })
}

const coordinatorLinksSchema = z.object({ appraise: z.string(), browser: z.string().url(), route: z.string() }).strict()
const planLifecycleResponseSchema = z
  .object({ plan: planArtifactSchema, validation: validationArtifactSchema.optional() })
  .strict()
const planReadResponseSchema = z
  .object({
    planId: planIdSchema,
    plan: planArtifactSchema,
    slug: z.string().min(1),
    planContentHash: z.string().startsWith('sha256:'),
    planStateHash: z.string().startsWith('sha256:'),
    reviewBindingHash: z.string().startsWith('sha256:'),
    contentHash: z.string().startsWith('sha256:'),
    reviewUrl: z.string().min(1),
    links: coordinatorLinksSchema,
    legacyPlanId: planIdSchema.optional(),
    targetProjectId: z.string().uuid().optional(),
    validationIntegrity: z
      .object({
        status: z.enum(['green', 'not_applicable', 'integrity_blocked']),
        operationId: z.string().min(1).optional(),
        operationPhase: z.string().min(1).optional(),
        representations: z
          .object({
            planArtifact: z
              .object({ present: z.boolean(), lifecycle: z.string().optional(), hash: z.string().optional() })
              .strict(),
            projection: z
              .object({ present: z.boolean(), lifecycle: z.string().optional(), hash: z.string().optional() })
              .strict(),
            validationArtifact: z
              .object({ present: z.boolean(), lifecycle: z.string().optional(), hash: z.string().optional() })
              .strict(),
            reviewArtifact: z
              .object({ present: z.boolean(), lifecycle: z.string().optional(), hash: z.string().optional() })
              .strict(),
            reviewReadyEvent: z
              .object({ present: z.boolean(), lifecycle: z.string().optional(), hash: z.string().optional() })
              .strict(),
          })
          .strict(),
        mismatches: z.array(z.string()),
        retryable: z.boolean(),
        nextRepairAction: z.string().optional(),
        failure: z.unknown().optional(),
      })
      .strict(),
  })
  .strict()
const planCreateResponseSchema = z
  .object({
    plan: planArtifactSchema,
    planId: planIdSchema,
    slug: z.string().min(1),
    lifecycle: planArtifactSchema.shape.lifecycle,
    planContentHash: z.string().startsWith('sha256:'),
    planStateHash: z.string().startsWith('sha256:'),
    reviewBindingHash: z.string().startsWith('sha256:'),
    contentHash: z.string().startsWith('sha256:'),
    eventSequence: z.number().int().positive(),
    reviewUrl: z.string().min(1),
    links: coordinatorLinksSchema,
    legacyPlanId: planIdSchema.optional(),
    revision: z.number().int().positive(),
    hubProject: z.object({ fingerprint: z.string().min(1), canonicalPath: z.string().min(1) }).strict(),
    coordinatorProject: z.object({ fingerprint: z.string().min(1), canonicalPath: z.string().min(1) }).strict(),
    targetProject: z.unknown().optional(),
    source: z
      .object({ path: z.string().min(1), external: z.boolean(), warning: z.string().optional() })
      .strict()
      .optional(),
    warnings: z.array(z.string().min(1)).optional(),
  })
  .strict()
const reviewThreadSchema = z
  .object({
    id: idSchema,
    target: reviewTargetSchema,
    blocking: z.boolean(),
    status: z.string().min(1),
    latestBody: z.string().min(1).optional(),
    latestActor: z.string().min(1).optional(),
    latestCreatedAt: z.string().datetime({ offset: true }).optional(),
    events: z.array(
      z
        .object({
          id: idSchema,
          action: z.enum(['created', 'addressed', 'disputed', 'resolved', 'dismissed', 'downgraded']),
          actor: z.string().min(1),
          createdAt: z.string().datetime({ offset: true }),
          body: z.string().min(1).optional(),
        })
        .strict(),
    ),
    orphaned: z.boolean(),
  })
  .strict()
const planReviewResponseSchema = z
  .object({
    planId: planIdSchema,
    targetProjectId: z.string().uuid(),
    plan: z
      .object({
        revision: z.number().int().positive(),
        lifecycle: planArtifactSchema.shape.lifecycle,
        planContentHash: z.string().startsWith('sha256:'),
        planStateHash: z.string().startsWith('sha256:'),
        reviewBindingHash: z.string().startsWith('sha256:'),
        contentHash: z.string().startsWith('sha256:'),
      })
      .strict(),
    reviewHash: z.string().startsWith('sha256:'),
    blockingThreads: z.array(reviewThreadSchema),
    nonBlockingThreads: z.array(reviewThreadSchema),
    orphanedThreadIds: z.array(z.string()),
    links: coordinatorLinksSchema,
    recovery: z.object({ changesRequested: z.string().min(1), revise: z.string().min(1) }).strict(),
  })
  .strict()
const planEventsResponseSchema = z
  .object({
    events: z.array(
      z
        .object({
          id: z.string().uuid(),
          planId: planIdSchema,
          sequence: z.number().int().positive(),
          type: z.string().min(1),
          payload: z.unknown(),
          previousStateHash: z.string().startsWith('sha256:').nullable(),
          stateHash: z.string().startsWith('sha256:').nullable(),
          planContentHash: z.string().startsWith('sha256:').nullable(),
          revision: z.number().int().positive().nullable(),
          actor: z.string().min(1).nullable(),
          acknowledgedAt: z.coerce.date().nullable(),
          supersededAt: z.coerce.date().nullable(),
          createdAt: z.coerce.date(),
        })
        .strict(),
    ),
    notifications: z.array(
      z
        .object({
          eventSequence: z.number().int().positive(),
          kind: z.string().min(1),
          actor: z.enum(['Agent', 'Reviewer']),
          message: z.string().min(1),
          severity: z.enum(['info', 'warning', 'action']),
          createdAt: z.coerce.date(),
        })
        .strict(),
    ),
  })
  .strict()
const planEventRecordSchema = z
  .object({
    id: z.string().min(1),
    planProjectionId: z.string().min(1),
    sequence: z.number().int().positive(),
    type: z.string().min(1),
    payloadJson: z.string().nullable(),
    createdAt: z.coerce.date(),
    acknowledgedAt: z.coerce.date().nullable(),
    acknowledgedBy: z.string().nullable(),
  })
  .strict()
const planEventAcknowledgementResponseSchema = z.union([
  planEventRecordSchema,
  z
    .object({
      acknowledgedThroughSequence: z.number().int().positive(),
      acknowledgedCount: z.number().int().nonnegative(),
      acknowledgedAt: z.coerce.date(),
    })
    .strict(),
])

const coordinatorJsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.boolean(),
    z.number().finite(),
    z.array(coordinatorJsonValueSchema),
    z.record(z.string(), coordinatorJsonValueSchema),
  ]),
)
// Plan-lifecycle responses are intentionally projected, rather than exposing a
// service object as an implicit wire contract.  Keep these schemas narrow and
// strict: callers should be able to rely on a rejected response when a new
// service field is accidentally returned without an API contract decision.
const coordinatorHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const coordinatorDateSchema = z.string().datetime({ offset: true })
const lifecycleSchema = planArtifactSchema.shape.lifecycle
const readinessSchema = z
  .object({
    ready: z.boolean(),
    runState: z.enum(['active', 'passed', 'failed', 'not_started']).optional(),
    blockers: z.array(z.string()),
    activeRunIds: z.array(idSchema).optional(),
  })
  .strict()
const implementationStateSchema = z
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
        reachedAt: coordinatorDateSchema,
      })
      .optional(),
    validationRuns: z.array(implementationValidationRunSchema),
    commits: z.array(
      z
        .object({ hash: z.string().min(1), taskIds: z.array(idSchema).min(1), createdAt: coordinatorDateSchema })
        .strict(),
    ),
    reconciliationReceipts: z.array(
      z
        .object({
          idempotencyKey: z.string().min(1),
          runIds: z.array(idSchema),
          verifiedTaskIds: z.array(idSchema),
          reconciledAt: coordinatorDateSchema,
        })
        .strict(),
    ),
    evidenceProtected: z.boolean(),
  })
  .strict()
const nextActionSchema = z.object({ tool: z.string().min(1), reason: z.string().min(1) }).strict()
const planHealthResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    planId: planIdSchema,
    lifecycle: lifecycleSchema,
    healthy: z.boolean(),
    readiness: readinessSchema,
    blockers: z.array(z.string()),
    activeImplementationRunIds: z.array(idSchema),
    activeBaselineAttemptIds: z.array(idSchema),
    legalNextAction: nextActionSchema,
    issues: z.array(
      z
        .object({
          code: z.string().min(1),
          recoveryAction: z.string().min(1),
          runId: idSchema.optional(),
          attemptId: idSchema.optional(),
        })
        .strict(),
    ),
    finalSignOffId: idSchema.optional(),
    evidenceProtected: z.boolean(),
    managedRunCount: z.number().int().nonnegative(),
    implementationRunCount: z.number().int().nonnegative(),
    baselineRunCount: z.number().int().nonnegative(),
  })
  .strict()
const completionReceiptSchema = z
  .object({
    plan: z
      .object({
        planId: planIdSchema,
        revision: z.number().int().positive(),
        lifecycle: lifecycleSchema,
        hash: coordinatorHashSchema,
      })
      .strict(),
    validation: z
      .object({
        revision: z.number().int().positive(),
        hash: coordinatorHashSchema,
        requiredValidationIds: z.array(idSchema),
        publicationIds: z.array(z.string().min(1)),
        decisionReceiptHashes: z.array(coordinatorHashSchema),
      })
      .strict(),
    readiness: readinessSchema,
    tasks: z.array(
      z.object({ taskId: idSchema, status: z.enum(['pending', 'in_progress', 'implemented', 'verified']) }).strict(),
    ),
    commits: z.array(
      z
        .object({ hash: z.string().min(1), taskIds: z.array(idSchema).min(1), createdAt: coordinatorDateSchema })
        .strict(),
    ),
    validationRuns: z.array(implementationValidationRunSchema),
    repositoryExport: z
      .object({
        policy: z.string().min(1),
        state: z.string().min(1),
        validationHash: coordinatorHashSchema.optional(),
        receiptManifestHash: coordinatorHashSchema.nullable().optional(),
      })
      .strict(),
    structuredBlockers: z.array(
      z
        .object({
          blocker: z.string().min(1),
          nextMcpAction: z.string().min(1),
          requiredInput: z
            .object({
              planId: planIdSchema,
              taskId: idSchema.optional(),
              status: z.enum(['pending', 'in_progress', 'implemented', 'verified']).optional(),
              type: z
                .enum([
                  'before_task',
                  'after_task',
                  'before_group',
                  'after_group',
                  'before_validation',
                  'before_completion',
                ])
                .optional(),
              validationIds: z.array(idSchema).optional(),
              commitHash: z.string().min(1).optional(),
            })
            .strict(),
        })
        .strict(),
    ),
    optionalFailures: z.array(implementationValidationRunSchema),
    acknowledgedFailures: z.array(implementationValidationRunSchema),
    blockingRemarks: z.array(
      z
        .object({
          id: idSchema,
          target: reviewTargetSchema,
          blocking: z.boolean(),
          events: z.array(
            z
              .object({
                id: idSchema,
                action: z.string(),
                actor: z.string().min(1),
                createdAt: coordinatorDateSchema,
                body: z.string().min(1).optional(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    nonBlockingRemarks: z.array(
      z
        .object({
          id: idSchema,
          target: reviewTargetSchema,
          blocking: z.boolean(),
          events: z.array(
            z
              .object({
                id: idSchema,
                action: z.string(),
                actor: z.string().min(1),
                createdAt: coordinatorDateSchema,
                body: z.string().min(1).optional(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    finalSignOff: z
      .object({
        id: idSchema,
        revision: z.number().int().positive(),
        contentHash: coordinatorHashSchema,
        relevantHashes: z.record(z.string(), coordinatorHashSchema),
        approvedBy: z.string().min(1),
        approvedAt: coordinatorDateSchema,
      })
      .strict()
      .optional(),
    eventSequence: z.number().int().nonnegative(),
    evidenceHash: coordinatorHashSchema,
    efficiencyTelemetry: z
      .object({
        retained: z.number().int().nonnegative(),
        phases: z.array(
          z
            .object({
              phase: z.string().min(1),
              durationMs: z.number().nonnegative(),
              waitMs: z.number().nonnegative(),
              retries: z.number().int().nonnegative(),
              toolCalls: z.number().int().nonnegative(),
              responseBytes: z.number().int().nonnegative(),
              recoveryCost: z.number().nonnegative(),
              estimatedTokens: z.number().int().nonnegative(),
            })
            .strict(),
        ),
        capturedAtEventSequence: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
const validationDecisionResponseSchema = z
  .object({
    validationId: idSchema,
    decision: z.enum(['approved', 'rejected', 'deferred']),
    contentHash: coordinatorHashSchema,
    decidedBy: z.string().min(1),
    decidedAt: coordinatorDateSchema,
    reviewBinding: z
      .object({
        operationId: z.string().min(1),
        operationHash: coordinatorHashSchema,
        reviewStateHash: coordinatorHashSchema,
        extensionArtifactHashes: z.array(coordinatorHashSchema),
      })
      .strict(),
  })
  .strict()
const validationFileApprovalResponseSchema = z
  .object({
    path: z.string().min(1),
    contentHash: coordinatorHashSchema,
    approvedBy: z.string().min(1),
    approvedAt: coordinatorDateSchema,
  })
  .strict()
const validationReviewStateResponseSchema = z
  .object({ operationId: z.string().min(1), reviewStateHash: coordinatorHashSchema })
  .strict()
const validationResourceBaseSchema = z
  .object({
    schemaVersion: z.literal(2),
    planId: planIdSchema,
    targetProjectId: z.string().min(1),
    proposalHash: coordinatorHashSchema,
    ids: z.record(z.string(), z.record(z.string(), z.string().min(1))),
    bindings: z.record(z.string(), z.array(z.record(z.string(), coordinatorJsonValueSchema))),
  })
  .strict()
const validationResourceResultSchema = z.union([
  validationResourceBaseSchema
    .extend({ replayed: z.boolean(), contextHash: coordinatorHashSchema, nextRecommendedAction: z.string().min(1) })
    .strict(),
  validationResourceBaseSchema
    .extend({ status: z.literal('abandoned'), abandonedAt: coordinatorDateSchema, abandonReason: z.string().min(1) })
    .strict(),
  validationResourceBaseSchema
    .extend({
      status: z.literal('cleaned'),
      cleanedAt: coordinatorDateSchema,
      cleaned: z.array(z.object({ entityType: z.string().min(1), entityId: z.string().min(1) }).strict()),
      retained: z.array(z.object({ entityType: z.string().min(1), entityId: z.string().min(1) }).strict()),
    })
    .strict(),
])
const validationReadPlanSchema = z
  .object({
    planId: planIdSchema,
    revision: z.number().int().positive(),
    lifecycle: lifecycleSchema,
    sourceHash: coordinatorHashSchema.optional(),
    tasks: z
      .array(
        z
          .object({
            id: idSchema,
            title: z.string().min(1),
            description: z.string().min(1),
            acceptanceCriteria: z.array(z.string().min(1)).min(1),
            validationIntent: z.string().min(1),
          })
          .strict(),
      )
      .optional(),
    projectedTasks: z
      .array(
        z
          .object({
            taskId: idSchema,
            title: z.string().min(1),
            description: z.string().min(1),
            validationIntent: z.string().min(1),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
const validationTargetProjectSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    canonicalPath: z.string().min(1),
    fingerprint: z.string().min(1),
  })
  .strict()
const validationRecipeSchema = z
  .object({
    id: z.string().min(1),
    intent: z.string().min(1),
    stepIds: z.array(z.string().min(1)),
    resourceHint: z.string().min(1),
  })
  .strict()
const validationResolvedStepSchema = z
  .object({
    step: z.unknown(),
    title: z.string().min(1),
    description: z.string().min(1),
    rank: z.number().int().positive(),
    score: z.number(),
    confidence: z.number().min(0).max(1),
    parameterCompatibility: z.number().min(0).max(1),
    explanation: z.string().min(1),
  })
  .strict()
const validationAuthoringSchema = z
  .object({
    contextPack: z
      .object({
        schemaVersion: z.literal('2'),
        approvedIntent: z.object({ goal: z.string(), description: z.string() }).strict(),
        constraints: z.array(z.unknown()),
        requirementIds: z.array(z.string()),
        tasks: z.array(z.object({ id: idSchema, title: z.string(), validationIntent: z.string() }).strict()),
        targetProject: validationTargetProjectSchema.nullable(),
        reusableResourceSummary: z.record(z.string(), z.number().int().nonnegative()),
      })
      .strict(),
    coverageExplorer: z
      .object({
        taskCoverage: z.array(z.unknown()),
        requirementCoverage: z.array(z.unknown()),
        selectedRuntime: z.unknown().nullable(),
        uncoveredIntentCount: z.number().int().nonnegative(),
      })
      .strict(),
    astStarter: z
      .object({
        editable: z.boolean(),
        semanticOwner: z.literal('agent'),
        readiness: z.unknown(),
        submission: z.unknown().nullable(),
        reason: z.string().min(1).nullable(),
      })
      .strict(),
    astExchange: z
      .object({
        mediaType: z.literal('application/vnd.appraise.validation-ast+json;version=2'),
        contentHash: coordinatorHashSchema,
        canonicalJson: z.string(),
        importTool: z.literal('validation_ast_check'),
      })
      .strict()
      .nullable(),
    recipes: z.array(validationRecipeSchema),
    runtimePreparationProposal: z
      .object({
        status: z.enum(['review_required', 'ready']),
        targetWorkspaceMutation: z.literal('none'),
        changes: z.array(
          z
            .object({
              kind: z.literal('register_environment'),
              owner: z.literal('user_or_agent_after_review'),
              target: z.string(),
              targetFilesChanged: z.literal(false),
              reason: z.string(),
            })
            .strict(),
        ),
        nextAllowedAction: z.string().min(1),
      })
      .strict(),
    resourceProposalContract: z.unknown(),
  })
  .strict()
const validationResolverResponseSchema = z
  .object({
    discoveryKind: z.literal('ready-step-definition'),
    intent: z.string().min(1),
    threshold: z.number().min(0).max(1),
    selected: validationResolvedStepSchema.nullable(),
    recommendedStep: validationResolvedStepSchema.nullable(),
    steps: z.array(validationResolvedStepSchema),
    metrics: z
      .object({
        resolverCalls: z.number().int().positive(),
        fallbackRequired: z.boolean(),
        selectedRank: z.number().int().positive().nullable(),
        candidatesConsidered: z.number().int().nonnegative(),
        returnedCandidates: z.number().int().nonnegative(),
        durationMs: z.number().nonnegative(),
      })
      .strict(),
    nextRecommendedAction: z.string().min(1),
  })
  .strict()
const validationContextResponseSchema = z.union([
  z
    .object({ plan: validationReadPlanSchema, contextHash: coordinatorHashSchema, notModified: z.literal(true) })
    .strict(),
  validationResolverResponseSchema,
  z
    .object({
      plan: validationReadPlanSchema,
      targetProject: validationTargetProjectSchema.nullable(),
      contextHash: coordinatorHashSchema,
      resources: z.record(z.string(), z.array(z.unknown())).optional(),
      authoring: validationAuthoringSchema,
      proposalSchemas: z.array(z.string().min(1)).optional(),
      nextRecommendedAction: z.string().min(1),
    })
    .strict(),
])
const validationAstCheckResponseSchema = z
  .object({
    valid: z.boolean(),
    blockers: z.array(z.unknown()),
    warnings: z.array(z.unknown()),
    submission: z.unknown(),
    extensionPolicy: z.unknown(),
    resolved: z.unknown(),
    contextHash: coordinatorHashSchema,
  })
  .strict()
const validationAstResponseSchema = validationAstCheckResponseSchema
  .extend({
    expectedPlanHash: coordinatorHashSchema.optional(),
    authoringProfile: z.unknown().nullable().optional(),
    astHash: coordinatorHashSchema.optional(),
    entities: z.array(z.unknown()).optional(),
    operations: z.array(z.unknown()).optional(),
    locators: z.array(z.unknown()).optional(),
    customExtensions: z.array(z.unknown()).optional(),
    gherkin: z.array(z.unknown()).optional(),
    canonicalProjection: z.unknown().optional(),
    commandReceipt: z.unknown().optional(),
    previewHash: coordinatorHashSchema.optional(),
    baseProjectionHash: coordinatorHashSchema.optional(),
    receiptHash: coordinatorHashSchema.optional(),
    publishOperationId: z.string().min(1).optional(),
    runtimeInputJson: z.string().optional(),
    runtimeInputHash: coordinatorHashSchema.optional(),
  })
  .strict()
const validationWriteResponseSchema = z.union([
  validationAstResponseSchema,
  z.object({ plan: planArtifactSchema, review: reviewArtifactSchema, validation: validationArtifactSchema }).strict(),
  z.object({ plan: planArtifactSchema, validation: validationArtifactSchema }).strict(),
  validationDecisionResponseSchema,
  validationFileApprovalResponseSchema,
  validationReviewStateResponseSchema,
  validationResourceResultSchema,
  z
    .object({
      id: z.string().min(1),
      planId: planIdSchema,
      phase: z.enum(['prepared', 'artifacts_written', 'projected', 'review_ready', 'failed']),
      operationHash: coordinatorHashSchema,
      reviewStateHash: coordinatorHashSchema.nullable().optional(),
      projectionHash: coordinatorHashSchema,
      receiptHash: coordinatorHashSchema,
      validationHash: coordinatorHashSchema,
      planHash: coordinatorHashSchema,
      reviewHash: coordinatorHashSchema,
      astId: idSchema,
      astHash: coordinatorHashSchema,
      contextHash: coordinatorHashSchema,
      previewHash: coordinatorHashSchema,
      createdAt: coordinatorDateSchema,
      updatedAt: coordinatorDateSchema,
    })
    .strict(),
])

function projectValidationAstPublishOperation(value: unknown) {
  const operation = value as {
    id: string
    planId: string
    phase: 'prepared' | 'artifacts_written' | 'projected' | 'review_ready' | 'failed'
    operationHash: string
    reviewStateHash?: string | null
    projectionHash: string
    receiptHash: string
    validationHash: string
    planHash: string
    reviewHash: string
    astId: string
    astHash: string
    contextHash: string
    previewHash: string
    createdAt: Date | string
    updatedAt: Date | string
  }
  return {
    id: operation.id,
    planId: operation.planId,
    phase: operation.phase,
    operationHash: operation.operationHash,
    reviewStateHash: operation.reviewStateHash ?? null,
    projectionHash: operation.projectionHash,
    receiptHash: operation.receiptHash,
    validationHash: operation.validationHash,
    planHash: operation.planHash,
    reviewHash: operation.reviewHash,
    astId: operation.astId,
    astHash: operation.astHash,
    contextHash: operation.contextHash,
    previewHash: operation.previewHash,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
  }
}
const implementationMutationResponseSchema = z.union([
  planArtifactSchema,
  implementationStateSchema,
  z
    .object({
      checkpoint: implementationStateSchema.shape.checkpoint.unwrap(),
      runnableTaskIds: z.array(idSchema),
      structuredBlockers: z.array(
        z
          .object({
            taskId: idSchema,
            kind: z.string().min(1),
            dependencyTaskIds: z.array(idSchema),
            state: z.enum(['pending', 'in_progress', 'implemented', 'verified']),
            recovery: z
              .object({ tool: z.string().min(1), arguments: z.record(z.string(), coordinatorJsonValueSchema) })
              .strict(),
          })
          .strict(),
      ),
    })
    .strict(),
  z.object({ implementation: implementationStateSchema, runnableTaskIds: z.array(idSchema) }).strict(),
  z
    .object({
      confirmationRequired: z.literal(true),
      impact: z
        .object({
          affectedTaskIds: z.array(idSchema),
          transitiveDependentIds: z.array(idSchema),
          impactedValidationIds: z.array(idSchema),
          approvalsRequiringConfirmation: z.array(idSchema),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      confirmationRequired: z.literal(false),
      impact: z
        .object({
          affectedTaskIds: z.array(idSchema),
          transitiveDependentIds: z.array(idSchema),
          impactedValidationIds: z.array(idSchema),
          approvalsRequiringConfirmation: z.array(idSchema),
        })
        .strict(),
      plan: planArtifactSchema,
      implementation: implementationStateSchema,
    })
    .strict(),
  z.object({ plan: planArtifactSchema, validation: validationArtifactSchema, readiness: readinessSchema }).strict(),
  z
    .object({
      plan: planArtifactSchema,
      validation: validationArtifactSchema,
      runs: z.array(implementationValidationRunSchema),
      capsuleStartOutcomes: z.array(
        z
          .object({
            testRunDbId: z.string().min(1),
            status: z.enum(['started', 'infrastructure_failure']),
            attemptId: z.string().min(1).optional(),
            code: z.string().min(1).optional(),
            message: z.string().min(1).optional(),
          })
          .strict(),
      ),
      reused: z.boolean(),
    })
    .strict(),
  z
    .object({
      status: z.literal('pending_unchanged'),
      activeRunIds: z.array(idSchema),
      pollAfterMs: z.number().int().positive(),
      nextAction: z
        .object({
          tool: z.literal('implementation_validation_reconcile'),
          arguments: z.object({ planId: planIdSchema, runIds: z.array(idSchema) }).strict(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      plan: planArtifactSchema,
      validation: validationArtifactSchema,
      readiness: readinessSchema,
      receipt: z
        .object({
          idempotencyKey: z.string().min(1),
          runIds: z.array(idSchema),
          verifiedTaskIds: z.array(idSchema),
          reconciledAt: coordinatorDateSchema,
        })
        .strict()
        .optional(),
    })
    .strict(),
  z.object({ plan: planArtifactSchema, review: reviewArtifactSchema, validation: validationArtifactSchema }).strict(),
])
const projectIdentitySchema = z.object({ fingerprint: z.string().min(1), canonicalPath: z.string().min(1) }).strict()
const diagnosticResponseSchema = z
  .object({
    ok: z.literal(true),
    hubProject: projectIdentitySchema,
    project: projectIdentitySchema,
    targetProjects: z.array(z.unknown()),
    contractVersion: z.string().min(1),
    checks: z.array(z.object({ id: z.string().min(1), status: z.literal('ok'), message: z.string().min(1) }).strict()),
    warnings: z.array(z.unknown()),
    recoveryActions: z.array(z.unknown()),
    links: z.object({ application: z.string().url() }).strict(),
  })
  .strict()
const targetProjectWriteResponseSchema = z
  .object({
    targetProject: z.unknown(),
    git: z
      .object({
        status: z.enum(['initialized', 'already_present', 'skipped']),
        branch: z.string().optional(),
        warning: z.string().optional(),
      })
      .strict(),
    marker: z
      .object({
        status: z.enum(['written', 'refreshed', 'skipped']),
        path: z.string().min(1),
        warning: z.string().optional(),
      })
      .strict(),
  })
  .strict()
const targetProjectResponseSchema = z
  .object({
    id: z.string().uuid(),
    canonicalPath: z.string().min(1),
    displayName: z.string().min(1),
    description: z.string().nullable(),
    packageName: z.string().nullable(),
    packageManager: z.string().nullable(),
    packageJson: z.string().nullable(),
    fingerprint: z.string().startsWith('sha256:'),
    lastDetectedAt: coordinatorDateSchema,
    createdAt: coordinatorDateSchema,
    updatedAt: coordinatorDateSchema,
  })
  .strict()
const standaloneTestRunResponseSchema = z
  .object({
    runId: z.string().min(1),
    id: z.string().min(1),
    targetProjectId: z.string().uuid(),
    testRunPageId: z.string().min(1),
    executionRunId: z.string().min(1),
    reportUrl: z.string().min(1),
    logsUrl: z.string().min(1),
    evidenceHealth: z.string().min(1),
    nextAllowedAction: z.object({ tool: z.string().min(1), reason: z.string().min(1) }).strict(),
  })
  .strict()
const testRunPreflightResponseSchema = z
  .object({
    status: z.enum(['blocked', 'ready']),
    evidenceHealth: z.enum(['invalid_stale_runtime', 'valid']),
    blockers: z.array(z.string()),
    warnings: z.array(z.string()),
    nextAllowedAction: z
      .object({ tool: z.enum(['test_run_preflight', 'test_run']), reason: z.string().min(1) })
      .strict(),
  })
  .strict()
const delegatedCoordinatorClaimsResponseSchema = delegatedCoordinatorClaimsSchema
const delegatedCoordinatorReceiptResponseSchema = z
  .object({
    claims: delegatedCoordinatorClaimsResponseSchema,
    signature: z.string().regex(/^hmac-sha256:[a-f0-9]{64}$/),
  })
  .strict()
const delegatedCoordinatorStoredReceiptSchema = z
  .object({
    id: z.string().uuid(),
    parentCoordinatorId: z.string().min(1),
    delegatedCoordinatorId: z.string().min(1),
    targetProjectId: z.string().nullable(),
    targetFingerprint: coordinatorHashSchema,
    pathFingerprint: coordinatorHashSchema,
    purpose: z.string().min(1),
    permissionsJson: z.string(),
    prohibitionsJson: z.string(),
    briefOrPlanHash: coordinatorHashSchema.nullable(),
    nonce: z.string().min(32),
    receiptJson: z.string(),
    issuedAt: coordinatorDateSchema,
    expiresAt: coordinatorDateSchema,
    revokedAt: coordinatorDateSchema.nullable(),
    revokedBy: z.string().nullable(),
    revocationReason: z.string().nullable(),
    permissions: z.array(z.enum(DELEGATED_COORDINATOR_PERMISSIONS)),
    prohibitions: z.array(z.string()),
    consumptions: z.array(
      z
        .object({
          id: z.string().uuid(),
          receiptId: z.string().uuid(),
          permission: z.string().min(1),
          operationKey: z.string().min(1),
          consumedAt: coordinatorDateSchema,
        })
        .strict(),
    ),
  })
  .strict()
const testRunEvidenceSummaryResponseSchema = z
  .object({
    testRunPageId: z.string().min(1),
    executionRunId: z.string().min(1),
    planId: planIdSchema.nullable(),
    validationId: idSchema.nullable().optional(),
    reportUrl: z.string().min(1),
    logsUrl: z.string().min(1),
    evidenceHealth: z.enum([
      'valid',
      'invalid_empty_run',
      'invalid_missing_test_cases',
      'invalid_missing_report',
      'invalid_placeholder_binary',
      'invalid_unmatched_scenarios',
      'invalid_stale_runtime',
      'infrastructure_failure',
    ]),
    grade: z.enum(['valid', 'invalid', 'infrastructure_failure', 'pending']),
    nextAllowedAction: z
      .object({
        tool: z.enum([
          'test_run_read',
          'test_run_diagnose',
          'test_run_preflight',
          'implementation_validation_reconcile',
        ]),
        reason: z.string().min(1),
      })
      .strict(),
    counts: z
      .object({
        expectedTestCases: z.number().int().nonnegative(),
        features: z.number().int().nonnegative(),
        scenarios: z.number().int().nonnegative(),
        steps: z.number().int().nonnegative(),
        hooks: z.number().int().nonnegative(),
        matchedScenarios: z.number().int().nonnegative(),
        unmatchedScenarios: z.number().int().nonnegative(),
        unexecutedExpectedTestCases: z.number().int().nonnegative(),
      })
      .strict(),
    blockers: z.array(z.string()),
    missingArtifacts: z.array(z.string()),
    failureSignatures: z.array(z.string()),
    logExcerpt: z.array(z.string()),
    completed: z.boolean(),
  })
  .strict()
const testRunEvidenceResponseSchema = z.union([
  testRunEvidenceSummaryResponseSchema,
  z.object({ kind: z.literal('capsule'), diagnostic: runtimeCapsuleDiagnosticV1Schema }).strict(),
  z.object({ kind: z.literal('manual'), evidence: z.object({}).strict() }).strict(),
])
const operationListItemResponseSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    categories: z.array(z.string().min(1)),
    capabilities: z.array(z.string().min(1)),
    runtime: z.enum(['browser', 'api', 'node', 'database']),
    deprecated: z.boolean(),
    descriptorHash: coordinatorHashSchema,
    humanSurface: z.enum(['supported', 'exception']),
    agentSurface: z.enum(['supported', 'exception']),
  })
  .strict()
const operationRankingResponseSchema = operationListItemResponseSchema
  .extend({
    displayName: z.string().min(1),
    canonicalRef: z.string().min(1),
    agentOperation: z.object({ id: z.string().min(1), version: z.string().min(1), ref: z.string().min(1) }).strict(),
    humanStep: z
      .object({
        name: z.string().min(1),
        description: z.string().optional(),
        signature: z.string().min(1),
        groupName: z.string().min(1),
      })
      .strict()
      .nullable(),
    score: z.number(),
    matchedTerms: z.array(z.string()),
    matchedAlias: z.string().nullable(),
    parameterCompatibility: z.number().min(0).max(1),
    missingRequiredBindings: z.array(z.object({ name: z.string().min(1), type: z.string().min(1) }).strict()),
    explanation: z.string().min(1),
  })
  .strict()
const operationsResponseSchema = z.union([
  z
    .object({ status: z.literal('unchanged'), manifestHash: coordinatorHashSchema, categories: z.array(z.never()) })
    .strict(),
  z
    .object({
      status: z.literal('current'),
      manifestHash: coordinatorHashSchema,
      categories: z.array(z.object({ id: z.string().min(1), operationCount: z.number().int().nonnegative() }).strict()),
    })
    .strict(),
  z.object({ manifestHash: coordinatorHashSchema, operations: z.array(operationDescriptorSchema) }).strict(),
  z
    .object({
      status: z.union([z.literal('current'), z.literal('unchanged')]),
      manifestHash: coordinatorHashSchema,
      items: z.array(operationListItemResponseSchema),
      nextCursor: z.number().int().nonnegative().nullable(),
    })
    .strict(),
  z
    .object({
      discoveryKind: z.literal('combined-step'),
      manifestHash: coordinatorHashSchema,
      query: z.string().min(1),
      recommended: operationRankingResponseSchema.nullable(),
      recommendedStep: operationRankingResponseSchema.nullable(),
      alternatives: z.array(operationRankingResponseSchema),
      steps: z.array(operationRankingResponseSchema),
      nextRecommendedAction: z.string().min(1),
    })
    .strict(),
])
// Step definition drafts and artifacts are authored, versioned documents. Their
// contents are intentionally opaque here; their dedicated service validates the
// nested document before this transport boundary is reached.
const stepDefinitionDraftResponseSchema = z
  .object({
    id: z.string().uuid(),
    proposedStepId: z.string().min(1),
    proposedVersion: z.string().min(1),
    revision: z.number().int().positive(),
    draftJson: z.string(),
    draftHash: coordinatorHashSchema,
    reuseJustification: z.string().nullable(),
    reuseEvidenceJson: z.string().nullable(),
    validationReportJson: z.string().nullable(),
    reviewedDraftHash: coordinatorHashSchema.nullable(),
    reviewedBy: z.string().nullable(),
    reviewedAt: coordinatorDateSchema.nullable(),
    reviewReceiptJson: z.string().nullable(),
    reviewReceiptHash: coordinatorHashSchema.nullable(),
    createdAt: coordinatorDateSchema,
    updatedAt: coordinatorDateSchema,
    definition: z.unknown(),
  })
  .strict()
const stepDefinitionSearchResponseSchema = z
  .object({
    reuseEvidence: z
      .object({
        indexHash: coordinatorHashSchema,
        searchedAt: coordinatorDateSchema,
        correlationId: z.string().min(1),
        planId: planIdSchema.optional(),
        candidateReferences: z.array(z.object({ id: z.string().min(1), version: z.string().min(1) }).strict()),
        receiptId: z.string().uuid(),
      })
      .strict(),
    matches: z.array(
      z
        .object({
          step: z
            .object({
              id: z.string().min(1),
              version: z.string().min(1),
              definitionHash: coordinatorHashSchema,
            })
            .strict(),
          title: z.string().min(1),
          description: z.string().min(1),
          human: z.unknown(),
          agent: z.unknown(),
          inputs: z.array(z.unknown()),
          outputs: z.array(z.unknown()),
          executionReadiness: z.literal('ready'),
          hashes: z
            .object({
              definition: coordinatorHashSchema,
              humanProjection: coordinatorHashSchema,
              agentContract: coordinatorHashSchema,
              execution: coordinatorHashSchema,
            })
            .strict(),
          rank: z.number().int().positive(),
          confidence: z.number().min(0).max(1),
          parameterCompatibility: z.number().min(0).max(1),
          explanation: z.string().min(1),
        })
        .strict(),
    ),
    nextRecommendedAction: z.string().min(1),
  })
  .strict()
const stepDefinitionResponseSchema = z.union([
  stepDefinitionSearchResponseSchema,
  stepDefinitionDraftResponseSchema,
  z.object({ draftId: z.string().uuid(), deleted: z.literal(true) }).strict(),
  z.object({ definition: stepDefinitionSchema }).strict(),
  z.object({ receipt: stepPublicationReceiptSchema }).strict(),
])
const locatorGraphResponseSchema = z.union([
  locatorGraphPageSchema,
  locatorGraphSchema,
  z
    .object({
      graphHash: coordinatorHashSchema,
      nodes: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), type: z.string().min(1) }).strict()),
      edges: z.array(
        z
          .object({
            id: z.string().min(1),
            source: z.string().min(1),
            target: z.string().min(1),
            label: z.string().min(1),
          })
          .strict(),
      ),
    })
    .strict(),
])
// Provider capability, run event, and repository snapshots are versioned JSON
// payloads owned by provider adapters. The envelope fields remain strict while
// those intentionally polymorphic payloads retain their documented JSON shape.
const providerRegistrationResponseSchema = z
  .object({
    id: z.string().uuid(),
    key: z.string().min(1),
    displayName: z.string().min(1),
    providerKind: z.string().min(1),
    adapterVersion: z.string().min(1),
    capabilitiesJson: z.string(),
    enabled: z.boolean(),
    executablePath: z.string().nullable(),
    detectedVersion: z.string().nullable(),
    probeStatus: z.string().min(1),
    probeMessage: z.string().nullable(),
    lastProbedAt: coordinatorDateSchema.nullable(),
    defaultProfile: z.string().nullable(),
    defaultModel: z.string().nullable(),
    launchEnabled: z.boolean(),
    settingsJson: z.string().nullable(),
    createdAt: coordinatorDateSchema,
    updatedAt: coordinatorDateSchema,
  })
  .strict()
const providerRegistrationListItemSchema = providerRegistrationResponseSchema
  .extend({
    capabilities: coordinatorJsonValueSchema.nullable(),
    settings: coordinatorJsonValueSchema.nullable(),
    launchable: z.boolean(),
  })
  .strict()
const providerEventResponseSchema = z
  .object({
    id: z.string().uuid(),
    runId: z.string().uuid(),
    sequence: z.number().int().nonnegative(),
    type: z.string().min(1),
    payloadJson: z.string().nullable(),
    stream: z.string().nullable(),
    createdAt: coordinatorDateSchema,
    payload: coordinatorJsonValueSchema.nullable(),
  })
  .strict()
const providerPermissionDecisionResponseSchema = z
  .object({
    id: z.string().uuid(),
    runId: z.string().uuid(),
    requestId: z.string().min(1),
    decision: z.enum(['approved', 'denied']),
    riskTier: z.string().min(1),
    requestedScope: z.string().min(1),
    payloadJson: z.string(),
    reason: z.string().nullable(),
    decidedBy: z.string().min(1),
    decidedAt: coordinatorDateSchema,
    payload: coordinatorJsonValueSchema.optional(),
  })
  .strict()
const providerArtifactSnapshotResponseSchema = z
  .object({
    id: z.string().uuid(),
    runId: z.string().uuid(),
    path: z.string().min(1),
    kind: z.string().min(1),
    hash: z.string().nullable(),
    metadataJson: z.string().nullable(),
    capturedAt: coordinatorDateSchema,
    metadata: coordinatorJsonValueSchema.nullable().optional(),
  })
  .strict()
const providerPlanResponseSchema = z
  .object({
    id: z.string().uuid(),
    planId: planIdSchema,
    slug: z.string(),
    legacyPlanId: z.string().nullable(),
    revision: z.number().int().positive(),
    lifecycle: lifecycleSchema,
    goal: z.string(),
    description: z.string(),
    sourceHash: coordinatorHashSchema,
    planContentHash: coordinatorHashSchema,
    planStateHash: coordinatorHashSchema,
    reviewBindingHash: coordinatorHashSchema,
    planPath: z.string(),
    reviewJson: z.string().nullable(),
    validationJson: z.string().nullable(),
    layoutJson: z.string().nullable(),
    stale: z.boolean(),
    conflicted: z.boolean(),
    deletedAt: coordinatorDateSchema.nullable(),
    lastValidProjectedAt: coordinatorDateSchema,
    lastSyncAt: coordinatorDateSchema,
    createdAt: coordinatorDateSchema,
    updatedAt: coordinatorDateSchema,
    targetProjectId: z.string().uuid().nullable(),
  })
  .strict()
const providerRunResponseSchema = z
  .object({
    id: z.string().uuid(),
    planProjectionId: z.string().uuid().nullable(),
    targetProjectId: z.string().uuid(),
    providerAdapterId: z.string().uuid().nullable(),
    providerKind: z.string().min(1),
    providerProfile: z.string().nullable(),
    adapterVersion: z.string().min(1),
    status: z.string().min(1),
    lifecyclePhase: z.string().min(1),
    capabilitySnapshotJson: z.string(),
    launchPrompt: z.string(),
    approvedScopeJson: z.string().nullable(),
    appraiseInstructions: z.string(),
    providerSessionId: z.string().nullable(),
    providerThreadId: z.string().nullable(),
    providerProcessId: z.string().nullable(),
    preRunRepoSnapshotJson: z.string().nullable(),
    postRunRepoSnapshotJson: z.string().nullable(),
    changedFilesJson: z.string().nullable(),
    artifactHashesJson: z.string().nullable(),
    failureReason: z.string().nullable(),
    cancelledAt: coordinatorDateSchema.nullable(),
    startedAt: coordinatorDateSchema.nullable(),
    completedAt: coordinatorDateSchema.nullable(),
    createdAt: coordinatorDateSchema,
    updatedAt: coordinatorDateSchema,
    plan: providerPlanResponseSchema.nullable(),
    targetProject: targetProjectResponseSchema,
    providerAdapter: providerRegistrationResponseSchema.nullable(),
    events: z.array(providerEventResponseSchema),
    permissionDecisions: z.array(providerPermissionDecisionResponseSchema),
    artifactSnapshots: z.array(providerArtifactSnapshotResponseSchema),
    capabilitySnapshot: coordinatorJsonValueSchema.nullable().optional(),
    approvedScope: coordinatorJsonValueSchema.nullable().optional(),
    preRunRepoSnapshot: coordinatorJsonValueSchema.nullable().optional(),
    postRunRepoSnapshot: coordinatorJsonValueSchema.nullable().optional(),
    changedFiles: coordinatorJsonValueSchema.nullable().optional(),
    artifactHashes: coordinatorJsonValueSchema.nullable().optional(),
  })
  .strict()
const providerRunsResponseSchema = z.union([
  z.object({ providerRuns: z.array(providerRunResponseSchema) }).strict(),
  providerRunResponseSchema,
  providerPermissionDecisionResponseSchema,
])
const qualityQueryResponseSchema = z
  .object({
    id: z.string().uuid(),
    prompt: z.string().min(1),
    status: z.string().min(1),
    answer: z.string().nullable(),
    rationale: z.string().nullable(),
  })
  .strict()
const qualityRevisionPayloadSchema = z
  .object({
    qualityPlan: z
      .object({
        id: z.string().uuid(),
        targetProjectId: z.string().uuid(),
        title: z.string().min(1),
        description: z.string().nullable(),
      })
      .strict(),
    revision: z
      .object({
        id: z.string().uuid(),
        revision: z.number().int().positive(),
        status: z.string().min(1),
        contentHash: coordinatorHashSchema,
        approvedAt: coordinatorDateSchema.nullable(),
        sourceSpecification: coordinatorJsonValueSchema,
        requirementGraph: coordinatorJsonValueSchema,
      })
      .strict(),
    requirements: z.array(
      z
        .object({
          id: z.string().uuid(),
          externalRef: z.string().nullable(),
          text: z.string().min(1),
          kind: z.string().min(1),
          contentHash: coordinatorHashSchema,
        })
        .strict(),
    ),
    obligations: z.array(
      z
        .object({
          id: z.string().uuid(),
          requirementSnapshotId: z.string().uuid(),
          title: z.string().min(1),
          intent: z.string().min(1),
          assertionScope: coordinatorJsonValueSchema,
          minimumAssurance: z.string().min(1),
          limitations: z.string().nullable(),
          contentHash: coordinatorHashSchema,
        })
        .strict(),
    ),
    queries: z.array(qualityQueryResponseSchema),
    approval: z.union([
      z.object({ blocked: z.literal(false) }).strict(),
      z.object({ blocked: z.literal(true), blockingQueries: z.array(qualityQueryResponseSchema) }).strict(),
    ]),
    validationVersionCount: z.number().int().nonnegative(),
    designHash: coordinatorHashSchema.nullable(),
    validationVersions: z.array(
      z
        .object({
          id: z.string().uuid(),
          validationIdentity: z.string().min(1),
          version: z.number().int().positive(),
          status: z.string().min(1),
          reuseOutcome: z.string().nullable(),
          canonicalHash: coordinatorHashSchema,
          realization: coordinatorJsonValueSchema.nullable(),
          realizationHash: coordinatorHashSchema.nullable(),
          compilationHash: coordinatorHashSchema.nullable(),
          scenarioApprovedAt: coordinatorDateSchema.nullable(),
          scenarioApprovedBy: z.string().nullable(),
          scenarioApprovalHash: coordinatorHashSchema.nullable(),
          design: coordinatorJsonValueSchema,
        })
        .strict(),
    ),
    nextRecommendedAction: z.string().min(1),
  })
  .strict()
const qualityAssessmentResponseSchema = z
  .object({
    assessment: z
      .object({
        id: z.string().uuid(),
        status: z.string().min(1),
        alignment: z.string().min(1),
        observedAssurance: z.string().nullable(),
        baselineAssessmentId: z.string().uuid().nullable(),
      })
      .strict(),
    qualityPlan: qualityRevisionPayloadSchema.shape.qualityPlan,
    revision: qualityRevisionPayloadSchema,
    subject: z
      .object({
        id: z.string().uuid(),
        subjectDigest: coordinatorHashSchema,
        subjectKind: z.string().min(1),
        authority: z.string().min(1),
        metadata: coordinatorJsonValueSchema.nullable(),
      })
      .strict(),
    readiness: z
      .object({
        ready: z.boolean(),
        blockers: z.array(z.string()),
        publishedValidationVersionIds: z.array(z.string().uuid()),
      })
      .strict(),
    evidenceReceiptCount: z.number().int().nonnegative(),
    evidenceSetHash: coordinatorHashSchema,
    decisions: z.array(
      z
        .object({
          id: z.string().uuid(),
          assessmentId: z.string().uuid(),
          decision: z.string().min(1),
          rationale: z.string().min(1),
          decidedBy: z.string().min(1),
          decisionHash: coordinatorHashSchema,
          decidedAt: coordinatorDateSchema,
        })
        .strict(),
    ),
    nextRecommendedAction: z.string().min(1),
  })
  .strict()
const qualityResponseSchema = z.union([
  qualityRevisionPayloadSchema,
  qualityRevisionPayloadSchema.extend({ idempotent: z.boolean() }).strict(),
  qualityRevisionPayloadSchema.extend({ approvedBy: z.string().min(1) }).strict(),
  qualityRevisionPayloadSchema.extend({ compilationHash: coordinatorHashSchema }).strict(),
  qualityAssessmentResponseSchema,
])
const objectiveResponseSchema = z
  .object({
    schemaVersion: z.literal('1'),
    objectiveId: idSchema,
    title: z.string().min(1),
    milestones: z.array(z.object({ id: idSchema, title: z.string().min(1) }).strict()),
    plans: z.array(
      z
        .object({
          planId: planIdSchema,
          milestoneId: idSchema,
          dependsOn: z.array(planIdSchema).optional(),
          impactedPaths: z.array(z.string().min(1)).optional(),
          lifecycle: lifecycleSchema,
          independentlyComplete: z.boolean(),
        })
        .strict(),
    ),
    contentHash: coordinatorHashSchema,
    reference: z.string().min(1),
  })
  .strict()
const coordinationSloResponseSchema = z
  .object({
    passed: z.boolean(),
    blockers: z.array(z.string()),
    activeMs: z.number().int().nonnegative(),
    humanReviewMs: z.number().int().nonnegative(),
    responseBytes: z.number().int().nonnegative(),
    maxResponseBytes: z.number().int().nonnegative(),
    operations: z.number().int().nonnegative(),
    retries: z.number().int().nonnegative(),
    approvals: z.number().int().nonnegative(),
  })
  .strict()
const repositoryExportJobResponseSchema = z
  .object({
    id: z.string().uuid(),
    targetProjectId: z.string().uuid(),
    publishOperationId: z.string().uuid(),
    validationHash: coordinatorHashSchema,
    destinationPath: z.string().min(1),
    policy: z.enum(['disabled', 'optional', 'required']),
    state: z.enum(['queued', 'running', 'succeeded', 'failed', 'conflict']),
    attemptCount: z.number().int().nonnegative(),
    idempotencyKey: coordinatorHashSchema,
    manifestHash: coordinatorHashSchema.nullable(),
    manifestJson: z.string().nullable(),
    conflictJson: z.string().nullable(),
    failureCode: z.string().nullable(),
    createdAt: coordinatorDateSchema,
    updatedAt: coordinatorDateSchema,
    completedAt: coordinatorDateSchema.nullable(),
  })
  .strict()
const repositoryExportReceiptResponseSchema = z
  .object({
    id: z.string().uuid(),
    jobId: z.string().uuid(),
    targetProjectId: z.string().uuid(),
    validationHash: coordinatorHashSchema,
    manifestHash: coordinatorHashSchema,
    destinationPath: z.string().min(1),
    receiptJson: z.string(),
    completedAt: coordinatorDateSchema,
  })
  .strict()
const repositoryExportResponseSchema = z.union([
  repositoryExportJobResponseSchema,
  repositoryExportReceiptResponseSchema,
  z.null(),
])
const delegatedValidationResponseSchema = z
  .object({
    status: z.literal('accepted-for-check'),
    submissionId: z.string().uuid(),
    astId: idSchema,
    contentHash: coordinatorHashSchema,
    nextAllowedAction: z.literal('validation_ast_check'),
  })
  .strict()
const lifecycleSnapshotResponseSchema = z
  .object({
    schemaVersion: z.literal('1'),
    planId: planIdSchema,
    revision: z.number().int().positive(),
    lifecycle: lifecycleSchema,
    sourceHash: coordinatorHashSchema,
    throughSequence: z.number().int().nonnegative(),
    tasks: z.array(z.object({ taskId: idSchema, title: z.string().min(1) }).strict()),
    eventDigest: coordinatorHashSchema,
    contentHash: coordinatorHashSchema,
    reference: z.string().min(1),
    archive: z.object({ contentHash: coordinatorHashSchema, reference: z.string().min(1) }).strict(),
    eventSequence: z.number().int().positive().optional(),
  })
  .strict()
const continuationPackageResponseSchema = z
  .object({
    schemaVersion: z.literal('1'),
    planId: planIdSchema,
    snapshot: z
      .object({
        contentHash: coordinatorHashSchema,
        reference: z.string().min(1),
        throughSequence: z.number().int().nonnegative(),
      })
      .strict(),
    objectiveReference: z.string().nullable().optional(),
    narrative: z.string(),
    references: z.array(z.string().min(1)),
    provenance: z
      .object({
        authoredBy: z.literal('agent'),
        authoritativeStateBy: z.literal('appraise'),
        createdAt: coordinatorDateSchema,
      })
      .strict(),
    contentHash: coordinatorHashSchema,
    reference: z.string().min(1),
  })
  .strict()
const agentPreflightResponseSchema = z
  .object({
    id: idSchema,
    status: z.enum(['ready', 'blocked']),
    snapshotHash: coordinatorHashSchema,
    observedAt: coordinatorDateSchema,
    browserUrl: z.string().url(),
  })
  .strict()
const coordinatorLeaseResponseSchema = z
  .object({
    id: z.string().uuid(),
    planProjectionId: z.string().uuid(),
    coordinatorId: z.string().min(1),
    connectionId: z.string().uuid(),
    leaseExpiresAt: coordinatorDateSchema,
    takeoverApproved: z.boolean(),
    createdAt: coordinatorDateSchema,
    updatedAt: coordinatorDateSchema,
  })
  .strict()

function parseCoordinatorPayload(value: string | null | undefined) {
  if (!value) return null
  return coordinatorJsonValueSchema.parse(JSON.parse(value))
}

function projectProviderWorkflowRun(value: {
  events: Array<{ payloadJson: string | null }>
  permissionDecisions: Array<{ payloadJson: string }>
  artifactSnapshots: Array<{ metadataJson: string | null }>
  capabilitySnapshotJson: string
  approvedScopeJson: string | null
  preRunRepoSnapshotJson: string | null
  postRunRepoSnapshotJson: string | null
  changedFilesJson: string | null
  artifactHashesJson: string | null
  [key: string]: unknown
}) {
  return {
    ...value,
    capabilitySnapshot: parseCoordinatorPayload(value.capabilitySnapshotJson),
    approvedScope: parseCoordinatorPayload(value.approvedScopeJson),
    preRunRepoSnapshot: parseCoordinatorPayload(value.preRunRepoSnapshotJson),
    postRunRepoSnapshot: parseCoordinatorPayload(value.postRunRepoSnapshotJson),
    changedFiles: parseCoordinatorPayload(value.changedFilesJson),
    artifactHashes: parseCoordinatorPayload(value.artifactHashesJson),
    events: value.events.map(event => ({ ...event, payload: parseCoordinatorPayload(event.payloadJson) })),
    permissionDecisions: value.permissionDecisions.map(decision => ({
      ...decision,
      payload: parseCoordinatorPayload(decision.payloadJson),
    })),
    artifactSnapshots: value.artifactSnapshots.map(snapshot => ({
      ...snapshot,
      metadata: parseCoordinatorPayload(snapshot.metadataJson),
    })),
  }
}
const operationSuccessSchemas = {
  'delegation-read': delegatedCoordinatorStoredReceiptSchema,
  diagnostic: diagnosticResponseSchema,
  'test-run-evidence': testRunEvidenceResponseSchema,
  'plan-health': planHealthResponseSchema,
  operations: operationsResponseSchema,
  'step-definitions-read': stepDefinitionResponseSchema,
  'target-projects-list': z.object({ targetProjects: z.array(targetProjectResponseSchema) }).strict(),
  'locator-graph': locatorGraphResponseSchema,
  'providers-list': z.object({ providers: z.array(providerRegistrationListItemSchema) }).strict(),
  'provider-runs-read': providerRunsResponseSchema,
  'quality-read': qualityResponseSchema,
  'plan-read': planReadResponseSchema,
  'plan-events-read': planEventsResponseSchema,
  'plan-review-read': planReviewResponseSchema,
  'plan-validations-read': validationContextResponseSchema,
  'plan-completion-read': completionReceiptSchema,
  'delegation-create': delegatedCoordinatorReceiptResponseSchema,
  'step-definitions-write': stepDefinitionResponseSchema,
  'delegation-revoke': delegatedCoordinatorStoredReceiptSchema,
  'objective-create': objectiveResponseSchema,
  'coordination-slo': coordinationSloResponseSchema,
  'diagnostic-preflight-write': agentPreflightResponseSchema,
  'repository-export': repositoryExportResponseSchema,
  'delegated-validation-submit': delegatedValidationResponseSchema,
  'provider-runs-write': providerRunsResponseSchema,
  'quality-write': qualityResponseSchema,
  'plan-snapshot': lifecycleSnapshotResponseSchema,
  'plan-continuation': continuationPackageResponseSchema,
  'providers-write': providerRegistrationResponseSchema,
  register: coordinatorLeaseResponseSchema,
  heartbeat: coordinatorLeaseResponseSchema,
  'plan-create': planCreateResponseSchema,
  'target-project-write': targetProjectWriteResponseSchema,
  'test-run-write': standaloneTestRunResponseSchema,
  'plan-start': planReadResponseSchema.omit({ links: true }),
  'plan-task-update': planEventRecordSchema,
  'plan-event-acknowledge': planEventAcknowledgementResponseSchema,
  'plan-validation-write': validationWriteResponseSchema,
  'plan-baseline-write': planLifecycleResponseSchema.or(coordinatorAcknowledgementSchema),
  'plan-implementation-write': implementationMutationResponseSchema,
  'plan-revise': planReadResponseSchema,
} satisfies Record<CoordinatorOperationId, z.ZodType>

const lifecycleSuccessSchemas: Readonly<Record<string, z.ZodType>> = {
  'plans/baseline/start': planLifecycleResponseSchema,
  'plans/baseline/reconcile': planLifecycleResponseSchema,
  'plans/baseline/cancel': planLifecycleResponseSchema,
  'plans/baseline/retry': planLifecycleResponseSchema,
  'plans/baseline/accept': planLifecycleResponseSchema,
  'plans/baseline/failures/acknowledge': coordinatorAcknowledgementSchema,
  'plans/baseline/regressions/justify': coordinatorAcknowledgementSchema,
  'plans/implementation/start': planArtifactSchema,
}

// fallow-ignore-next-line complexity
function successLifecyclePath(operation: string[]) {
  if (operation[0] !== 'plans') return operation.join('/')
  const parts = [operation[0], operation[2], operation[3]]
  if (['failures', 'regressions'].includes(operation[3] ?? '')) parts.push(operation[5])
  return parts.join('/')
}

export function coordinatorSuccessSchema(method: 'GET' | 'POST' | 'PUT', operation: string[]) {
  const operationId = coordinatorOperationRegistry.resolve(method, operation)
  const lifecyclePath = successLifecyclePath(operation)
  if (operationId === 'test-run-write' && operation[1] === 'preflight') return testRunPreflightResponseSchema
  return lifecycleSuccessSchemas[lifecyclePath] ?? operationSuccessSchemas[operationId]
}

async function validatedCoordinatorResponse(
  response: Response,
  method: 'GET' | 'POST' | 'PUT',
  operation: string[],
): Promise<Response> {
  try {
    const body = (await response.clone().json()) as unknown
    coordinatorSuccessSchema(method, operation).parse(body)
    return response
  } catch (error) {
    console.error('Coordinator success response validation failed.', error)
    throw new CoordinatorPostCommitSerializationError({ cause: error })
  }
}

function withLinks<T extends object>(value: T, planId: string, request: Request, targetProjectId?: string | null) {
  const baseUrl = request.headers.get('x-appraise-base-url') ?? new URL(request.url).origin
  return { ...value, links: planLinks(planId, baseUrl, targetProjectId) }
}

function assertProviderNativeRunsEnabled() {
  if (!isProviderNativeRunsEnabled()) {
    throw new ServiceError(
      'Provider-native runs are experimental and disabled. Start planning from your coding agent through Appraise MCP instead.',
      'VALIDATION',
      400,
    )
  }
}

async function getPlan(request: Request, operation: string[]) {
  const planId = routePlanIdSchema.parse(operation[1])
  const plan = await readCoordinatorPlan(planId)
  return Response.json(withLinks(plan, plan.planId, request, plan.targetProjectId))
}

async function getReview(request: Request, operation: string[]) {
  const planId = routePlanIdSchema.parse(operation[1])
  const review = await readPlanReviewSummary(planId)
  return Response.json(withLinks(review, review.planId, request, review.targetProjectId))
}

async function getEvents(request: Request, operation: string[]) {
  const url = new URL(request.url)
  const planId = routePlanIdSchema.parse(operation[1])
  const afterSequence = z.coerce
    .number()
    .int()
    .nonnegative()
    .parse(url.searchParams.get('after') ?? '0')
  const input = { planId, afterSequence }
  const wait = url.searchParams.get('wait') === 'true'
  const events = wait ? await waitForPlanEvents({ ...input, signal: request.signal }) : await readPlanEvents(input)
  if (wait && events.length === 0) {
    await ensurePlanReviewReadyEvent(planId)
    const repairedEvents = await readPlanEvents(input)
    if (repairedEvents.length > 0)
      return Response.json({ events: repairedEvents, notifications: projectLifecycleNotifications(repairedEvents) })
  }
  return Response.json({ events, notifications: projectLifecycleNotifications(events) })
}

async function getDiagnostic(request: Request) {
  const identity = await ensureProjectIdentity()
  const targetProjects = await listTargetProjects()
  return Response.json({
    ok: true,
    hubProject: {
      fingerprint: identity.projectFingerprint,
      canonicalPath: identity.canonicalProjectPath,
    },
    project: {
      fingerprint: identity.projectFingerprint,
      canonicalPath: identity.canonicalProjectPath,
    },
    targetProjects,
    contractVersion: coordinatorContractVersion,
    checks: [
      { id: 'application', status: 'ok', message: 'AppraiseJS application and coordinator API are reachable.' },
      { id: 'authentication', status: 'ok', message: 'Coordinator authentication succeeded.' },
      { id: 'project', status: 'ok', message: 'Coordinator project identity matches this application.' },
    ],
    warnings: [],
    recoveryActions: [],
    links: {
      application: request.headers.get('x-appraise-base-url') ?? new URL(request.url).origin,
    },
  })
}

async function resolveEvidenceTarget(request: Request) {
  const fingerprint = request.headers.get('x-appraise-target-project')
  if (!fingerprint) throw new ServiceError('Test run not found.', 'NOT_FOUND', 404)
  const target = await resolveTargetProject(fingerprint).catch(() => null)
  if (!target) throw new ServiceError('Test run not found.', 'NOT_FOUND', 404)
  return target
}

async function getTestRunEvidence(request: Request, operation: string[]) {
  const runId = z.string().uuid().parse(operation[1])
  const target = await resolveEvidenceTarget(request)
  if (operation.length === 2) {
    return Response.json(await readTestRunEvidenceSummary(runId, target.id))
  }
  if (operation[2] === 'diagnose') {
    return Response.json(await diagnoseTestRunEvidence(runId, target.id))
  }
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

// fallow-ignore-next-line complexity
async function getValidations(request: Request, operation: string[]) {
  const planId = routePlanIdSchema.parse(operation[1])
  if (operation[3] === 'draft' && operation[4] === 'context') {
    const context = await readValidationContext(planId, { resourceTypes: [], limit: 1 })
    return Response.json({
      plan: context.plan,
      targetProject: context.targetProject,
      contextHash: context.contextHash,
      authoring: context.authoring,
      nextRecommendedAction: context.nextRecommendedAction,
    })
  }
  if (operation[3] === 'context') {
    const url = new URL(request.url)
    return Response.json(
      await readValidationContext(planId, {
        resourceTypes: parseValidationResourceTypes(url.searchParams),
        query: url.searchParams.get('query') ?? undefined,
        limit: z.coerce.number().int().positive().max(200).catch(50).parse(url.searchParams.get('limit')),
        sinceHash: url.searchParams.get('sinceHash') ?? undefined,
      }),
    )
  }
  if (operation[3] === 'resolver') {
    const url = new URL(request.url)
    return Response.json(
      await resolveReusableValidationSteps(planId, {
        intent: z.string().trim().min(1).parse(url.searchParams.get('intent')),
        parameterNames: url.searchParams.get('parameterNames')?.split(',').filter(Boolean),
        limit: z.coerce.number().int().positive().max(25).catch(5).parse(url.searchParams.get('limit')),
      }),
    )
  }
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

function operationRefs(query: URLSearchParams) {
  return z
    .string()
    .transform((value, context) => {
      try {
        return JSON.parse(value) as unknown
      } catch {
        context.addIssue({ code: 'custom', message: 'refs must be valid JSON.' })
        return z.NEVER
      }
    })
    .pipe(
      z
        .array(z.object({ id: z.string(), version: z.string().optional() }))
        .min(1)
        .max(50),
    )
    .parse(query.get('refs') ?? '[]')
}

function optionalQuery(query: URLSearchParams, key: string) {
  return query.get(key) ?? undefined
}

function parseDeprecatedFilter(query: URLSearchParams) {
  const value = query.get('deprecated')
  return value === null
    ? undefined
    : z
        .enum(['true', 'false'])
        .transform(option => option === 'true')
        .parse(value)
}

function parseActionCursor(query: URLSearchParams) {
  return query.has('cursor') ? z.coerce.number().int().nonnegative().parse(query.get('cursor')) : 0
}

function parseActionLimit(query: URLSearchParams) {
  return query.has('limit') ? z.coerce.number().int().min(1).max(100).parse(query.get('limit')) : 50
}

function operationCategories(query: URLSearchParams) {
  if (query.get('knownManifestHash') === defaultOperationRegistry.manifestHash)
    return Response.json({ status: 'unchanged', manifestHash: defaultOperationRegistry.manifestHash, categories: [] })
  const operations = defaultOperationRegistry.list({}, 0, 100).items
  const counts = new Map<string, number>()
  operations.forEach(operation =>
    operation.categories.forEach(category => counts.set(category, (counts.get(category) ?? 0) + 1)),
  )
  return Response.json({
    status: 'current',
    manifestHash: defaultOperationRegistry.manifestHash,
    categories: [...counts]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, operationCount]) => ({ id, operationCount })),
  })
}

function operationListFilter(query: URLSearchParams) {
  return {
    category: optionalQuery(query, 'category'),
    capability: optionalQuery(query, 'capability'),
    runtime: z.enum(['browser', 'api', 'node', 'database']).optional().parse(optionalQuery(query, 'runtime')),
  }
}

type OperationSearchContext = {
  intent: string
  terms: Set<string>
  requestedParameters: Set<string>
}

function operationMatchExplanation(input: {
  exactId: boolean
  matchedAlias: string | null
  matchedTerms: string[]
  termCount: number
  matchedParameterCount: number
  requestedParameterCount: number
}) {
  if (input.exactId) return 'Exact canonical operation identity match.'
  if (input.matchedAlias)
    return `Compatibility alias ${JSON.stringify(input.matchedAlias)} resolves to this canonical operation.`
  return `Matched ${input.matchedTerms.length}/${input.termCount} intent terms and ${input.matchedParameterCount}/${input.requestedParameterCount} requested parameters.`
}

function matchBoost(exactId: boolean, matchedAlias: string | null) {
  return exactId || matchedAlias ? 100 : 0
}

function parameterCompatibility(requestedCount: number, matchedCount: number) {
  return requestedCount === 0 ? 1 : matchedCount / requestedCount
}

function operationSearchText(
  operation: ReturnType<typeof defaultOperationRegistry.list>['items'][number],
  descriptor: ReturnType<typeof defaultOperationRegistry.read>[number],
  aliases: string[],
) {
  return `${canonicalStepDiscoveryText(descriptor)} ${aliases.join(' ')}`.toLowerCase()
}

function humanStepProjection(
  projection: ReturnType<typeof defaultOperationRegistry.read>[number]['humanProjections'][number] | null,
) {
  if (!projection) return null
  return {
    name: projection.title,
    description: projection.description,
    signature: projection.signature,
    groupName: projection.group,
  }
}

function missingRequiredBindings(
  inputs: ReturnType<typeof defaultOperationRegistry.read>[number]['inputs'],
  requestedParameters: Set<string>,
) {
  return inputs
    .filter(input => input.required && !requestedParameters.has(input.name))
    .map(input => ({ name: input.name, type: input.type }))
}

function matchedIntentTerms(terms: Set<string>, text: string) {
  return [...terms].filter(term => text.includes(term))
}

function matchedInputNames(requestedParameters: Set<string>, availableParameters: Set<string>) {
  return [...requestedParameters].filter(name => availableParameters.has(name))
}

function matchingAlias(aliases: string[], intent: string) {
  return aliases.find(alias => alias.toLowerCase() === intent.toLowerCase()) ?? null
}

function activeHumanProjection(descriptor: ReturnType<typeof defaultOperationRegistry.read>[number]) {
  return descriptor.humanProjections.find(projection => !projection.deprecated) ?? null
}

function rankOperation(
  operation: ReturnType<typeof defaultOperationRegistry.list>['items'][number],
  context: OperationSearchContext,
) {
  const descriptor = defaultOperationRegistry.read([{ id: operation.id, version: operation.version }])[0]!
  const aliases = descriptor.aliases.map(alias => alias.value)
  const text = operationSearchText(operation, descriptor, aliases)
  const matchedTerms = matchedIntentTerms(context.terms, text)
  const availableParameters = new Set(descriptor.inputs.map(input => input.name))
  const matchedParameters = matchedInputNames(context.requestedParameters, availableParameters)
  const missingBindings = missingRequiredBindings(descriptor.inputs, context.requestedParameters)
  const exactId = operation.id === context.intent
  const matchedAlias = matchingAlias(aliases, context.intent)
  const humanProjection = activeHumanProjection(descriptor)
  return {
    ...operation,
    displayName: humanProjection?.title ?? operation.title,
    canonicalRef: `${operation.id}@${operation.version}`,
    agentOperation: { id: operation.id, version: operation.version, ref: `${operation.id}@${operation.version}` },
    humanStep: humanStepProjection(humanProjection),
    score: matchedTerms.length + matchedParameters.length * 2 + matchBoost(exactId, matchedAlias),
    matchedTerms,
    matchedAlias,
    parameterCompatibility: parameterCompatibility(context.requestedParameters.size, matchedParameters.length),
    missingRequiredBindings: missingBindings,
    explanation: operationMatchExplanation({
      exactId,
      matchedAlias,
      matchedTerms,
      termCount: context.terms.size,
      matchedParameterCount: matchedParameters.length,
      requestedParameterCount: context.requestedParameters.size,
    }),
  }
}

function nextOperationAction(ranked: Array<ReturnType<typeof rankOperation>>) {
  const recommended = ranked[0]
  if (!recommended) return 'Refine the query or inspect bounded operation categories before proposing custom behavior.'
  return recommended.missingRequiredBindings.length
    ? 'Resolve the recommended operation binding gaps, then call operation_read for its exact descriptor.'
    : 'Call operation_read for the selected exact version, then use its canonical reference in the Validation AST.'
}

function searchOperations(query: URLSearchParams) {
  const intent = z.string().trim().min(1).max(500).parse(query.get('query'))
  const terms = stepDiscoveryTerms(intent)
  const requestedParameters = new Set(
    (query.get('parameterNames') ?? '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  )
  const listing = defaultOperationRegistry.list(
    {
      ...operationListFilter(query),
      inputType: z
        .enum([
          'string',
          'number',
          'boolean',
          'json',
          'locator',
          'environment-ref',
          'stored-value-ref',
          'artifact-ref',
          'reviewed-extension-ref',
        ])
        .optional()
        .parse(optionalQuery(query, 'inputType')),
      surface: z.enum(['human', 'agent']).optional().parse(optionalQuery(query, 'surface')),
      deprecated: parseDeprecatedFilter(query),
    },
    0,
    100,
  )
  const limit = parseActionLimit(query)
  const ranked = listing.items
    .map(operation => rankOperation(operation, { intent, terms, requestedParameters }))
    .filter(operation => operation.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit)
  return Response.json({
    discoveryKind: 'combined-step',
    manifestHash: defaultOperationRegistry.manifestHash,
    query: intent,
    recommended: ranked[0] ?? null,
    recommendedStep: ranked[0] ?? null,
    alternatives: ranked.slice(1),
    steps: ranked,
    nextRecommendedAction: nextOperationAction(ranked),
  })
}

function listOperations(query: URLSearchParams) {
  return Response.json(
    defaultOperationRegistry.list(
      {
        ...operationListFilter(query),
        surface: z.enum(['human', 'agent']).optional().parse(optionalQuery(query, 'surface')),
        deprecated: parseDeprecatedFilter(query),
        idPrefix: optionalQuery(query, 'idPrefix'),
      },
      parseActionCursor(query),
      parseActionLimit(query),
      optionalQuery(query, 'knownManifestHash'),
    ),
  )
}

function readOperations(query: URLSearchParams) {
  return Response.json({
    manifestHash: defaultOperationRegistry.manifestHash,
    operations: defaultOperationRegistry.read(operationRefs(query)),
  })
}

async function getOperations(request: Request, operation: string[]) {
  const query = new URL(request.url).searchParams
  const handlers: Record<string, () => Response> = {
    categories: () => operationCategories(query),
    read: () => readOperations(query),
    search: () => searchOperations(query),
    list: () => listOperations(query),
  }
  return (handlers[operation[1] ?? 'list'] ?? handlers.list)()
}

async function queryCoordinatorLocatorGraph(request: Request) {
  const query = new URL(request.url).searchParams
  return Response.json(
    await queryLocatorGraph({
      fromId: query.get('fromId'),
      relation: query.get('relation') ?? undefined,
      toType: query.get('toType') ?? undefined,
      cursor: query.get('cursor') ?? undefined,
      limit: z.coerce.number().int().positive().max(100).catch(25).parse(query.get('limit')),
      depth: z.coerce.number().int().positive().max(4).catch(1).parse(query.get('depth')),
    }),
  )
}

async function getLocatorGraph(request: Request, operation: string[]) {
  const handlers: Record<string, () => Promise<Response>> = {
    visual: async () => Response.json(await readLocatorGraphVisualProjection()),
    query: () => queryCoordinatorLocatorGraph(request),
  }
  return (handlers[operation[1] ?? 'query'] ?? handlers.query)()
}

function qualityLifecyclePending(operation: string[]) {
  return new ServiceError(
    'Quality Design and Assessment coordinator service is not implemented yet.',
    'VALIDATION',
    501,
    {
      code: 'QUALITY_LIFECYCLE_PENDING',
      operation: operation.join('/'),
      recovery:
        'Use the legacy plan lifecycle only for existing in-flight work. New Quality Design clients should wait for requirements and assessment service publication before executing this operation.',
      nextImplementationSlice:
        'Implement the quality requirements service against QualityPlan, QualityPlanRevision, RequirementSnapshot, RequirementQuery, and QualityObligationRevision.',
    },
  )
}

async function getQualityRequirements(request: Request, operation: string[]) {
  const url = new URL(request.url)
  return Response.json(
    await readQualityRequirementGraph({
      qualityPlanId: z.string().min(1).parse(operation[2]),
      revisionId: url.searchParams.get('revisionId') ?? undefined,
    }),
  )
}

async function getQualityAssessment(operation: string[]) {
  return Response.json(await readQualityAssessment(z.string().min(1).parse(operation[2])))
}

const qualityGetHandlers: Record<string, (request: Request, operation: string[]) => Promise<Response>> = {
  'plans/requirements': getQualityRequirements,
  'assessments/readiness': (_request, operation) => getQualityAssessment(operation),
  'assessments/diagnose': (_request, operation) => getQualityAssessment(operation),
  'assessments/review': (_request, operation) => getQualityAssessment(operation),
}

async function getQualityOperation(request: Request, operation: string[]) {
  const handler = qualityGetHandlers[`${operation[1]}/${operation[3] ?? ''}`]
  if (handler) return handler(request, operation)
  throw qualityLifecyclePending(operation)
}

async function getStepDefinitions(request: Request, operation: string[]) {
  const result = await coordinatorStepDefinitionService.read(operation, new URL(request.url).searchParams)
  return Response.json(result.body)
}

async function dispatchGet(request: Request, operation: string[]) {
  const id = coordinatorOperationRegistry.resolve('GET', operation)
  const handlers: Partial<Record<CoordinatorOperationId, () => Promise<Response>>> = {
    'delegation-read': async () =>
      Response.json(await readDelegatedCoordinatorReceipt(z.string().uuid().parse(operation[1]))),
    diagnostic: () => getDiagnostic(request),
    'test-run-evidence': () => getTestRunEvidence(request, operation),
    'plan-health': async () =>
      Response.json(await readImplementationLifecycleHealth(routePlanIdSchema.parse(operation[1]))),
    operations: () => getOperations(request, operation),
    'step-definitions-read': () => getStepDefinitions(request, operation),
    'target-projects-list': async () => Response.json({ targetProjects: await listTargetProjects() }),
    'locator-graph': () => getLocatorGraph(request, operation),
    'providers-list': async () => {
      assertProviderNativeRunsEnabled()
      return Response.json({ providers: await listProviderRegistrations() })
    },
    'provider-runs-read': async () => {
      assertProviderNativeRunsEnabled()
      return operation.length === 1
        ? Response.json({ providerRuns: (await listProviderWorkflowRuns()).map(projectProviderWorkflowRun) })
        : Response.json(projectProviderWorkflowRun(await getProviderWorkflowRun(z.string().uuid().parse(operation[1]))))
    },
    'quality-read': async () => {
      return getQualityOperation(request, operation)
    },
    'plan-read': () => getPlan(request, operation),
    'plan-events-read': () => getEvents(request, operation),
    'plan-review-read': () => getReview(request, operation),
    'plan-validations-read': () => getValidations(request, operation),
    'plan-completion-read': async () =>
      Response.json(await reviewImplementationCompletion(routePlanIdSchema.parse(operation[1]))),
  }
  return handlers[id]!()
}

function lifecycleMutationRoute(operation: string[]) {
  return { planId: routePlanIdSchema.parse(operation[1]), action: operation[3] }
}

function idempotencyValue(body: unknown) {
  return z.object({ idempotencyKey: idSchema }).parse(body)
}

// Request parsing branches stay in this thin HTTP adapter.
// fallow-ignore-next-line complexity
async function postImplementationOperationUnchecked(operation: string[], body: unknown) {
  const { planId, action } = lifecycleMutationRoute(operation)
  if (action === 'start') {
    const value = idempotencyValue(body)
    return Response.json(await startImplementation(planId, value))
  }
  if (action === 'checkpoint') {
    const value = z
      .object({
        type: z.enum([
          'before_task',
          'after_task',
          'before_group',
          'after_group',
          'before_validation',
          'before_completion',
        ]),
        taskIds: z.array(idSchema).optional(),
        queuedFeedbackCount: z.number().int().nonnegative().optional(),
        idempotencyKey: idSchema,
      })
      .parse(body)
    return Response.json(await reachImplementationCheckpoint({ planId, ...value }))
  }
  if (action === 'tasks') {
    const value = z
      .object({
        status: z.enum(['pending', 'in_progress', 'implemented', 'verified']),
        commitHash: z.string().min(1).optional(),
        idempotencyKey: idSchema,
      })
      .parse(body)
    return Response.json(await updateImplementationTask({ planId, taskId: idSchema.parse(operation[4]), ...value }))
  }
  if (action === 'groups') {
    const value = z.object({ groupIds: z.array(idSchema).min(1), idempotencyKey: idSchema }).parse(body)
    return Response.json(await approveImplementationGroups({ planId, ...value }))
  }
  if (action === 'feedback') {
    const value = z
      .object({
        affectedTaskIds: z.array(idSchema).min(1),
        confirmed: z.boolean(),
        pausePlanWide: z.boolean().optional(),
        idempotencyKey: idSchema,
      })
      .parse(body)
    return Response.json(await applyBlockingFeedback({ planId, ...value }))
  }
  if (action === 'control') {
    const value = z
      .object({
        action: z.enum(['pause', 'resume', 'cancel']),
        stopActiveRuns: z.boolean().optional(),
        idempotencyKey: idSchema,
      })
      .parse(body)
    return Response.json(await controlImplementation({ planId, ...value }))
  }
  if (action === 'validations') {
    if (operation[4] === 'readiness') {
      const value = z
        .object({
          validationIds: z.array(idSchema).optional(),
          confirmedRemoteEnvironmentIds: z.array(idSchema).optional(),
          action: z.enum(['check', 'launch', 'stop']).optional(),
        })
        .parse(body)
      return Response.json(await readImplementationValidationReadiness({ planId, ...value }))
    }
    if (operation[4] === 'start') {
      const value = z
        .object({
          validationIds: z.array(idSchema).optional(),
          commitHash: z.string().min(1).optional(),
          confirmedRemoteEnvironmentIds: z.array(idSchema).optional(),
          idempotencyKey: idSchema,
        })
        .parse(body)
      return Response.json(await startImplementationValidation({ planId, ...value }))
    }
    if (operation[4] === 'reconcile') {
      const value = z
        .object({
          runIds: z.array(idSchema).optional(),
          verifyTaskIds: z.array(idSchema).optional(),
          idempotencyKey: idSchema,
        })
        .refine(input => !input.verifyTaskIds || Boolean(input.idempotencyKey), {
          message: 'verifyTaskIds requires an idempotencyKey.',
        })
        .parse(body)
      return Response.json(await reconcileImplementationValidation({ planId, ...value }))
    }
    const value = z
      .object({
        run: implementationValidationRunSchema,
        idempotencyKey: idSchema,
      })
      .parse(body)
    return Response.json(await recordImplementationValidation({ planId, ...value }))
  }
  if (action === 'complete') {
    const value = z
      .object({
        approvedBy: z.string().min(1),
        contentHash: z.string().startsWith('sha256:'),
        idempotencyKey: idSchema,
      })
      .parse(body)
    return Response.json(await approveImplementationCompletion({ planId, ...value }))
  }
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

async function postImplementationOperation(operation: string[], body: unknown) {
  if (operation[3] === 'validations' && operation[4] === 'readiness')
    return postImplementationOperationUnchecked(operation, body)
  return receiptBackedLifecycleMutation('implementation', operation, body, postImplementationOperationUnchecked)
}

async function receiptBackedLifecycleMutation(
  domain: 'baseline' | 'implementation',
  operation: string[],
  body: unknown,
  mutate: (operation: string[], body: unknown) => Promise<Response>,
) {
  const planId = routePlanIdSchema.parse(operation[1])
  const { idempotencyKey } = z.object({ idempotencyKey: idSchema }).passthrough().parse(body)
  const result = await validationReceiptMutation({
    operationName: `${domain}_${operation.slice(3).join('_')}`,
    planId,
    idempotencyKey,
    request: body,
    mutate: async () => (await mutate(operation, body)).json() as Promise<unknown>,
  })
  return Response.json(result)
}

// Baseline actions are thin coordinator API wrappers around the lifecycle-owned service.
// fallow-ignore-next-line complexity
async function postBaselineOperationUnchecked(operation: string[], body: unknown) {
  const { planId, action } = lifecycleMutationRoute(operation)
  if (action === 'start') {
    const value = idempotencyValue(body)
    return Response.json(await startBaselineExecution(planId, value))
  }
  if (action === 'reconcile') {
    const value = idempotencyValue(body)
    return Response.json(await reconcileBaselineExecution(planId, value))
  }
  if (action === 'cancel') {
    const value = idempotencyValue(body)
    return Response.json(await cancelBaselineExecution(planId, value))
  }
  if (action === 'retry') {
    const value = z
      .object({
        reason: z.string().trim().min(1),
        expectedValidationHash: z.string().startsWith('sha256:'),
        idempotencyKey: idSchema,
      })
      .parse(body)
    return Response.json(await retryBaselineAfterRepair({ planId, ...value }, value))
  }
  if (action === 'accept') {
    const value = idempotencyValue(body)
    return Response.json(await acceptBaseline(planId, value))
  }
  if (action === 'failures' && operation[5] === 'acknowledge') {
    const value = z.object({ acknowledgedBy: z.string().min(1), idempotencyKey: idSchema }).parse(body)
    return Response.json(
      await acknowledgeBaselineFailure(
        {
          planId,
          attemptId: idSchema.parse(operation[4]),
          acknowledgedBy: value.acknowledgedBy,
        },
        value,
      ),
    )
  }
  if (action === 'regressions' && operation[5] === 'justify') {
    const value = z.object({ justification: z.string().trim().min(1), idempotencyKey: idSchema }).parse(body)
    await justifyBaselineRegressionPass(
      {
        planId,
        attemptId: idSchema.parse(operation[4]),
        justification: value.justification,
      },
      value,
    )
    return Response.json(coordinatorAcknowledgement())
  }
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

async function postBaselineOperation(operation: string[], body: unknown) {
  return receiptBackedLifecycleMutation('baseline', operation, body, postBaselineOperationUnchecked)
}

export async function GET(request: Request, context: RouteContext) {
  let operation: string[] = []
  try {
    await guardCoordinatorRequest(request)
    operation = (await context.params).operation
    return await validatedCoordinatorResponse(await dispatchGet(request, operation), 'GET', operation)
  } catch (error) {
    return await responseError(error, coordinatorErrorContext(request, operation))
  }
}

async function postRegister(body: unknown) {
  const input = z
    .object({
      planId: routePlanIdSchema,
      coordinatorId: z.string().min(1),
      reconnectConnectionId: z.string().uuid().optional(),
      takeoverApproved: z.boolean().optional(),
    })
    .parse(body)
  return Response.json(await registerCoordinator(input))
}

async function postHeartbeat(body: unknown) {
  const input = z
    .object({ planId: routePlanIdSchema, coordinatorId: z.string().min(1), connectionId: z.string().uuid() })
    .parse(body)
  return Response.json(await heartbeatCoordinator(input))
}

const createPlanArtifactSchema = planArtifactSchema.omit({ planId: true }).extend({ planId: planIdSchema.optional() })
const createPlanBodySchema = z.object({
  plan: z.union([createPlanArtifactSchema, z.string()]),
  target: z.string().min(1).optional(),
  source: z
    .object({
      path: z.string().min(1),
      external: z.boolean(),
      warning: z.string().optional(),
    })
    .optional(),
  delegation: z
    .object({ receipt: z.unknown(), delegatedCoordinatorId: z.string().min(1), operationKey: z.string().min(1) })
    .optional(),
})

function parseCreatePlanBody(body: unknown) {
  const value = createPlanBodySchema.parse(body)
  const plan =
    typeof value.plan === 'string'
      ? (parseYamlArtifact('plan', value.plan) as z.infer<typeof planArtifactSchema>)
      : planArtifactSchema.parse({ ...value.plan, planId: value.plan.planId ?? createOpaquePlanId() })
  return { ...value, plan }
}

function sourceResponse(source: z.infer<typeof createPlanBodySchema>['source']) {
  if (!source) return {}
  return {
    source,
    ...(source.external
      ? { warnings: ['Plan source is outside the coordinator project and was explicitly allowed.'] }
      : {}),
  }
}

// fallow-ignore-next-line complexity
async function postCreatePlan(request: Request, body: unknown) {
  const value = parseCreatePlanBody(body)
  const identity = await ensureProjectIdentity()
  const targetProject = value.target ? await resolveTargetProject(value.target) : undefined
  await authorizeDelegatedPlanCreation(value.delegation, targetProject)
  const createdPlan = await createCoordinatorPlan(value.plan, { targetProjectId: targetProject?.id })
  return Response.json(
    {
      ...withLinks(createdPlan, createdPlan.planId, request, targetProject?.id),
      hubProject: {
        fingerprint: identity.projectFingerprint,
        canonicalPath: identity.canonicalProjectPath,
      },
      coordinatorProject: {
        fingerprint: identity.projectFingerprint,
        canonicalPath: identity.canonicalProjectPath,
      },
      ...(targetProject ? { targetProject } : {}),
      ...sourceResponse(value.source),
    },
    { status: 201 },
  )
}

async function authorizeDelegatedPlanCreation(
  delegation: z.infer<typeof createPlanBodySchema>['delegation'],
  targetProject: Awaited<ReturnType<typeof resolveTargetProject>> | undefined,
) {
  if (!delegation) return
  if (!targetProject) throw new ServiceError('Delegated plan creation requires a registered target.', 'VALIDATION')
  await verifyDelegatedCoordinatorReceipt({
    receipt: delegation.receipt,
    delegatedCoordinatorId: delegation.delegatedCoordinatorId,
    operationKey: delegation.operationKey,
    targetFingerprint: targetProject.fingerprint,
    pathFingerprint: `sha256:${createHash('sha256').update(targetProject.canonicalPath).digest('hex')}`,
    permission: 'plan_create',
    briefOrPlanHash: undefined,
  })
}

async function postTargetProject(body: unknown) {
  const value = z
    .object({
      path: z.string().min(1),
      displayName: z.string().min(1).optional(),
      initializeGit: z.boolean().optional(),
    })
    .parse(body)
  const identity = await ensureProjectIdentity()
  const git = await initializeTargetGitRepository(value.path, value.initializeGit ?? false)
  const targetProject = await registerTargetProject({ projectPath: value.path, displayName: value.displayName })
  return Response.json(
    {
      targetProject,
      git,
      marker: await writeTargetProjectMarker(targetProject, identity.projectFingerprint),
    },
    { status: 201 },
  )
}

async function postStandaloneTestRun(body: unknown) {
  const value = z
    .object({
      target: z.string().min(1),
      environmentId: z.string().min(1),
      name: z.string().min(1).optional(),
      tagExpression: z.string().optional(),
      testWorkersCount: z.number().int().positive().optional(),
      browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']).optional(),
      planId: planIdSchema.optional(),
      validationId: idSchema.optional(),
      implementationValidationRunId: idSchema.optional(),
      featurePaths: z.array(z.string().min(1)).optional(),
      importPaths: z.array(z.string().min(1)).optional(),
      supportPaths: z.array(z.string().min(1)).optional(),
      prepareWorkspace: z.boolean().optional(),
      expectedTestCases: z.array(z.object({ testCaseId: idSchema, testSuiteId: idSchema.nullish() })).optional(),
    })
    .superRefine((input, context) => {
      if (input.planId && input.expectedTestCases?.some(link => !link.testSuiteId)) {
        context.addIssue({
          code: 'custom',
          path: ['expectedTestCases'],
          message: 'Plan-bound expected test cases require a testSuiteId.',
        })
      }
    })
    .parse(body)
  return Response.json(await createStandaloneTargetTestRun(value), { status: 201 })
}

async function postTestRunPreflight(body: unknown) {
  const value = z
    .object({
      target: z.string().min(1).optional(),
      environmentId: z.string().min(1).optional(),
      planId: planIdSchema.optional(),
      validationId: idSchema.optional(),
      featurePaths: z.array(z.string().min(1)).optional(),
      importPaths: z.array(z.string().min(1)).optional(),
      supportPaths: z.array(z.string().min(1)).optional(),
    })
    .parse(body)
  return Response.json(await preflightStandaloneTargetTestRun(value))
}

async function postProviderRegistration(operation: string[], body: unknown) {
  const providerKey = z.string().min(1).parse(operation[1])
  if (operation[2] === 'probe') return Response.json(await probeProviderRegistration(providerKey))
  if (operation[2] === 'update') {
    const value = z
      .object({
        executablePath: z.string().trim().nullable().optional(),
        defaultProfile: z.string().trim().nullable().optional(),
        defaultModel: z.string().trim().nullable().optional(),
        enabled: z.boolean().optional(),
        launchEnabled: z.boolean().optional(),
        settings: z.record(z.string(), z.unknown()).nullable().optional(),
      })
      .parse(body)
    return Response.json(await updateProviderRegistration({ providerKey, ...value }))
  }
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

async function postProviderRun(operation: string[], body: unknown) {
  if (operation.length === 1) {
    const value = z
      .object({
        targetProjectId: z.string().uuid(),
        planId: routePlanIdSchema.optional(),
        providerKey: z.string().min(1).optional(),
        providerProfile: z.string().min(1).optional(),
        launchPrompt: z.string().trim().min(1),
      })
      .parse(body)
    return Response.json(
      projectProviderWorkflowRun(
        await createProviderWorkflowRun({ ...value, approvedScope: { mode: 'planning_only' } }),
      ),
      {
        status: 201,
      },
    )
  }
  const runId = z.string().uuid().parse(operation[1])
  if (operation[2] === 'cancel')
    return Response.json(projectProviderWorkflowRun(await cancelProviderWorkflowRun(runId)))
  if (operation[2] === 'permissions') {
    const value = z
      .object({
        requestId: z.string().min(1),
        decision: z.enum(['approved', 'denied']),
        riskTier: z.string().min(1),
        requestedScope: z.string().min(1),
        payload: z.record(z.string(), z.unknown()).default({}),
        reason: z.string().optional(),
        decidedBy: z.string().min(1),
      })
      .parse(body)
    return Response.json(await recordProviderPermissionDecision({ runId, ...value }))
  }
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

async function postStartPlan(operation: string[]) {
  return Response.json(await startCoordinatorPlan(routePlanIdSchema.parse(operation[1])))
}

async function postTaskUpdate(operation: string[], body: unknown) {
  const value = z.object({ status: z.string().min(1), detail: z.string().optional() }).parse(body)
  return Response.json(
    await updateCoordinatorTask({
      planId: routePlanIdSchema.parse(operation[1]),
      taskId: idSchema.parse(operation[3]),
      ...value,
    }),
  )
}

async function postEventAcknowledgement(operation: string[], body: unknown) {
  const value = z
    .object({
      sequence: z.number().int().positive().optional(),
      acknowledgeThroughSequence: z.number().int().positive().optional(),
      coordinatorId: z.string().min(1),
    })
    .refine(input => (input.sequence === undefined) !== (input.acknowledgeThroughSequence === undefined), {
      message: 'Provide exactly one event acknowledgement sequence.',
    })
    .parse(body)
  const planId = routePlanIdSchema.parse(operation[1])
  if (value.acknowledgeThroughSequence !== undefined) {
    return Response.json(
      await acknowledgePlanEventsThrough({
        planId,
        sequence: value.acknowledgeThroughSequence,
        coordinatorId: value.coordinatorId,
      }),
    )
  }
  return Response.json(
    await acknowledgePlanEvent({ planId, sequence: value.sequence!, coordinatorId: value.coordinatorId }),
  )
}

// Request parsing branches stay in this thin HTTP adapter.
async function validationReceiptMutation<T>(input: {
  operationName: string
  planId: string
  idempotencyKey: string
  request: unknown
  mutate: () => Promise<T>
}) {
  const operation = await prepareCoordinatorOperation({
    operationName: `route_${input.operationName}`,
    scopeKey: input.planId,
    planId: input.planId,
    idempotencyKey: input.idempotencyKey,
    request: input.request,
    recoverUnknown: true,
  })
  if (operation.replay) return readCoordinatorOperationResult<T>(operation.receipt)!
  try {
    const result = await input.mutate()
    await completeCoordinatorOperation(operation.receipt, result)
    return result
  } catch (error) {
    await recordCoordinatorOperationOutcome(
      operation.receipt,
      error instanceof ServiceError ? 'not_committed' : 'unknown',
    ).catch(() => undefined)
    throw error
  }
}

// fallow-ignore-next-line complexity
async function postValidationOperation(request: Request, operation: string[], body: unknown) {
  const planId = routePlanIdSchema.parse(operation[1])
  if (operation[3] === 'resources' && operation[4] === 'propose') {
    const value = z.object({ proposal: z.unknown(), idempotencyKey: idSchema }).parse(body)
    return Response.json(
      await validationReceiptMutation({
        operationName: 'validation_resources_propose',
        planId,
        idempotencyKey: value.idempotencyKey,
        request: { proposal: value.proposal },
        mutate: () => proposeValidationResources({ planId, proposal: value.proposal }),
      }),
    )
  }
  if (operation[3] === 'resources' && operation[4] === 'abandon') {
    const value = z.object({ idempotencyKey: idSchema, reason: z.string().trim().min(1) }).parse(body)
    return Response.json(
      await validationReceiptMutation({
        operationName: 'validation_resources_abandon',
        planId,
        idempotencyKey: value.idempotencyKey,
        request: { reason: value.reason },
        mutate: () => abandonValidationResourceProposal({ planId, ...value }),
      }),
    )
  }
  if (operation[3] === 'resources' && operation[4] === 'cleanup') {
    const value = z.object({ idempotencyKey: idSchema }).parse(body)
    return Response.json(
      await validationReceiptMutation({
        operationName: 'validation_resources_cleanup',
        planId,
        idempotencyKey: value.idempotencyKey,
        request: {},
        mutate: () => cleanupValidationResourceProposal({ planId, ...value }),
      }),
    )
  }
  if (operation[3] === 'ast') {
    if (operation[4] === 'extension-policy') return Response.json(await readValidationAstExtensionPolicyForPlan(planId))
    if (operation[4] === 'extension-reviews') {
      const value = z.object({ operationId: z.string().optional() }).parse(body)
      return Response.json(await readValidationAstExtensionReviewsForPlan(planId, value.operationId))
    }
    const value = z
      .object({
        submission: z.unknown(),
        expectedReceiptHash: z.string().startsWith('sha256:').optional(),
        idempotencyKey: idSchema.optional(),
      })
      .parse(body)
    if (operation[4] === 'check') return Response.json(await checkValidationAstForPlan(planId, value.submission))
    if (operation[4] === 'preview') return Response.json(await previewValidationAstForPlan(planId, value.submission))
    if (operation[4] === 'compile' && value.expectedReceiptHash && value.idempotencyKey) {
      const expectedReceiptHash = value.expectedReceiptHash
      const compiled = await validationReceiptMutation({
        operationName: 'validation_ast_compile',
        planId,
        idempotencyKey: value.idempotencyKey,
        request: { submission: value.submission, expectedReceiptHash: value.expectedReceiptHash },
        mutate: () =>
          compileValidationAstForPlan({
            planId,
            submission: value.submission,
            expectedReceiptHash,
          }),
      })
      return Response.json(projectValidationAstPublishOperation(compiled))
    }
    throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
  }
  if (operation[3] === 'draft' || operation[3] === 'publish')
    throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
  if (operation[3] === 'feedback') {
    const value = z
      .object({
        scope: z.enum(['test_artifact', 'product_scope']),
        target: reviewTargetSchema,
        body: z.string().trim().min(1),
        actor: z.string().min(1).optional(),
        affectedValidationIds: z.array(idSchema).optional(),
        affectedFilePaths: z.array(z.string().min(1)).optional(),
        idempotencyKey: idSchema,
      })
      .parse(body)
    return Response.json(
      await validationReceiptMutation({
        operationName: 'validation_feedback',
        planId,
        idempotencyKey: value.idempotencyKey,
        request: value,
        mutate: () => submitValidationFeedback({ planId, ...value }),
      }),
    )
  }
  if (operation[3] === 'submit') {
    const binding = astReviewBindingSchema.extend({ idempotencyKey: idSchema }).parse(body)
    return Response.json(
      await validationReceiptMutation({
        operationName: 'validation_review_submit',
        planId,
        idempotencyKey: binding.idempotencyKey,
        request: binding,
        mutate: () => submitValidationReview(planId, binding),
      }),
    )
  }
  if (operation[3] === 'reconcile') {
    const value = z.object({ idempotencyKey: idSchema }).parse(body)
    return Response.json(
      await validationReceiptMutation({
        operationName: 'validation_review_reconcile',
        planId,
        idempotencyKey: value.idempotencyKey,
        request: {},
        mutate: () => reconcileManagedValidationReviewState(planId),
      }),
    )
  }
  if (operation[3] === 'nodes') {
    const value = astReviewBindingSchema
      .extend({
        decision: z.enum(['approved', 'rejected', 'deferred']),
        decidedBy: z.string().min(1),
        idempotencyKey: idSchema,
      })
      .parse(body)
    const validationId = idSchema.parse(operation[4])
    return Response.json(
      await validationReceiptMutation({
        operationName: 'validation_node_decide',
        planId,
        idempotencyKey: value.idempotencyKey,
        request: { validationId, ...value },
        mutate: () => decideValidationNode({ planId, validationId, ...value }),
      }),
    )
  }
  if (operation[3] === 'files') {
    const value = z
      .object({
        path: z.string().min(1),
        contentHash: z.string().startsWith('sha256:'),
        approvedBy: z.string().min(1),
        idempotencyKey: idSchema,
      })
      .parse(body)
    return Response.json(
      await validationReceiptMutation({
        operationName: 'validation_file_approve',
        planId,
        idempotencyKey: value.idempotencyKey,
        request: value,
        mutate: () => approveValidationFile({ planId, ...value }),
      }),
    )
  }
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

async function postDelegationCreate(body: unknown) {
  const value = z
    .object({
      parentCoordinatorId: z.string().min(1),
      delegatedCoordinatorId: z.string().min(1),
      targetProjectId: z.string().min(1).optional(),
      targetFingerprint: z.string().startsWith('sha256:'),
      pathFingerprint: z.string().startsWith('sha256:'),
      purpose: z.string().min(1),
      permissions: z.array(z.enum(DELEGATED_COORDINATOR_PERMISSIONS)).min(1),
      prohibitions: z.array(z.string().min(1)).optional(),
      briefOrPlanHash: z.string().startsWith('sha256:').optional(),
      expiresAt: z.string().datetime({ offset: true }),
    })
    .parse(body)
  return Response.json(await createDelegatedCoordinatorReceipt(value), { status: 201 })
}

async function postDelegationRevoke(operation: string[], body: unknown) {
  const value = z.object({ revokedBy: z.string().min(1), reason: z.string().min(1).optional() }).parse(body)
  return Response.json(await revokeDelegatedCoordinatorReceipt({ id: z.string().uuid().parse(operation[1]), ...value }))
}

async function postObjective(body: unknown) {
  const value = z
    .object({
      objectiveId: idSchema.optional(),
      title: z.string().min(1),
      milestones: z.array(z.object({ id: idSchema, title: z.string().min(1) })),
      plans: z.array(
        z.object({
          planId: routePlanIdSchema,
          milestoneId: idSchema,
          dependsOn: z.array(routePlanIdSchema).optional(),
          impactedPaths: z.array(z.string().min(1)).optional(),
        }),
      ),
    })
    .parse(body)
  return Response.json(await createObjective(value))
}

function postCoordinationSlo(body: unknown) {
  const value = z
    .object({
      phases: z.array(
        z.object({
          phase: z.string().min(1),
          activeAppraiseMs: z.number().int().nonnegative(),
          activeAgentMs: z.number().int().nonnegative(),
          humanReviewMs: z.number().int().nonnegative(),
        }),
      ),
      responseBytes: z.array(z.number().int().nonnegative()),
      operations: z.number().int().nonnegative(),
      retries: z.number().int().nonnegative(),
      approvals: z.number().int().nonnegative(),
    })
    .parse(body)
  return Response.json(evaluateCoordinationSlo(value))
}

async function postRepositoryExport(operation: string[], body: unknown) {
  if (operation.length === 1) {
    const value = z
      .object({
        publishOperationId: z.string().min(1),
        policy: z.enum(['disabled', 'optional', 'required']),
        destinationPath: z.string().min(1).optional(),
      })
      .parse(body)
    return Response.json(await enqueueRepositoryExport(value))
  }
  const value = z.object({ allowReplaceConflicts: z.boolean().optional() }).parse(body)
  return Response.json(
    await runRepositoryExportJob(z.string().uuid().parse(operation[1]), {
      allowReplaceConflicts: value.allowReplaceConflicts,
    }),
  )
}

async function postDelegatedValidation(request: Request, body: unknown) {
  const value = z.object({ submission: z.unknown(), receipt: z.unknown() }).parse(body)
  return Response.json(
    await submitDelegatedValidationAst({
      submission: value.submission,
      receipt: value.receipt,
      targetFingerprint: request.headers.get('x-appraise-project') ?? '',
    }),
  )
}

async function postPlanSnapshot(operation: string[], body: unknown) {
  const value = z.object({ archiveThroughSequence: z.number().int().nonnegative().optional() }).parse(body)
  return Response.json(
    await createLifecycleSnapshot(routePlanIdSchema.parse(operation[1]), {
      archiveThroughSequence: value.archiveThroughSequence,
    }),
  )
}

async function postPlanContinuation(operation: string[], body: unknown) {
  const value = z
    .object({
      narrative: z.string(),
      references: z.array(z.string().min(1)).optional(),
      objectiveReference: z.string().min(1).optional(),
    })
    .parse(body)
  return Response.json(await createContinuationPackage({ planId: routePlanIdSchema.parse(operation[1]), ...value }))
}

async function postDiagnosticPreflight(request: Request, body: unknown) {
  const receipt = await recordAgentPreflightReceipt(body)
  const baseUrl = request.headers.get('x-appraise-base-url') ?? new URL(request.url).origin
  const query = new URLSearchParams({ preflight: receipt.id })
  if (receipt.targetProjectId) query.set('project', receipt.targetProjectId)
  return Response.json({
    id: receipt.id,
    status: receipt.status,
    snapshotHash: receipt.snapshotHash,
    observedAt: receipt.observedAt,
    browserUrl: `${baseUrl}/projects?${query}`,
  })
}

function qualityPlanId(operation: string[]) {
  return z.string().min(1).parse(operation[2])
}

function qualityAssessmentId(operation: string[]) {
  return z.string().min(1).parse(operation[2])
}

async function postQualityRequirementSource(body: unknown) {
  const value = z
    .object({ target: z.string().min(1), idempotencyKey: z.string().min(1) })
    .passthrough()
    .parse(body)
  if (!('source' in value)) throw new ServiceError('Quality requirement source is required.', 'VALIDATION')
  return Response.json(await submitQualityRequirementSource({ ...value, source: value.source }), { status: 201 })
}

async function postQualityRequirementAnalyze(operation: string[], body: unknown) {
  const value = z.object({ revisionId: z.string().min(1).optional() }).parse(body)
  return Response.json(await readQualityRequirementGraph({ qualityPlanId: qualityPlanId(operation), ...value }))
}

async function postQualityRequirementQueries(operation: string[], body: unknown) {
  const value = z
    .object({
      revisionId: z.string().min(1).optional(),
      answers: z
        .array(
          z.object({
            queryId: z.string().min(1),
            status: z.enum(['ANSWERED', 'DEFERRED', 'ACCEPTED_ASSUMPTION']),
            answer: z.string().optional(),
            rationale: z.string().optional(),
          }),
        )
        .min(1),
      idempotencyKey: z.string().min(1),
    })
    .parse(body)
  return Response.json(await answerQualityRequirementQueries({ qualityPlanId: qualityPlanId(operation), ...value }))
}

async function postQualityRequirementApprove(operation: string[], body: unknown) {
  const value = z
    .object({
      revisionId: z.string().min(1),
      expectedRevisionHash: z.string().startsWith('sha256:'),
      approvedBy: z.string().min(1),
    })
    .parse(body)
  return Response.json(await approveQualityRequirements({ qualityPlanId: qualityPlanId(operation), ...value }))
}

async function postQualityScenarioProposal(operation: string[], body: unknown) {
  const value = z
    .object({ revisionId: z.string().min(1), idempotencyKey: z.string().min(1) })
    .passthrough()
    .parse(body)
  if (!('proposal' in value)) throw new ServiceError('Scenario design proposal is required.', 'VALIDATION')
  return Response.json(
    await proposeQualityValidationDesign({
      qualityPlanId: qualityPlanId(operation),
      ...value,
      proposal: value.proposal,
    }),
  )
}

async function postQualityScenarioApproval(operation: string[], body: unknown) {
  const value = z
    .object({
      revisionId: z.string().min(1),
      expectedDesignHash: z.string().startsWith('sha256:'),
      approvedBy: z.string().min(1),
    })
    .parse(body)
  return Response.json(await approveQualityValidationDesign({ qualityPlanId: qualityPlanId(operation), ...value }))
}

async function postQualityValidationCompile(operation: string[], body: unknown) {
  const value = z
    .object({ revisionId: z.string().min(1), expectedDesignHash: z.string().startsWith('sha256:') })
    .passthrough()
    .parse(body)
  if (!('realization' in value)) throw new ServiceError('Validation realization is required.', 'VALIDATION')
  return Response.json(
    await compileQualityValidations({
      qualityPlanId: qualityPlanId(operation),
      ...value,
      realization: value.realization,
    }),
  )
}

async function postQualityValidationPublish(operation: string[], body: unknown) {
  const value = z
    .object({
      revisionId: z.string().min(1),
      validationVersionIds: z.array(z.string().min(1)).min(1),
      expectedCompilationHash: z.string().startsWith('sha256:'),
    })
    .parse(body)
  return Response.json(await publishQualityValidations({ qualityPlanId: qualityPlanId(operation), ...value }))
}

async function postQualityAssessmentCreate(body: unknown) {
  const value = z
    .object({
      qualityPlanId: z.string().min(1),
      revisionId: z.string().min(1),
      baselineAssessmentId: z.string().min(1).optional(),
      idempotencyKey: z.string().min(1),
    })
    .passthrough()
    .parse(body)
  if (!('subject' in value)) throw new ServiceError('Assessment subject is required.', 'VALIDATION')
  return Response.json(await createQualityAssessment({ ...value, subject: value.subject }), { status: 201 })
}

async function postQualityAssessmentDecision(operation: string[], body: unknown) {
  const value = z
    .object({
      expectedEvidenceSetHash: z.string().startsWith('sha256:'),
      decision: z.enum(['accepted', 'rejected', 'accepted_with_limitations']),
      decidedBy: z.string().min(1),
      rationale: z.string().min(1),
    })
    .parse(body)
  return Response.json(await decideQualityAssessment({ assessmentId: qualityAssessmentId(operation), ...value }))
}

const qualityPostHandlers: Record<string, (operation: string[], body: unknown) => Promise<Response>> = {
  'requirements/source': (_operation, body) => postQualityRequirementSource(body),
  'plans/requirements/analyze': postQualityRequirementAnalyze,
  'plans/requirements/queries': postQualityRequirementQueries,
  'plans/requirements/approve': postQualityRequirementApprove,
  'plans/validation-design/proposals': postQualityScenarioProposal,
  'plans/validation-design/approve': postQualityScenarioApproval,
  'plans/validations/compile': postQualityValidationCompile,
  'plans/validations/publish': postQualityValidationPublish,
  assessments: (_operation, body) => postQualityAssessmentCreate(body),
  'assessments/decision': postQualityAssessmentDecision,
}

const qualityPostSecondSegment: Record<string, number> = {
  assessments: 3,
  plans: 3,
  requirements: 2,
}

const qualityPostThirdSegment: Record<string, number> = {
  plans: 4,
}

function qualityPostSegment(operation: string[], indexes: Record<string, number>) {
  return operation[indexes[operation[1] ?? '']]
}

function qualityPostHandler(operation: string[]) {
  const key = [
    operation[1],
    qualityPostSegment(operation, qualityPostSecondSegment),
    qualityPostSegment(operation, qualityPostThirdSegment),
  ]
    .filter(Boolean)
    .join('/')
  return qualityPostHandlers[key]
}

async function postQualityOperation(operation: string[], body: unknown) {
  const handler = qualityPostHandler(operation)
  if (handler) return handler(operation, body)
  throw qualityLifecyclePending(operation)
}

async function postStepDefinitions(operation: string[], body: unknown) {
  const result = await coordinatorStepDefinitionService.write(operation, body)
  return result.status ? Response.json(result.body, { status: result.status }) : Response.json(result.body)
}

async function dispatchPost(request: Request, operation: string[], body: unknown) {
  const id = coordinatorOperationRegistry.resolve('POST', operation)
  const handlers: Partial<Record<CoordinatorOperationId, () => Promise<Response>>> = {
    'delegation-create': () => postDelegationCreate(body),
    'step-definitions-write': () => postStepDefinitions(operation, body),
    'delegation-revoke': () => postDelegationRevoke(operation, body),
    'objective-create': () => postObjective(body),
    'coordination-slo': async () => postCoordinationSlo(body),
    'diagnostic-preflight-write': () => postDiagnosticPreflight(request, body),
    'repository-export': () => postRepositoryExport(operation, body),
    'delegated-validation-submit': () => postDelegatedValidation(request, body),
    'provider-runs-write': () => {
      assertProviderNativeRunsEnabled()
      return postProviderRun(operation, body)
    },
    'quality-write': async () => {
      return postQualityOperation(operation, body)
    },
    'plan-snapshot': () => postPlanSnapshot(operation, body),
    'plan-continuation': () => postPlanContinuation(operation, body),
    'providers-write': () => {
      assertProviderNativeRunsEnabled()
      return postProviderRegistration(operation, body)
    },
    register: () => postRegister(body),
    heartbeat: () => postHeartbeat(body),
    'plan-create': () => postCreatePlan(request, body),
    'target-project-write': () => postTargetProject(body),
    'test-run-write': () => (operation[1] === 'preflight' ? postTestRunPreflight(body) : postStandaloneTestRun(body)),
    'plan-start': () => postStartPlan(operation),
    'plan-task-update': () => postTaskUpdate(operation, body),
    'plan-event-acknowledge': () => postEventAcknowledgement(operation, body),
    'plan-validation-write': () => postValidationOperation(request, operation, body),
    'plan-baseline-write': () => postBaselineOperation(operation, body),
    'plan-implementation-write': () => postImplementationOperation(operation, body),
  }
  return handlers[id]!()
}

export async function POST(request: Request, context: RouteContext) {
  const startedAt = Date.now()
  let operation: string[] = []
  let body: unknown
  let operationCompleted = false
  try {
    operation = (await context.params).operation
    body = await readCoordinatorJson(request)
    await guardPostRequest(request, operation, body)
    const response = await dispatchPost(request, operation, body)
    operationCompleted = true
    const validatedResponse = await validatedCoordinatorResponse(response, 'POST', operation)
    await recordCoordinatorResponseMetric({ operation, body, response, startedAt }).catch(error =>
      console.warn('Plan operation telemetry could not be recorded.', error),
    )
    return validatedResponse
  } catch (error) {
    const response = await responseError(
      operationCompleted ? new CoordinatorPostCommitSerializationError({ cause: error }) : error,
      coordinatorErrorContext(request, operation, body),
    )
    await recordCoordinatorResponseMetric({ operation, body, response, startedAt }).catch(error =>
      console.warn('Plan operation telemetry could not be recorded.', error),
    )
    return response
  }
}

async function guardPostRequest(request: Request, operation: string[], body: unknown) {
  try {
    await guardCoordinatorRequest(request)
  } catch (error) {
    if (!isDelegatedPlanCreate(operation, body)) throw error
  }
}

// This fail-closed predicate is deliberately explicit because it is the only coordinator-auth bypass.
// fallow-ignore-next-line complexity
function isDelegatedPlanCreate(operation: string[], body: unknown): boolean {
  return (
    operation.length === 1 &&
    operation[0] === 'plans' &&
    typeof body === 'object' &&
    body !== null &&
    'delegation' in body
  )
}

export async function PUT(request: Request, context: RouteContext) {
  let operation: string[] = []
  let body: unknown
  try {
    await guardCoordinatorRequest(request)
    operation = (await context.params).operation
    coordinatorOperationRegistry.resolve('PUT', operation)
    const parsedBody = z
      .object({ plan: planArtifactSchema, expectedHash: z.string().startsWith('sha256:') })
      .parse(await readCoordinatorJson(request))
    body = parsedBody
    const planId = routePlanIdSchema.parse(operation[1])
    const revised = await reviseCoordinatorPlan(planId, parsedBody.plan, parsedBody.expectedHash)
    return await validatedCoordinatorResponse(
      Response.json(withLinks(revised, revised.planId, request, revised.targetProjectId)),
      'PUT',
      operation,
    )
  } catch (error) {
    return await responseError(error, coordinatorErrorContext(request, operation, body))
  }
}
