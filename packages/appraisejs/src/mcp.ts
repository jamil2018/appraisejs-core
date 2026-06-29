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
const mcpSurfaceVersion = '2026-06-30.review-standby-loop'
const workflowCriticalTools = [
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
] as const
const workflowResourceUris = [
  'appraise://project',
  'appraise://target-projects',
  'appraise://agent-guide',
  'appraise://workflow/planning',
  'appraise://workflow/standby',
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

type CoordinatorToolEvent = { sequence: number; type: string }

const defaultReviewLoopTimeoutMs = 120_000

type RecommendedWait = {
  tool: 'plan_wait_for_approval' | 'plan_review_loop' | 'plan_wait_for_review'
  mode: 'long_poll'
  timeoutMs: number
  afterSequence: number
}

function linkFromSnapshot(links: unknown, key: 'appraise' | 'browser'): string | undefined {
  if (!links || typeof links !== 'object') return undefined
  const value = (links as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
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
  return {
    browserUrl,
    appraiseUrl,
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
        'Before entering or continuing standby, present the browser URL, appraise:// URL, goal, description, revision, lifecycle, content hash, currentAfterSequence, nextAfterSequence, and the recommended wait call.',
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
          text: JSON.stringify({
            standbyAfter: 'plan_review_ready',
            preferredTool: 'plan_review_loop',
            compatibilityTool: 'plan_wait_for_approval',
            pendingBehavior:
              'Use bounded long-poll standby when possible. On timeout, present and return browserUrl, appraiseUrl, goal, description, revision, lifecycle, contentHash, currentAfterSequence, nextAfterSequence, and recommendedWait for continuation.',
            cursorGuidance:
              'afterSequence is exclusive. Resume standby with nextAfterSequence exactly unless intentionally redelivering unacknowledged events through plan_events_read.',
            gateResults: {
              approved: 'Call plan_start, then acknowledge only after validation_preparation_started.',
              changes_requested: 'Call plan_review_read, revise against the expected hash, and return to standby.',
              cancelled: 'Acknowledge the cancellation event and stop.',
            },
          }),
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
            browserUrl: linkFromSnapshot(current.links, 'browser'),
            appraiseUrl: linkFromSnapshot(current.links, 'appraise') ?? `appraise://plans/${planId}`,
            goal: current.plan.goal,
            description: current.plan.description,
            revision: current.plan.revision,
            lifecycle: current.plan.lifecycle,
            contentHash: current.contentHash,
            links: current.links,
            events: result.events ?? [],
            currentAfterSequence: after,
            nextAfterSequence: reviewReadyAfterSequence,
            recommendedWait: {
              tool: 'plan_review_loop',
              mode: 'long_poll',
              timeoutMs: defaultReviewLoopTimeoutMs,
              afterSequence: reviewReadyAfterSequence,
            },
            requiredPresentation:
              'Present the browser URL, appraise:// URL, goal, description, revision, lifecycle, content hash, currentAfterSequence, nextAfterSequence, and recommended wait call before entering standby.',
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
              'Present the browser URL, appraise:// URL, goal, description, revision, lifecycle, content hash, currentAfterSequence, nextAfterSequence, and recommended wait call before entering standby.',
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
    async ({ planId, validation }) =>
      text(
        await api.request(`plans/${planId}/validations/publish`, {
          method: 'POST',
          body: JSON.stringify({ validation }),
        }),
      ),
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
