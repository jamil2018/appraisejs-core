import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import {
  CoordinatorRequestError,
  createCoordinatorClient,
  type CoordinatorOptions as McpOptions,
} from './coordinator-client.js'
import { diagnoseProject } from './diagnostics.js'
import { planArtifactSchema } from './plan-file.js'

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

function toolError(error: unknown) {
  if (error instanceof CoordinatorRequestError) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            code: error.code ?? 'coordinator-request-failed',
            message: error.message,
            ...(error.path ? { path: error.path } : {}),
            ...(error.recovery ? { recovery: error.recovery } : {}),
          }),
        },
      ],
    }
  }
  throw error
}

export async function createCoordinatorApiClient(options: McpOptions) {
  return createCoordinatorClient(options)
}

export async function createAppraiseMcpServer(options: McpOptions): Promise<McpServer> {
  const api = await createCoordinatorApiClient(options)
  const server = new McpServer({ name: 'appraisejs', version: '0.5.0' })

  server.registerResource(
    'project',
    'appraise://project',
    { title: 'AppraiseJS project identity', mimeType: 'application/json' },
    async uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({ projectFingerprint: api.identity.projectFingerprint }),
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
    async () => text(await diagnoseProject(options)),
  )
  server.registerTool(
    'plan_create',
    {
      description: 'Create a structured AppraiseJS plan and wait until its review surface is ready.',
      inputSchema: { plan: planArtifactSchema },
    },
    async ({ plan }) => {
      try {
        return text(await api.request('plans', { method: 'POST', body: JSON.stringify({ plan }) }))
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
      if (!reviewReady) return text(result)
      const current = (await api.request(`plans/${planId}`)) as {
        plan: { revision: number; lifecycle: string }
        contentHash: string
        links: unknown
      }
      return text({
        planId,
        revision: current.plan.revision,
        lifecycle: current.plan.lifecycle,
        contentHash: current.contentHash,
        links: current.links,
        eventSequence: reviewReady.sequence,
        events: result.events,
      })
    },
  )
  server.registerTool(
    'plan_revise',
    {
      description: 'Submit a higher plan revision using an exact expected content hash.',
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
