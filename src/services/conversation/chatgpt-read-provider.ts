import { z } from 'zod'

import type { WorkspaceRequest } from '@/lib/conversation/workspace-request'

import type { ConversationLookupProvider } from './conversation-read-service'

const endpoint = 'https://api.openai.com/v1/responses'
const modelsEndpoint = 'https://api.openai.com/v1/models'
const toolName = 'workspace_record_search'
const namespace = 'appraise'
// The account catalog includes full model metadata, even though lookup uses only the visible slugs.
const maxCatalogBytes = 4 * 1024 * 1024
const maxStreamBytes = 256 * 1024
const supportedModels = ['gpt-6.2-sol', 'gpt-6.1-sol'] as const
const modelCatalog = z.object({ models: z.array(z.object({ slug: z.string(), visibility: z.string() })) })

const terminalEvent = z.object({
  type: z.enum(['response.completed', 'response.failed', 'response.incomplete']),
  response: z.object({ id: z.string().min(1).max(256), status: z.string(), output: z.array(z.unknown()).optional() }),
})

const toolCall = z.object({
  type: z.literal('function_call'),
  call_id: z.string().min(1).max(256),
  name: z.literal(toolName),
  namespace: z.literal(namespace).optional(),
  status: z.literal('completed').optional(),
  arguments: z.string().max(64),
})

function inferenceRequest({ kind, query }: WorkspaceRequest, model: string) {
  return {
    model,
    store: false,
    stream: true,
    parallel_tool_calls: false,
    instructions:
      'Call appraise.workspace_record_search once with an empty JSON object. Appraise has bound the requested kind and title query.',
    input: [{ role: 'user', content: JSON.stringify({ kind, query }) }],
    tool_choice: 'required',
    tools: [
      {
        type: 'namespace',
        name: namespace,
        description: 'Read the requested project records.',
        tools: [
          {
            type: 'function',
            name: toolName,
            description: 'Find Appraise records within the preselected project.',
            strict: true,
            parameters: { type: 'object', properties: {}, additionalProperties: false, required: [] },
          },
        ],
      },
    ],
  }
}

async function accountModel(transport: typeof fetch, authorization: string, signal: AbortSignal) {
  const response = await transport(modelsEndpoint, {
    headers: { Authorization: authorization, Accept: 'application/json' },
    redirect: 'error',
    signal,
  })
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined)
    return undefined
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > maxCatalogBytes) return undefined
      chunks.push(chunk.value)
    }
    const catalog = modelCatalog.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    const listed = new Set(catalog.models.filter(model => model.visibility === 'list').map(model => model.slug))
    return supportedModels.find(model => listed.has(model))
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

function terminalFrame(frame: string) {
  const data = frame
    .split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n')
  if (!data || data === '[DONE]') return undefined
  const value: unknown = JSON.parse(data)
  const event = terminalEvent.safeParse(value)
  return event.success ? event.data : undefined
}

async function readTerminal(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decode = new TextDecoder('utf-8', { fatal: true })
  let buffered = ''
  let bytes = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) throw new Error('Provider reply ended before a terminal event.')
      bytes += chunk.value.byteLength
      if (bytes > maxStreamBytes) throw new Error('Provider reply exceeded the read limit.')
      buffered += decode.decode(chunk.value, { stream: true })
      const frames = buffered.split(/\r?\n\r?\n/)
      buffered = frames.pop() ?? ''
      for (const frame of frames) {
        const terminal = terminalFrame(frame)
        if (terminal) return terminal
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

function isExpectedOutput(output: unknown[] | undefined) {
  if (!output) return false
  const callable = output.filter(item => {
    const result = z.object({ type: z.enum(['message', 'reasoning']) }).safeParse(item)
    return !result.success
  })
  if (callable.length !== 1) return false
  const parsed = toolCall.safeParse(callable[0])
  if (!parsed.success) return false
  try {
    return z.object({}).strict().safeParse(JSON.parse(parsed.data.arguments)).success
  } catch {
    return false
  }
}

async function takeReply(response: Response) {
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    if (response.status >= 400 && response.status < 500 && response.status !== 408) return undefined
    throw new Error('Provider did not confirm receipt of the read.')
  }
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  // The plan-usage endpoint can omit Content-Type. The parser still requires a valid terminal event.
  if (!response.body || (mediaType !== undefined && mediaType !== 'text/event-stream')) {
    throw new Error('Provider did not return an event stream.')
  }
  return readTerminal(response.body)
}

function confirmsRead(event: z.output<typeof terminalEvent> | undefined) {
  return (
    event?.type === 'response.completed' &&
    event.response.status === 'completed' &&
    isExpectedOutput(event.response.output)
  )
}

/** A single function request. Appraise renders its local result and sends no records back to the model. */
export function createChatGptReadProvider(
  readAccessToken: () => Promise<string | undefined>,
  transport = fetch,
): ConversationLookupProvider {
  return async ({ query, lookup, signal }) => {
    const accessToken = await readAccessToken().catch(() => undefined)
    if (!accessToken || signal.aborted) return 'failed'
    const authorization = `Bearer ${accessToken}`
    const model = await accountModel(transport, authorization, signal).catch(() => undefined)
    if (!model || signal.aborted) return 'failed'
    if ((await readAccessToken().catch(() => undefined)) !== accessToken || signal.aborted) return 'failed'
    const response = await transport(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(inferenceRequest(query, model)),
      redirect: 'error',
      signal,
    })
    if (!confirmsRead(await takeReply(response))) return 'failed'
    signal.throwIfAborted()
    await lookup()
    return 'completed'
  }
}
