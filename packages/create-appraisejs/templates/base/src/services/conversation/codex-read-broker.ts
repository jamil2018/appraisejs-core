import { randomBytes, timingSafeEqual } from 'node:crypto'
import { once } from 'node:events'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { z } from 'zod'

import {
  codexLookupAcknowledgement,
  codexLookupModel,
  codexLookupNamespace,
  codexLookupParameters,
  codexLookupPrompt,
  codexLookupTool,
} from '@/lib/conversation/codex-lookup-contract'
import type { WorkspaceRequest } from '@/lib/conversation/workspace-request'

import { readChatGptStreamEvent } from './chatgpt-read-stream'

const upstream = 'https://api.openai.com/v1/responses'
const maxBytes = 1024 * 1024
const outputType = z.object({ type: z.string() })
const outputCall = z.object({
  type: z.literal('function_call'),
  id: z.string().optional(),
  call_id: z.string().min(1).max(256),
  namespace: z.literal(codexLookupNamespace),
  name: z.literal(codexLookupTool),
  arguments: z.string().max(64),
})
const reasoning = z.object({
  type: z.literal('reasoning'),
  id: z.string().min(1).max(256),
  summary: z.array(z.object({ type: z.literal('summary_text'), text: z.string() })),
  encrypted_content: z.string().optional().nullable(),
})
const nativeRequest = z.object({
  model: z.literal(codexLookupModel),
  input: z
    .array(
      z.object({
        role: z.string().optional(),
        type: z.string().optional(),
        call_id: z.string().optional(),
        output: z.unknown(),
        content: z.unknown(),
      }),
    )
    .max(32),
})
const content = z.array(z.object({ type: z.literal('input_text'), text: z.string() })).length(1)
const completed = z.object({
  type: z.literal('response.completed'),
  response: z.object({ status: z.literal('completed'), output: z.array(z.unknown()).max(16) }),
})

const tools = [
  {
    type: 'namespace',
    name: codexLookupNamespace,
    description: 'Appraise project reads.',
    tools: [
      {
        type: 'function',
        name: codexLookupTool,
        description: 'Read the exact project lookup supplied by Appraise.',
        strict: true,
        parameters: codexLookupParameters,
      },
    ],
  },
]

async function takeBytes(chunks: AsyncIterable<Uint8Array | string>) {
  const parts: Buffer[] = []
  let size = 0
  for await (const chunk of chunks) {
    const bytes = Buffer.from(chunk)
    size += bytes.byteLength
    if (size > maxBytes) throw new Error('Lookup transport exceeded its size limit.')
    parts.push(bytes)
  }
  return Buffer.concat(parts)
}

async function* webChunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      yield value
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

function matchingText(value: unknown, text: string) {
  if (value === text) return true
  const parsed = content.safeParse(value)
  return parsed.success && parsed.data[0].text === text
}

function admitsInitial(body: z.infer<typeof nativeRequest>, prompt: string) {
  return body.input.filter(item => item.role === 'user' && matchingText(item.content, prompt)).length === 1
}

function admitsContinuation(body: z.infer<typeof nativeRequest>, callId: string) {
  const outputs = body.input.filter(item => item.type === 'function_call_output')
  return (
    outputs.length === 1 && outputs[0].call_id === callId && matchingText(outputs[0].output, codexLookupAcknowledgement)
  )
}

function completionOutput(body: Buffer) {
  for (const frame of body.toString('utf8').split(/\r?\n\r?\n/)) {
    const terminal = completed.safeParse(readChatGptStreamEvent(frame))
    if (terminal.success) return terminal.data.response.output
  }
  throw new Error('Lookup did not complete.')
}

function initialOutput(output: unknown[]) {
  const calls = output.filter(item => outputType.parse(item).type !== 'reasoning')
  if (calls.length !== 1) throw new Error('Lookup returned unexpected output.')
  const call = outputCall.parse(calls[0])
  z.object({}).strict().parse(JSON.parse(call.arguments))
  const history = output.map(item => (outputType.parse(item).type === 'reasoning' ? reasoning.parse(item) : call))
  return { callId: call.call_id, history }
}

function finalOutput(output: unknown[]) {
  const types = output.map(item => outputType.parse(item).type)
  return types.includes('message') && types.every(type => type === 'message' || type === 'reasoning')
}

function headersMatch(request: IncomingMessage, port: number, authorization: Buffer) {
  const received = Buffer.from(request.headers.authorization ?? '')
  return (
    request.method === 'POST' &&
    request.url === '/v1/responses' &&
    request.headers.host === `127.0.0.1:${port}` &&
    request.socket.remoteAddress === '127.0.0.1' &&
    received.length === authorization.length &&
    timingSafeEqual(received, authorization)
  )
}

function responseRejected(response: ServerResponse) {
  if (response.destroyed) return
  response.writeHead(400, { 'Content-Type': 'application/json', Connection: 'close' })
  response.end('{"error":{"message":"Appraise lookup rejected the request."}}')
}

export async function openCodexReadBroker({
  query,
  readToken,
  signal,
  transport = fetch,
}: {
  query: WorkspaceRequest
  readToken: () => Promise<string | undefined>
  signal: AbortSignal
  transport?: typeof fetch
}) {
  const token = randomBytes(32).toString('base64url')
  const authorization = Buffer.from(`Bearer ${token}`)
  const controller = new AbortController()
  const ownedSignal = AbortSignal.any([signal, controller.signal])
  const prompt = codexLookupPrompt(query)
  const userMessage = { role: 'user', content: prompt }
  let port = 0
  let sent = 0
  let busy = false
  let acknowledged = false
  let settled = false
  let first: ReturnType<typeof initialOutput> | undefined

  async function issue(input: readonly unknown[], continuation: boolean) {
    const accessToken = await readToken()
    if (!accessToken || ownedSignal.aborted) throw new Error('Lookup connection unavailable.')
    sent += 1
    const response = await transport(upstream, {
      method: 'POST',
      redirect: 'error',
      signal: ownedSignal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: codexLookupModel,
        store: false,
        stream: true,
        parallel_tool_calls: false,
        instructions: 'Use only the supplied Appraise lookup tool. Appraise displays matching results locally.',
        input,
        tools,
        tool_choice: continuation ? 'none' : 'required',
        include: ['reasoning.encrypted_content'],
      }),
    })
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error('Lookup provider did not accept the request.')
    }
    return takeBytes(webChunks(response.body))
  }

  async function execute(body: z.infer<typeof nativeRequest>) {
    if (sent === 0 && admitsInitial(body, prompt)) {
      const bytes = await issue([userMessage], false)
      first = initialOutput(completionOutput(bytes))
      return bytes
    }
    if (sent !== 1 || !first || !acknowledged || !admitsContinuation(body, first.callId)) {
      throw new Error('Lookup continuation is unavailable.')
    }
    const bytes = await issue(
      [
        userMessage,
        ...first.history,
        { type: 'function_call_output', call_id: first.callId, output: codexLookupAcknowledgement },
      ],
      true,
    )
    if (!finalOutput(completionOutput(bytes))) throw new Error('Lookup returned unexpected continuation output.')
    settled = true
    return bytes
  }

  const server = createServer(
    { requestTimeout: 15_000, headersTimeout: 5_000, maxHeaderSize: 8192 },
    async (request, response) => {
      if (busy || ownedSignal.aborted || !headersMatch(request, port, authorization)) {
        responseRejected(response)
        return
      }
      busy = true
      try {
        const body = nativeRequest.parse(JSON.parse((await takeBytes(request)).toString('utf8')))
        const bytes = await execute(body)
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
          Connection: 'close',
        })
        response.end(bytes)
      } catch {
        responseRejected(response)
      } finally {
        busy = false
      }
    },
  )
  const listening = once(server, 'listening')
  server.listen({ host: '127.0.0.1', port: 0 })
  await listening
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Could not bind the lookup broker.')
  }
  port = address.port
  server.unref()
  server.on('error', () => controller.abort())
  function authorizeToolCall(callId: string) {
    if (acknowledged || first?.callId !== callId) throw new Error('Lookup function call was not confirmed.')
  }

  return {
    port,
    token,
    sent: () => sent,
    completed: () => settled,
    authorizeToolCall,
    confirmToolCall(callId: string) {
      authorizeToolCall(callId)
      acknowledged = true
    },
    async stop() {
      controller.abort()
      await new Promise<void>(resolve => {
        server.close(() => resolve())
        server.closeAllConnections()
      })
    },
  }
}
