import Ajv from 'ajv'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import origin from './native-qualification-schemas/origin.json'
import type { OwnedFixtureChild } from './owned-child'
import type { RpcRequestMethod } from './rpc-transport'

const responses = Object.freeze({
  initialize: 'v1/InitializeResponse.json',
  'config/read': 'v2/ConfigReadResponse.json',
  'thread/start': 'v2/ThreadStartResponse.json',
  'mcpServerStatus/list': 'v2/ListMcpServerStatusResponse.json',
  'turn/start': 'v2/TurnStartResponse.json',
})
function reject(): never {
  throw new Error('Pinned native protocol refused')
}
function localReferences(value: unknown): void {
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    if (key === '$ref' && (typeof nested !== 'string' || !nested.startsWith('#/'))) reject()
    localReferences(nested)
  }
}

/** Only committed installed-schema bytes; no generation, download or external reference resolver. */
export function createNativeQualificationProtocol(
  scope: Readonly<{ serverName: 'appraise_worker'; enabledTools: readonly string[]; maxToolCalls: number }>,
) {
  const serverName = scope.serverName,
    tools = new Set(scope.enabledTools),
    maxCalls = scope.maxToolCalls
  if (
    serverName !== 'appraise_worker' ||
    !tools.size ||
    !Number.isSafeInteger(maxCalls) ||
    maxCalls < 1 ||
    maxCalls > 16
  )
    reject()
  let poisoned = false,
    turnEntered = false
  let threadId: string | undefined, turnId: string | undefined
  const mcpItems = new Map<string, string>()
  const issued = new Map<number, keyof typeof responses>()
  const replies = new Set<number>()
  const written = new Map<number, string>()
  const startReceipts = new Set<number>()
  let nextRequest = 0
  function refuse(): never {
    poisoned = true
    reject()
  }
  function healthy() {
    if (poisoned) reject()
  }
  const record = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value)
  function mcpItem(value: Record<string, unknown>) {
    if (value.server !== serverName || !tools.has(String(value.tool))) refuse()
    const id = String(value.id),
      tool = String(value.tool)
    if (!/^[A-Za-z0-9._:-]{1,200}$/.test(id)) refuse()
    if (mcpItems.has(id) && mcpItems.get(id) !== tool) refuse()
    mcpItems.set(id, tool)
    if (mcpItems.size > maxCalls) refuse()
  }
  function item(value: unknown) {
    if (!record(value)) refuse()
    if (['userMessage', 'agentMessage', 'reasoning', 'plan'].includes(String(value.type))) return
    if (value.type !== 'mcpToolCall') refuse()
    mcpItem(value)
  }
  function turn(value: unknown) {
    if (
      !record(value) ||
      !Array.isArray(value.items) ||
      typeof value.id !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,200}$/.test(value.id)
    )
      refuse()
    if (turnId && value.id !== turnId) refuse()
    turnId = String(value.id)
    for (const nested of value.items) item(nested)
  }
  function correlate(params: Record<string, unknown>, seenTurn: unknown) {
    if (!turnEntered || params.threadId !== threadId) refuse()
    if (turnId && seenTurn !== turnId) refuse()
    if (typeof seenTurn !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(seenTurn)) refuse()
    turnId = seenTurn
  }
  function inspectNotification(method: string, params: Record<string, unknown>) {
    if (['turn/started', 'turn/completed'].includes(method)) {
      if (!record(params.turn)) refuse()
      correlate(params, params.turn.id)
      turn(params.turn)
      return
    }
    if (method.startsWith('thread/realtime/')) refuse()
    if (!method.startsWith('item/')) return
    correlate(params, params.turnId)
    if (['item/started', 'item/completed'].includes(method)) {
      item(params.item)
      return
    }
    if (method === 'item/mcpToolCall/progress' && mcpItems.has(String(params.itemId))) return
    if (/^item\/(agentMessage|reasoning|plan)\//.test(method)) return
    refuse()
  }
  const ajv = new Ajv({ allErrors: false, logger: false, unknownFormats: 'ignore' })
  const validators = new Map(
    Object.entries(origin.files).map(([name, expected]) => {
      const bytes = readFileSync(new URL(`./native-qualification-schemas/${name}`, import.meta.url))
      if (createHash('sha256').update(bytes).digest('hex') !== expected) reject()
      const schema: unknown = JSON.parse(bytes.toString('utf8'))
      localReferences(schema)
      return [name, ajv.compile(schema as object)] as const
    }),
  )
  function validate(name: string, value: unknown) {
    healthy()
    if (!validators.get(name)?.(value)) refuse()
  }
  function inspectTurnStartResult(id: number, result: unknown) {
    if (!record(result) || !record(result.turn)) refuse()
    turn(result.turn)
    if (result.turn.status === 'inProgress' && result.turn.error == null) startReceipts.add(id)
  }
  function passiveReply(value: Record<string, unknown>) {
    const id = value.id
    if (typeof id !== 'number' || !Number.isSafeInteger(id)) refuse()
    if (!issued.has(id) || replies.has(id) || Object.hasOwn(value, 'method')) refuse()
    replies.add(id)
    if (Object.hasOwn(value, 'error') === Object.hasOwn(value, 'result')) refuse()
    if (Object.hasOwn(value, 'error')) {
      validate('JSONRPCError.json', value)
      return
    }
    validate(responses[issued.get(id)!], value.result)
    if (issued.get(id) === 'turn/start') inspectTurnStartResult(id, value.result)
    return issued.get(id) === 'initialize'
  }
  return Object.freeze({
    assertHealthy: healthy,
    written(requestId: number, method: RpcRequestMethod) {
      healthy()
      if (issued.get(requestId) !== method || written.has(requestId)) refuse()
      written.set(requestId, method)
    },
    consumeTurnStartReceipt(requestId: number) {
      healthy()
      if (written.get(requestId) !== 'turn/start' || !startReceipts.delete(requestId)) refuse()
    },
    passiveFrame(value: unknown) {
      if (!record(value)) refuse()
      if (Object.hasOwn(value, 'id')) {
        return passiveReply(value) === true ? 'INITIALIZE_VALIDATED' : undefined
      }
      if (typeof value.method !== 'string' || !record(value.params)) refuse()
      validate('ServerNotification.json', value)
      inspectNotification(value.method, value.params)
    },
    notification(method: string, params: Record<string, unknown>) {
      validate('ServerNotification.json', { method, params })
      inspectNotification(method, params)
    },
    transport(original: OwnedFixtureChild['transport']): OwnedFixtureChild['transport'] {
      return Object.freeze({
        async request(
          method: RpcRequestMethod,
          params: Record<string, unknown>,
          timeoutMs?: number,
          signal?: AbortSignal,
        ) {
          healthy()
          if (!Object.hasOwn(responses, method)) refuse()
          validate('ClientRequest.json', { id: 1, method, params })
          issued.set(++nextRequest, method as keyof typeof responses)
          if (method === 'turn/start') {
            if (turnEntered) refuse()
            turnEntered = true
            threadId = String(params.threadId)
          }
          const result = await original.request(method, params, timeoutMs, signal)
          validate(responses[method as keyof typeof responses], result)
          if (method === 'turn/start' && record(result)) turn(result.turn)
          return result
        },
        async notifyInitialized() {
          // The installed protocol uses absent params, including on the canonical fixture wire.
          validate('ClientNotification.json', { method: 'initialized' })
          await original.notifyInitialized()
        },
        fence: original.fence,
        snapshot: original.snapshot,
      })
    },
  })
}
