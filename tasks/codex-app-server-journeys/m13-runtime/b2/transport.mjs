import { FinitePrivateTransport, schemaValidator } from '../private-rpc.mjs'
import { B2Refusal, requireCondition } from './topology.mjs'

export const SCHEMA_FILES = Object.freeze([
  'ClientRequest.json',
  'ClientNotification.json',
  'ServerNotification.json',
  'JSONRPCError.json',
  'v1/InitializeParams.json',
  'v1/InitializeResponse.json',
  'v2/ConfigReadParams.json',
  'v2/ConfigReadResponse.json',
  'v2/GetAccountParams.json',
  'v2/GetAccountResponse.json',
])
export function loadValidators(schemaRoot) {
  return schemaValidator(schemaRoot, SCHEMA_FILES, () => {
    throw new B2Refusal('schema_refused')
  })
}

export function categorizeAccount(result) {
  const present = result.account != null
  const type = present ? result.account.type : 'missing'
  requireCondition(['missing', 'apiKey', 'chatgpt', 'amazonBedrock', 'gcp'].includes(type), 'account_type_refused')
  return { accountType: type, present, requiresOpenaiAuth: result.requiresOpenaiAuth }
}

/** A finite private codec. Sensitive account fields and error text never escape this instance. */
export class B2Transport extends FinitePrivateTransport {
  #wire
  #notificationSequence = 0
  #remoteControlDisabledCount = 0
  #accountUpdateCount = 0
  #step = 0
  #id = 0

  /** @param {{stdin: import('node:stream').Writable, stdout: import('node:stream').Readable, stderr: import('node:stream').Readable, validate: (name: string, value: unknown) => void, event?: (event: {category: 'notification_method', method: string, sequence: number, phase: string} | {category: 'remote_control_disabled', count: number} | {category: 'account_update_observed', count: number}) => void}} options */
  constructor(options) {
    const wire = {}
    super(options, B2Refusal, 'truncated_frame', message => this.#receive(message), wire, {
      initialize: 0,
      initialized: 0,
      configRead: 0,
      accountRead: 0,
    })
    this.#wire = wire
    wire.start()
  }
  #receive(message) {
    requireCondition(message && typeof message === 'object' && !Array.isArray(message), 'malformed_frame')
    if ('method' in message) return this.#notification(message)
    const pending = this.#wire.pending()
    requireCondition(
      pending && message.id === pending.id && 'result' in message !== 'error' in message,
      'unexpected_response',
    )
    if ('error' in message) {
      this.#wire.validate('JSONRPCError.json', message)
      throw new B2Refusal('rpc_refused')
    }
    this.#wire.validate(pending.schema, message.result)
    // Reduce the sensitive account response before resolving any externally visible promise.
    const result = pending.account ? categorizeAccount(message.result) : message.result
    this.#wire.resolvePending(result)
  }
  #notification(message) {
    if ('id' in message) throw new B2Refusal('server_request_refused')
    this.#wire.validate('ServerNotification.json', message)
    if (message.method === 'account/updated') {
      requireCondition(
        this.#step === 3 && message.params.authMode === 'chatgpt' && this.#accountUpdateCount === 0,
        'account_update_refused',
      )
      // This event is diagnostic only. The account response remains the sole account qualification gate.
      this.#wire.event({ category: 'account_update_observed', count: ++this.#accountUpdateCount })
      return
    }
    if (
      message.method === 'remoteControl/status/changed' &&
      message.params.status === 'disabled' &&
      message.params.environmentId == null
    ) {
      requireCondition(this.#remoteControlDisabledCount < 32, 'remote_control_noise_refused')
      this.#wire.event({ category: 'remote_control_disabled', count: ++this.#remoteControlDisabledCount })
      return
    }
    this.#wire.event({
      category: 'notification_method',
      method: message.method,
      sequence: ++this.#notificationSequence,
      phase: ['UNSTARTED', 'INITIALIZATION', 'CONFIGURATION', 'ACCOUNT_READ'][this.#step],
    })
    throw new B2Refusal(
      message.method === 'remoteControl/status/changed'
        ? 'remote_control_status_refused'
        : 'unsolicited_notification_refused',
    )
  }
  #request(method, params, schema, account = false) {
    this.assertHealthy()
    requireCondition(!this.#wire.pending(), 'concurrent_request_refused')
    const id = ++this.#id
    const request = { id, method, params }
    this.#wire.validate('ClientRequest.json', request)
    return this.#wire.send(request, { schema, account }, 10_000)
  }
  async initialize() {
    requireCondition(this.#step++ === 0, 'sequence_refused')
    const params = {
      clientInfo: { name: 'appraise_m13_b2', version: '1.0.0' },
      capabilities: { experimentalApi: false },
    }
    this.#wire.validate('v1/InitializeParams.json', params)
    this.#wire.counts.initialize++
    const result = await this.#request('initialize', params, 'v1/InitializeResponse.json')
    this.assertHealthy()
    const notification = { method: 'initialized' }
    this.#wire.validate('ClientNotification.json', notification)
    this.#wire.write(`${JSON.stringify(notification)}\n`)
    this.#wire.counts.initialized++
    return result
  }
  async configRead(cwd) {
    requireCondition(this.#step++ === 1, 'sequence_refused')
    const params = { cwd, includeLayers: false }
    this.#wire.validate('v2/ConfigReadParams.json', params)
    this.#wire.counts.configRead++
    const result = await this.#request('config/read', params, 'v2/ConfigReadResponse.json')
    this.assertHealthy()
    return result
  }
  async accountRead() {
    requireCondition(this.#step++ === 2, 'sequence_refused')
    const params = { refreshToken: false }
    this.#wire.validate('v2/GetAccountParams.json', params)
    this.#wire.counts.accountRead++
    const result = await this.#request('account/read', params, 'v2/GetAccountResponse.json', true)
    this.assertHealthy()
    return result
  }
}
