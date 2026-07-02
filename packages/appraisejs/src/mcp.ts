import http from 'node:http'
import { createRequire } from 'node:module'

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

import {
  CoordinatorRequestError,
  createCoordinatorClient,
  coordinatorRequestErrorEnvelope,
  type CoordinatorOptions as McpOptions,
} from './coordinator-client.js'
import { diagnoseProject, formatMcpBootstrapError } from './diagnostics.js'
import { planArtifactSchema, planCreateInputSchema } from './plan-file.js'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json') as { version?: string }
const serverStartedAt = new Date().toISOString()
const mcpSurfaceVersion = '2026-07-02.lifecycle-hardening'
const truthyFeatureValues = new Set(['1', 'true', 'yes', 'on'])

function providerNativeRunsEnabled() {
  return truthyFeatureValues.has((process.env.APPRAISE_EXPERIMENTAL_PROVIDER_RUNS ?? '').trim().toLowerCase())
}

const baseWorkflowCriticalTools = [
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
  'validation_publish',
  'validation_review_loop',
  'validation_decide',
  'validation_file_approve',
  'validation_feedback_submit',
  'validation_review_submit',
  'baseline_start',
  'baseline_reconcile',
  'baseline_cancel',
  'baseline_failure_acknowledge',
  'baseline_regression_justify',
  'baseline_accept',
  'implementation_start',
  'implementation_checkpoint',
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
  'appraise://workflow/standby',
] as const
const providerNativeWorkflowResourceUris = ['appraise://providers', 'appraise://provider-runs'] as const
const workflowResourceUris = [
  ...baseWorkflowResourceUris,
  ...(providerNativeRunsEnabled() ? providerNativeWorkflowResourceUris : []),
] as const

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

function withGuidance(
  value: unknown,
  guidance: { nextRecommendedAction?: string; nextRequiredAgentBehavior?: string },
) {
  const payload = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  return { ...payload, ...guidance }
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

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some(pattern => pattern.test(value))
}

function createStructuredTasksFromBrief(projectBrief: string): BriefPlanTask[] | undefined {
  const brief = projectBrief.toLowerCase()
  const isAppBrief = includesAny(brief, [
    /\bapp(?:lication)?\b/,
    /\bfrontend\b/,
    /\bweb\b/,
    /\bui\b/,
    /\btodo(?:s)?\b/,
    /\btask(?:s)?\b/,
  ])
  const signals = [
    includesAny(brief, [/\breact\b/, /\bvite\b/, /\btailwind\b/, /\bshadcn\b/, /\btanstack\b/]),
    includesAny(brief, [/\btodo(?:s)?\b/, /\btask(?:s)?\b/, /\bchecklist\b/]),
    includesAny(brief, [/\bcrud\b/, /\bcreate\b/, /\badd\b/, /\bedit\b/, /\bupdate\b/, /\bdelete\b/, /\bremove\b/]),
    includesAny(brief, [/\bcomplete\b/, /\bcompleted\b/, /\bdone\b/, /\btoggle\b/]),
    includesAny(brief, [
      /\bpersist(?:ence|ed|ing)?\b/,
      /\bstorage\b/,
      /\blocalstorage\b/,
      /\bdatabase\b/,
      /\bsqlite\b/,
    ]),
    includesAny(brief, [/\btest(?:s|ing)?\b/, /\bvalidation\b/, /\be2e\b/, /\bplaywright\b/, /\bvitest\b/]),
  ].filter(Boolean).length

  if (!isAppBrief || signals < 3) return undefined

  const stack = [
    includesAny(brief, [/\breact\b/]) ? 'React' : undefined,
    includesAny(brief, [/\bvite\b/]) ? 'Vite' : undefined,
    includesAny(brief, [/\btailwind\b/]) ? 'Tailwind' : undefined,
    includesAny(brief, [/\bshadcn\b/]) ? 'shadcn/ui' : undefined,
    includesAny(brief, [/\btanstack\b/]) ? 'TanStack' : undefined,
  ]
    .filter(Boolean)
    .join(', ')
  const stackSummary = stack || 'the requested frontend stack'
  const taskNoun = includesAny(brief, [/\btodo(?:s)?\b/]) ? 'todo' : 'task'

  return [
    {
      id: 'scaffold-setup',
      title: 'Scaffold and configure the app shell',
      description: `Create the ${stackSummary} application foundation, install required UI/data dependencies, and wire the base layout, routing, and styling entry points requested by the brief.`,
      acceptanceCriteria: [
        'The app starts locally with the requested stack and no missing dependency errors.',
        'Base styling, component primitives, and project structure are in place for the planned UI.',
      ],
      validationIntent: 'Run install/build or the closest available scaffold validation for the generated app shell.',
    },
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
  ]
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
  const structuredTasks = createStructuredTasksFromBrief(input.projectBrief)
  return {
    version: '1',
    revision: 1,
    lifecycle: 'draft',
    goal: title || 'AppraiseJS planning session',
    description: context,
    tasks: structuredTasks ?? [
      {
        id: 'plan-from-brief',
        title: 'Plan from brief',
        description: input.projectBrief,
        acceptanceCriteria: ['The Appraise review surface shows the proposed plan for human review.'],
        validationIntent: 'Wait for AppraiseJS plan review readiness before any implementation starts.',
      },
    ],
    edges: structuredTasks
      ? [
          { from: 'scaffold-setup', to: 'task-model-ui', type: 'blocks' as const },
          { from: 'task-model-ui', to: 'crud-completion', type: 'blocks' as const },
          { from: 'crud-completion', to: 'persistence', type: 'blocks' as const },
          { from: 'persistence', to: 'validation', type: 'blocks' as const },
        ]
      : [],
    implementationGroups: structuredTasks
      ? [
          { id: 'foundation', taskIds: ['scaffold-setup', 'task-model-ui'] },
          { id: 'behavior', taskIds: ['crud-completion', 'persistence'] },
          { id: 'quality', taskIds: ['validation'] },
        ]
      : [],
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

function validationGateStatus(lifecycle: string): 'approved' | 'changes_requested' | 'cancelled' | undefined {
  if (lifecycle === 'validations_approved') return 'approved'
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
  contentHash: string
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
    `Content hash: ${input.contentHash}`,
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
    contentHash: input.current.contentHash,
    currentAfterSequence: input.currentAfterSequence,
    nextAfterSequence: input.nextAfterSequence,
    recommendedWait: input.recommendedWait,
  })
  return {
    browserUrl,
    appraiseUrl,
    handoffMarkdown,
    requiredUserFacingMessage: handoffMarkdown,
    goal: input.current.plan.goal,
    description: input.current.plan.description,
    revision: input.current.plan.revision,
    lifecycle: input.current.plan.lifecycle,
    contentHash: input.current.contentHash,
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
        'contentHash',
        'currentAfterSequence',
        'nextAfterSequence',
        'recommendedWait',
      ],
      instruction:
        'No wait call before complete URL handoff. Before entering or continuing standby, present the complete direct browser URL, appraise:// URL, plan ID, goal, description, revision, lifecycle, content hash, currentAfterSequence, nextAfterSequence, and the recommended wait call.',
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
    'workflow-planning',
    'appraise://workflow/planning',
    { title: 'AppraiseJS planning workflow', mimeType: 'application/json' },
    async uri => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(planningWorkflow) }],
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
        const created = (
          target
            ? await api.createPlanForTarget(createPlanFromBrief(input), target)
            : await api.createPlan(createPlanFromBrief(input))
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
          diagnostic,
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
    'test_run',
    {
      description:
        'Run existing Appraise-compatible Cucumber/Playwright artifacts from an attached target repository and record a standalone Appraise test run.',
      inputSchema: {
        target: z.string().min(1),
        environmentId: z.string().min(1),
        name: z.string().min(1).optional(),
        tagExpression: z.string().optional(),
        testWorkersCount: z.number().int().positive().optional(),
        browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']).optional(),
      },
    },
    async input => {
      try {
        return text(await api.runTargetTests(input))
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
      let gateEvent = events.find(event => approvalGateEventStatus(event.type))
      let lifecycleStatus = approvalGateStatus(current.plan.lifecycle)
      let reviewReady =
        events.some(event => event.type === 'plan_review_ready') ||
        ['awaiting_plan_review', 'plan_approved', 'changes_requested', 'cancelled'].includes(current.plan.lifecycle)

      if (!reviewReady && !gateEvent && !lifecycleStatus) {
        const waited = await waitForEvents(api.request, planId, afterSequence, timeoutMs)
        events = [...events, ...(waited.events ?? [])]
        current = await readSnapshot(planId)
        gateEvent = events.find(event => approvalGateEventStatus(event.type))
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
        gateEvent = events.find(event => approvalGateEventStatus(event.type))
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
      let gateEvent = events.find(event => approvalGateEventStatus(event.type))
      let current = await readSnapshot(planId)
      let lifecycleStatus = approvalGateStatus(current.plan.lifecycle)

      if (!gateEvent && !lifecycleStatus) {
        if (mode === 'long_poll' || timeoutMs) {
          const waitAfterSequence = nextApprovalWaitSequence(afterSequence, events)
          const waited = await waitForEvents(api.request, planId, waitAfterSequence, timeoutMs)
          events = [...events, ...(waited.events ?? [])]
          gateEvent = events.find(event => approvalGateEventStatus(event.type))
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
    'validation_publish',
    {
      description: 'Publish generated validation nodes and changed-file evidence for user review.',
      inputSchema: { planId: z.string(), validation: z.record(z.string(), z.unknown()) },
    },
    async ({ planId, validation }) => {
      const published = (await api.request(`plans/${planId}/validations/publish`, {
        method: 'POST',
        body: JSON.stringify({ validation }),
      })) as {
        validationReviewLinks?: { browser?: string; appraise?: string; route?: string }
        lifecycle?: string
        revision?: number
        validationArtifactPath?: string
        validationCount?: number
        changedFileCount?: number
        manifestPaths?: string[]
        reusedStepPaths?: string[]
        newStepPaths?: string[]
      }
      return text({
        ...published,
        browserUrl: published.validationReviewLinks?.browser,
        appraiseUrl: published.validationReviewLinks?.appraise ?? `appraise://plans/${planId}`,
        requiredUserFacingMessage: [
          `Direct validation review URL: ${published.validationReviewLinks?.browser ?? published.validationReviewLinks?.route ?? `/plans/${planId}?review=validation`}`,
          `Appraise URL: ${published.validationReviewLinks?.appraise ?? `appraise://plans/${planId}`}`,
          `Plan ID: ${planId}`,
          `Lifecycle: ${published.lifecycle ?? 'awaiting_validation_review'}`,
          `Revision: ${published.revision ?? '(not returned)'}`,
          `Validation artifact path: ${published.validationArtifactPath ?? `appraise/plans/validations/${planId}.validation.yaml`}`,
          `Validation count: ${published.validationCount ?? 0}`,
          `Changed-file count: ${published.changedFileCount ?? 0}`,
          `Manifest paths: ${(published.manifestPaths ?? []).join(', ')}`,
          `Reused registry/template step paths: ${(published.reusedStepPaths ?? []).join(', ')}`,
          `New custom step paths: ${(published.newStepPaths ?? []).join(', ') || '(none)'}`,
          'Next review action: open the validation review URL and wait for Appraise validation approval or changes.',
        ].join('\n'),
        handoffMarkdown: [
          'Validation artifacts are published and validation_review_ready has been emitted.',
          `Review: ${published.validationReviewLinks?.browser ?? published.validationReviewLinks?.route ?? `/plans/${planId}?review=validation`}`,
          `Artifact: ${published.validationArtifactPath ?? `appraise/plans/validations/${planId}.validation.yaml`}`,
        ].join('\n'),
        nextRequiredAgentBehavior: 'standby_for_validation_review',
      })
    },
  )
  server.registerTool(
    'validation_decide',
    {
      description: 'Record a hash-bound decision for one validation node.',
      inputSchema: {
        planId: z.string(),
        validationId: z.string(),
        decision: z.enum(['approved', 'rejected', 'deferred']),
        decidedBy: z.string(),
      },
    },
    async ({ planId, validationId, ...body }) =>
      text(
        await api.request(`plans/${planId}/validations/nodes/${validationId}`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      ),
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
      let gateEvent = events.find(event => validationGateEventStatus(event.type))
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
        gateEvent = events.find(event => validationGateEventStatus(event.type))
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
      description: 'Start required baseline executions after validation review approval.',
      inputSchema: { planId: z.string() },
    },
    async ({ planId }) =>
      text(
        lifecycleToolPayload({
          planId,
          result: await api.request(`plans/${planId}/baseline/start`, { method: 'POST', body: '{}' }),
          nextRecommendedAction: 'Call baseline_reconcile until baseline evidence enters review.',
          nextRequiredAgentBehavior: 'reconcile_baseline',
          nextAllowedAction: { tool: 'baseline_reconcile' },
        }),
      ),
  )
  server.registerTool(
    'baseline_reconcile',
    {
      description: 'Refresh baseline execution evidence and detect when baseline review is ready.',
      inputSchema: { planId: z.string() },
    },
    async ({ planId }) => {
      const result = await api.request(`plans/${planId}/baseline/reconcile`, { method: 'POST', body: '{}' })
      const lifecycle =
        result && typeof result === 'object' && 'plan' in result
          ? (result as { plan?: { lifecycle?: string } }).plan?.lifecycle
          : undefined
      return text(
        lifecycleToolPayload({
          planId,
          result,
          nextRecommendedAction:
            lifecycle === 'baseline_review'
              ? 'Review baseline evidence, acknowledge or justify allowed results, then call baseline_accept.'
              : 'Continue calling baseline_reconcile until baseline review is ready, or cancel if the run should stop.',
          nextRequiredAgentBehavior:
            lifecycle === 'baseline_review' ? 'review_and_accept_baseline' : 'reconcile_baseline',
          nextAllowedAction:
            lifecycle === 'baseline_review' ? { tool: 'baseline_accept' } : { tool: 'baseline_reconcile' },
        }),
      )
    },
  )
  server.registerTool(
    'baseline_cancel',
    {
      description: 'Cancel active baseline executions and return the plan to baseline changes requested.',
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
    'baseline_failure_acknowledge',
    {
      description: 'Acknowledge a current unrelated baseline failure by attempt id.',
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
      description: 'Justify an accepted regression-pass baseline attempt before baseline acceptance.',
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
      description: 'Accept complete baseline evidence and unlock the implementation_start gate.',
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
      description: 'Approve one flagged changed file for its exact current content hash.',
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
      description: 'Submit the revision-level validation review after all required decisions are current.',
      inputSchema: { planId: z.string() },
    },
    async ({ planId }) => text(await api.request(`plans/${planId}/validations/submit`, { method: 'POST', body: '{}' })),
  )
  server.registerTool(
    'plan_events_read',
    {
      description: 'Read unacknowledged plan events without acknowledging them.',
      inputSchema: { planId: z.string(), afterSequence: z.number().int().nonnegative().default(0) },
    },
    async ({ planId, afterSequence }) => text(await api.request(`plans/${planId}/events?after=${afterSequence}`)),
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
    'implementation_start',
    {
      description: 'Start implementation after accepted baseline evidence.',
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
      description: 'Complete a validation-passed plan only after explicit final user approval.',
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
