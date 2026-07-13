import http from 'node:http'
import { createRequire } from 'node:module'

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import {
  ACTION_CATALOG_CONTRACT_VERSION,
  DELEGATED_AUTHORIZATION_VERSION,
  LOCATOR_GRAPH_CONTRACT_VERSION,
  VALIDATION_AST_SCHEMA_VERSION,
  type DelegatedAuthorizationReceipt,
  type ValidationAstSubmission,
} from './managed-validation-contracts.js'

import {
  CoordinatorRequestError,
  createCoordinatorClient,
  coordinatorRequestErrorEnvelope,
  type CoordinatorOptions as McpOptions,
} from './coordinator-client.js'
import { diagnoseProject, formatMcpBootstrapError } from './diagnostics.js'
import { planArtifactSchema, planCreateInputSchema } from './plan-file.js'
import { analyzeBrief, assessPlanRequirements } from './plan-requirements.js'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json') as { version?: string }
const serverStartedAt = new Date().toISOString()
const mcpSurfaceVersion = '2026-07-02.lifecycle-hardening'
const truthyFeatureValues = new Set(['1', 'true', 'yes', 'on'])

function providerNativeRunsEnabled() {
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
  'validation_ast_check',
  'validation_ast_preview',
  'validation_ast_compile',
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

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

export function normalizeOptionalRef(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? undefined : value
}

const implementationValidationRunInputSchema = z.object({
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
function withGuidance(
  value: unknown,
  guidance: { nextRecommendedAction?: string; nextRequiredAgentBehavior?: string },
) {
  const payload = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  return { ...payload, ...guidance }
}

const responseModeSchema = z.enum(['summary', 'evidenceOnly', 'blockersOnly', 'linksOnly', 'full']).default('summary')

export const MCP_RESPONSE_TOKEN_BUDGETS = {
  diagnostic: 1_000,
  planCreation: 2_000,
  unchangedWait: 300,
  validationMutation: 1_500,
  baselineMutation: 1_500,
} as const

export function measureMcpResponse(value: unknown) {
  const json = JSON.stringify(value)
  const repeatedKeys = [...json.matchAll(/"([^"\\]+)":/g)].map(match => match[1])
  const uniqueKeys = new Set(repeatedKeys)
  return {
    bytes: Buffer.byteLength(json, 'utf8'),
    estimatedTokens: Math.ceil(Buffer.byteLength(json, 'utf8') / 4),
    duplicationRatio: repeatedKeys.length === 0 ? 0 : (repeatedKeys.length - uniqueKeys.size) / repeatedKeys.length,
  }
}

export function applyResponseMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  if (responseMode === 'full' || !value || typeof value !== 'object' || Array.isArray(value)) return value
  const payload = value as Record<string, unknown>
  if (responseMode === 'linksOnly') {
    return {
      testRunPageId: payload.testRunPageId,
      executionRunId: payload.executionRunId,
      planId: payload.planId,
      validationId: payload.validationId,
      reportUrl: payload.reportUrl,
      logsUrl: payload.logsUrl,
      nextAllowedAction: payload.nextAllowedAction,
    }
  }
  if (responseMode === 'blockersOnly') {
    return {
      executionRunId: payload.executionRunId,
      evidenceHealth: payload.evidenceHealth,
      blockers: payload.blockers,
      missingArtifacts: payload.missingArtifacts,
      nextAllowedAction: payload.nextAllowedAction,
    }
  }
  if (responseMode === 'evidenceOnly') {
    return {
      testRunPageId: payload.testRunPageId,
      executionRunId: payload.executionRunId,
      evidenceHealth: payload.evidenceHealth,
      grade: payload.grade,
      counts: payload.counts,
      blockers: payload.blockers,
      missingArtifacts: payload.missingArtifacts,
      reportUrl: payload.reportUrl,
      logsUrl: payload.logsUrl,
      nextAllowedAction: payload.nextAllowedAction,
    }
  }
  return {
    testRunPageId: payload.testRunPageId,
    executionRunId: payload.executionRunId,
    planId: payload.planId,
    validationId: payload.validationId,
    evidenceHealth: payload.evidenceHealth,
    grade: payload.grade,
    blockers: payload.blockers,
    reportUrl: payload.reportUrl,
    logsUrl: payload.logsUrl,
    nextAllowedAction: payload.nextAllowedAction,
  }
}

export function applyLifecycleResponseMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  if (responseMode === 'full' || !value || typeof value !== 'object' || Array.isArray(value)) return value
  const payload = value as Record<string, unknown>
  const plan = payload.plan && typeof payload.plan === 'object' ? (payload.plan as Record<string, unknown>) : undefined
  const common = {
    planId: payload.planId ?? plan?.planId,
    lifecycle: payload.lifecycle ?? plan?.lifecycle,
    revision: payload.revision ?? plan?.revision,
    contentHash: payload.contentHash ?? payload.validationHash,
    nextAllowedAction: payload.nextAllowedAction,
    nextRecommendedAction: payload.nextRecommendedAction,
    nextRequiredAgentBehavior: payload.nextRequiredAgentBehavior,
  }
  if (responseMode === 'linksOnly')
    return { ...common, links: payload.links, browserUrl: payload.browserUrl, appraiseUrl: payload.appraiseUrl }
  if (responseMode === 'blockersOnly') return { ...common, blockers: payload.blockers, warnings: payload.warnings }
  if (responseMode === 'evidenceOnly') {
    return {
      ...common,
      attemptId: payload.attemptId,
      testRunId: payload.testRunId,
      testRunIds: payload.testRunIds,
      evidence: payload.evidence ?? payload.evidenceSummary,
      counts: payload.counts,
      manifestPaths: payload.manifestPaths,
    }
  }
  return {
    ...common,
    published: payload.published,
    attemptId: payload.attemptId,
    testRunId: payload.testRunId,
    testRunIds: payload.testRunIds,
    reused: payload.reused,
    evidence: payload.evidenceSummary ?? payload.evidence,
    counts: payload.counts,
    blockers: payload.blockers,
    warnings: payload.warnings,
    manifestPaths: payload.manifestPaths,
    validationArtifactPath: payload.validationArtifactPath,
    links: payload.links,
    browserUrl: payload.browserUrl,
    appraiseUrl: payload.appraiseUrl,
  }
}

export function applyCapsuleDiagnosticMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  if (responseMode === 'full' || !value || typeof value !== 'object' || Array.isArray(value)) return value
  const diagnostic = value as Record<string, unknown>
  if (responseMode === 'blockersOnly')
    return {
      schemaVersion: diagnostic.schemaVersion,
      blockers: diagnostic.blockers,
      nextRecoveryAction: diagnostic.nextRecoveryAction,
    }
  if (responseMode === 'evidenceOnly')
    return { schemaVersion: diagnostic.schemaVersion, run: diagnostic.run, evidence: diagnostic.evidence }
  if (responseMode === 'linksOnly') {
    const evidence = diagnostic.evidence as Record<string, unknown> | undefined
    return {
      schemaVersion: diagnostic.schemaVersion,
      runId: (diagnostic.run as Record<string, unknown> | undefined)?.runId,
      links: evidence?.links,
      nextRecoveryAction: diagnostic.nextRecoveryAction,
    }
  }
  return {
    schemaVersion: diagnostic.schemaVersion,
    run: diagnostic.run,
    attempt: diagnostic.attempt,
    preflight: diagnostic.preflight,
    blockers: diagnostic.blockers,
    evidence: diagnostic.evidence,
    nextRecoveryAction: diagnostic.nextRecoveryAction,
  }
}

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

function summarizeDiagnostic(value: Awaited<ReturnType<typeof diagnoseProject>>) {
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

export function missingCapabilityRecovery(missing: { tools?: string[]; resources?: string[] } = {}) {
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

function diagnosticGuidance(diagnostic: unknown) {
  const ok = Boolean((diagnostic as { ok?: unknown })?.ok)
  return {
    nextRecommendedAction: ok
      ? 'For an existing app, register or select the target workspace with project_add before planning. For hub checkout work, call planning_session_create with targetMode:"hub". If expected MCP tools or resources are missing, restart/reconnect the MCP client and sidecar.'
      : 'Resolve diagnostics first. For stale or missing MCP capabilities, restart/reconnect the MCP client, restart the Appraise MCP sidecar, then rerun npm run setup:mcp and npm run setup:agent.',
    nextRequiredAgentBehavior: ok ? 'choose_explicit_target_before_planning' : 'recover_mcp_or_project_binding',
  }
}

function projectPayload(api: Awaited<ReturnType<typeof createCoordinatorApiClient>>) {
  return {
    projectFingerprint: api.identity.projectFingerprint,
    canonicalProjectPath: api.project.canonicalProjectPath,
    capabilities: mcpCapabilityMetadata,
    capabilityRecovery: missingCapabilityRecovery(),
  }
}

export function planningSessionTargetRequiredResponse(input: {
  projectBrief: string
  targetProjects: unknown
  hubProjectPath: string
}) {
  return {
    status: 'target_required',
    code: 'planning-target-required',
    message:
      'planning_session_create requires targetWorkspacePath for a new-app brief, or explicit targetMode:"hub" when the plan is intentionally scoped to the Appraise hub checkout.',
    projectBrief: input.projectBrief,
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

type BriefPlanTask = {
  id: string
  title: string
  description: string
  acceptanceCriteria: string[]
  validationIntent: string
}

type StructuredBriefPlan = {
  tasks: BriefPlanTask[]
  edges: Array<{ from: string; to: string; type: 'blocks' }>
  implementationGroups: Array<{ id: string; taskIds: string[] }>
}

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some(pattern => pattern.test(value))
}

function structuredBriefPlan(tasks: BriefPlanTask[]): StructuredBriefPlan {
  return {
    tasks,
    edges: tasks.slice(0, -1).map((task, index) => ({ from: task.id, to: tasks[index + 1]!.id, type: 'blocks' })),
    implementationGroups: [
      { id: 'foundation', taskIds: tasks.slice(0, 2).map(task => task.id) },
      { id: 'behavior', taskIds: tasks.slice(2, -1).map(task => task.id) },
      { id: 'quality', taskIds: [tasks[tasks.length - 1]!.id] },
    ].filter(group => group.taskIds.length > 0),
  }
}

function createStructuredTasksFromBrief(projectBrief: string): StructuredBriefPlan | undefined {
  const brief = projectBrief.toLowerCase()
  const briefAnalysis = analyzeBrief(projectBrief)
  const isAppBrief = includesAny(brief, [
    /\bapp(?:lication)?\b/,
    /\bfrontend\b/,
    /\bweb\b/,
    /\bui\b/,
    /\btodo(?:s)?\b/,
    /\btask(?:s)?\b/,
    /\bdashboard\b/,
    /\beditor\b/,
    /\bnotes?\b/,
  ])

  if (!isAppBrief) return undefined

  const stack = [
    includesAny(brief, [/\breact\b/]) ? 'React' : undefined,
    includesAny(brief, [/\bvite\b/]) ? 'Vite' : undefined,
    includesAny(brief, [/\btailwind\b/]) ? 'Tailwind' : undefined,
    includesAny(brief, [/\bshadcn\b/]) ? 'shadcn/ui' : undefined,
    includesAny(brief, [/\btanstack\b/]) ? 'TanStack' : undefined,
  ]
    .filter(Boolean)
    .join(', ')
  const stackSummary = stack || 'React 19, TypeScript, Vite, and local browser validation'
  const setupTask: BriefPlanTask = {
    id: 'scaffold-setup',
    title: 'Scaffold and configure the app shell',
    description: `Create the ${stackSummary} application foundation, install required UI/data dependencies, and wire the base layout, routing, and styling entry points requested by the brief. These defaults are reviewable through Appraise feedback when the brief does not name a stack.`,
    acceptanceCriteria: [
      `The app starts locally with ${stackSummary} and no missing dependency errors.`,
      'Base styling, component primitives, and project structure are in place for the planned UI.',
      'Stack assumptions are stated clearly in the review-ready plan.',
    ],
    validationIntent: 'Run install/build or the closest available scaffold validation for the generated app shell.',
  }
  const asksForPersistence = includesAny(brief, [
    /\bpersist(?:ence|ed|ing)?\b/,
    /\bstorage\b/,
    /\blocalstorage\b/,
    /\bdatabase\b/,
    /\bsqlite\b/,
    /\bsaved?\b/,
    /\bhistory\b/,
  ])
  const asksForCrud = includesAny(brief, [
    /\bcrud\b/,
    /\bcreate\b/,
    /\badd\b/,
    /\bedit\b/,
    /\bupdate\b/,
    /\bdelete\b/,
    /\bremove\b/,
  ])
  const asksForCompletion = includesAny(brief, [/\bcomplete\b/, /\bcompleted\b/, /\bdone\b/, /\btoggle\b/])
  const isTodoBrief = includesAny(brief, [/\btodo(?:s)?\b/, /\btask(?:s)?\b/, /\bchecklist\b/])
  const isReminderBrief = briefAnalysis.selectedDomain === 'reminder'
  const isApiInformationBrief = briefAnalysis.selectedDomain === 'api-information'
  const isNotesBrief = briefAnalysis.selectedDomain === 'notes'
  const isEditorBrief = briefAnalysis.selectedDomain === 'editor'
  const isDashboardBrief = includesAny(brief, [
    /\bdashboard\b/,
    /\bmetrics?\b/,
    /\bsummary\b/,
    /\bfilter(?:ing)?\b/,
    /\bsort(?:ing)?\b/,
    /\breport(?:ing)?\b/,
  ])

  if (isReminderBrief) {
    return structuredBriefPlan([
      setupTask,
      {
        id: 'reminder-model-ui',
        title: 'Model reminders and build the primary list',
        description:
          'Define reminders with a title, optional notes, due date and time, and an active or completed state in a clear list and input flow.',
        acceptanceCriteria: [
          'Users can enter a reminder title, optional notes, and due date/time.',
          'The primary UI includes accessible empty, active, and completed reminder states.',
        ],
        validationIntent: 'Test reminder creation and field validation with focused UI coverage.',
      },
      {
        id: 'reminder-crud-completion',
        title: 'Implement reminder CRUD and completion',
        description:
          'Implement create, edit, delete, complete, and reactivate behavior with predictable accessible controls.',
        acceptanceCriteria: [
          'Users can create, edit, and delete reminders without losing unrelated records.',
          'Users can complete and reactivate a reminder with the updated state reflected immediately.',
        ],
        validationIntent: 'Test create, edit, delete, completion, and reactivation workflows.',
      },
      {
        id: 'reminder-filtering-persistence',
        title: 'Filter and persist reminders',
        description:
          'Provide active and completed reminder filters and persist reminder data so it restores after reload.',
        acceptanceCriteria: [
          'Users can filter active and completed reminders.',
          'Persisted reminders, including notes, due date/time, and completion state, restore on reload.',
        ],
        validationIntent: 'Test filters and persistence recovery with deterministic saved-data evidence.',
      },
      {
        id: 'reminder-quality-validation',
        title: 'Validate accessible responsive reminder workflows',
        description:
          'Validate the reminder workflow across responsive layouts with keyboard focus management and screen-reader announcements.',
        acceptanceCriteria: [
          'Responsive layouts preserve reminder creation, filters, and status controls on small screens.',
          'Accessible controls expose labels, focus management, and screen-reader status announcements.',
        ],
        validationIntent: 'Run responsive and accessibility tests for the complete reminder workflow.',
      },
    ])
  }

  if (isTodoBrief && (asksForCrud || asksForCompletion || asksForPersistence)) {
    const taskNoun = includesAny(brief, [/\btodo(?:s)?\b/]) ? 'todo' : 'task'
    return structuredBriefPlan([
      setupTask,
      {
        id: 'task-model-ui',
        title: `Model ${taskNoun} data and build the primary UI`,
        description: `Define the ${taskNoun} shape, app state boundaries, and visible list/form experience for creating, viewing, and organizing items.`,
        acceptanceCriteria: [
          `The UI exposes a clear ${taskNoun} list, empty state, and input flow.`,
          `${taskNoun} data includes the fields needed for titles and completion state.`,
        ],
        validationIntent: 'Exercise the main UI states manually or with component-level tests where available.',
      },
      {
        id: 'crud-completion',
        title: `Implement ${taskNoun} CRUD and completion behavior`,
        description: `Add create, read, update, delete, and completion-toggle flows with predictable state updates and accessible controls.`,
        acceptanceCriteria: [
          `Users can add, edit, delete, and mark ${taskNoun} items complete or incomplete.`,
          'Completion changes are reflected immediately in the rendered list without stale UI state.',
        ],
        validationIntent: 'Run focused interaction tests or manually verify each CRUD and completion path.',
      },
      {
        id: 'persistence',
        title: `Persist ${taskNoun} state`,
        description: `Store ${taskNoun} data using the persistence approach requested by the brief, and restore saved state on reload.`,
        acceptanceCriteria: [
          `${taskNoun} items survive a page reload or app restart according to the selected persistence layer.`,
          'Persistence failures do not corrupt the visible in-memory state.',
        ],
        validationIntent:
          'Verify saved items reload correctly and cover persistence behavior with the closest available automated test.',
      },
      {
        id: 'validation',
        title: 'Validate the planned user workflow',
        description:
          'Add or run validation that covers startup, primary UI rendering, CRUD behavior, completion toggles, and persistence recovery.',
        acceptanceCriteria: [
          'The happy path from app launch through persisted completed items is verified.',
          'Relevant lint, unit, component, or end-to-end checks pass or have documented follow-up gaps.',
        ],
        validationIntent: 'Run the focused test suite plus lint/build checks appropriate for the created app.',
      },
    ])
  }

  if (isNotesBrief) {
    return structuredBriefPlan([
      setupTask,
      {
        id: 'notes-crud',
        title: 'Build local notes CRUD',
        description: 'Create the notes list and editor flows for adding, reading, editing, and deleting local notes.',
        acceptanceCriteria: [
          'Users can create, read, edit, and delete notes with accessible labeled controls.',
          'Empty, selected, editing, and destructive-confirmation states are clear.',
        ],
        validationIntent: 'Exercise create, read, edit, and delete note workflows with focused browser validation.',
      },
      {
        id: 'notes-organization',
        title: 'Persist and organize notes',
        description: 'Persist notes locally and support the ordering and search behavior requested by the brief.',
        acceptanceCriteria: [
          'Notes survive reload and retain deterministic ordering.',
          'Search narrows notes by their visible content without losing the selected note unexpectedly.',
        ],
        validationIntent: 'Verify persistence, ordering, reload recovery, and search results.',
      },
      {
        id: 'notes-quality',
        title: 'Validate the notes experience',
        description: 'Cover the complete local notes workflow, responsive behavior, and accessibility states.',
        acceptanceCriteria: [
          'Keyboard and screen-reader users can operate note creation, selection, editing, search, and deletion.',
          'The notes workflow remains usable across responsive layouts.',
        ],
        validationIntent: 'Run focused notes CRUD, persistence, search, accessibility, and responsive tests.',
      },
    ])
  }

  if (isApiInformationBrief) {
    const resultNoun = includesAny(brief, [/\bweather\b/, /\bforecast\b/]) ? 'weather results' : 'API results'
    const apiName = includesAny(brief, [/\bweather\b/, /\bforecast\b/]) ? 'weather API' : 'external API'
    return structuredBriefPlan([
      setupTask,
      {
        id: 'input-search',
        title: 'Build the input and search flow',
        description:
          'Create the user input flow for entering a location or query, submitting the lookup, and clearing or revising the search.',
        acceptanceCriteria: [
          'Users can enter a location or query and submit it from the primary screen.',
          'The interface communicates the active query and handles empty input without a broken request.',
        ],
        validationIntent: 'Exercise the search/input path with the closest available component or browser check.',
      },
      {
        id: 'api-integration',
        title: `Integrate the ${apiName}`,
        description:
          'Fetch information from the requested API source, normalize the response for the UI, and protect the interface from network or response-shape failures.',
        acceptanceCriteria: [
          `Successful responses populate ${resultNoun} without leaking raw transport details to users.`,
          'Loading, empty, and error states are visible and recoverable from the primary flow.',
        ],
        validationIntent:
          'Use a mocked or deterministic API response in focused tests when live API access is not stable.',
      },
      {
        id: 'result-rendering',
        title: `Render ${resultNoun}`,
        description:
          'Display the fetched information with clear hierarchy, useful metadata, and responsive layout states for desktop and mobile.',
        acceptanceCriteria: [
          `${resultNoun} include the user-relevant fields requested by the brief.`,
          'The result view remains usable across loading, success, empty, and error states.',
        ],
        validationIntent: 'Verify the rendered result and state transitions with focused UI or E2E coverage.',
      },
      {
        id: 'validation',
        title: 'Validate the information workflow',
        description:
          'Add or run validation that covers app startup, query submission, API success, loading and error states, and result rendering.',
        acceptanceCriteria: [
          'The primary information lookup path is verified with deterministic evidence.',
          'Relevant lint, unit, component, or end-to-end checks pass or have documented follow-up gaps.',
        ],
        validationIntent: 'Run focused tests with mocked API evidence plus lint/build checks appropriate for the app.',
      },
    ])
  }

  if (isEditorBrief) {
    return structuredBriefPlan([
      setupTask,
      {
        id: 'editor-state',
        title: 'Build editor state and controls',
        description:
          'Create the document or note editing experience, including editing state, selection affordances, and save-ready UI feedback.',
        acceptanceCriteria: [
          'Users can create or update written content through the primary editor.',
          'Unsaved, saved, empty, and invalid states are represented clearly.',
        ],
        validationIntent: 'Exercise editor state transitions with focused component or browser validation.',
      },
      {
        id: 'document-management',
        title: 'Manage documents or notes',
        description:
          'Add the list/detail workflow for creating, selecting, renaming, deleting, or organizing documents as requested by the brief.',
        acceptanceCriteria: [
          'Users can move between document list and editor surfaces without losing context.',
          'Document management actions update the visible state predictably.',
        ],
        validationIntent: 'Verify the document/list workflow and destructive action safeguards.',
      },
      {
        id: 'persistence',
        title: 'Persist editor content',
        description:
          'Store document content with the persistence layer requested by the brief and restore it on reload.',
        acceptanceCriteria: [
          'Saved content survives a page reload or app restart according to the selected persistence layer.',
          'Persistence failures surface a recoverable state without corrupting visible content.',
        ],
        validationIntent: 'Verify saved content reloads and persistence failures are handled.',
      },
      {
        id: 'validation',
        title: 'Validate the editor workflow',
        description:
          'Add or run validation that covers editing, document management, persistence, and recovery states.',
        acceptanceCriteria: [
          'The primary editor workflow is verified with deterministic evidence.',
          'Relevant lint, unit, component, or end-to-end checks pass or have documented follow-up gaps.',
        ],
        validationIntent: 'Run focused tests plus lint/build checks appropriate for the app.',
      },
    ])
  }

  if (isDashboardBrief) {
    return structuredBriefPlan([
      setupTask,
      {
        id: 'data-source',
        title: 'Connect dashboard data sources',
        description:
          'Prepare the dashboard data source, fixture, or API integration and normalize data for summaries and tables.',
        acceptanceCriteria: [
          'Dashboard data loads from the source requested by the brief or a deterministic fixture when needed.',
          'Empty and error data-source states are visible and recoverable.',
        ],
        validationIntent: 'Validate data loading with deterministic fixture or mocked source evidence.',
      },
      {
        id: 'dashboard-controls',
        title: 'Add filtering, sorting, and summaries',
        description:
          'Implement the dashboard controls, summary metrics, and list/table views needed to inspect and compare the data.',
        acceptanceCriteria: [
          'Users can filter or sort the dashboard data where the brief requests comparison or scanning.',
          'Summary metrics and detailed rows remain consistent after control changes.',
        ],
        validationIntent: 'Exercise filters, sorting, summaries, and empty states in focused UI validation.',
      },
      {
        id: 'dashboard-states',
        title: 'Polish operational states',
        description:
          'Cover loading, empty, error, and responsive states so repeated dashboard use remains predictable.',
        acceptanceCriteria: [
          'The dashboard remains scannable across loading, empty, success, and error states.',
          'Responsive layouts preserve key controls and summaries on smaller screens.',
        ],
        validationIntent: 'Verify dashboard states with component or E2E checks.',
      },
      {
        id: 'validation',
        title: 'Validate the dashboard workflow',
        description: 'Add or run validation that covers data loading, filtering/sorting, summaries, and error states.',
        acceptanceCriteria: [
          'The primary dashboard workflow is verified with deterministic evidence.',
          'Relevant lint, unit, component, or end-to-end checks pass or have documented follow-up gaps.',
        ],
        validationIntent: 'Run focused tests plus lint/build checks appropriate for the app.',
      },
    ])
  }

  if (asksForCrud) {
    const persistenceTask: BriefPlanTask[] = asksForPersistence
      ? [
          {
            id: 'persistence',
            title: 'Persist entity state',
            description:
              'Store entity data using the persistence approach requested by the brief and restore saved state on reload.',
            acceptanceCriteria: [
              'Entity data survives a page reload or app restart according to the selected persistence layer.',
              'Persistence failures do not corrupt the visible in-memory state.',
            ],
            validationIntent:
              'Verify saved entities reload correctly and cover persistence behavior with the closest available automated test.',
          },
        ]
      : []
    return structuredBriefPlan([
      setupTask,
      {
        id: 'entity-model',
        title: 'Model the requested entity data',
        description:
          'Define the entity shape, state boundaries, validation rules, and list/detail UI needed by the brief.',
        acceptanceCriteria: [
          'The UI exposes the requested entity list, empty state, and input flow.',
          'Entity fields match the nouns and attributes present in the user brief.',
        ],
        validationIntent: 'Exercise the primary model and UI states manually or with component tests.',
      },
      {
        id: 'crud-workflow',
        title: 'Implement create, edit, delete, and list flows',
        description:
          'Add the requested entity operations with predictable state updates, accessible controls, and safe destructive actions.',
        acceptanceCriteria: [
          'Users can create, edit, delete, and list the requested entities.',
          'State changes are reflected immediately without stale UI state.',
        ],
        validationIntent: 'Run focused interaction tests or manually verify each requested CRUD path.',
      },
      ...persistenceTask,
      {
        id: 'validation',
        title: 'Validate the CRUD workflow',
        description: 'Add or run validation that covers startup, entity CRUD behavior, and requested persistence.',
        acceptanceCriteria: [
          'The primary entity workflow is verified with deterministic evidence.',
          'Relevant lint, unit, component, or end-to-end checks pass or have documented follow-up gaps.',
        ],
        validationIntent: 'Run the focused test suite plus lint/build checks appropriate for the created app.',
      },
    ])
  }

  return structuredBriefPlan([
    setupTask,
    {
      id: 'review-plan',
      title: 'Clarify the requested app behavior',
      description:
        'Keep the first plan concise and reviewable, preserving only behavior that appears in the brief without adding flows the user did not request.',
      acceptanceCriteria: [
        'The plan uses nouns and behaviors from the user brief.',
        'Any missing product decisions are surfaced for Appraise review instead of being assumed.',
      ],
      validationIntent: 'Use the Appraise review loop to confirm the intended workflow before implementation starts.',
    },
  ])
}

export function createPlanFromBrief(input: {
  projectBrief: string
  displayName?: string
  sourceFiles?: string[]
  planContext?: string
}) {
  const title = (input.displayName ?? input.projectBrief.split(/\r?\n/, 1)[0] ?? 'AppraiseJS planning session')
    .trim()
    .slice(0, 120)
  const context = [
    input.projectBrief,
    input.planContext,
    input.sourceFiles?.length ? `Source files: ${input.sourceFiles.join(', ')}` : undefined,
  ]
    .filter(Boolean)
    .join('\n\n')
  const structuredPlan = createStructuredTasksFromBrief(input.projectBrief)
  const tasks = structuredPlan?.tasks ?? [
    {
      id: 'plan-from-brief',
      title: 'Plan from brief',
      description: input.projectBrief,
      acceptanceCriteria: ['The Appraise review surface shows the proposed plan for human review.'],
      validationIntent: 'Wait for AppraiseJS plan review readiness before any implementation starts.',
    },
  ]
  return {
    version: '1',
    revision: 1,
    lifecycle: 'draft',
    goal: title || 'AppraiseJS planning session',
    description: context,
    requirementAssessment: assessPlanRequirements(input.projectBrief, tasks),
    tasks,
    edges: structuredPlan?.edges ?? [],
    implementationGroups: structuredPlan?.implementationGroups ?? [],
  }
}

function toolError(error: unknown) {
  if (error instanceof CoordinatorRequestError) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(coordinatorRequestErrorEnvelope(error)),
        },
      ],
    }
  }
  throw error
}

export type PlanSnapshot = {
  plan: { revision: number; lifecycle: string; goal?: string; description?: string }
  planContentHash: string
  planStateHash: string
  reviewBindingHash: string
  /** Compatibility alias for planContentHash. */
  contentHash: string
  links: unknown
}

function approvalGateStatus(lifecycle: string): 'approved' | 'changes_requested' | 'cancelled' | undefined {
  if (lifecycle === 'plan_approved') return 'approved'
  if (lifecycle === 'changes_requested') return 'changes_requested'
  if (lifecycle === 'cancelled') return 'cancelled'
  return undefined
}

function approvalGateEventStatus(type: string): 'approved' | 'changes_requested' | 'cancelled' | undefined {
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

function validationGateEventStatus(type: string): 'approved' | 'changes_requested' | 'cancelled' | undefined {
  if (type === 'validations_approved' || type === 'validation_approved') return 'approved'
  if (type === 'validation_changes_requested') return 'changes_requested'
  if (type === 'plan_cancelled') return 'cancelled'
  return undefined
}

type CoordinatorToolEvent = { sequence: number; type: string }

const defaultReviewLoopTimeoutMs = 120_000

export function latestGateEvent(
  events: CoordinatorToolEvent[],
  statusForEvent: (type: string) => 'approved' | 'changes_requested' | 'cancelled' | undefined,
) {
  return events.filter(event => statusForEvent(event.type)).sort((left, right) => right.sequence - left.sequence)[0]
}

type RecommendedWait = {
  tool: 'plan_wait_for_approval' | 'plan_review_loop' | 'plan_wait_for_review' | 'validation_review_loop'
  mode: 'long_poll'
  timeoutMs: number
  afterSequence: number
}

function linkFromSnapshot(links: unknown, key: 'appraise' | 'browser'): string | undefined {
  if (!links || typeof links !== 'object') return undefined
  const value = (links as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
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

function standbyPresentation(input: {
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
    browserUrl: browserUrl ? `${browserUrl}?review=validation` : undefined,
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

function lifecycleToolPayload(input: {
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

async function waitForEvents(
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

export async function createCoordinatorApiClient(options: McpOptions) {
  return createCoordinatorClient(options)
}

export async function createAppraiseMcpServer(options: McpOptions): Promise<McpServer> {
  const api = await createCoordinatorApiClient(options)
  const server = new McpServer({ name: 'appraisejs', version: '0.5.0' })
  const readSnapshot = (planId: string) => api.request(`plans/${planId}`) as Promise<PlanSnapshot>

  const phase1Contracts = [
    {
      name: 'action-catalog-contract',
      uri: 'appraise://contracts/action-catalog',
      title: 'Versioned action catalog contract',
      value: { version: ACTION_CATALOG_CONTRACT_VERSION, operations: ['categories', 'list', 'read'] },
    },
    {
      name: 'locator-graph-contract',
      uri: 'appraise://contracts/locator-graph',
      title: 'Surface and locator graph contract',
      value: { version: LOCATOR_GRAPH_CONTRACT_VERSION, boundedQueries: true, visualProjection: true },
    },
    {
      name: 'validation-ast-contract',
      uri: 'appraise://contracts/validation-ast',
      title: 'Agent-authored validation AST contract',
      value: { version: VALIDATION_AST_SCHEMA_VERSION, phases: ['check', 'preview', 'publish'] },
    },
    {
      name: 'delegated-authorization-contract',
      uri: 'appraise://contracts/delegated-authorization',
      title: 'Delegated authorization receipt contract',
      value: { version: DELEGATED_AUTHORIZATION_VERSION, replayProtection: 'durable-nonce' },
    },
  ] as const
  for (const contract of phase1Contracts) {
    server.registerResource(
      contract.name,
      contract.uri,
      { title: contract.title, mimeType: 'application/json' },
      async uri => ({
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(contract.value) }],
      }),
    )
  }

  server.registerResource(
    'project',
    'appraise://project',
    { title: 'AppraiseJS project identity', mimeType: 'application/json' },
    async uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(projectPayload(api)),
        },
      ],
    }),
  )
  server.registerResource(
    'target-projects',
    'appraise://target-projects',
    { title: 'Attached AppraiseJS target projects', mimeType: 'application/json' },
    async uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await api.listTargetProjects()),
        },
      ],
    }),
  )
  server.registerResource(
    'locator-graph-visual',
    'appraise://locator-graph/visual',
    { title: 'Human locator graph projection', mimeType: 'application/json' },
    async uri => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await api.readLocatorGraphVisual()) },
      ],
    }),
  )
  server.registerTool(
    'locator_graph_query',
    {
      description: 'Query a bounded locator graph path from a surface, group, or locator node.',
      inputSchema: {
        fromId: z.string().min(1),
        relation: z.string().optional(),
        toType: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
        depth: z.number().int().positive().max(4).optional(),
      },
    },
    async input => text(await api.queryLocatorGraph(input)),
  )
  server.registerTool(
    'validation_resources_propose',
    {
      description:
        'Transactionally propose target-bound managed-validation resources and receive stable IDs plus a refreshed context hash.',
      inputSchema: { planId: z.string(), proposal: z.unknown() },
    },
    async ({ planId, proposal }) => text(await api.proposeValidationResources(planId, proposal)),
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
  for (const phase of ['check', 'preview'] as const) {
    server.registerTool(
      `validation_ast_${phase}`,
      {
        description: `${phase} a bounded Validation AST against authoritative plan, catalog, locator, and environment context.`,
        inputSchema: { planId: z.string(), submission: z.unknown() },
      },
      async ({ planId, submission }) =>
        text(
          await api[phase === 'check' ? 'checkValidationAst' : 'previewValidationAst'](
            planId,
            submission as ValidationAstSubmission,
          ),
        ),
    )
  }
  server.registerTool(
    'validation_ast_extension_policy',
    {
      description: 'Read the bounded, versioned custom-extension capability policy for an authoritative target plan.',
      inputSchema: { planId: z.string() },
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
      },
    },
    async ({ planId, submission, expectedReceiptHash }) =>
      text(await api.compileValidationAst(planId, submission as ValidationAstSubmission, expectedReceiptHash)),
  )
  if (providerNativeRunsEnabled()) {
    server.registerResource(
      'provider-runs',
      'appraise://provider-runs',
      { title: 'AppraiseJS provider workflow runs', mimeType: 'application/json' },
      async uri => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(await api.listProviderRuns()),
          },
        ],
      }),
    )
    server.registerResource(
      'providers',
      'appraise://providers',
      { title: 'AppraiseJS coding agent providers', mimeType: 'application/json' },
      async uri => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(await api.listProviders()),
          },
        ],
      }),
    )
  }
  server.registerResource(
    'agent-guide',
    'appraise://agent-guide',
    { title: 'AppraiseJS agent workflow guide', mimeType: 'application/json' },
    async uri => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(agentGuide) }],
    }),
  )
  server.registerResource(
    'action-catalog',
    'appraise://actions/catalog',
    { title: 'AppraiseJS action catalog categories', mimeType: 'application/json' },
    async uri => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await api.listActionCategories()) },
      ],
    }),
  )
  server.registerResource(
    'action-category',
    new ResourceTemplate('appraise://actions/category/{categoryId}', { list: undefined }),
    { title: 'AppraiseJS action category', mimeType: 'application/json' },
    async (uri, variables) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await api.listActions({ categoryId: String(variables.categoryId), limit: 50 })),
        },
      ],
    }),
  )
  server.registerResource(
    'workflow-planning',
    'appraise://workflow/planning',
    { title: 'AppraiseJS planning workflow', mimeType: 'application/json' },
    async uri => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(planningWorkflow) }],
    }),
  )
  server.registerResource(
    'workflow-validation-preparation',
    'appraise://workflow/validation-preparation',
    { title: 'AppraiseJS validation preparation workflow and artifact contract', mimeType: 'application/json' },
    async uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(validationPreparationWorkflow),
        },
      ],
    }),
  )
  server.registerResource(
    'workflow-standby',
    'appraise://workflow/standby',
    { title: 'AppraiseJS standby workflow', mimeType: 'application/json' },
    async uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(standbyWorkflow),
        },
      ],
    }),
  )
  server.registerResource(
    'plan',
    new ResourceTemplate('appraise://plans/{planId}', { list: undefined }),
    { title: 'AppraiseJS plan', mimeType: 'application/json' },
    async (uri, variables) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await api.request(`plans/${String(variables.planId)}`)),
        },
      ],
    }),
  )
  server.registerResource(
    'validation-context',
    new ResourceTemplate('appraise://plans/{planId}/validation-context', { list: undefined }),
    { title: 'AppraiseJS validation context', mimeType: 'application/json' },
    async (uri, variables) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await api.request(`plans/${String(variables.planId)}/validations/context`)),
        },
      ],
    }),
  )
  server.registerResource(
    'validation-draft',
    new ResourceTemplate('appraise://plans/{planId}/validation-draft', { list: undefined }),
    { title: 'AppraiseJS validation draft', mimeType: 'application/json' },
    async (uri, variables) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await api.request(`plans/${String(variables.planId)}/validations/draft`)),
        },
      ],
    }),
  )

  server.registerTool(
    'project_diagnostic',
    {
      description:
        'Verify application/API reachability, authentication, project identity, Git reproducibility, and contract compatibility.',
      inputSchema: {},
    },
    async () => {
      const diagnostic = await diagnoseProject(options)
      return text(
        withGuidance(
          {
            ...diagnostic,
            capabilities: mcpCapabilityMetadata,
            capabilityRecovery: missingCapabilityRecovery(),
          },
          diagnosticGuidance(diagnostic),
        ),
      )
    },
  )
  server.registerTool(
    'project_add',
    {
      description:
        'Attach an existing application repository as a target project and write a non-blocking .appraisejs/project.json continuity marker when writable.',
      inputSchema: { path: z.string().min(1), displayName: z.string().min(1).optional() },
    },
    async ({ path, displayName }) => {
      try {
        return text(
          withGuidance(await api.addTargetProject(path, displayName), {
            nextRecommendedAction:
              'Use the returned target project id, fingerprint, display name, or canonical path as plan_create target.',
          }),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
  server.registerTool(
    'project_list',
    {
      description: 'List application repositories attached to the local AppraiseJS hub.',
      inputSchema: {},
    },
    async () => text(await api.listTargetProjects()),
  )
  if (providerNativeRunsEnabled()) {
    server.registerTool(
      'provider_list',
      {
        description: 'List built-in coding agent providers, registration state, probe status, and launchability.',
        inputSchema: {},
      },
      async () => {
        try {
          return text(await api.listProviders())
        } catch (error) {
          return toolError(error)
        }
      },
    )
    server.registerTool(
      'provider_probe',
      {
        description: 'Probe a built-in coding agent provider executable without storing secrets.',
        inputSchema: { providerKey: z.string().min(1) },
      },
      async ({ providerKey }) => {
        try {
          return text(await api.probeProvider(providerKey))
        } catch (error) {
          return toolError(error)
        }
      },
    )
    server.registerTool(
      'provider_update',
      {
        description:
          'Update non-secret coding agent registration settings such as executable override and enabled state.',
        inputSchema: {
          providerKey: z.string().min(1),
          executablePath: z.string().nullable().optional(),
          defaultProfile: z.string().nullable().optional(),
          defaultModel: z.string().nullable().optional(),
          enabled: z.boolean().optional(),
          launchEnabled: z.boolean().optional(),
          settings: z.record(z.string(), z.unknown()).nullable().optional(),
        },
      },
      async ({ providerKey, ...input }) => {
        try {
          return text(await api.updateProvider(providerKey, input))
        } catch (error) {
          return toolError(error)
        }
      },
    )
    server.registerTool(
      'provider_run_create',
      {
        description:
          'Create a planning-only Appraise-owned provider run for an attached target project. This does not approve plans, validation, baseline, implementation, or completion gates.',
        inputSchema: {
          targetProjectId: z.string().uuid(),
          planId: z.string().min(1).optional(),
          providerKey: z.string().min(1).optional(),
          providerProfile: z.string().min(1).optional(),
          launchPrompt: z.string().trim().min(1),
        },
      },
      async input => {
        try {
          return text(
            withGuidance(await api.createProviderRun(input), {
              nextRecommendedAction:
                'Read the provider run, present its event stream, then continue through Appraise plan review or validation gates only when durable Appraise state allows it.',
              nextRequiredAgentBehavior: 'respect_appraise_lifecycle_gates',
            }),
          )
        } catch (error) {
          return toolError(error)
        }
      },
    )
    server.registerTool(
      'provider_run_read',
      {
        description:
          'Read an Appraise-owned provider run with event, permission, artifact, and target-project context.',
        inputSchema: { runId: z.string().uuid() },
      },
      async ({ runId }) => {
        try {
          return text(await api.readProviderRun(runId))
        } catch (error) {
          return toolError(error)
        }
      },
    )
    server.registerTool(
      'provider_run_cancel',
      {
        description:
          'Cancel a provider execution attempt. Cancellation updates provider-run status only; plan lifecycle cancellation remains Appraise-owned.',
        inputSchema: { runId: z.string().uuid() },
      },
      async ({ runId }) => {
        try {
          return text(await api.cancelProviderRun(runId))
        } catch (error) {
          return toolError(error)
        }
      },
    )
    server.registerTool(
      'provider_permission_decide',
      {
        description:
          'Record a user-visible provider permission decision for a provider run without bypassing Appraise lifecycle gates.',
        inputSchema: {
          runId: z.string().uuid(),
          requestId: z.string().min(1),
          decision: z.enum(['approved', 'denied']),
          riskTier: z.string().min(1),
          requestedScope: z.string().min(1),
          payload: z.record(z.string(), z.unknown()).optional(),
          reason: z.string().optional(),
          decidedBy: z.string().min(1).default('mcp-client'),
        },
      },
      async ({ runId, ...input }) => {
        try {
          return text(await api.decideProviderPermission(runId, input))
        } catch (error) {
          return toolError(error)
        }
      },
    )
  }
  server.registerTool(
    'plan_create',
    {
      description:
        'Create a structured AppraiseJS plan with a short title in goal and a separate description, then wait until its review surface is ready.',
      inputSchema: { plan: planCreateInputSchema, target: z.string().min(1).optional() },
    },
    async ({ plan, target }) => {
      try {
        return text(
          withGuidance(target ? await api.createPlanForTarget(plan, target) : await api.createPlan(plan), {
            nextRecommendedAction:
              'Present the returned browser URL, appraise:// URL, goal, description, revision, lifecycle, content hash, currentAfterSequence when present, nextAfterSequence when present, and recommended wait call; then call plan_review_loop to wait for durable review readiness and Appraise-owned approval feedback before implementation.',
            nextRequiredAgentBehavior: 'wait_for_plan_review_ready',
          }),
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
        'Normal-agent entry point: diagnose, optionally register a target workspace, create a plan from a brief, wait for review readiness, then return standby instructions.',
      inputSchema: {
        projectBrief: z.string().min(1),
        targetWorkspacePath: z.string().min(1).optional(),
        targetMode: z.enum(['hub']).optional(),
        displayName: z.string().min(1).optional(),
        mode: z.enum(['plan_only', 'plan_then_wait']).default('plan_then_wait'),
        sourceFiles: z.array(z.string().min(1)).optional(),
        planContext: z.string().optional(),
      },
    },
    async input => {
      try {
        const diagnostic = await diagnoseProject(options)
        if (!input.targetWorkspacePath && input.targetMode !== 'hub') {
          return text(
            planningSessionTargetRequiredResponse({
              projectBrief: input.projectBrief,
              targetProjects: await api.listTargetProjects(),
              hubProjectPath: api.project.canonicalProjectPath,
            }),
          )
        }
        let targetProjectResult: unknown
        let target: string | undefined
        if (input.targetWorkspacePath) {
          targetProjectResult = await api.addTargetProject(input.targetWorkspacePath, input.displayName)
          const targetProject = (targetProjectResult as { targetProject?: { id?: string } }).targetProject
          target = targetProject?.id ?? input.targetWorkspacePath
        }
        const candidatePlan = createPlanFromBrief(input)
        const requirementAssessment = assessPlanRequirements(input.projectBrief, candidatePlan.tasks)
        if (requirementAssessment.uncoveredRequirementIds.length) {
          return text({
            status: 'coverage_review_required',
            candidatePlan,
            requirementAssessment,
            nextRecommendedAction:
              'Review the uncovered explicit requirements, revise the brief or task shape, then rerun planning_session_create before Appraise publishes a review-ready revision.',
            nextRequiredAgentBehavior: 'resolve_uncovered_plan_requirements',
          })
        }
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
        return text({
          diagnostic: summarizeDiagnostic(diagnostic),
          requirementAssessment,
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
        })
      } catch (error) {
        return toolError(error)
      }
    },
  )
  server.registerTool(
    'test_run_preflight',
    {
      description:
        'Read-only blocker check before creating a managed target test run. Use this before plan-bound test_run calls.',
      inputSchema: {
        target: z.string().min(1).optional(),
        environmentId: z.string().min(1).optional(),
        planId: z.string().min(1).optional(),
        validationId: z.string().min(1).optional(),
        featurePaths: z.array(z.string().min(1)).optional(),
        importPaths: z.array(z.string().min(1)).optional(),
        supportPaths: z.array(z.string().min(1)).optional(),
        responseMode: responseModeSchema,
      },
    },
    async ({ responseMode, ...input }) => {
      try {
        const result = await api.request('test-runs/preflight', {
          method: 'POST',
          body: JSON.stringify(input),
        })
        return text(applyResponseMode(result, responseMode))
      } catch (error) {
        return toolError(error)
      }
    },
  )
  server.registerTool(
    'test_run',
    {
      description:
        'Run existing Appraise-compatible Cucumber/Playwright artifacts from an attached target repository and record a managed Appraise test run.',
      inputSchema: {
        target: z.string().min(1),
        environmentId: z.string().min(1),
        name: z.string().min(1).optional(),
        tagExpression: z.string().optional(),
        testWorkersCount: z.number().int().positive().optional(),
        browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']).optional(),
        planId: z.string().min(1).optional(),
        validationId: z.string().min(1).optional(),
        implementationValidationRunId: z.string().min(1).optional(),
        featurePaths: z.array(z.string().min(1)).optional(),
        importPaths: z.array(z.string().min(1)).optional(),
        supportPaths: z.array(z.string().min(1)).optional(),
        prepareWorkspace: z.boolean().optional(),
        expectedTestCases: z
          .array(z.object({ testCaseId: z.string().min(1), testSuiteId: z.string().min(1) }))
          .optional(),
        responseMode: responseModeSchema,
      },
    },
    async ({ responseMode, ...input }) => {
      try {
        return text(applyResponseMode(await api.runTargetTests(input), responseMode))
      } catch (error) {
        return toolError(error)
      }
    },
  )
  server.registerTool(
    'test_run_read',
    {
      description: 'Read bounded status and evidence summary for a managed Appraise test run.',
      inputSchema: { runId: z.string().uuid(), responseMode: responseModeSchema },
    },
    async ({ runId, responseMode }) => {
      try {
        return text(applyResponseMode(await api.readTestRun(runId), responseMode))
      } catch (error) {
        return toolError(error)
      }
    },
  )
  server.registerTool(
    'test_run_diagnose',
    {
      description: 'Diagnose invalid or suspicious managed test-run evidence with concise blockers and next action.',
      inputSchema: { runId: z.string().uuid(), responseMode: responseModeSchema },
    },
    async ({ runId, responseMode }) => {
      try {
        const result = (await api.diagnoseTestRun(runId)) as {
          kind?: string
          diagnostic?: unknown
          evidence?: unknown
        }
        const exactDto = result.kind === 'capsule' ? result.diagnostic : (result.evidence ?? result)
        return text(
          result.kind === 'capsule'
            ? applyCapsuleDiagnosticMode(exactDto, responseMode)
            : applyResponseMode(exactDto, responseMode),
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
      inputSchema: { planId: z.string() },
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
      },
    },
    async ({ planId, afterSequence, timeoutMs }) => {
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
        return text(reviewReadyPendingResponse({ planId, current, events, afterSequence, timeoutMs }))
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
          approvalPendingResponse({ planId, current, events, afterSequence, waitTool: 'plan_review_loop', timeoutMs }),
        )
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
              ? 'Call plan_review_read, revise against the current hash, and return to plan_review_loop standby.'
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
      inputSchema: { planId: z.string() },
    },
    async ({ planId }) => text(await api.request(`plans/${planId}/start`, { method: 'POST', body: '{}' })),
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
    'validation_context_read',
    {
      description:
        'Read live Appraise validation-preparation context: current plan tasks, target project metadata, reusable modules, suites, cases, template steps, locators, and environments.',
      inputSchema: {
        planId: z.string(),
        resourceTypes: z.array(z.string()).optional(),
        query: z.string().optional(),
        limit: z.number().int().positive().max(200).default(50),
        sinceHash: z.string().optional(),
      },
    },
    async ({ planId, resourceTypes, query, limit, sinceHash }) => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (resourceTypes?.length) params.set('resourceTypes', resourceTypes.join(','))
      if (query) params.set('query', query)
      if (sinceHash) params.set('sinceHash', sinceHash)
      return text(await api.request(`plans/${planId}/validations/context?${params}`))
    },
  )
  server.registerTool(
    'appraise_resources_list',
    {
      description:
        'List live reusable Appraise resources for validation authoring. This is equivalent to the resources section of validation_context_read.',
      inputSchema: { planId: z.string() },
    },
    async ({ planId }) => {
      const context = (await api.request(`plans/${planId}/validations/context`)) as { resources?: unknown }
      return text({
        resources: context.resources,
        nextRecommendedAction: 'Use resource IDs or names in draft proposals.',
      })
    },
  )
  server.registerTool(
    'template_step_search',
    {
      description:
        'Resolve live template steps with ranked intent and parameter compatibility before proposing custom steps.',
      inputSchema: {
        planId: z.string(),
        query: z.string().min(1),
        parameterNames: z.array(z.string().min(1)).default([]),
        limit: z.number().int().positive().max(25).default(5),
      },
    },
    async ({ planId, query, parameterNames, limit }) =>
      text(
        await api.request(
          `plans/${planId}/validations/resolver?intent=${encodeURIComponent(query)}&parameterNames=${encodeURIComponent(parameterNames.join(','))}&limit=${limit}`,
        ),
      ),
  )
  server.registerTool(
    'template_step_match',
    {
      description: 'Rank reusable template steps and step blocks for a behavior intent before proposing custom steps.',
      inputSchema: {
        planId: z.string(),
        intent: z.string().min(1),
        parameterNames: z.array(z.string().min(1)).default([]),
        limit: z.number().int().positive().max(25).default(5),
      },
    },
    async ({ planId, intent, parameterNames, limit }) =>
      text(
        await api.request(
          `plans/${planId}/validations/resolver?intent=${encodeURIComponent(intent)}&parameterNames=${encodeURIComponent(parameterNames.join(','))}&limit=${limit}`,
        ),
      ),
  )
  server.registerTool(
    'step_block_search',
    {
      description: 'Search reusable step blocks before proposing custom validation step sequences.',
      inputSchema: { planId: z.string(), query: z.string().min(1) },
    },
    async ({ planId, query }) => {
      const context = (await api.request(
        `plans/${planId}/validations/context?resourceTypes=stepBlocks&query=${encodeURIComponent(query)}&limit=25`,
      )) as {
        resources?: { stepBlocks?: Array<Record<string, unknown>> }
      }
      const matches = context.resources?.stepBlocks ?? []
      return text({ matches, nextRecommendedAction: 'Reuse a matching stepBlockRef when possible.' })
    },
  )
  server.registerTool(
    'locator_search',
    {
      description: 'Search live locators before proposing new locator resources.',
      inputSchema: { planId: z.string(), query: z.string().min(1) },
    },
    async ({ planId, query }) => {
      const context = (await api.request(
        `plans/${planId}/validations/context?resourceTypes=locators,locatorGroups&query=${encodeURIComponent(query)}&limit=25`,
      )) as {
        resources?: { locators?: Array<Record<string, unknown>>; locatorGroups?: Array<Record<string, unknown>> }
      }
      return text({
        locators: context.resources?.locators ?? [],
        locatorGroups: context.resources?.locatorGroups ?? [],
        nextRecommendedAction: 'Reuse a matching locatorRef or locatorGroupRef when possible.',
      })
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
      },
    },
    async ({ planId, afterSequence, timeoutMs }) => {
      const initial = (await api.request(`plans/${planId}/events?after=${afterSequence}`)) as {
        events?: CoordinatorToolEvent[]
      }
      let events = initial.events ?? []
      let current = await readSnapshot(planId)
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
        gateEvent = latestGateEvent(events, validationGateEventStatus)
        lifecycleStatus = validationGateStatus(current.plan.lifecycle)
      }

      if (!gateEvent && !lifecycleStatus) {
        return text(validationReviewPendingResponse({ planId, current, events, afterSequence, timeoutMs }))
      }

      const status = gateEvent ? validationGateEventStatus(gateEvent.type) : lifecycleStatus
      return text({
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
      })
    },
  )
  server.registerTool(
    'baseline_start',
    {
      description: 'Agent-owned execution tool: start required baseline executions after validation review approval.',
      inputSchema: { planId: z.string(), responseMode: responseModeSchema },
    },
    async ({ planId, responseMode }) =>
      text(
        applyLifecycleResponseMode(
          lifecycleToolPayload({
            planId,
            result: await api.request(`plans/${planId}/baseline/start`, { method: 'POST', body: '{}' }),
            nextRecommendedAction: 'Call baseline_reconcile until baseline evidence enters review.',
            nextRequiredAgentBehavior: 'reconcile_baseline',
            nextAllowedAction: { tool: 'baseline_reconcile' },
          }),
          responseMode,
        ),
      ),
  )
  server.registerTool(
    'baseline_reconcile',
    {
      description: 'Agent-owned execution tool: refresh baseline evidence and detect when review is ready.',
      inputSchema: { planId: z.string(), responseMode: responseModeSchema },
    },
    async ({ planId, responseMode }) => {
      const result = await api.request(`plans/${planId}/baseline/reconcile`, { method: 'POST', body: '{}' })
      const lifecycle =
        result && typeof result === 'object' && 'plan' in result
          ? (result as { plan?: { lifecycle?: string } }).plan?.lifecycle
          : undefined
      const recovery = baselineRecoveryForLifecycle(lifecycle)
      return text(
        applyLifecycleResponseMode(
          lifecycleToolPayload({
            planId,
            result,
            ...recovery,
          }),
          responseMode,
        ),
      )
    },
  )
  server.registerTool(
    'baseline_cancel',
    {
      description:
        'Explicit user/Appraise interrupt relay: cancel active baseline executions and return the plan to baseline changes requested.',
      inputSchema: { planId: z.string() },
    },
    async ({ planId }) =>
      text(
        lifecycleToolPayload({
          planId,
          result: await api.request(`plans/${planId}/baseline/cancel`, { method: 'POST', body: '{}' }),
          nextRecommendedAction: 'Revise validation or baseline setup, then call baseline_start again when ready.',
          nextRequiredAgentBehavior: 'revise_baseline_or_validation',
        }),
      ),
  )
  server.registerTool(
    'baseline_retry',
    {
      description:
        'Return invalid baseline evidence to validation repair while preserving historical attempts and requiring a fresh exact review.',
      inputSchema: {
        planId: z.string(),
        reason: z.string().trim().min(1),
        expectedValidationHash: z.string().startsWith('sha256:'),
      },
    },
    async ({ planId, reason, expectedValidationHash }) =>
      text(
        lifecycleToolPayload({
          planId,
          result: await api.request(`plans/${planId}/baseline/retry`, {
            method: 'POST',
            body: JSON.stringify({ reason, expectedValidationHash }),
          }),
          nextRecommendedAction:
            'Repair the managed Validation AST and submit it through check, preview, and compile for fresh review.',
          nextRequiredAgentBehavior: 'revise_validation_artifacts',
          nextAllowedAction: { tool: 'validation_context_read' },
        }),
      ),
  )
  server.registerTool(
    'baseline_failure_acknowledge',
    {
      description:
        'Explicit user/Appraise decision relay: acknowledge a current unrelated baseline failure by attempt id.',
      inputSchema: { planId: z.string(), attemptId: z.string(), acknowledgedBy: z.string().min(1) },
    },
    async ({ planId, attemptId, acknowledgedBy }) =>
      text(
        lifecycleToolPayload({
          planId,
          result: await api.request(`plans/${planId}/baseline/failures/${attemptId}/acknowledge`, {
            method: 'POST',
            body: JSON.stringify({ acknowledgedBy }),
          }),
          nextRecommendedAction: 'Continue baseline review and call baseline_accept when all blockers are resolved.',
          nextRequiredAgentBehavior: 'review_and_accept_baseline',
          nextAllowedAction: { tool: 'baseline_accept' },
        }),
      ),
  )
  server.registerTool(
    'baseline_regression_justify',
    {
      description:
        'Explicit user/Appraise decision relay: justify an accepted regression-pass baseline attempt before baseline acceptance.',
      inputSchema: { planId: z.string(), attemptId: z.string(), justification: z.string().min(1) },
    },
    async ({ planId, attemptId, justification }) =>
      text(
        lifecycleToolPayload({
          planId,
          result: await api.request(`plans/${planId}/baseline/regressions/${attemptId}/justify`, {
            method: 'POST',
            body: JSON.stringify({ justification }),
          }),
          nextRecommendedAction: 'Continue baseline review and call baseline_accept when all blockers are resolved.',
          nextRequiredAgentBehavior: 'review_and_accept_baseline',
          nextAllowedAction: { tool: 'baseline_accept' },
        }),
      ),
  )
  server.registerTool(
    'baseline_accept',
    {
      description: 'Explicit user/Appraise decision relay: accept complete baseline evidence.',
      inputSchema: { planId: z.string() },
    },
    async ({ planId }) =>
      text(
        lifecycleToolPayload({
          planId,
          result: await api.request(`plans/${planId}/baseline/accept`, { method: 'POST', body: '{}' }),
          nextRecommendedAction: 'Call implementation_start before recording implementation checkpoints.',
          nextRequiredAgentBehavior: 'start_implementation',
          nextAllowedAction: { tool: 'implementation_start' },
        }),
      ),
  )
  server.registerTool(
    'validation_file_approve',
    {
      description:
        'Explicit user/Appraise decision relay: approve one flagged changed file for its exact current content hash.',
      inputSchema: { planId: z.string(), path: z.string(), contentHash: z.string(), approvedBy: z.string() },
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
    'validation_review_submit',
    {
      description:
        'Explicit user/Appraise decision relay: submit the revision-level validation review after all required decisions are current.',
      inputSchema: {
        planId: z.string(),
        operationHash: z.string().startsWith('sha256:').optional(),
        extensionArtifactHashes: z.array(z.string().startsWith('sha256:')).optional(),
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
    'objective_create',
    {
      description: 'Create a bounded objective of independently reviewable milestone-scoped plans.',
      inputSchema: {
        objectiveId: z.string().optional(),
        title: z.string().min(1).max(160),
        milestones: z
          .array(z.object({ id: z.string(), title: z.string().min(1) }))
          .min(1)
          .max(24),
        plans: z
          .array(
            z.object({
              planId: z.string(),
              milestoneId: z.string(),
              dependsOn: z.array(z.string()).optional(),
              impactedPaths: z.array(z.string()).optional(),
            }),
          )
          .min(1)
          .max(24),
      },
    },
    async input => text(await api.createObjective(input)),
  )
  server.registerTool(
    'coordination_slo_evaluate',
    {
      description: 'Evaluate active Appraise/agent time and coordination budgets separately from human review.',
      inputSchema: {
        phases: z.array(
          z.object({
            phase: z.string(),
            activeAppraiseMs: z.number().int().nonnegative(),
            activeAgentMs: z.number().int().nonnegative(),
            humanReviewMs: z.number().int().nonnegative(),
          }),
        ),
        responseBytes: z.array(z.number().int().nonnegative()),
        operations: z.number().int().nonnegative(),
        retries: z.number().int().nonnegative(),
        approvals: z.number().int().nonnegative(),
      },
    },
    async input => text(await api.evaluateCoordinationSlo(input)),
  )
  server.registerTool(
    'implementation_start',
    {
      description: 'Agent-owned execution tool: start implementation after accepted baseline evidence.',
      inputSchema: { planId: z.string() },
    },
    async ({ planId }) =>
      text(
        lifecycleToolPayload({
          planId,
          result: await api.request(`plans/${planId}/implementation/start`, { method: 'POST', body: '{}' }),
          nextRecommendedAction: 'Call implementation_checkpoint before task work, then update runnable tasks.',
          nextRequiredAgentBehavior: 'record_implementation_checkpoint',
          nextAllowedAction: { tool: 'implementation_checkpoint', type: 'before_group' },
        }),
      ),
  )
  server.registerTool(
    'implementation_checkpoint',
    {
      description: 'Reach an implementation checkpoint and receive currently runnable tasks.',
      inputSchema: {
        planId: z.string(),
        type: z.enum([
          'before_task',
          'after_task',
          'before_group',
          'after_group',
          'before_validation',
          'before_completion',
        ]),
        taskIds: z.array(z.string()).optional(),
        queuedFeedbackCount: z.number().int().nonnegative().optional(),
      },
    },
    async ({ planId, ...body }) =>
      text(
        await api.request(`plans/${planId}/implementation/checkpoint`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      ),
  )
  server.registerTool(
    'implementation_group_approve',
    {
      description: 'Approve implementation groups and receive currently runnable task IDs.',
      inputSchema: { planId: z.string(), groupIds: z.array(z.string().min(1)).min(1) },
    },
    async ({ planId, groupIds }) =>
      text(
        lifecycleToolPayload({
          planId,
          result: await api.request(`plans/${planId}/implementation/groups`, {
            method: 'POST',
            body: JSON.stringify({ groupIds }),
          }),
          nextRecommendedAction: 'Call implementation_checkpoint before working on runnable tasks.',
          nextRequiredAgentBehavior: 'record_implementation_checkpoint',
          nextAllowedAction: { tool: 'implementation_checkpoint', type: 'before_group' },
        }),
      ),
  )
  server.registerTool(
    'implementation_task_update',
    {
      description: 'Move an implementation task through pending, in progress, implemented, and verified.',
      inputSchema: {
        planId: z.string(),
        taskId: z.string(),
        status: z.enum(['pending', 'in_progress', 'implemented', 'verified']),
        commitHash: z.string().optional(),
      },
    },
    async ({ planId, taskId, ...body }) =>
      text(
        await api.request(`plans/${planId}/implementation/tasks/${taskId}`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      ),
  )
  server.registerTool(
    'implementation_validation_record',
    {
      description:
        'Record exceptional manual implementation validation evidence. This is always reduced assurance and does not replace managed Appraise TestRun evidence for required runtime validations.',
      inputSchema: { planId: z.string(), run: implementationValidationRunInputSchema },
    },
    async ({ planId, run }) =>
      text(
        await api.request(`plans/${planId}/implementation/validations`, {
          method: 'POST',
          body: JSON.stringify({ run }),
        }),
      ),
  )
  server.registerTool(
    'implementation_validation_start',
    {
      description:
        'Create agent-owned, plan-bound implementation validation run records and return bound test_run inputs to execute through Appraise.',
      inputSchema: {
        planId: z.string(),
        validationIds: z.array(z.string().min(1)).optional(),
        commitHash: z.string().min(1).optional(),
      },
    },
    async ({ planId, validationIds, commitHash }) =>
      text(
        lifecycleToolPayload({
          planId,
          result: await api.request(`plans/${planId}/implementation/validations/start`, {
            method: 'POST',
            body: JSON.stringify({ validationIds, commitHash }),
          }),
          nextRecommendedAction:
            'Call test_run once for each returned testRunInputs item, then call implementation_validation_reconcile with the implementation run IDs.',
          nextRequiredAgentBehavior: 'run_bound_test_runs_then_reconcile',
          nextAllowedAction: { tool: 'test_run' },
        }),
      ),
  )
  server.registerTool(
    'implementation_validation_reconcile',
    {
      description:
        'Reconcile Appraise-owned validation runs and optionally verify implemented tasks atomically with an idempotency key.',
      inputSchema: {
        planId: z.string(),
        runIds: z.array(z.string().min(1)).optional(),
        verifyTaskIds: z.array(z.string().min(1)).optional(),
        idempotencyKey: z.string().min(1).optional(),
      },
    },
    async ({ planId, runIds, verifyTaskIds, idempotencyKey }) =>
      text(
        lifecycleToolPayload({
          planId,
          result: await api.request(`plans/${planId}/implementation/validations/reconcile`, {
            method: 'POST',
            body: JSON.stringify({ runIds, verifyTaskIds, idempotencyKey }),
          }),
          nextRecommendedAction:
            'If readiness is blocked, inspect test_run_diagnose for invalid evidence; otherwise continue toward implementation_completion_review.',
          nextRequiredAgentBehavior: 'inspect_validation_readiness_then_continue',
          nextAllowedAction: { tool: 'implementation_completion_review' },
        }),
      ),
  )
  server.registerTool(
    'implementation_feedback',
    {
      description: 'Analyze and, after user confirmation, apply blocking feedback impact.',
      inputSchema: {
        planId: z.string(),
        affectedTaskIds: z.array(z.string()).min(1),
        confirmed: z.boolean(),
        pausePlanWide: z.boolean().optional(),
      },
    },
    async ({ planId, ...body }) =>
      text(
        await api.request(`plans/${planId}/implementation/feedback`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      ),
  )
  server.registerTool(
    'implementation_control',
    {
      description: 'Pause, resume, or cancel implementation; cancellation separately controls active runs.',
      inputSchema: {
        planId: z.string(),
        action: z.enum(['pause', 'resume', 'cancel']),
        stopActiveRuns: z.boolean().optional(),
      },
    },
    async ({ planId, ...body }) =>
      text(
        await api.request(`plans/${planId}/implementation/control`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      ),
  )
  server.registerTool(
    'implementation_completion_review',
    {
      description: 'Read final task, commit, validation, evidence, failure, and remark review data.',
      inputSchema: { planId: z.string() },
    },
    async ({ planId }) => text(await api.request(`plans/${planId}/completion`)),
  )
  server.registerTool(
    'implementation_complete',
    {
      description: 'Explicit user/Appraise decision relay: complete a validation-passed plan after final approval.',
      inputSchema: {
        planId: z.string(),
        approvedBy: z.string(),
        contentHash: z.string(),
      },
    },
    async ({ planId, ...body }) =>
      text(
        await api.request(`plans/${planId}/implementation/complete`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      ),
  )
  server.registerTool(
    'action_categories_list',
    {
      description: 'List bounded action category summaries; known catalog hashes return unchanged.',
      inputSchema: { parentCategoryId: z.string().optional(), knownCatalogHash: z.string().optional() },
    },
    async input => text(await api.listActionCategories(input.parentCategoryId, input.knownCatalogHash)),
  )
  server.registerTool(
    'actions_list',
    {
      description: 'List deterministic bounded action summaries using exact filters.',
      inputSchema: {
        categoryId: z.string().optional(),
        capability: z.string().optional(),
        inputType: z.string().optional(),
        runtime: z.enum(['browser', 'api', 'node', 'database']).optional(),
        deprecated: z.boolean().optional(),
        idPrefix: z.string().optional(),
        cursor: z.number().int().nonnegative().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async input => text(await api.listActions(input)),
  )
  server.registerTool(
    'actions_read',
    {
      description: 'Read exact versioned action descriptors for selected references.',
      inputSchema: {
        actionRefs: z
          .array(z.object({ id: z.string(), version: z.string().optional() }))
          .min(1)
          .max(50),
      },
    },
    async ({ actionRefs }) => text(await api.readActions(actionRefs)),
  )
  server.registerTool(
    'coordinator_register',
    {
      description: 'Acquire or reconnect the single coordinator lease for a plan.',
      inputSchema: {
        planId: z.string(),
        reconnectConnectionId: z.string().optional(),
        takeoverApproved: z.boolean().optional(),
      },
    },
    async ({ planId, reconnectConnectionId, takeoverApproved }) =>
      text(
        await api.request('register', {
          method: 'POST',
          body: JSON.stringify({
            planId,
            coordinatorId: options.coordinatorId,
            reconnectConnectionId,
            takeoverApproved,
          }),
        }),
      ),
  )
  server.registerTool(
    'coordinator_heartbeat',
    {
      description: 'Renew an active coordinator lease.',
      inputSchema: { planId: z.string(), connectionId: z.string() },
    },
    async ({ planId, connectionId }) =>
      text(
        await api.request('heartbeat', {
          method: 'POST',
          body: JSON.stringify({ planId, coordinatorId: options.coordinatorId, connectionId }),
        }),
      ),
  )

  return server
}

export async function runAppraiseMcp(options: McpOptions): Promise<void> {
  const server = await createAppraiseMcpServer(options)
  await server.connect(new StdioServerTransport())
}

export type AppraiseHttpMcpOptions = McpOptions & {
  host: string
  port: number
  path: string
}

function jsonRpcError(res: http.ServerResponse, status: number, code: number, message: string): void {
  res.writeHead(status, {
    Allow: 'POST',
    'Content-Type': 'application/json',
  })
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }))
}

export async function runAppraiseHttpMcp(options: AppraiseHttpMcpOptions): Promise<void> {
  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? `${options.host}:${options.port}`}`)
    if (requestUrl.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, transport: 'streamable-http', path: options.path }))
      return
    }

    if (requestUrl.pathname !== options.path) {
      jsonRpcError(res, 404, -32000, 'Not found.')
      return
    }

    if (req.method !== 'POST') {
      jsonRpcError(res, 405, -32000, 'Method not allowed.')
      return
    }

    let mcpServer: McpServer | undefined
    let transport: StreamableHTTPServerTransport | undefined
    res.on('close', () => {
      void transport?.close().catch(() => undefined)
      void mcpServer?.close().catch(() => undefined)
    })

    try {
      mcpServer = await createAppraiseMcpServer(options)
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      })
      await mcpServer.connect(transport)
      await transport.handleRequest(req, res)
    } catch (error) {
      console.error(formatMcpBootstrapError(error))
      if (!res.headersSent) jsonRpcError(res, 500, -32603, 'Internal server error.')
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.host, () => {
      server.off('error', reject)
      resolve()
    })
  })

  const url = `http://${options.host}:${options.port}${options.path}`
  console.error(`AppraiseJS MCP HTTP server listening at ${url}`)

  await new Promise<void>(resolve => {
    const shutdown = () => {
      server.close(() => resolve())
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
  })
}
