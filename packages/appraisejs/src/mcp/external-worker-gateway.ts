import { createHash } from 'node:crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { registerAppraiseOperations, type McpRegistryContext } from './registry.js'

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const roles = z.enum([
  'REQUIREMENT_ANALYZER',
  'SCOUT',
  'RESOURCE_EXPLORER',
  'TEST_SCENARIO_DESIGNER',
  'AUTOMATOR',
  'TRIAGER',
])
export type ExternalWorkerRole = z.infer<typeof roles>

/** Separate from the retained managed/Factory profile. No claim, admission or outcome tools. */
export const externalWorkerTools = Object.freeze({
  REQUIREMENT_ANALYZER: ['quality_journey_analysis_get', 'quality_journey_external_analyzer_analysis_submit_v1'],
  SCOUT: ['quality_journey_discovery_get', 'quality_journey_external_scout_target_observation_submit_v1'],
  RESOURCE_EXPLORER: [
    'quality_journey_discovery_get',
    'operation_search',
    'quality_journey_external_resource_explorer_resolution_submit_v1',
  ],
  TEST_SCENARIO_DESIGNER: ['quality_journey_scenarios_get', 'quality_journey_external_scenarios_submit_v1'],
  AUTOMATOR: ['operation_search', 'quality_journey_external_automator_materialize_v1'],
  TRIAGER: [
    'quality_journey_triage_get',
    'quality_journey_triage_evidence_read',
    'quality_journey_external_triage_submit_v1',
  ],
} as const satisfies Record<ExternalWorkerRole, readonly string[]>)
for (const names of Object.values(externalWorkerTools)) Object.freeze(names)

const bindingSchema = z
  .object({
    hubId: id,
    target: z.string().min(1).max(2000),
    targetProjectId: id,
    journeyId: id,
    role: roles,
    workItemId: id,
    attemptId: id,
    assignmentId: id,
    assignmentGeneration: z.number().int().positive(),
    leaseId: id,
    authorizationId: id,
    coordinatorSessionId: id.optional(),
    coordinatorHandoffId: id.optional(),
    coordinatorGeneration: z.number().int().positive(),
    transportGeneration: z.number().int().positive(),
    expectedInputHash: digest,
    expectedScopeHash: digest,
    assignmentSecret: z.string().min(32).max(2000),
    expiresAt: z.string().datetime(),
  })
  .strict()
  .refine(binding => Boolean(binding.coordinatorSessionId || binding.coordinatorHandoffId), {
    message: 'A trusted coordinator session or legacy handoff binding is required.',
  })
export type ExternalWorkerBinding = z.infer<typeof bindingSchema>

const hiddenFields = [
  'target',
  'journeyId',
  'workItemId',
  'attemptId',
  'assignmentId',
  'assignmentGeneration',
  'assignmentSecret',
  'leaseId',
  'expectedInputHash',
  'expectedScopeHash',
  'coordinatorSessionId',
  'coordinatorHandoffId',
  'coordinatorGeneration',
  'ownerToken',
] as const
const forbiddenKeys = new Set([
  ...hiddenFields,
  'actor',
  'principal',
  'principalId',
  'coordinatorPrincipalId',
  'trustedHumanDecision',
  'projectBearer',
  'bearer',
  'credentials',
  'authorizationId',
  'hubId',
  'transportGeneration',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  '__proto__',
  'constructor',
  'prototype',
])

export type FrozenWorkerRead = {
  toolName: string
  arguments: Record<string, unknown>
  allowedArtifactIds: readonly string[]
  /** Broad source records are filtered by exact assignment and projected through fixed schemas. */
  source: readonly {
    hubId: string
    targetProjectId: string
    journeyId: string
    workItemId: string
    attemptId: string
    inputHash: string
    scopeHash: string
    artifactId: string
    revisionId?: string
    data: Record<string, unknown>
  }[]
  inputHash: string
  scopeHash: string
}
const acceptanceSchema = z
  .object({
    receiptId: id,
    assignmentId: id,
    attemptId: id,
    operation: z.string().min(1),
    idempotencyKey: id,
    requestHash: digest,
    artifactIds: z.array(id).min(1).max(1536),
  })
  .strict()
export type ExternalWorkerAcceptance = z.infer<typeof acceptanceSchema>

type CapturedTool = {
  shape: z.ZodRawShape
  handler: (input: Record<string, unknown>) => Promise<unknown>
  description?: string
}
export class ExternalWorkerCallError extends Error {
  constructor(
    readonly receipt: {
      operation: string
      requestHash: string
      effectOutcome: 'none' | 'occurred' | 'unknown'
      canonicalAccepted: boolean
    },
  ) {
    super('External worker call blocked; trusted reconciliation may be required.')
    this.name = 'ExternalWorkerCallError'
  }
}

/** In-process only: does not create credentials, a transport, a session or a provider turn. */
export function createExternalWorkerGateway(options: {
  context: Omit<McpRegistryContext, 'server'>
  binding: ExternalWorkerBinding
  frozenReads: readonly FrozenWorkerRead[]
  /** Must re-read current session, assignment, lease, authorization and frozen revisions. */
  authorize: (binding: Readonly<ExternalWorkerBinding>, stage: 'before_io' | 'after_io') => Promise<void>
  /** Trusted durable-acceptance lookup; a successful handler/turn alone is insufficient. */
  readAcceptance: (input: {
    binding: Readonly<ExternalWorkerBinding>
    toolName: string
    idempotencyKey: string
    requestHash: string
  }) => Promise<ExternalWorkerAcceptance | null>
  clock?: () => Date
}) {
  const binding = Object.freeze(bindingSchema.parse(options.binding))
  const authorize = options.authorize
  const readAcceptance = options.readAcceptance
  const clock = options.clock ?? (() => new Date())
  const captured = new Map<string, CapturedTool>()
  // Capture the canonical Zod validators and handlers without creating a public MCP transport.
  const definitions = registerAppraiseOperations({
    ...options.context,
    server: {
      registerTool(
        name: string,
        config: { inputSchema?: z.ZodRawShape; description?: string },
        handler: CapturedTool['handler'],
      ) {
        captured.set(name, { shape: config.inputSchema ?? {}, handler, description: config.description })
      },
      registerResource() {},
    } as unknown as McpServer,
  })
  const names = [...externalWorkerTools[binding.role]]
  const tools = names.map(name => {
    const canonical = captured.get(name)
    if (!canonical) throw new Error('External worker canonical tool missing.')
    // Only top-level trusted ingress fields are removed. Nested artifact identity/refinements survive.
    const shape = Object.fromEntries(
      Object.entries(canonical.shape).filter(([key]) => !hiddenFields.includes(key as (typeof hiddenFields)[number])),
    )
    return {
      name,
      canonical,
      workerSchema: z.object(shape).strict(),
      canonicalSchema: z.object(canonical.shape).strict(),
    }
  })
  const frozenReads = new Map<string, unknown>()
  for (const read of options.frozenReads) {
    const tool = tools.find(candidate => candidate.name === read.toolName && !isSubmission(candidate.name))
    if (!tool || read.inputHash !== binding.expectedInputHash || read.scopeHash !== binding.expectedScopeHash)
      throw new Error('Frozen read is outside the external assignment.')
    const args = tool.workerSchema.parse(read.arguments)
    const key = hash({ name: tool.name, args })
    if (frozenReads.has(key)) throw new Error('Duplicate frozen read.')
    if (!read.allowedArtifactIds.length || new Set(read.allowedArtifactIds).size !== read.allowedArtifactIds.length)
      throw new Error('Frozen artifact allowlist missing or duplicated.')
    const scope = ['hubId', 'targetProjectId', 'journeyId', 'workItemId', 'attemptId'] as const
    const records = read.source.filter(
      record =>
        scope.every(field => record[field] === binding[field]) &&
        record.inputHash === binding.expectedInputHash &&
        record.scopeHash === binding.expectedScopeHash &&
        read.allowedArtifactIds.includes(record.artifactId),
    )
    if (
      records.length !== read.allowedArtifactIds.length ||
      new Set(records.map(record => record.artifactId)).size !== records.length
    )
      throw new Error('Frozen artifact scope incomplete or ambiguous.')
    const dataSchema = frozenDataSchema(read.toolName, captured)
    const artifacts = records.map(record => {
      const data: Record<string, unknown> = dataSchema.parse(record.data)
      assertSafeProjection(data, binding.assignmentSecret)
      if (
        read.toolName === 'quality_journey_triage_evidence_read' &&
        (record.artifactId !== args.receiptId ||
          data.receiptId !== args.receiptId ||
          data.artifactKind !== args.artifactKind ||
          data.offset !== (args.offset ?? 0) ||
          data.limit !== (args.limit ?? 65536))
      )
        throw new Error('Evidence page outside frozen receipt.')
      return {
        artifactId: id.parse(record.artifactId),
        ...(record.revisionId ? { revisionId: id.parse(record.revisionId) } : {}),
        contentHash: hash(data),
        data,
      }
    })
    frozenReads.set(key, structuredClone({ artifacts }))
  }
  for (const tool of tools.filter(tool => !isSubmission(tool.name))) {
    if (!options.frozenReads.some(read => read.toolName === tool.name)) throw new Error('Required frozen read missing.')
  }
  const manifest = tools.map(tool => ({
    name: tool.name,
    inputSchema: z.toJSONSchema(tool.workerSchema),
    canonicalSchemaHash: hash(
      definitions.find(definition => definition.kind === 'tool' && definition.name === tool.name)?.inputSchema,
    ),
    workerSchemaHash: hash(z.toJSONSchema(tool.workerSchema)),
  }))
  const profileDigest = hash({ role: binding.role, tools: manifest, resources: [] })

  function checkExpiry() {
    if (Date.parse(binding.expiresAt) <= clock().getTime()) throw new Error('External worker binding expired.')
  }
  async function call(toolName: string, input: unknown) {
    let effectOutcome: 'none' | 'occurred' | 'unknown' = 'none'
    let canonicalAccepted = false
    let requestHash = `sha256:${'0'.repeat(64)}`
    try {
      checkExpiry()
      const tool = tools.find(candidate => candidate.name === toolName)
      if (!tool) throw new Error('Tool outside role.')
      const args = tool.workerSchema.parse(JSON.parse(stableJson(input)))
      assertWorkerPayload(args, binding)
      requestHash = hash({ toolName, arguments: args, profileDigest, binding: publicBinding(binding) })
      await authorize(binding, 'before_io')
      checkExpiry()
      let result: unknown
      if (!isSubmission(tool.name)) {
        const key = hash({ name: tool.name, args })
        if (!frozenReads.has(key)) throw new Error('Read outside frozen projection.')
        result = structuredClone(frozenReads.get(key))
      } else {
        const trusted = { ...args }
        for (const key of hiddenFields) {
          if (key in tool.canonical.shape) trusted[key] = key === 'ownerToken' ? binding.assignmentSecret : binding[key]
        }
        const canonicalInput = tool.canonicalSchema.parse(trusted)
        effectOutcome = 'unknown'
        // Services retain transaction-local authority and canonical validation. No retry here.
        await tool.canonical.handler(canonicalInput)
        const accepted = acceptanceSchema.parse(
          await readAcceptance({
            binding,
            toolName,
            idempotencyKey: String(args.idempotencyKey),
            requestHash,
          }),
        )
        if (
          accepted.assignmentId !== binding.assignmentId ||
          accepted.attemptId !== binding.attemptId ||
          accepted.operation !== toolName ||
          accepted.idempotencyKey !== args.idempotencyKey ||
          accepted.requestHash !== requestHash
        )
          throw new Error('Acceptance identity mismatch.')
        canonicalAccepted = true
        effectOutcome = 'occurred'
        result = accepted
      }
      checkExpiry()
      await authorize(binding, 'after_io')
      checkExpiry()
      return structuredClone(result)
    } catch {
      throw new ExternalWorkerCallError({
        operation: tools.some(tool => tool.name === toolName) ? toolName : 'unregistered',
        requestHash,
        effectOutcome,
        canonicalAccepted,
      })
    }
  }
  return Object.freeze({
    get profile() {
      return { role: binding.role, tools: structuredClone(manifest), resources: [] as never[], profileDigest }
    },
    call,
    register(server: McpServer) {
      for (const tool of tools)
        server.registerTool(
          tool.name,
          {
            description: `Assignment-frozen external worker operation: ${tool.name}`,
            inputSchema: tool.workerSchema,
          },
          async input => ({ content: [{ type: 'text' as const, text: JSON.stringify(await call(tool.name, input)) }] }),
        )
    },
  })
}

function isSubmission(name: string) {
  return name.startsWith('quality_journey_external_')
}
function publicBinding(binding: ExternalWorkerBinding) {
  return Object.fromEntries(Object.entries(binding).filter(([key]) => key !== 'assignmentSecret'))
}
function hash(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`
}
function stableJson(value: unknown, depth = 0): string {
  if (depth > 64 || (typeof value === 'number' && !Number.isFinite(value)))
    throw new Error('Invalid JSON worker value.')
  if (Array.isArray(value)) return `[${value.map(child => stableJson(child, depth + 1)).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child, depth + 1)}`)
      .join(',')}}`
  const result = JSON.stringify(value)
  if (result === undefined) throw new Error('Non-JSON worker value.')
  return result
}
function frozenDataSchema(name: string, tools: Map<string, CapturedTool>) {
  const payload = (tool: string, key: string) => {
    const schema = tools.get(tool)?.shape[key]
    if (!schema) throw new Error('Canonical frozen payload schema missing.')
    return z.optional(schema)
  }
  const text = z.string().max(65536)
  const resources = z
    .array(z.object({ resourceId: id, version: id, contentHash: digest, label: text }).strict())
    .max(512)
  const summary = { summary: text }
  switch (name) {
    case 'quality_journey_analysis_get':
      return z.object({
        ...summary,
        charter: payload('quality_journey_external_analyzer_analysis_submit_v1', 'charter'),
        answers: z
          .array(z.object({ questionId: id, answer: text }).strict())
          .max(256)
          .optional(),
        feedback: z.array(text).max(256).optional(),
      })
    case 'quality_journey_discovery_get':
      return z.object({
        ...summary,
        charter: payload('quality_journey_external_analyzer_analysis_submit_v1', 'charter'),
        observations: payload('quality_journey_external_scout_target_observation_submit_v1', 'bundle'),
        resolution: payload('quality_journey_external_resource_explorer_resolution_submit_v1', 'bundle'),
        resources: resources.optional(),
      })
    case 'quality_journey_scenarios_get':
      return z.object({ ...summary, portfolio: payload('quality_journey_external_scenarios_submit_v1', 'portfolio') })
    case 'operation_search':
      return z.object({ ...summary, resources })
    case 'quality_journey_triage_get':
      return z.object({ ...summary, report: payload('quality_journey_external_triage_submit_v1', 'report') })
    case 'quality_journey_triage_evidence_read':
      return z.object({
        ...summary,
        receiptId: id,
        artifactKind: z.enum(['report', 'log']),
        offset: z.number().int().nonnegative(),
        limit: z.number().int().min(1).max(65536),
        text,
      })
    default:
      throw new Error('Unknown frozen read projection.')
  }
}
function assertSafeProjection(value: unknown, secret: string): void {
  if (typeof value === 'string' && value.includes(secret)) throw new Error('Secret in frozen projection.')
  if (Array.isArray(value)) {
    value.forEach(child => assertSafeProjection(child, secret))
    return
  }
  if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      if (
        [
          'assignmentSecret',
          'ownerToken',
          'projectBearer',
          'credentials',
          'password',
          'token',
          'accessToken',
          'refreshToken',
          'apiKey',
        ].includes(key)
      )
        throw new Error('Secret in frozen projection.')
      assertSafeProjection(child, secret)
    }
  stableJson(value)
}
function assertWorkerPayload(args: Record<string, unknown>, binding: ExternalWorkerBinding) {
  const scan = (value: unknown, path: string[]) => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => scan(child, [...path, String(index)]))
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      // Identity assertions in these canonical artifacts are proposals, never injected authority.
      const artifactIdentity =
        (path[0] === 'result' && path.length === 1 && ['assignmentId', 'workItemId', 'attemptId'].includes(key)) ||
        (path[0] === 'portfolio' && path.length === 1 && ['journeyId', 'targetProjectId'].includes(key)) ||
        (path[0] === 'bundle' && path.length === 1 && key === 'authorizationId')
      if (artifactIdentity) {
        if (child !== binding[key as keyof ExternalWorkerBinding]) throw new Error('Artifact scope mismatch.')
      } else if (forbiddenKeys.has(key) || key === 'targetProjectId') throw new Error('Caller authority override.')
      scan(child, [...path, key])
    }
  }
  scan(args, [])
  const result = args.result as Record<string, unknown> | undefined
  const bundle = args.bundle as Record<string, unknown> | undefined
  if (
    bundle &&
    (bundle.inputHash !== binding.expectedInputHash || bundle.assignmentScopeHash !== binding.expectedScopeHash)
  )
    throw new Error('Bundle binding mismatch.')
  if (result && (result.role !== binding.role || result.inputHash !== binding.expectedInputHash))
    throw new Error('Worker result binding mismatch.')
}
