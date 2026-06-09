import { promises as fs } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import path from 'node:path'

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

type McpOptions = {
  cwd: string
  baseUrl: string
  coordinatorId: string
}

type ProjectIdentity = {
  projectFingerprint: string
  token: string
}

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

async function readIdentity(cwd: string): Promise<ProjectIdentity> {
  const identityPath = path.join(cwd, '.appraisejs', 'coordinator.json')
  try {
    return JSON.parse(await fs.readFile(identityPath, 'utf8')) as ProjectIdentity
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const packageJson = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf8')) as { name?: string }
  const canonical = `${await fs.realpath(cwd)}\0${packageJson.name ?? 'appraisejs'}`
  const identity = {
    projectFingerprint: `sha256:${createHash('sha256').update(canonical).digest('hex')}`,
    token: randomBytes(32).toString('base64url'),
  }
  await fs.mkdir(path.dirname(identityPath), { recursive: true, mode: 0o700 })
  await fs.writeFile(identityPath, `${JSON.stringify(identity, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  return identity
}

export async function createCoordinatorApiClient(options: McpOptions) {
  const identity = await readIdentity(options.cwd)
  const request = async (operation: string, init?: RequestInit) => {
    const response = await fetch(`${options.baseUrl.replace(/\/$/, '')}/api/internal/coordinator/${operation}`, {
      ...init,
      headers: {
        authorization: `Bearer ${identity.token}`,
        'content-type': 'application/json',
        'x-appraise-project': identity.projectFingerprint,
        ...init?.headers,
      },
    })
    const body = (await response.json()) as unknown
    if (!response.ok) {
      const message =
        typeof body === 'object' && body && 'error' in body
          ? String((body as { error: unknown }).error)
          : response.statusText
      throw new Error(message)
    }
    return body
  }
  return { identity, request }
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
    'plan_create',
    {
      description: 'Create a structured AppraiseJS plan and wait until its review surface is ready.',
      inputSchema: { plan: z.record(z.string(), z.unknown()) },
    },
    async ({ plan }) => text(await api.request('plans', { method: 'POST', body: JSON.stringify({ plan }) })),
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
    async ({ planId, afterSequence }) =>
      text(await api.request(`plans/${planId}/events?after=${afterSequence}&wait=true`)),
  )
  server.registerTool(
    'plan_revise',
    {
      description: 'Submit a higher plan revision using an exact expected content hash.',
      inputSchema: {
        planId: z.string(),
        expectedHash: z.string(),
        plan: z.record(z.string(), z.unknown()),
      },
    },
    async ({ planId, expectedHash, plan }) =>
      text(
        await api.request(`plans/${planId}`, {
          method: 'PUT',
          body: JSON.stringify({ expectedHash, plan }),
        }),
      ),
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
