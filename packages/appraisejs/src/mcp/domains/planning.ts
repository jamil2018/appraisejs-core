import type { McpRegistryContext } from '../registry.js'
import {
  CoordinatorRequestError,
  applyAuthoringResponseMode,
  applyLifecycleResponseMode,
  approvalGateEventStatus,
  approvalGateStatus,
  approvalPendingResponse,
  defaultReviewLoopTimeoutMs,
  diagnoseProject,
  latestGateEvent,
  lifecycleToolPayload,
  nextApprovalWaitSequence,
  orderedEventBatch,
  planArtifactSchema,
  planCandidateHash,
  planCreateInputSchema,
  planTaskShapeHash,
  planningSessionTargetRequiredResponse,
  responseModeSchema,
  reviewReadyPendingResponse,
  standbyPresentation,
  summarizeDiagnostic,
  text,
  toolError,
  waitForEvents,
  withGuidance,
  z,
} from '../shared.js'
import type { CoordinatorToolEvent, PlanSnapshot, RecommendedWait } from '../shared.js'

export function registerPlanningOperations(context: McpRegistryContext): void {
  const { server, api, options, readSnapshot } = context
  server.registerTool(
    'delegated_plan_create',
    {
      description: 'Create a target-bound plan using only an unexpired bounded delegation receipt.',
      inputSchema: {
        plan: z.unknown(),
        target: z.string(),
        receipt: z.unknown(),
        delegatedCoordinatorId: z.string(),
        operationKey: z.string(),
      },
    },
    async ({ plan, target, receipt, delegatedCoordinatorId, operationKey }) =>
      text(
        await api.request('plans', {
          method: 'POST',
          body: JSON.stringify({ plan, target, delegation: { receipt, delegatedCoordinatorId, operationKey } }),
        }),
      ),
  )

  server.registerTool(
    'plan_create',
    {
      description:
        'Create a structured AppraiseJS plan with a short title in goal and a separate description, then wait until its review surface is ready.',
      inputSchema: {
        plan: planCreateInputSchema,
        target: z.string().min(1).optional(),
        responseMode: responseModeSchema,
      },
    },
    async ({ plan, target, responseMode }) => {
      try {
        return text(
          applyAuthoringResponseMode(
            withGuidance(target ? await api.createPlanForTarget(plan, target) : await api.createPlan(plan), {
              nextRecommendedAction:
                'Present the returned browser URL, appraise:// URL, goal, description, revision, lifecycle, content hash, currentAfterSequence when present, nextAfterSequence when present, and recommended wait call; then call plan_review_loop to wait for durable review readiness and Appraise-owned approval feedback before implementation.',
              nextRequiredAgentBehavior: 'wait_for_plan_review_ready',
            }),
            responseMode,
          ),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'planning_session_create',
    {
      description:
        'Normal-agent entry point: diagnose, optionally register a target workspace, persist an agent-authored plan, wait for review readiness, then return standby instructions. AppraiseJS validates and gates the supplied plan but does not infer tasks from a brief.',
      inputSchema: {
        plan: planCreateInputSchema,
        targetWorkspacePath: z.string().min(1).optional(),
        targetMode: z.enum(['hub']).optional(),
        displayName: z.string().min(1).optional(),
        mode: z.enum(['plan_only', 'plan_then_wait']).default('plan_then_wait'),
        responseMode: responseModeSchema,
      },
    },
    async input => {
      try {
        const diagnostic = await diagnoseProject(options)
        if (!input.targetWorkspacePath && input.targetMode !== 'hub') {
          return text(
            applyAuthoringResponseMode(
              planningSessionTargetRequiredResponse({
                planDescription: input.plan.description,
                targetProjects: await api.listTargetProjects(),
                hubProjectPath: api.project.canonicalProjectPath,
              }),
              input.responseMode,
            ),
          )
        }
        let targetProjectResult: unknown
        let target: string | undefined
        if (input.targetWorkspacePath) {
          targetProjectResult = await api.addTargetProject(input.targetWorkspacePath, input.displayName)
          const targetProject = (targetProjectResult as { targetProject?: { id?: string } }).targetProject
          target = targetProject?.id ?? input.targetWorkspacePath
        }
        const candidatePlan = input.plan
        const candidateHash = planCandidateHash(candidatePlan)
        const taskShapeHash = planTaskShapeHash(candidatePlan)
        const created = (
          target ? await api.createPlanForTarget(candidatePlan, target) : await api.createPlan(candidatePlan)
        ) as PlanSnapshot & {
          planId?: string
          eventSequence?: number
        }
        const planId = created.planId ?? String((created as { plan?: { planId?: string } }).plan?.planId ?? '')
        let reviewReady: unknown
        let reviewReadyAfterSequence = 0
        if (planId && input.mode !== 'plan_only') {
          const after = typeof created.eventSequence === 'number' ? Math.max(0, created.eventSequence - 1) : 0
          const result = (await api.request(`plans/${planId}/events?after=${after}&wait=true`)) as {
            events?: CoordinatorToolEvent[]
          }
          const current = await readSnapshot(planId)
          reviewReadyAfterSequence = nextApprovalWaitSequence(after, result.events ?? [])
          reviewReady = {
            planId,
            ...standbyPresentation({
              planId,
              current,
              currentAfterSequence: after,
              nextAfterSequence: reviewReadyAfterSequence,
              recommendedWait: {
                tool: 'plan_review_loop',
                mode: 'long_poll',
                timeoutMs: defaultReviewLoopTimeoutMs,
                afterSequence: reviewReadyAfterSequence,
              },
            }),
            contentHash: current.contentHash,
            links: current.links,
            events: result.events ?? [],
            currentAfterSequence: after,
            nextAfterSequence: reviewReadyAfterSequence,
          }
        }
        return text(
          applyAuthoringResponseMode(
            {
              diagnostic: summarizeDiagnostic(diagnostic),
              candidateHash,
              taskShapeHash,
              targetProject: targetProjectResult,
              created,
              reviewReady,
              nextRequiredAgentBehavior: reviewReady ? 'standby_for_appraise_review' : 'wait_for_plan_review_ready',
              standby: {
                preferredTool: 'plan_review_loop',
                compatibilityTool: reviewReady ? 'plan_wait_for_approval' : 'plan_wait_for_review',
                currentAfterSequence: reviewReady
                  ? (reviewReady as { currentAfterSequence: number }).currentAfterSequence
                  : 0,
                nextAfterSequence: reviewReadyAfterSequence,
                recommendedWait: {
                  tool: 'plan_review_loop',
                  mode: 'long_poll',
                  timeoutMs: defaultReviewLoopTimeoutMs,
                  afterSequence: reviewReadyAfterSequence,
                },
                requiredPresentation:
                  'No wait call before complete URL handoff. Present the complete direct browser URL, appraise:// URL, plan ID, goal, description, revision, lifecycle, content hash, currentAfterSequence, nextAfterSequence, and recommended wait call before entering standby.',
                rule: reviewReady
                  ? 'Keep an active bounded Appraise review wait when the host supports it. Do not implement until Appraise emits approval and plan_start succeeds.'
                  : 'Wait for durable plan_review_ready evidence before presenting the review URL as complete. Pending review is not completion.',
              },
            },
            input.responseMode,
          ),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'plan_read',
    {
      description: 'Read the current plan artifact and content hash.',
      inputSchema: { planId: z.string(), responseMode: responseModeSchema },
    },
    async ({ planId }) => text(await api.request(`plans/${planId}`)),
  )

  server.registerTool(
    'plan_review_read',
    {
      description:
        'Read plan-review remarks, review hash, blocking/non-blocking threads, orphaned thread IDs, links, and recovery guidance without acknowledging events.',
      inputSchema: { planId: z.string() },
    },
    async ({ planId }) => text(await api.request(`plans/${planId}/review`)),
  )

  server.registerTool(
    'plan_review_loop',
    {
      description:
        'Preferred Appraise review standby loop: wait for review readiness when needed, then wait with bounded long-poll semantics for approved, changes_requested, or cancelled.',
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
      let gateEvent = latestGateEvent(events, approvalGateEventStatus)
      let lifecycleStatus = approvalGateStatus(current.plan.lifecycle)
      let reviewReady =
        events.some(event => event.type === 'plan_review_ready') ||
        ['awaiting_plan_review', 'plan_approved', 'changes_requested', 'cancelled'].includes(current.plan.lifecycle)

      if (!reviewReady && !gateEvent && !lifecycleStatus) {
        const waited = await waitForEvents(api.request, planId, afterSequence, timeoutMs)
        events = [...events, ...(waited.events ?? [])]
        current = await readSnapshot(planId)
        gateEvent = latestGateEvent(events, approvalGateEventStatus)
        lifecycleStatus = approvalGateStatus(current.plan.lifecycle)
        reviewReady =
          events.some(event => event.type === 'plan_review_ready') ||
          ['awaiting_plan_review', 'plan_approved', 'changes_requested', 'cancelled'].includes(current.plan.lifecycle)
      }

      if (!reviewReady && !gateEvent && !lifecycleStatus) {
        return text(
          applyAuthoringResponseMode(
            reviewReadyPendingResponse({ planId, current, events, afterSequence, timeoutMs }),
            responseMode,
          ),
        )
      }

      if (!gateEvent && !lifecycleStatus) {
        const waitAfterSequence = nextApprovalWaitSequence(afterSequence, events)
        const waited = await waitForEvents(api.request, planId, waitAfterSequence, timeoutMs)
        events = [...events, ...(waited.events ?? [])]
        current = await readSnapshot(planId)
        gateEvent = latestGateEvent(events, approvalGateEventStatus)
        lifecycleStatus = approvalGateStatus(current.plan.lifecycle)
      }

      if (!gateEvent && !lifecycleStatus) {
        return text(
          applyAuthoringResponseMode(
            approvalPendingResponse({
              planId,
              current,
              events,
              afterSequence,
              waitTool: 'plan_review_loop',
              timeoutMs,
            }),
            responseMode,
          ),
        )
      }

      const status = gateEvent ? approvalGateEventStatus(gateEvent.type) : lifecycleStatus
      return text(
        applyAuthoringResponseMode(
          {
            status,
            planId,
            revision: current.plan.revision,
            lifecycle: current.plan.lifecycle,
            contentHash: current.contentHash,
            links: current.links,
            ...(gateEvent ? { eventSequence: gateEvent.sequence } : {}),
            events,
            currentAfterSequence: afterSequence,
            nextAfterSequence: nextApprovalWaitSequence(afterSequence, events),
            cursorGuidance:
              'afterSequence is exclusive. Acknowledge the observed gate event only after the permitted transition or recovery action succeeds.',
            ...(status === 'changes_requested'
              ? {
                  recovery:
                    'Call plan_review_read to capture blocking remarks and reviewHash, then submit a higher revision with plan_revise. Do not acknowledge plan_changes_requested until the review decision has been captured.',
                }
              : {}),
            nextRecommendedAction:
              status === 'approved'
                ? 'Call plan_start, then acknowledge the approval event only after validation_preparation_started.'
                : status === 'changes_requested'
                  ? 'Call plan_review_read, revise against the current hash, and return to plan_review_loop standby.'
                  : 'Acknowledge cancellation and stop.',
            nextRequiredAgentBehavior:
              status === 'approved'
                ? 'start_validation_preparation'
                : status === 'changes_requested'
                  ? 'revise_plan_from_review_feedback'
                  : 'stop_after_cancellation',
          },
          responseMode,
        ),
      )
    },
  )

  server.registerTool(
    'plan_wait_for_review',
    {
      description: 'Wait for the durable plan_review_ready event before presenting the review URL.',
      inputSchema: { planId: z.string(), afterSequence: z.number().int().nonnegative().default(0) },
    },
    async ({ planId, afterSequence }) => {
      const result = (await api.request(`plans/${planId}/events?after=${afterSequence}&wait=true`)) as {
        events?: Array<{ sequence: number; type: string }>
      }
      const reviewReady = result.events?.find(event => event.type === 'plan_review_ready')
      if (!reviewReady) {
        try {
          const current = await readSnapshot(planId)
          return text(
            reviewReadyPendingResponse({
              planId,
              current,
              events: result.events ?? [],
              afterSequence,
              timeoutMs: defaultReviewLoopTimeoutMs,
            }),
          )
        } catch (error) {
          if (error instanceof CoordinatorRequestError) return toolError(error)
          throw error
        }
      }
      const current = await readSnapshot(planId)
      const nextAfterSequence = reviewReady.sequence
      const recommendedWait: RecommendedWait = {
        tool: 'plan_review_loop',
        mode: 'long_poll',
        timeoutMs: defaultReviewLoopTimeoutMs,
        afterSequence: nextAfterSequence,
      }
      return text({
        planId,
        ...standbyPresentation({
          planId,
          current,
          currentAfterSequence: afterSequence,
          nextAfterSequence,
          recommendedWait,
        }),
        contentHash: current.contentHash,
        links: current.links,
        eventSequence: reviewReady.sequence,
        currentAfterSequence: afterSequence,
        nextAfterSequence,
        recommendedWait,
        cursorGuidance:
          'afterSequence is exclusive. Use this eventSequence as the next approval wait cursor, or prefer plan_review_loop for the full review standby.',
        events: result.events,
        nextRecommendedAction:
          'Present the Appraise/browser review links, then continue with plan_review_loop or call plan_wait_for_approval using this eventSequence.',
        nextRequiredAgentBehavior: 'standby_for_appraise_review',
      })
    },
  )

  server.registerTool(
    'plan_wait_for_approval',
    {
      description:
        'Read-only wait for the plan approval gate; defaults to bounded polling and preserves explicit long-poll mode for clients that can safely wait.',
      inputSchema: {
        planId: z.string(),
        afterSequence: z.number().int().nonnegative().default(0),
        mode: z.enum(['poll', 'long_poll']).default('poll'),
        timeoutMs: z.number().int().positive().max(300_000).optional(),
      },
    },
    async ({ planId, afterSequence, mode, timeoutMs }) => {
      const initial = (await api.request(`plans/${planId}/events?after=${afterSequence}`)) as {
        events?: Array<{ sequence: number; type: string }>
      }
      let events = initial.events ?? []
      let gateEvent = latestGateEvent(events, approvalGateEventStatus)
      let current = await readSnapshot(planId)
      let lifecycleStatus = approvalGateStatus(current.plan.lifecycle)

      if (!gateEvent && !lifecycleStatus) {
        if (mode === 'long_poll' || timeoutMs) {
          const waitAfterSequence = nextApprovalWaitSequence(afterSequence, events)
          const waited = await waitForEvents(api.request, planId, waitAfterSequence, timeoutMs)
          events = [...events, ...(waited.events ?? [])]
          gateEvent = latestGateEvent(events, approvalGateEventStatus)
          current = await readSnapshot(planId)
          lifecycleStatus = approvalGateStatus(current.plan.lifecycle)
        }

        if (!gateEvent && !lifecycleStatus) {
          return text(
            approvalPendingResponse({
              planId,
              current,
              events,
              afterSequence,
              waitTool: 'plan_wait_for_approval',
              timeoutMs,
            }),
          )
        }
      }

      const status = gateEvent ? approvalGateEventStatus(gateEvent.type) : lifecycleStatus
      return text({
        status,
        planId,
        revision: current.plan.revision,
        lifecycle: current.plan.lifecycle,
        contentHash: current.contentHash,
        links: current.links,
        ...(gateEvent ? { eventSequence: gateEvent.sequence } : {}),
        events,
        currentAfterSequence: afterSequence,
        nextAfterSequence: nextApprovalWaitSequence(afterSequence, events),
        cursorGuidance:
          'afterSequence is exclusive. Acknowledge the observed gate event only after the permitted transition or recovery action succeeds.',
        ...(status === 'changes_requested'
          ? {
              recovery:
                'Call plan_review_read to capture blocking remarks and reviewHash, then submit a higher revision with plan_revise. Do not acknowledge plan_changes_requested until the review decision has been captured.',
            }
          : {}),
        nextRecommendedAction:
          status === 'approved'
            ? 'Call plan_start, then acknowledge the approval event only after validation_preparation_started.'
            : status === 'changes_requested'
              ? 'Call plan_review_read, revise against the current hash, and return to review-ready standby.'
              : 'Acknowledge cancellation and stop.',
        nextRequiredAgentBehavior:
          status === 'approved'
            ? 'start_validation_preparation'
            : status === 'changes_requested'
              ? 'revise_plan_from_review_feedback'
              : 'stop_after_cancellation',
      })
    },
  )

  server.registerTool(
    'plan_revise',
    {
      description:
        'Submit a higher plan revision with a short title in goal and a separate description using an exact expected content hash.',
      inputSchema: {
        planId: z.string(),
        expectedHash: z.string(),
        plan: planArtifactSchema,
      },
    },
    async ({ planId, expectedHash, plan }) => {
      try {
        return text(
          await api.request(`plans/${planId}`, {
            method: 'PUT',
            body: JSON.stringify({ expectedHash, plan }),
          }),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'plan_start',
    {
      description: 'Start validation preparation for an approved plan revision.',
      inputSchema: { planId: z.string(), responseMode: responseModeSchema },
    },
    async ({ planId, responseMode }) =>
      text(
        applyLifecycleResponseMode(
          lifecycleToolPayload({
            planId,
            result: await api.request(`plans/${planId}/start`, { method: 'POST', body: '{}' }),
            nextRecommendedAction: 'Read validation context and author the managed Validation AST.',
            nextRequiredAgentBehavior: 'prepare_validation_artifacts',
            nextAllowedAction: { tool: 'validation_context_read' },
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'plan_task_update',
    {
      description: 'Publish a durable task progress update.',
      inputSchema: {
        planId: z.string(),
        taskId: z.string(),
        status: z.string(),
        detail: z.string().optional(),
      },
    },
    async ({ planId, taskId, ...body }) =>
      text(
        await api.request(`plans/${planId}/tasks/${taskId}`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      ),
  )

  server.registerTool(
    'plan_events_read',
    {
      description: 'Read unacknowledged plan events without acknowledging them.',
      inputSchema: {
        planId: z.string(),
        afterSequence: z.number().int().nonnegative().default(0),
        limit: z.number().int().positive().max(100).default(100),
      },
    },
    async ({ planId, afterSequence, limit }) => {
      const result = (await api.request(`plans/${planId}/events?after=${afterSequence}&limit=${limit}`)) as {
        events?: CoordinatorToolEvent[]
      }
      return text({ planId, ...orderedEventBatch(afterSequence, result.events ?? []) })
    },
  )

  server.registerTool(
    'plan_event_acknowledge',
    {
      description: 'Idempotently acknowledge one delivered plan event.',
      inputSchema: { planId: z.string(), sequence: z.number().int().positive() },
    },
    async ({ planId, sequence }) =>
      text(
        await api.request(`plans/${planId}/events/ack`, {
          method: 'POST',
          body: JSON.stringify({ sequence, coordinatorId: options.coordinatorId }),
        }),
      ),
  )

  server.registerTool(
    'plan_events_acknowledge_through',
    {
      description: 'Idempotently acknowledge every delivered plan event through a sequence in one bounded update.',
      inputSchema: { planId: z.string(), acknowledgeThroughSequence: z.number().int().positive() },
    },
    async ({ planId, acknowledgeThroughSequence }) =>
      text(
        await api.request(`plans/${planId}/events/ack`, {
          method: 'POST',
          body: JSON.stringify({ acknowledgeThroughSequence, coordinatorId: options.coordinatorId }),
        }),
      ),
  )

  server.registerTool(
    'plan_lifecycle_snapshot',
    {
      description: 'Create a content-addressed Appraise-owned lifecycle snapshot for bounded continuation.',
      inputSchema: { planId: z.string(), archiveThroughSequence: z.number().int().nonnegative().optional() },
    },
    async ({ planId, archiveThroughSequence }) =>
      text(await api.createLifecycleSnapshot(planId, archiveThroughSequence)),
  )

  server.registerTool(
    'plan_continuation_package_create',
    {
      description:
        'Create a durable bounded handoff with Appraise-authored state and an agent-authored semantic narrative.',
      inputSchema: {
        planId: z.string(),
        narrative: z.string().max(8_192),
        references: z.array(z.string()).max(100).optional(),
        objectiveReference: z.string().optional(),
      },
    },
    async ({ planId, ...input }) => text(await api.createContinuationPackage(planId, input)),
  )

  server.registerTool(
    'plan_lifecycle_health',
    {
      description:
        'Read bounded lifecycle invariant health, orphaned managed runs, and authorized recovery actions for a plan.',
      inputSchema: { planId: z.string(), responseMode: responseModeSchema },
    },
    async ({ planId, responseMode }) =>
      text(applyLifecycleResponseMode(await api.request(`plans/${planId}/health`), responseMode)),
  )
}
