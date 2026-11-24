import path from 'node:path'
import type { Readable, Writable } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'

import type { WorkspaceRecord, WorkspaceRecordKind } from '@/lib/conversation/workspace-records'
import { workspaceRecordKinds } from '@/lib/conversation/workspace-records'
import type { WorkspaceRequest } from '@/lib/conversation/workspace-request'

const TOOL = 'workspace_record_search'
const MODEL = 'gpt-6.1-sol'
const FRAME_LIMIT = 64 * 1024
const TOTAL_LIMIT = 1024 * 1024
const FRAME_COUNT_LIMIT = 128
const TURN_TIMEOUT_MS = 45_000
const STOP_TIMEOUT_MS = 3_000

export type CodexReadLaunch = Readonly<{
  accessToken: string
  args: readonly string[]
  environment: Readonly<Record<string, string>>
}>

export type CodexReadTransport = Readonly<{
  stdin: Writable
  stdout: Readable
  isolatedCwd: string
  isolatedHome: string
  isolationVerified: true
  stop(): Promise<void>
}>

export type OpenCodexReadTransport = (launch: CodexReadLaunch, signal: AbortSignal) => Promise<CodexReadTransport>

export type CodexReadResult = Readonly<{
  records: readonly WorkspaceRecord[]
  threadId: string
  turnId: string
}>

export class CodexReadAttemptError extends Error {
  constructor(
    message: string,
    readonly outcome: 'NOT_STARTED' | 'UNKNOWN',
    readonly threadId?: string,
    readonly turnId?: string,
  ) {
    super(message)
    this.name = 'CodexReadAttemptError'
  }
}

const providerArgs = Object.freeze([
  'app-server',
  '--listen',
  'stdio://',
  '-c',
  'model_provider="openai_chatgpt_plan"',
  '-c',
  'model_providers.openai_chatgpt_plan.name="ChatGPT plan"',
  '-c',
  'model_providers.openai_chatgpt_plan.base_url="https://api.openai.com/v1"',
  '-c',
  'model_providers.openai_chatgpt_plan.env_key="ACCESS_TOKEN"',
  '-c',
  'model_providers.openai_chatgpt_plan.wire_api="responses"',
  '-c',
  'model_providers.openai_chatgpt_plan.requires_openai_auth=false',
  '-c',
  'model_providers.openai_chatgpt_plan.supports_websockets=false',
  '-c',
  'approval_policy="never"',
  '-c',
  'sandbox_mode="read-only"',
  '-c',
  'mcp_servers={}',
  '-c',
  'web_search="disabled"',
  '-c',
  'project_doc_max_bytes=0',
  '-c',
  'history.persistence="none"',
  '-c',
  'shell_environment_policy.inherit="none"',
])

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid provider message.')
  return value as Record<string, unknown>
}

function name(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 256) throw new Error('Invalid provider identity.')
  return value
}

function outsideWorkspace(location: string): boolean {
  if (!path.isAbsolute(location)) return false
  const relative = path.relative(process.cwd(), location)
  return relative !== '' && (relative.startsWith('..' + path.sep) || relative === '..')
}

function query(input: WorkspaceRequest): WorkspaceRequest {
  if (
    !input ||
    !workspaceRecordKinds.includes(input.kind) ||
    typeof input.query !== 'string' ||
    input.query.length > 160
  ) {
    throw new Error('Invalid workspace lookup.')
  }
  return { kind: input.kind, query: input.query }
}

function exactArguments(value: unknown, expected: WorkspaceRequest): void {
  const args = object(value)
  if (Object.keys(args).length !== 2 || args.kind !== expected.kind || args.query !== expected.query) {
    throw new Error('Provider lookup did not match the requested project read.')
  }
}

function records(value: readonly WorkspaceRecord[], requestedKind: WorkspaceRecordKind): readonly WorkspaceRecord[] {
  if (!Array.isArray(value) || value.length > 8) throw new Error('Invalid Appraise lookup result.')
  const seen = new Set<string>()
  return value.map(record => {
    if (
      !record ||
      record.kind !== requestedKind ||
      typeof record.id !== 'string' ||
      !/^[\x20-\x7e]{1,200}$/.test(record.id) ||
      typeof record.title !== 'string' ||
      !record.title ||
      record.title.length > 512
    ) {
      throw new Error('Invalid Appraise lookup result.')
    }
    const key = `${record.kind}:${record.id}`
    if (seen.has(key)) throw new Error('Duplicate Appraise lookup result.')
    seen.add(key)
    return { kind: record.kind, id: record.id, title: record.title }
  })
}

async function write(stdin: Writable, message: unknown): Promise<void> {
  const bytes = JSON.stringify(message) + '\n'
  if (Buffer.byteLength(bytes) > FRAME_LIMIT) throw new Error('Provider request exceeded the limit.')
  await new Promise<void>((resolve, reject) => {
    stdin.write(bytes, error => (error ? reject(error) : resolve()))
  })
}

function parseFrame(line: string, count: number): unknown {
  if (Buffer.byteLength(line) > FRAME_LIMIT) throw new Error('Provider frame exceeded the limit.')
  if (count > FRAME_COUNT_LIMIT) throw new Error('Provider event count exceeded the limit.')
  return JSON.parse(line)
}

function takeLines(pending: string): { lines: string[]; remaining: string } {
  const parts = pending.split('\n')
  return { lines: parts.slice(0, -1), remaining: parts.at(-1) ?? '' }
}

async function* frames(stdout: Readable): AsyncGenerator<unknown> {
  const decoder = new StringDecoder('utf8')
  let pending = ''
  let total = 0
  let count = 0
  for await (const chunk of stdout) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    total += bytes.length
    if (total > TOTAL_LIMIT) throw new Error('Provider output exceeded the limit.')
    pending += decoder.write(bytes)
    if (Buffer.byteLength(pending) > FRAME_LIMIT * 2) throw new Error('Provider frame exceeded the limit.')
    const split = takeLines(pending)
    pending = split.remaining
    for (const line of split.lines) yield parseFrame(line, ++count)
  }
  if (pending.length || decoder.end().length) throw new Error('Provider ended with a partial frame.')
}

async function boundedStop(transport: CodexReadTransport) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      transport.stop(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Provider cleanup timed out.')), STOP_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

type ReadInput = Readonly<{
  accessToken: string
  query: WorkspaceRequest
  lookup: () => Promise<readonly WorkspaceRecord[]>
  signal?: AbortSignal
}>

type ProtocolState = {
  phase: 'initializing' | 'starting-thread' | 'starting-turn' | 'running'
  threadId?: string
  turnId?: string
  turnIssued: boolean
  toolCalls: number
  returnedRecords?: readonly WorkspaceRecord[]
}

type ProtocolContext = Readonly<{
  input: ReadInput
  requested: WorkspaceRequest
  transport: CodexReadTransport
  signal: AbortSignal
}>

function attemptError(state: ProtocolState): CodexReadAttemptError {
  return new CodexReadAttemptError(
    'The provider read could not be confirmed.',
    state.turnIssued ? 'UNKNOWN' : 'NOT_STARTED',
    state.threadId,
    state.turnId,
  )
}

function launchRequest(accessToken: string): CodexReadLaunch {
  return { accessToken, args: providerArgs, environment: { ACCESS_TOKEN: accessToken } }
}

function stopLateTransport(transport: CodexReadTransport): void {
  transport.stdout.destroy()
  transport.stdin.destroy()
  void boundedStop(transport).catch(() => undefined)
}

async function openBounded(
  open: OpenCodexReadTransport,
  accessToken: string,
  signal: AbortSignal,
): Promise<CodexReadTransport> {
  let expired = false
  let onAbort: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      expired = true
      reject(new Error('Provider launch was interrupted.'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
  const launch = open(launchRequest(accessToken), signal)
  void launch.then(
    late => {
      if (expired) stopLateTransport(late)
    },
    () => undefined,
  )
  try {
    const transport = await Promise.race([launch, aborted])
    if (signal.aborted) {
      if (!expired) stopLateTransport(transport)
      throw new Error('Provider launch was interrupted.')
    }
    return transport
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort)
  }
}

function assertIsolated(transport: CodexReadTransport): void {
  if (
    transport.isolationVerified !== true ||
    !outsideWorkspace(transport.isolatedCwd) ||
    !outsideWorkspace(transport.isolatedHome)
  )
    throw new Error('Isolated provider host is unavailable.')
}

function initializeRequest() {
  return {
    id: 0,
    method: 'initialize',
    params: {
      clientInfo: { name: 'AppraiseJS', title: 'AppraiseJS', version: '0.4.0' },
      capabilities: { experimentalApi: true },
    },
  }
}

function threadRequest() {
  return {
    id: 1,
    method: 'thread/start',
    params: {
      model: MODEL,
      approvalPolicy: 'never',
      sandbox: 'read-only',
      serviceName: 'AppraiseJS',
      ephemeral: true,
      dynamicTools: [
        {
          type: 'function',
          name: TOOL,
          description: 'Read matching records in the selected Appraise project.',
          inputSchema: {
            type: 'object',
            properties: { kind: { type: 'string', enum: workspaceRecordKinds }, query: { type: 'string' } },
            required: ['kind', 'query'],
            additionalProperties: false,
          },
        },
      ],
    },
  }
}

function turnRequest(threadId: string, requested: WorkspaceRequest) {
  return {
    id: 2,
    method: 'turn/start',
    params: {
      threadId,
      model: MODEL,
      effort: 'low',
      input: [
        {
          type: 'text',
          text: `Use ${TOOL} exactly once with kind ${requested.kind} and query ${JSON.stringify(requested.query)}. Describe the result briefly.`,
        },
      ],
    },
  }
}

async function initialized(
  message: Record<string, unknown>,
  context: ProtocolContext,
  state: ProtocolState,
): Promise<void> {
  if (state.phase !== 'initializing' || !message.result) throw new Error('Invalid provider initialization.')
  state.phase = 'starting-thread'
  await write(context.transport.stdin, { method: 'initialized', params: {} })
  await write(context.transport.stdin, threadRequest())
}

async function threadStarted(
  message: Record<string, unknown>,
  context: ProtocolContext,
  state: ProtocolState,
): Promise<void> {
  if (state.phase !== 'starting-thread' || !message.result) throw new Error('Invalid provider thread response.')
  state.threadId = name(object(object(message.result).thread).id)
  state.turnIssued = true
  state.phase = 'starting-turn'
  await write(context.transport.stdin, turnRequest(state.threadId, context.requested))
}

function turnStarted(message: Record<string, unknown>, state: ProtocolState): void {
  if (state.phase !== 'starting-turn' || !state.threadId || !message.result) {
    throw new Error('Invalid provider turn response.')
  }
  state.turnId = name(object(object(message.result).turn).id)
  state.phase = 'running'
}

async function handleResponse(
  message: Record<string, unknown>,
  context: ProtocolContext,
  state: ProtocolState,
): Promise<void> {
  if (message.id === 0) return initialized(message, context, state)
  if (message.id === 1) return threadStarted(message, context, state)
  turnStarted(message, state)
}

function assertScoped(params: Record<string, unknown>, state: ProtocolState): void {
  if (!state.threadId || !state.turnId || params.threadId !== state.threadId || params.turnId !== state.turnId) {
    throw new Error('Unexpected provider scope.')
  }
}

async function handleToolCall(
  message: Record<string, unknown>,
  context: ProtocolContext,
  state: ProtocolState,
): Promise<void> {
  if (state.phase !== 'running' || state.toolCalls !== 0) throw new Error('Unexpected provider tool call.')
  const params = object(message.params)
  assertScoped(params, state)
  if (params.namespace !== null || params.tool !== TOOL) throw new Error('Unexpected provider tool call.')
  name(params.callId)
  exactArguments(params.arguments, context.requested)
  state.toolCalls += 1
  state.returnedRecords = records(await context.input.lookup(), context.requested.kind)
  if (context.signal.aborted) throw new Error('Provider read was interrupted.')
  await write(context.transport.stdin, {
    id: message.id,
    result: {
      contentItems: [{ type: 'inputText', text: JSON.stringify({ records: state.returnedRecords }) }],
      success: true,
    },
  })
}

function completedResult(params: Record<string, unknown>, state: ProtocolState): CodexReadResult {
  const turn = object(params.turn)
  if (
    !state.threadId ||
    !state.turnId ||
    params.threadId !== state.threadId ||
    turn.id !== state.turnId ||
    turn.status !== 'completed' ||
    state.toolCalls !== 1 ||
    !state.returnedRecords
  )
    throw new Error('Provider read did not complete with the requested result.')
  return { records: state.returnedRecords, threadId: state.threadId, turnId: state.turnId }
}

function assertItem(message: Record<string, unknown>, context: ProtocolContext, state: ProtocolState): void {
  const params = object(message.params)
  assertScoped(params, state)
  const item = object(params.item)
  if (!['userMessage', 'agentMessage', 'reasoning', 'dynamicToolCall'].includes(String(item.type))) {
    throw new Error('Unexpected provider item.')
  }
  if (item.type === 'dynamicToolCall') {
    if (item.tool !== TOOL) throw new Error('Unexpected provider tool item.')
    exactArguments(item.arguments, context.requested)
  }
}

function handleNotification(
  message: Record<string, unknown>,
  context: ProtocolContext,
  state: ProtocolState,
): CodexReadResult | undefined {
  if (message.method === 'turn/completed') return completedResult(object(message.params), state)
  if (message.method === 'item/started' || message.method === 'item/completed') {
    assertItem(message, context, state)
    return undefined
  }
  if (message.method === 'item/agentMessage/delta') {
    assertScoped(object(message.params), state)
    return undefined
  }
  if (message.id !== undefined || (typeof message.method === 'string' && message.method.startsWith('item/'))) {
    throw new Error('Unexpected provider message.')
  }
  return undefined
}

async function routeFrame(
  incoming: unknown,
  context: ProtocolContext,
  state: ProtocolState,
): Promise<CodexReadResult | undefined> {
  if (context.signal.aborted) throw new Error('Provider read was interrupted.')
  const message = object(incoming)
  if (message.error) throw new Error('Provider request failed.')
  if (message.id === 0 || message.id === 1 || message.id === 2) {
    await handleResponse(message, context, state)
    return undefined
  }
  if (message.method === 'item/tool/call' && message.id !== undefined) {
    await handleToolCall(message, context, state)
    return undefined
  }
  return handleNotification(message, context, state)
}

async function consume(context: ProtocolContext, state: ProtocolState): Promise<CodexReadResult> {
  await write(context.transport.stdin, initializeRequest())
  for await (const incoming of frames(context.transport.stdout)) {
    const result = await routeFrame(incoming, context, state)
    if (result) return result
  }
  throw new Error('Provider closed before the read completed.')
}

async function consumeBounded(context: ProtocolContext, state: ProtocolState): Promise<CodexReadResult> {
  let onAbort: (() => void) | undefined
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error('Provider read was interrupted.'))
    context.signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([consume(context, state), interrupted])
  } finally {
    if (onAbort) context.signal.removeEventListener('abort', onAbort)
  }
}

function readInput(input: ReadInput): WorkspaceRequest {
  if (typeof input.accessToken !== 'string' || !input.accessToken || input.accessToken.length > 16_384) {
    throw new CodexReadAttemptError('ChatGPT access is unavailable.', 'NOT_STARTED')
  }
  try {
    const requested = query(input.query)
    if (typeof input.lookup !== 'function') throw new Error('Invalid lookup callback.')
    return requested
  } catch {
    throw new CodexReadAttemptError('The workspace lookup is invalid.', 'NOT_STARTED')
  }
}

/**
 * One read-only protocol turn. The caller must supply an independently qualified host
 * with an isolated, non-project cwd and an effective no-shell/no-files boundary.
 * This module has no native-launch fallback and never trusts model prose for records.
 */
export async function runCodexRecordLookup(input: ReadInput, open: OpenCodexReadTransport): Promise<CodexReadResult> {
  const requested = readInput(input)
  if (input.signal?.aborted) throw new CodexReadAttemptError('Provider read was cancelled.', 'NOT_STARTED')
  const deadline = AbortSignal.timeout(TURN_TIMEOUT_MS)
  const signal = input.signal ? AbortSignal.any([input.signal, deadline]) : deadline
  const state: ProtocolState = { phase: 'initializing', turnIssued: false, toolCalls: 0 }
  let transport: CodexReadTransport | undefined
  try {
    transport = await openBounded(open, input.accessToken, signal)
    assertIsolated(transport)
    return await consumeBounded({ input, requested, transport, signal }, state)
  } catch {
    throw attemptError(state)
  } finally {
    if (transport) {
      transport.stdout.destroy()
      transport.stdin.destroy()
      try {
        await boundedStop(transport)
      } catch {
        throw attemptError(state)
      }
    }
  }
}
