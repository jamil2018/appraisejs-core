import type { McpRegistryContext } from '../registry.js'
import {
  applyAuthoringResponseMode,
  defaultReviewLoopTimeoutMs,
  latestGateEvent,
  linkFromSnapshot,
  nextApprovalWaitSequence,
  responseModeSchema,
  text,
  validationGateEventStatus,
  validationGateStatus,
  validationIntegrityBlockedResponse,
  validationReviewBrowserUrl,
  validationReviewPendingResponse,
  waitForEvents,
  z,
} from '../shared.js'
import type {
  CoordinatorToolEvent,
  DelegatedAuthorizationReceipt,
  PlanSnapshot,
  ValidationAstSubmission,
} from '../shared.js'

export function registerValidationOperations(context: McpRegistryContext): void {
  const { server, api, readSnapshot } = context
  server.registerTool(
    'validation_resources_propose',
    {
      description:
        'Transactionally propose target-bound managed-validation resources and receive stable IDs plus a refreshed context hash.',
      inputSchema: {
        planId: z.string(),
        proposal: z.unknown(),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ planId, proposal, idempotencyKey, responseMode }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`plans/${planId}/validations/resources/propose`, {
            method: 'POST',
            body: JSON.stringify({ proposal, idempotencyKey }),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'validation_resources_abandon',
    {
      description: 'Idempotently abandon a validation resource proposal before safe cleanup.',
      inputSchema: { planId: z.string(), idempotencyKey: z.string(), reason: z.string().min(1) },
    },
    async ({ planId, idempotencyKey, reason }) =>
      text(
        await api.request(`plans/${planId}/validations/resources/abandon`, {
          method: 'POST',
          body: JSON.stringify({ idempotencyKey, reason }),
        }),
      ),
  )

  server.registerTool(
    'validation_resources_cleanup',
    {
      description:
        'Safely clean abandoned proposal-owned resources; reused or referenced resources are retained and reported.',
      inputSchema: { planId: z.string(), idempotencyKey: z.string() },
    },
    async ({ planId, idempotencyKey }) =>
      text(
        await api.request(`plans/${planId}/validations/resources/cleanup`, {
          method: 'POST',
          body: JSON.stringify({ idempotencyKey }),
        }),
      ),
  )

  server.registerTool(
    'validation_ast_extension_reviews',
    {
      description: 'Read exact bounded extension reviews and the hash required to bind a review decision.',
      inputSchema: { planId: z.string(), operationId: z.string().optional() },
    },
    async ({ planId, operationId }) => text(await api.readValidationAstExtensionReviews(planId, operationId)),
  )

  server.registerTool(
    'delegated_validation_ast_submit',
    {
      description:
        'Submit a receipt-authorized Validation AST envelope for later compiler review checking; does not compile or publish.',
      inputSchema: { submission: z.unknown(), receipt: z.unknown() },
    },
    async ({ submission, receipt }) =>
      text(
        await api.submitDelegatedValidationAst(
          submission as ValidationAstSubmission,
          receipt as DelegatedAuthorizationReceipt,
        ),
      ),
  )

  server.registerTool(
    'validation_ast_extension_policy',
    {
      description: 'Read the bounded, versioned custom-extension capability policy for an authoritative target plan.',
      inputSchema: { planId: z.string(), responseMode: responseModeSchema },
    },
    async ({ planId }) => text(await api.readValidationAstExtensionPolicy(planId)),
  )

  server.registerTool(
    'validation_ast_compile',
    {
      description:
        'Project an exactly previewed Validation AST into canonical entities without runtime materialization.',
      inputSchema: {
        planId: z.string(),
        submission: z.unknown(),
        expectedReceiptHash: z.string().startsWith('sha256:'),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ planId, submission, expectedReceiptHash, idempotencyKey, responseMode }) => {
      const [result, snapshot] = await Promise.all([
        api.request(`plans/${planId}/validations/ast/compile`, {
          method: 'POST',
          body: JSON.stringify({ submission, expectedReceiptHash, idempotencyKey }),
        }),
        api.readPlan(planId) as Promise<PlanSnapshot>,
      ])
      const browserUrl = validationReviewBrowserUrl(linkFromSnapshot(snapshot.links, 'browser'))
      return text(
        applyAuthoringResponseMode(
          {
            ...(result as Record<string, unknown>),
            browserUrl,
            appraiseUrl: linkFromSnapshot(snapshot.links, 'appraise') ?? `appraise://plans/${planId}`,
            nextRecommendedAction: 'Open the validation review URL and wait for the Appraise-owned decision.',
            nextRequiredAgentBehavior: 'standby_for_validation_review',
          },
          responseMode,
        ),
      )
    },
  )

  server.registerTool(
    'validation_context_read',
    {
      description:
        'Read a bounded plan-intent context pack with coverage exploration, an editable deterministic AST starter/export, registry-first recipes, the versioned resource-proposal contract and examples, runtime preparation proposals, target metadata, and reusable resources.',
      inputSchema: {
        planId: z.string(),
        resourceTypes: z
          .array(
            z.enum([
              'modules',
              'testSuites',
              'testCases',
              'stepDefinitions',
              'locatorGroups',
              'locators',
              'environments',
            ]),
          )
          .optional(),
        query: z.string().optional(),
        limit: z.number().int().positive().max(200).default(50),
        sinceHash: z.string().optional(),
        responseMode: responseModeSchema,
      },
    },
    async ({ planId, resourceTypes, query, limit, sinceHash, responseMode }) => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (resourceTypes?.length) params.set('resourceTypes', resourceTypes.join(','))
      if (query) params.set('query', query)
      if (sinceHash) params.set('sinceHash', sinceHash)
      return text(
        applyAuthoringResponseMode(await api.request(`plans/${planId}/validations/context?${params}`), responseMode),
      )
    },
  )

  server.registerTool(
    'validation_review_loop',
    {
      description:
        'Wait for validation review to resolve through validations_approved, validation_changes_requested, or cancellation.',
      inputSchema: {
        planId: z.string(),
        afterSequence: z.number().int().nonnegative().default(0),
        timeoutMs: z.number().int().positive().max(300_000).default(defaultReviewLoopTimeoutMs),
        responseMode: responseModeSchema,
      },
    },
    async ({ planId, afterSequence, timeoutMs, responseMode }) => {
      const initial = (await api.request(`plans/${planId}/events?after=${afterSequence}`)) as {
        events?: CoordinatorToolEvent[]
      }
      let events = initial.events ?? []
      let current = await readSnapshot(planId)
      if (current.validationIntegrity?.status === 'integrity_blocked')
        return text(
          applyAuthoringResponseMode(validationIntegrityBlockedResponse(planId, current, afterSequence), responseMode),
        )
      let gateEvent = latestGateEvent(events, validationGateEventStatus)
      let lifecycleStatus = validationGateStatus(current.plan.lifecycle)

      if (!gateEvent && !lifecycleStatus) {
        const waited = await waitForEvents(
          api.request,
          planId,
          nextApprovalWaitSequence(afterSequence, events),
          timeoutMs,
        )
        events = [...events, ...(waited.events ?? [])]
        current = await readSnapshot(planId)
        if (current.validationIntegrity?.status === 'integrity_blocked')
          return text(
            applyAuthoringResponseMode(
              validationIntegrityBlockedResponse(planId, current, afterSequence),
              responseMode,
            ),
          )
        gateEvent = latestGateEvent(events, validationGateEventStatus)
        lifecycleStatus = validationGateStatus(current.plan.lifecycle)
      }

      if (!gateEvent && !lifecycleStatus) {
        return text(
          applyAuthoringResponseMode(
            validationReviewPendingResponse({ planId, current, events, afterSequence, timeoutMs }),
            responseMode,
          ),
        )
      }

      const status = gateEvent ? validationGateEventStatus(gateEvent.type) : lifecycleStatus
      return text(
        applyAuthoringResponseMode(
          {
            status,
            planId,
            revision: current.plan.revision,
            lifecycle: current.plan.lifecycle,
            contentHash: current.contentHash,
            links: current.links,
            terminal: status === 'cancelled',
            mustContinue: status !== 'cancelled',
            ...(gateEvent ? { eventSequence: gateEvent.sequence } : {}),
            events,
            currentAfterSequence: afterSequence,
            nextAfterSequence: nextApprovalWaitSequence(afterSequence, events),
            cursorGuidance:
              'afterSequence is exclusive. Acknowledge the observed validation gate only after the permitted transition or recovery action succeeds.',
            nextRecommendedAction:
              status === 'approved'
                ? 'Call baseline_start, then keep reconciling baseline evidence until baseline review is ready.'
                : status === 'changes_requested'
                  ? 'Read validation feedback, revise validation artifacts, publish again, and return to validation_review_loop standby.'
                  : 'Acknowledge cancellation and stop.',
            nextRequiredAgentBehavior:
              status === 'approved'
                ? 'start_baseline'
                : status === 'changes_requested'
                  ? 'revise_validation_artifacts'
                  : 'stop_after_cancellation',
          },
          responseMode,
        ),
      )
    },
  )

  server.registerTool(
    'validation_file_approve',
    {
      description:
        'Explicit user/Appraise decision relay: approve one flagged changed file for its exact current content hash.',
      inputSchema: {
        planId: z.string(),
        path: z.string(),
        contentHash: z.string(),
        approvedBy: z.string(),
        idempotencyKey: z.string().min(1),
      },
    },
    async ({ planId, ...body }) =>
      text(
        await api.request(`plans/${planId}/validations/files`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      ),
  )

  server.registerTool(
    'validation_feedback_submit',
    {
      description:
        'Route validation review feedback as test-artifact changes or product-scope changes with lifecycle invalidation.',
      inputSchema: {
        planId: z.string(),
        scope: z.enum(['test_artifact', 'product_scope']),
        target: z.discriminatedUnion('type', [
          z.object({ type: z.literal('plan') }),
          z.object({ type: z.literal('task'), taskId: z.string() }),
          z.object({ type: z.literal('validation'), validationId: z.string() }),
          z.object({ type: z.literal('result'), resultId: z.string() }),
          z.object({ type: z.literal('file'), path: z.string() }),
        ]),
        body: z.string().min(1),
        actor: z.string().optional(),
        affectedValidationIds: z.array(z.string()).optional(),
        affectedFilePaths: z.array(z.string()).optional(),
        idempotencyKey: z.string().min(1),
      },
    },
    async ({ planId, ...body }) =>
      text(
        await api.request(`plans/${planId}/validations/feedback`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      ),
  )

  server.registerTool(
    'validation_review_reconcile',
    {
      description:
        'Recovery-only reconciliation for a review_ready validation after a crash. Normal validation decisions return the refreshed review binding atomically.',
      inputSchema: { planId: z.string(), idempotencyKey: z.string().min(1) },
    },
    async ({ planId, idempotencyKey }) =>
      text(
        await api.request(`plans/${planId}/validations/reconcile`, {
          method: 'POST',
          body: JSON.stringify({ idempotencyKey }),
        }),
      ),
  )

  server.registerTool(
    'validation_review_submit',
    {
      description:
        'Explicit user/Appraise decision relay: submit the revision-level validation review after all required decisions are current.',
      inputSchema: {
        planId: z.string(),
        operationHash: z.string().startsWith('sha256:').optional(),
        reviewStateHash: z.string().startsWith('sha256:').optional(),
        extensionArtifactHashes: z.array(z.string().startsWith('sha256:')).optional(),
        idempotencyKey: z.string().min(1),
      },
    },
    async ({ planId, ...binding }) =>
      text(
        await api.request(`plans/${planId}/validations/submit`, {
          method: 'POST',
          body: JSON.stringify(binding),
        }),
      ),
  )
}
