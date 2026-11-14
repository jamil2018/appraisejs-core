import { FinitePrivateTransport, schemaValidator } from '../private-rpc.mjs'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

export const SERVER_NAME = 'm13_b1_fixture'
export const TOOL_SCHEMA = Object.freeze({ type: 'object', properties: {}, additionalProperties: false })
export const SERVER_INFO = Object.freeze({ name: 'm13-b1-fixture', version: '1.0.0' })
export const SERVER_CAPABILITIES = Object.freeze({ tools: {} })
export const SCHEMA_FILES = Object.freeze([
  'ClientRequest.json',
  'ClientNotification.json',
  'ServerNotification.json',
  'JSONRPCError.json',
  'v1/InitializeParams.json',
  'v1/InitializeResponse.json',
  'v2/ConfigReadParams.json',
  'v2/ConfigReadResponse.json',
  'v2/ThreadStartParams.json',
  'v2/ThreadStartResponse.json',
  'v2/ListMcpServerStatusParams.json',
  'v2/ListMcpServerStatusResponse.json',
])
export const digest = value => createHash('sha256').update(value).digest('hex')

export class B1Refusal extends Error {
  constructor(category, hash) {
    super(category)
    this.name = 'B1Refusal'
    this.category = category
    if (hash) this.hash = hash
  }
}

export function loadValidators(schemaRoot) {
  return schemaValidator(schemaRoot, SCHEMA_FILES, value => {
    throw new B1Refusal('schema_refused', digest(JSON.stringify(value)))
  })
}

// A generic RPC failure, authentication problem, or timeout never witnesses the negative case.
export function isRequiredMcpRefusal(error) {
  if (!error || !Number.isInteger(error.code) || typeof error.message !== 'string') return false
  const message = error.message
  if (/auth|login|credential|timeout|timed out|deadline/i.test(message)) return false
  return (
    /required/i.test(message) &&
    /mcp/i.test(message) &&
    /fail|refus|could not|unable/i.test(message) &&
    /(?:^|[^a-zA-Z0-9_])m13_b1_fixture(?:$|[^a-zA-Z0-9_])/.test(message)
  )
}

function matchesServerInfo(info) {
  if (!info || info.name !== SERVER_INFO.name || info.version !== SERVER_INFO.version) return false
  const nullable = ['description', 'icons', 'title', 'websiteUrl']
  return Object.entries(info).every(
    ([key, value]) => ['name', 'version'].includes(key) || (nullable.includes(key) && value === null),
  )
}

export function assertReadyStatus(result) {
  const server = result.data?.[0]
  if (
    result.data?.length !== 1 ||
    result.nextCursor != null ||
    server.name !== SERVER_NAME ||
    server.runtimeStatus !== 'connected' ||
    server.toolsError !== null ||
    server.httpOrigin != null ||
    server.pluginId != null ||
    server.resources.length !== 0 ||
    server.resourceTemplates.length !== 0 ||
    !matchesServerInfo(server.serverInfo) ||
    !isDeepStrictEqual(server.serverCapabilities, SERVER_CAPABILITIES) ||
    Object.keys(server.tools).length !== 1
  )
    throw new B1Refusal('native_readiness_refused')
  const tool = Object.values(server.tools)[0]
  if (tool.name !== 'fixture_observe' || !isDeepStrictEqual(tool.inputSchema, TOOL_SCHEMA))
    throw new B1Refusal('fixture_tool_drift')
}

function verifyThreadSelection(result) {
  if (
    result.model !== 'gpt-6.1-sol' ||
    result.reasoningEffort !== 'medium' ||
    result.approvalPolicy !== 'never' ||
    result.modelProvider !== 'openai' ||
    result.thread.modelProvider !== 'openai'
  )
    throw new B1Refusal('thread_contract_refused')
}
function verifyThreadIsolation(result, cwd) {
  if (result.sandbox.type !== 'readOnly' || result.sandbox.networkAccess === true || result.cwd !== cwd)
    throw new B1Refusal('thread_contract_refused')
}
function verifyEphemeralThread(thread, cwd) {
  if (
    thread.ephemeral !== true ||
    thread.turns.length !== 0 ||
    thread.preview !== '' ||
    thread.cwd !== cwd ||
    !thread.id
  )
    throw new B1Refusal('thread_contract_refused')
}
/** Private finite B1 protocol. No generic request, turn, account, model, or approval API is exposed. */
export class B1Transport extends FinitePrivateTransport {
  #wire
  #step = 0
  #id = 0
  #threadId
  #notificationSequence = 0
  #remoteControlDisabled = 0

  /** @param {{stdin: import('node:stream').Writable, stdout: import('node:stream').Readable, stderr: import('node:stream').Readable, validate: (name: string, value: unknown) => void, event?: (event: {category: string, hash?: string}) => void}} options */
  constructor(options) {
    const wire = {}
    super(options, B1Refusal, 'partial_frame_eof', message => this.#receive(message), wire, {
      initialize: 0,
      initialized: 0,
      configRead: 0,
      threadStart: 0,
      statusList: 0,
    })
    this.#wire = wire
    wire.start()
  }
  #receive(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw new B1Refusal('malformed_frame')
    if ('method' in message) return this.#notification(message)
    return this.#response(message)
  }
  #response(message) {
    const pending = this.#wire.pending()
    if (!pending || message.id !== pending.id || 'result' in message === 'error' in message)
      throw new B1Refusal('unexpected_response')
    if ('error' in message) {
      this.#wire.validate('JSONRPCError.json', message)
      const category = pending.negative && isRequiredMcpRefusal(message.error) ? 'required_mcp_refused' : 'rpc_refused'
      this.#wire.rejectPending(new B1Refusal(category, digest(JSON.stringify(message.error))))
      return
    }
    this.#wire.validate(pending.schema, message.result)
    this.#wire.resolvePending(message.result)
  }

  #notification(message) {
    if ('id' in message) throw new B1Refusal('server_request_refused')
    this.#wire.validate('ServerNotification.json', message)
    if (message.method === 'remoteControl/status/changed') {
      if (message.params.status !== 'disabled' || message.params.environmentId != null)
        throw new B1Refusal('remote_control_active_or_unverified')
      if (++this.#remoteControlDisabled > 32) throw new B1Refusal('notification_limit')
      this.#wire.event({ category: 'remote_control_disabled', count: this.#remoteControlDisabled })
      return
    }
    this.#wire.event({
      category: 'notification_method',
      method: message.method,
      sequence: ++this.#notificationSequence,
      phase: ['UNSTARTED', 'INITIALIZATION', 'CONFIGURATION', 'THREAD_START', 'STATUS'][this.#step],
    })
    const allowed = [
      'thread/started',
      'thread/status/changed',
      'thread/readState/changed',
      'mcpServer/startupStatus/updated',
    ]
    if (!allowed.includes(message.method)) throw new B1Refusal('notification_refused')
    this.#wire.event({ category: 'native_notification', hash: digest(JSON.stringify(message)) })
    return
  }
  #request(method, params, schema, timeoutMs, negative = false) {
    this.assertHealthy()
    if (this.#wire.pending()) throw new B1Refusal('concurrent_request_refused')
    const id = ++this.#id
    const message = { id, method, params }
    this.#wire.validate('ClientRequest.json', message)
    return this.#wire.send(message, { schema, negative }, timeoutMs)
  }

  async initialize(timeoutMs = 10_000) {
    if (this.#step++ !== 0) throw new B1Refusal('sequence_refused')
    const params = {
      clientInfo: { name: 'appraise_m13_b1', version: '1.0.0' },
      capabilities: { experimentalApi: false },
    }
    this.#wire.validate('v1/InitializeParams.json', params)
    this.#wire.counts.initialize++
    const result = await this.#request('initialize', params, 'v1/InitializeResponse.json', timeoutMs)
    const notification = { method: 'initialized' }
    this.#wire.validate('ClientNotification.json', notification)
    this.assertHealthy()
    this.#wire.write(`${JSON.stringify(notification)}\n`)
    this.#wire.counts.initialized++
    return result
  }

  async configRead(cwd) {
    if (this.#step++ !== 1) throw new B1Refusal('sequence_refused')
    const params = { cwd, includeLayers: false }
    this.#wire.validate('v2/ConfigReadParams.json', params)
    this.#wire.counts.configRead++
    return this.#request('config/read', params, 'v2/ConfigReadResponse.json', 10_000)
  }

  async startThread(cwd, negative = false) {
    if (this.#step++ !== 2) throw new B1Refusal('sequence_refused')
    const params = { cwd, ephemeral: true, model: 'gpt-6.1-sol', approvalPolicy: 'never', sandbox: 'read-only' }
    this.#wire.validate('v2/ThreadStartParams.json', params)
    this.#wire.counts.threadStart++
    const result = await this.#request('thread/start', params, 'v2/ThreadStartResponse.json', 40_000, negative)
    verifyThreadSelection(result)
    verifyThreadIsolation(result, cwd)
    verifyEphemeralThread(result.thread, cwd)
    this.#threadId = result.thread.id
    return result
  }

  async listStatus() {
    if (this.#step++ !== 3 || !this.#threadId) throw new B1Refusal('sequence_refused')
    const params = { threadId: this.#threadId, serverName: SERVER_NAME, detail: 'full', limit: 1 }
    this.#wire.validate('v2/ListMcpServerStatusParams.json', params)
    this.#wire.counts.statusList++
    const result = await this.#request('mcpServerStatus/list', params, 'v2/ListMcpServerStatusResponse.json', 10_000)
    assertReadyStatus(result)
    return result
  }
}
