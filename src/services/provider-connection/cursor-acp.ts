import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { z } from 'zod'

const maxResponseBytes = 256 * 1024
const maxMessageLength = 4096
const action = 'workspace_record_search'
const actionResponse = z.object({ action: z.literal(action) }).strict()

const envelope = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.number(), z.string(), z.null()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
})
const updateSchema = z.object({
  sessionId: z.string(),
  update: z.object({
    sessionUpdate: z.string(),
    content: z.object({ type: z.string(), text: z.string().optional() }).optional(),
  }),
})
const newSession = z.object({
  sessionId: z.string().min(1),
  modes: z.object({
    currentModeId: z.string(),
    availableModes: z.array(z.object({ id: z.string() })),
  }),
})

export async function requestCursorLookup(
  child: ChildProcessWithoutNullStreams,
  cwd: string,
  signal: AbortSignal,
): Promise<boolean> {
  let responseBytes = 0
  let sessionId: string | undefined
  let message = ''
  let toolRequested = false
  let requestId = 0
  let prompting = false
  child.on('error', error => child.stdout.destroy(error))
  child.stdin.on('error', error => child.stdout.destroy(error))
  child.stdout.on('data', (chunk: Buffer) => {
    responseBytes += chunk.length
    if (responseBytes > maxResponseBytes) child.stdout.destroy(new Error('Cursor ACP exceeded its response budget.'))
  })
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  const replies = lines[Symbol.asyncIterator]()

  function send(packet: Record<string, unknown>) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...packet })}\n`)
  }

  function answerServerRequest(packet: z.infer<typeof envelope>): boolean {
    if (!packet.method || packet.id == null) return false
    toolRequested ||= prompting
    if (packet.method === 'session/request_permission') {
      send({ id: packet.id, result: { outcome: { outcome: 'cancelled' } } })
    } else {
      send({ id: packet.id, error: { code: -32601, message: 'Client method unavailable' } })
    }
    return true
  }

  function appendMessageChunk({ sessionUpdate, content }: z.infer<typeof updateSchema>['update']) {
    if (sessionUpdate !== 'agent_message_chunk') return
    if (content?.type !== 'text') return
    message += content.text ?? ''
    if (message.length > maxMessageLength) throw new Error('Cursor ACP returned too much text.')
  }

  function collectUpdate(packet: z.infer<typeof envelope>) {
    if (packet.method !== 'session/update' || !prompting) return
    const notice = updateSchema.parse(packet.params)
    if (notice.sessionId !== sessionId) throw new Error('Cursor ACP sent an update for a different session.')
    if (['tool_call', 'tool_call_update'].includes(notice.update.sessionUpdate)) toolRequested = true
    appendMessageChunk(notice.update)
  }

  async function request(method: string, params: Record<string, unknown>) {
    signal.throwIfAborted()
    const id = ++requestId
    send({ id, method, params })
    for (;;) {
      const next = await replies.next()
      if (next.done) throw new Error('Cursor ACP closed before replying.')
      const packet = envelope.parse(JSON.parse(next.value))
      if (answerServerRequest(packet)) continue
      collectUpdate(packet)
      if (packet.id !== id) continue
      if (packet.error !== undefined) throw new Error(`Cursor ACP could not complete ${method}.`)
      return packet.result
    }
  }

  try {
    const initialized = await request('initialize', {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: 'appraisejs', version: '0.5' },
    })
    z.object({ protocolVersion: z.literal(1) }).parse(initialized)
    const session = newSession.parse(await request('session/new', { cwd, mcpServers: [] }))
    sessionId = session.sessionId
    if (session.modes.currentModeId !== 'ask') {
      if (!session.modes.availableModes.some(mode => mode.id === 'ask')) return false
      z.object({}).parse(await request('session/set_mode', { sessionId, modeId: 'ask' }))
    }

    prompting = true
    const result = await request('session/prompt', {
      sessionId,
      prompt: [
        {
          type: 'text',
          text: 'Return exactly {"action":"workspace_record_search"} as plain JSON for an Appraise project lookup. Do not use tools or access files.',
        },
      ],
    })
    const { stopReason } = z.object({ stopReason: z.string() }).parse(result)
    if (stopReason !== 'end_turn' || toolRequested) return false
    try {
      return actionResponse.safeParse(JSON.parse(message)).success
    } catch {
      return false
    }
  } finally {
    lines.close()
  }
}
