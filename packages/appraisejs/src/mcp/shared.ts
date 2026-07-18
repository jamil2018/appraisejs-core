import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { z } from 'zod'
import { diagnoseProject } from '../diagnostics.js'
import type { createCoordinatorApiClient } from './coordinator-call.js'
export { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
export { z } from 'zod'
export {
  ACTION_CATALOG_CONTRACT_VERSION,
  DELEGATED_AUTHORIZATION_VERSION,
  LOCATOR_GRAPH_CONTRACT_VERSION,
  VALIDATION_AST_SCHEMA_VERSION,
  VALIDATION_AST_JSON_SCHEMA,
} from '../managed-validation-contracts.js'
export type { DelegatedAuthorizationReceipt, ValidationAstSubmission } from '../managed-validation-contracts.js'
export { diagnoseProject } from '../diagnostics.js'
export { planArtifactSchema, planCreateInputSchema } from '../plan-file.js'

const require = createRequire(import.meta.url)

const packageJson = require('../../package.json') as {
  version?: string
}

const serverStartedAt = new Date().toISOString()

const mcpSurfaceVersion = '2026-07-02.lifecycle-hardening'

const truthyFeatureValues = new Set(['1', 'true', 'yes', 'on'])

export function providerNativeRunsEnabled() {
  return truthyFeatureValues.has((process.env.APPRAISE_EXPERIMENTAL_PROVIDER_RUNS ?? '').trim().toLowerCase())
}

const baseWorkflowCriticalTools = [
  'action_categories_list',
  'actions_list',
  'actions_read',
  'project_diagnostic',
  'project_add',
  'project_list',
  'planning_session_create',
  'plan_create',
  'plan_review_loop',
  'plan_wait_for_review',
  'plan_wait_for_approval',
  'plan_review_read',
  'plan_revise',
  'plan_start',
  'validation_context_read',
  'appraise_resources_list',
  'template_step_search',
  'template_step_match',
  'step_block_search',
  'locator_search',
  'validation_resources_propose',
  'validation_ast_check',
  'validation_ast_preview',
  'validation_ast_compile',
  'validation_review_loop',
  'validation_review_reconcile',
  'validation_decide',
  'validation_file_approve',
  'validation_feedback_submit',
  'validation_review_submit',
  'test_run_preflight',
  'baseline_start',
  'baseline_reconcile',
  'baseline_cancel',
  'baseline_retry',
  'baseline_failure_acknowledge',
  'baseline_regression_justify',
  'baseline_accept',
  'implementation_start',
  'implementation_group_approve',
  'implementation_checkpoint',
  'implementation_task_update',
  'implementation_validation_record',
  'implementation_validation_start',
  'implementation_validation_reconcile',
  'implementation_feedback',
  'implementation_control',
  'implementation_completion_review',
  'implementation_complete',
  'delegated_validation_ast_submit',
  'delegation_create',
  'delegation_read',
  'delegation_revoke',
  'delegated_plan_create',
  'validation_ast_extension_policy',
  'validation_ast_extension_reviews',
  'test_run_read',
  'test_run_diagnose',
] as const

const providerNativeWorkflowTools = [
  'provider_list',
  'provider_probe',
  'provider_update',
  'provider_run_create',
  'provider_run_read',
  'provider_run_cancel',
  'provider_permission_decide',
] as const

const workflowCriticalTools = [
  ...baseWorkflowCriticalTools,
  ...(providerNativeRunsEnabled() ? providerNativeWorkflowTools : []),
] as const

const baseWorkflowResourceUris = [
  'appraise://project',
  'appraise://target-projects',
  'appraise://agent-guide',
  'appraise://workflow/planning',
  'appraise://workflow/validation-preparation',
  'appraise://workflow/standby',
  'appraise://resources/modules',
  'appraise://resources/test-suites',
  'appraise://resources/test-cases',
  'appraise://resources/template-steps',
  'appraise://resources/locator-groups',
  'appraise://resources/locators',
  'appraise://resources/environments',
] as const

const providerNativeWorkflowResourceUris = ['appraise://providers', 'appraise://provider-runs'] as const

const phase1ContractResourceUris = [
  'appraise://actions/catalog',
  'appraise://actions/category/{categoryId}',
  'appraise://locator-graph/visual',
  'appraise://contracts/action-catalog',
  'appraise://contracts/locator-graph',
  'appraise://contracts/validation-ast',
  'appraise://contracts/delegated-authorization',
] as const

const workflowResourceUris = [
  ...baseWorkflowResourceUris,
  ...phase1ContractResourceUris,
  ...(providerNativeRunsEnabled() ? providerNativeWorkflowResourceUris : []),
] as const

export function text(value: unknown) {
  const serialized = JSON.stringify(value, null, 2)
  return {
    content: [{ type: 'text' as const, text: serialized }],
    _meta: {
      'appraise/responseMetrics': {
        bytes: Buffer.byteLength(serialized),
        estimatedTokens: Math.ceil(serialized.length / 4),
      },
    },
  }
}

export function normalizeOptionalRef(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? undefined : value
}

export const implementationValidationRunInputSchema = z.object({
  id: z.string().min(1),
  validationId: z.string().min(1),
  taskIds: z.array(z.string().min(1)).min(1),
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
  failureSignatureHash: z.string().startsWith('sha256:').optional(),
  acknowledgedAt: z.string().datetime({ offset: true }).optional(),
  completedAt: z.string().datetime({ offset: true }).optional(),
})

export function withGuidance(
  value: unknown,
  guidance: {
    nextRecommendedAction?: string
    nextRequiredAgentBehavior?: string
  },
) {
  const payload = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  return { ...payload, ...guidance }
}

export * from './response-projector.js'
export * from './coordinator-call.js'

export function baselineRecoveryForLifecycle(lifecycle: string | undefined) {
  if (lifecycle === 'baseline_review')
    return {
      nextRecommendedAction:
        'Review baseline evidence, acknowledge or justify allowed results, then call baseline_accept.',
      nextRequiredAgentBehavior: 'review_and_accept_baseline',
      nextAllowedAction: { tool: 'baseline_accept' },
    }
  if (lifecycle === 'validation_changes_requested')
    return {
      nextRecommendedAction:
        'Read validation feedback, repair the managed Validation AST, then repeat check, preview, exact review, and compile.',
      nextRequiredAgentBehavior: 'revise_validation_artifacts',
      nextAllowedAction: { tool: 'validation_context_read' },
    }
  return {
    nextRecommendedAction:
      'Continue calling baseline_reconcile until baseline review is ready, or cancel if the run should stop.',
    nextRequiredAgentBehavior: 'reconcile_baseline',
    nextAllowedAction: { tool: 'baseline_reconcile' },
  }
}

export function summarizeDiagnostic(value: Awaited<ReturnType<typeof diagnoseProject>>) {
  return {
    ok: value.ok,
    project: value.project,
    hubProject: value.hubProject,
    contractVersion: value.contractVersion,
    checks: value.checks.map(check => ({ id: check.id, status: check.status, code: check.code })),
    warnings: value.warnings,
    recoveryActions: value.recoveryActions,
    links: value.links,
  }
}

export const planningWorkflow = {
  phases: [
    'project_diagnostic',
    'project_add when the target workspace is not registered',
    'plan_create',
    'plan_review_loop until durable review readiness and an Appraise-owned approval decision',
    'present appraise:// and browser links',
    'plan_wait_for_approval standby for compatibility with clients that already observed plan_review_ready',
    'handle approved, changes_requested, or cancelled as Appraise-owned events',
  ],
  eventAcknowledgement:
    'Read delivery does not acknowledge events. afterSequence is exclusive: pass the latest handled sequence, and acknowledge a sequence only after the permitted transition or recovery action succeeds.',
  standby:
    'When approval is pending, pause at the Appraise review gate in a resumable standby state and resume with nextAfterSequence. Do not implement, finalize, or validate. Do not treat chat approval as Appraise approval.',
}

export const standbyWorkflow = {
  standbyAfter: 'plan_review_ready',
  preferredTool: 'plan_review_loop',
  compatibilityTool: 'plan_wait_for_approval',
  pendingBehavior:
    'Use bounded long-poll standby when possible. No wait call before complete URL handoff: present and return the complete direct browserUrl, appraiseUrl, planId, goal, description, revision, lifecycle, contentHash, currentAfterSequence, nextAfterSequence, and recommendedWait before entering or continuing standby.',
  cursorGuidance:
    'afterSequence is exclusive. Resume standby with nextAfterSequence exactly unless intentionally redelivering unacknowledged events through plan_events_read.',
  gateResults: {
    approved: 'Call plan_start, then acknowledge only after validation_preparation_started.',
    changes_requested: 'Call plan_review_read, revise against the expected hash, and return to standby.',
    cancelled: 'Acknowledge the cancellation event and stop.',
  },
}

export const validationPreparationWorkflow = {
  phase: 'validation_preparation',
  preferredTool: 'validation_ast_compile',
  contractResource: 'appraise://contracts/validation-ast',
  artifactContract: 'appraise.validation-ast',
  happyPath: [
    'plan_start',
    'validation_context_read',
    'validation_resources_propose when target-bound resources are missing',
    'validation_ast_check',
    'validation_ast_preview',
    'human review of the exact preview receipt',
    'validation_ast_compile',
    'validation_review_loop standby',
    'capsule-backed baseline and implementation validation',
  ],
  ownership:
    'Appraise owns canonical projection and immutable runtime capsules. Managed validation never uses target automation files as execution authority.',
  recovery:
    'Resolve the bounded AST check or preview blocker and retry the same managed operation. Reconnect the client if removed v1 tools remain visible.',
}

export const mcpCapabilityMetadata = {
  packageVersion: packageJson.version ?? '0.0.0',
  mcpSurfaceVersion,
  serverStartedAt,
  workflowCriticalTools: [...workflowCriticalTools],
  workflowResourceUris: [...workflowResourceUris],
}

export const compactMcpCapabilityMetadata = {
  packageVersion: mcpCapabilityMetadata.packageVersion,
  mcpSurfaceVersion: mcpCapabilityMetadata.mcpSurfaceVersion,
  serverStartedAt: mcpCapabilityMetadata.serverStartedAt,
  workflowCriticalToolCount: mcpCapabilityMetadata.workflowCriticalTools.length,
  workflowResourceCount: mcpCapabilityMetadata.workflowResourceUris.length,
  workflowSentinelTools: [
    'project_diagnostic',
    'planning_session_create',
    'plan_review_loop',
    'validation_ast_compile',
    'baseline_start',
    'implementation_start',
    'implementation_complete',
  ],
  workflowSentinelResources: [
    'appraise://agent-guide',
    'appraise://workflow/planning',
    'appraise://workflow/validation-preparation',
    'appraise://workflow/standby',
  ],
  fullCapabilityResource: 'appraise://project',
}

export function missingCapabilityRecovery(
  missing: {
    tools?: string[]
    resources?: string[]
  } = {},
) {
  const tools = missing.tools ?? []
  const resources = missing.resources ?? []
  return {
    status: tools.length || resources.length ? 'missing_or_stale' : 'available',
    expected: {
      workflowCriticalTools: [...workflowCriticalTools],
      workflowResourceUris: [...workflowResourceUris],
    },
    missing: {
      tools,
      resources,
    },
    recoveryActions: [
      'Restart or reconnect the MCP client so it refreshes tool and resource discovery.',
      'Restart the Appraise MCP sidecar so the running server matches the current branch source.',
      'Rerun `npm run setup:mcp` and `npm run setup:agent`, then verify planning_session_create and appraise://workflow/standby are visible.',
    ],
    toolsNotVisible:
      'If setup text is visible but native MCP tools are absent, register the Streamable HTTP endpoint or stdio command with the host, then restart or reconnect the client.',
  }
}

export function compactProjectDiagnostic(diagnostic: Awaited<ReturnType<typeof diagnoseProject>>) {
  const { targetProjects, ...rest } = diagnostic
  return {
    ...rest,
    targetProjectCount: targetProjects.length,
    targetProjectDiscovery: 'Call project_list only when target selection requires the registered-project list.',
  }
}

export const agentGuide = {
  summary:
    'Use AppraiseJS as the lifecycle owner for planning, validation, baseline, implementation, and completion gates.',
  setup: {
    preferredCommand: 'appraisejs agent setup',
    repoWrapper: 'npm run setup:agent',
    mcpDetails: 'npm run setup:mcp',
  },
  planningWorkflow,
  capabilityRecovery: missingCapabilityRecovery(),
  links: {
    lifecycle: 'docs/agent-lifecycle-flow.md',
    mcpSetup: 'docs/agent-mcp-setup.md',
    contract: 'docs/coordinator-api-mcp.md',
  },
  validationPreparationWorkflow,
}

export function diagnosticGuidance(diagnostic: unknown) {
  const ok = Boolean(
    (
      diagnostic as {
        ok?: unknown
      }
    )?.ok,
  )
  return {
    nextRecommendedAction: ok
      ? 'For an existing app, register or select the target workspace with project_add before planning. For hub checkout work, call planning_session_create with targetMode:"hub". If expected MCP tools or resources are missing, restart/reconnect the MCP client and sidecar.'
      : 'Resolve diagnostics first. For stale or missing MCP capabilities, restart/reconnect the MCP client, restart the Appraise MCP sidecar, then rerun npm run setup:mcp and npm run setup:agent.',
    nextRequiredAgentBehavior: ok ? 'choose_explicit_target_before_planning' : 'recover_mcp_or_project_binding',
  }
}

export function projectPayload(api: Awaited<ReturnType<typeof createCoordinatorApiClient>>) {
  return {
    projectFingerprint: api.identity.projectFingerprint,
    canonicalProjectPath: api.project.canonicalProjectPath,
    capabilities: mcpCapabilityMetadata,
    capabilityRecovery: missingCapabilityRecovery(),
  }
}

export function planningSessionTargetRequiredResponse(input: {
  planDescription: string
  targetProjects: unknown
  hubProjectPath: string
}) {
  return {
    status: 'target_required',
    code: 'planning-target-required',
    message:
      'planning_session_create requires targetWorkspacePath for a new-app brief, or explicit targetMode:"hub" when the plan is intentionally scoped to the Appraise hub checkout.',
    planDescription: input.planDescription,
    targetProjectCandidates: input.targetProjects,
    hubProject: {
      canonicalPath: input.hubProjectPath,
      targetMode: 'hub',
    },
    recovery: {
      existingTarget:
        'If the app repository already exists, call project_add or rerun planning_session_create with targetWorkspacePath.',
      newWorkspace:
        'If this is a brand-new app, create or choose the target workspace path first, then pass targetWorkspacePath.',
      hubMode:
        'Only pass targetMode:"hub" when the requested work is intentionally for the AppraiseJS hub checkout itself.',
    },
    nextRecommendedAction:
      'Choose an explicit targetWorkspacePath, or rerun with targetMode:"hub" for intentional hub-scoped planning.',
    nextRequiredAgentBehavior: 'choose_explicit_target_before_planning',
  }
}

export function planCandidateHash(plan: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(plan)).digest('hex')}`
}

export function planTaskShapeHash(plan: {
  tasks?: Array<{
    id: string
  }>
  edges?: Array<{
    from: string
    to: string
    type: string
  }>
  implementationGroups?: Array<{
    id: string
    taskIds: string[]
  }>
}): string {
  return planCandidateHash({
    taskIds: plan.tasks?.map(task => task.id) ?? [],
    edges: plan.edges ?? [],
    implementationGroups: plan.implementationGroups ?? [],
  })
}

export type PlanSnapshot = {
  plan: {
    revision: number
    lifecycle: string
    goal?: string
    description?: string
  }
  planContentHash: string
  planStateHash: string
  reviewBindingHash: string
  /** Compatibility alias for planContentHash. */
  contentHash: string
  links: unknown
  validationIntegrity?: {
    status: 'green' | 'not_applicable' | 'integrity_blocked'
    operationId?: string
    operationPhase?: string
    mismatches: string[]
    retryable: boolean
    nextRepairAction?: string
    failure?: unknown
  }
}

export function validationIntegrityBlockedResponse(planId: string, current: PlanSnapshot, afterSequence: number) {
  const integrity = current.validationIntegrity!
  return {
    status: 'integrity_blocked',
    planId,
    lifecycle: current.plan.lifecycle,
    integrity,
    currentAfterSequence: afterSequence,
    nextAfterSequence: afterSequence,
    nextRecommendedAction: integrity.nextRepairAction,
    nextRequiredAgentBehavior: integrity.retryable ? 'resume_validation_publication' : 'diagnose_validation_integrity',
  }
}

export function approvalGateStatus(lifecycle: string): 'approved' | 'changes_requested' | 'cancelled' | undefined {
  if (lifecycle === 'plan_approved') return 'approved'
  if (lifecycle === 'changes_requested') return 'changes_requested'
  if (lifecycle === 'cancelled') return 'cancelled'
  return undefined
}

export function approvalGateEventStatus(type: string): 'approved' | 'changes_requested' | 'cancelled' | undefined {
  if (type === 'plan_approved') return 'approved'
  if (type === 'plan_changes_requested') return 'changes_requested'
  if (type === 'plan_cancelled') return 'cancelled'
  return undefined
}

export function validationGateStatus(lifecycle: string): 'approved' | 'changes_requested' | 'cancelled' | undefined {
  if (lifecycle === 'validations_approved') return 'approved'
  if (lifecycle === 'validation_changes_requested') return 'changes_requested'
  if (lifecycle === 'awaiting_validation_review') return undefined
  if (lifecycle === 'cancelled') return 'cancelled'
  return undefined
}

export function validationGateEventStatus(type: string): 'approved' | 'changes_requested' | 'cancelled' | undefined {
  if (type === 'validations_approved' || type === 'validation_approved') return 'approved'
  if (type === 'validation_changes_requested') return 'changes_requested'
  if (type === 'plan_cancelled') return 'cancelled'
  return undefined
}

export type CoordinatorToolEvent = {
  sequence: number
  type: string
}

export const defaultReviewLoopTimeoutMs = 120000

export function latestGateEvent(
  events: CoordinatorToolEvent[],
  statusForEvent: (type: string) => 'approved' | 'changes_requested' | 'cancelled' | undefined,
) {
  return events.filter(event => statusForEvent(event.type)).sort((left, right) => right.sequence - left.sequence)[0]
}

export type RecommendedWait = {
  tool: 'plan_wait_for_approval' | 'plan_review_loop' | 'plan_wait_for_review' | 'validation_review_loop'
  mode: 'long_poll'
  timeoutMs: number
  afterSequence: number
}

export function linkFromSnapshot(links: unknown, key: 'appraise' | 'browser'): string | undefined {
  if (!links || typeof links !== 'object') return undefined
  const value = (links as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

export function validationReviewBrowserUrl(browserUrl: string | undefined) {
  if (!browserUrl) return undefined
  const url = new URL(browserUrl)
  url.searchParams.set('review', 'validation')
  return url.href
}

function formatReviewHandoff(input: {
  browserUrl?: string
  appraiseUrl: string
  planId: string
  goal?: string
  description?: string
  revision: number
  lifecycle: string
  planContentHash: string
  planStateHash: string
  reviewBindingHash: string
  currentAfterSequence: number
  nextAfterSequence: number
  recommendedWait: RecommendedWait
}) {
  return [
    'No wait call before complete URL handoff.',
    `Direct browser URL: ${input.browserUrl ?? '(not returned)'}`,
    `Appraise URL: ${input.appraiseUrl}`,
    `Plan ID: ${input.planId}`,
    `Goal: ${input.goal ?? '(not returned)'}`,
    `Description: ${input.description ?? '(not returned)'}`,
    `Revision: ${input.revision}`,
    `Lifecycle: ${input.lifecycle}`,
    `Plan content hash: ${input.planContentHash}`,
    `Plan state hash: ${input.planStateHash}`,
    `Review binding hash: ${input.reviewBindingHash}`,
    `Current after sequence: ${input.currentAfterSequence}`,
    `Next after sequence: ${input.nextAfterSequence}`,
    `Recommended wait call: ${input.recommendedWait.tool}({ planId: "${input.planId}", afterSequence: ${input.recommendedWait.afterSequence}, timeoutMs: ${input.recommendedWait.timeoutMs} })`,
  ].join('\n')
}

export function standbyPresentation(input: {
  planId: string
  current: PlanSnapshot
  currentAfterSequence: number
  nextAfterSequence: number
  recommendedWait: RecommendedWait
}) {
  const appraiseUrl = linkFromSnapshot(input.current.links, 'appraise') ?? `appraise://plans/${input.planId}`
  const browserUrl = linkFromSnapshot(input.current.links, 'browser')
  const handoffMarkdown = formatReviewHandoff({
    browserUrl,
    appraiseUrl,
    planId: input.planId,
    goal: input.current.plan.goal,
    description: input.current.plan.description,
    revision: input.current.plan.revision,
    lifecycle: input.current.plan.lifecycle,
    planContentHash: input.current.planContentHash,
    planStateHash: input.current.planStateHash,
    reviewBindingHash: input.current.reviewBindingHash,
    currentAfterSequence: input.currentAfterSequence,
    nextAfterSequence: input.nextAfterSequence,
    recommendedWait: input.recommendedWait,
  })
  return {
    browserUrl,
    appraiseUrl,
    handoffMarkdown,
    goal: input.current.plan.goal,
    description: input.current.plan.description,
    revision: input.current.plan.revision,
    lifecycle: input.current.plan.lifecycle,
    planContentHash: input.current.planContentHash,
    planStateHash: input.current.planStateHash,
    reviewBindingHash: input.current.reviewBindingHash,
    contentHash: input.current.planContentHash,
    currentAfterSequence: input.currentAfterSequence,
    nextAfterSequence: input.nextAfterSequence,
    recommendedWait: input.recommendedWait,
    standbyPresentation: {
      required: true,
      requiredFields: [
        'browserUrl',
        'appraiseUrl',
        'goal',
        'description',
        'revision',
        'lifecycle',
        'planContentHash',
        'planStateHash',
        'reviewBindingHash',
        'currentAfterSequence',
        'nextAfterSequence',
        'recommendedWait',
      ],
      instruction:
        'No wait call before complete URL handoff. Before entering or continuing standby, present the complete direct browser URL, appraise:// URL, plan ID, goal, description, revision, lifecycle, named plan hashes, currentAfterSequence, nextAfterSequence, and the recommended wait call.',
    },
  }
}

export function nextApprovalWaitSequence(afterSequence: number, events: CoordinatorToolEvent[]): number {
  return events.reduce((latest, event) => Math.max(latest, event.sequence), afterSequence)
}

export function approvalPendingResponse(input: {
  planId: string
  current: PlanSnapshot
  events: CoordinatorToolEvent[]
  afterSequence: number
  waitTool?: 'plan_wait_for_approval' | 'plan_review_loop'
  timeoutMs?: number
}) {
  const nextAfterSequence = nextApprovalWaitSequence(input.afterSequence, input.events)
  const waitTool = input.waitTool ?? 'plan_review_loop'
  const timeoutMs = input.timeoutMs ?? defaultReviewLoopTimeoutMs
  const recommendedWait: RecommendedWait = {
    tool: waitTool,
    mode: 'long_poll',
    timeoutMs,
    afterSequence: nextAfterSequence,
  }
  if (input.afterSequence > 0 && input.events.length === 0) {
    return {
      status: 'pending_unchanged',
      terminal: false,
      mustContinue: true,
      planId: input.planId,
      currentAfterSequence: input.afterSequence,
      nextAfterSequence,
      recommendedWait,
      nextRecommendedAction:
        'Remain in Appraise review-gate standby and call the recommended wait tool with nextAfterSequence.',
      nextRequiredAgentBehavior: 'standby_for_appraise_review',
    }
  }
  return {
    status: 'pending',
    terminal: false,
    mustContinue: true,
    planId: input.planId,
    ...standbyPresentation({
      planId: input.planId,
      current: input.current,
      currentAfterSequence: input.afterSequence,
      nextAfterSequence,
      recommendedWait,
    }),
    contentHash: input.current.contentHash,
    links: input.current.links,
    events: input.events,
    currentAfterSequence: input.afterSequence,
    nextAfterSequence,
    recommendedWait,
    cursorGuidance:
      'afterSequence is exclusive. Resume by passing nextAfterSequence exactly; subtract one only when intentionally redelivering unacknowledged events through plan_events_read.',
    reviewGatePause:
      'Pause at the Appraise review gate. Do not implement, finalize, start validation, or treat chat messages as approval while this status is pending.',
    recovery:
      'Open the review URL in AppraiseJS for the current revision. Continue standby by calling the recommended wait tool with nextAfterSequence until Appraise emits approved, changes_requested, or cancelled.',
    nextRecommendedAction:
      'Remain in review-gate standby and resume with nextAfterSequence. Only leave standby after an Appraise-owned approved, changes_requested, or cancelled result.',
    nextRequiredAgentBehavior: 'standby_for_appraise_review',
  }
}

export function validationReviewPendingResponse(input: {
  planId: string
  current: PlanSnapshot
  events: CoordinatorToolEvent[]
  afterSequence: number
  timeoutMs?: number
}) {
  const nextAfterSequence = nextApprovalWaitSequence(input.afterSequence, input.events)
  const timeoutMs = input.timeoutMs ?? defaultReviewLoopTimeoutMs
  const recommendedWait: RecommendedWait = {
    tool: 'validation_review_loop',
    mode: 'long_poll',
    timeoutMs,
    afterSequence: nextAfterSequence,
  }
  const browserUrl = linkFromSnapshot(input.current.links, 'browser')
  const appraiseUrl = linkFromSnapshot(input.current.links, 'appraise') ?? `appraise://plans/${input.planId}`
  if (input.afterSequence > 0 && input.events.length === 0) {
    return {
      status: 'pending_unchanged',
      phase: 'validation_review',
      terminal: false,
      mustContinue: true,
      planId: input.planId,
      currentAfterSequence: input.afterSequence,
      nextAfterSequence,
      recommendedWait,
      nextRecommendedAction: 'Continue validation-review standby with nextAfterSequence.',
      nextRequiredAgentBehavior: 'standby_for_validation_review',
    }
  }
  return {
    status: 'pending',
    phase: 'validation_review',
    terminal: false,
    mustContinue: true,
    planId: input.planId,
    browserUrl: validationReviewBrowserUrl(browserUrl),
    appraiseUrl,
    revision: input.current.plan.revision,
    lifecycle: input.current.plan.lifecycle,
    contentHash: input.current.contentHash,
    links: input.current.links,
    events: input.events,
    currentAfterSequence: input.afterSequence,
    nextAfterSequence,
    recommendedWait,
    cursorGuidance:
      'afterSequence is exclusive. Resume by passing nextAfterSequence exactly; do not treat pending validation review as completion.',
    nextRecommendedAction:
      'Remain in validation-review standby until Appraise emits validations_approved, validation_changes_requested, or cancellation.',
    nextRequiredAgentBehavior: 'standby_for_validation_review',
  }
}

export function orderedEventBatch(afterSequence: number, events: CoordinatorToolEvent[]) {
  const orderedEvents = [...events]
    .filter(event => event.sequence > afterSequence)
    .sort((left, right) => left.sequence - right.sequence)
  return {
    events: orderedEvents,
    latestEvent: orderedEvents.at(-1) ?? null,
    currentAfterSequence: afterSequence,
    nextAfterSequence: nextApprovalWaitSequence(afterSequence, orderedEvents),
  }
}

export function lifecycleToolPayload(input: {
  planId: string
  result: unknown
  nextRequiredAgentBehavior: string
  nextRecommendedAction: string
  terminal?: boolean
  mustContinue?: boolean
  nextAllowedAction?: unknown
}) {
  const result = input.result && typeof input.result === 'object' ? (input.result as Record<string, unknown>) : {}
  const plan = result.plan && typeof result.plan === 'object' ? (result.plan as Record<string, unknown>) : result
  return {
    ...result,
    planId: input.planId,
    lifecycle: typeof plan.lifecycle === 'string' ? plan.lifecycle : undefined,
    terminal: input.terminal ?? false,
    mustContinue: input.mustContinue ?? true,
    nextAllowedAction: input.nextAllowedAction,
    nextRecommendedAction: input.nextRecommendedAction,
    nextRequiredAgentBehavior: input.nextRequiredAgentBehavior,
  }
}

export function reviewReadyPendingResponse(input: {
  planId: string
  current: PlanSnapshot
  events: CoordinatorToolEvent[]
  afterSequence: number
  timeoutMs?: number
}) {
  const nextAfterSequence = nextApprovalWaitSequence(input.afterSequence, input.events)
  const timeoutMs = input.timeoutMs ?? defaultReviewLoopTimeoutMs
  const recommendedWait: RecommendedWait = {
    tool: 'plan_review_loop',
    mode: 'long_poll',
    timeoutMs,
    afterSequence: nextAfterSequence,
  }
  if (input.afterSequence > 0 && input.events.length === 0) {
    return {
      status: 'pending_unchanged',
      phase: 'review_ready',
      terminal: false,
      mustContinue: true,
      planId: input.planId,
      currentAfterSequence: input.afterSequence,
      nextAfterSequence,
      recommendedWait,
      nextRecommendedAction: 'Continue waiting for durable review readiness through the recommended wait tool.',
      nextRequiredAgentBehavior: 'wait_for_plan_review_ready',
    }
  }
  return {
    status: 'pending',
    terminal: false,
    mustContinue: true,
    phase: 'review_ready',
    planId: input.planId,
    ...standbyPresentation({
      planId: input.planId,
      current: input.current,
      currentAfterSequence: input.afterSequence,
      nextAfterSequence,
      recommendedWait,
    }),
    contentHash: input.current.contentHash,
    links: input.current.links,
    events: input.events,
    currentAfterSequence: input.afterSequence,
    nextAfterSequence,
    recommendedWait,
    cursorGuidance:
      'afterSequence is exclusive. Resume by passing nextAfterSequence exactly; subtract one only when intentionally redelivering unacknowledged events through plan_events_read.',
    reviewGatePause:
      'Do not present the review as durable and do not implement until plan_review_ready has been observed and the Appraise review gate later emits approved.',
    recovery:
      'Continue with plan_review_loop using nextAfterSequence until durable plan_review_ready exists, then remain in standby for approved, changes_requested, or cancelled.',
    nextRecommendedAction:
      'Keep waiting for durable review readiness through plan_review_loop. Do not move to implementation or validation from this pending response.',
    nextRequiredAgentBehavior: 'wait_for_plan_review_ready',
  }
}

export async function waitForEvents(
  request: (operation: string, init?: RequestInit) => Promise<unknown>,
  planId: string,
  afterSequence: number,
  timeoutMs?: number,
) {
  const controller = timeoutMs && timeoutMs > 0 ? new AbortController() : undefined
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined
  try {
    return (await request(`plans/${planId}/events?after=${afterSequence}&wait=true`, {
      signal: controller?.signal,
    })) as {
      events?: CoordinatorToolEvent[]
    }
  } catch (error) {
    if (controller?.signal.aborted) return { events: [] }
    throw error
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
