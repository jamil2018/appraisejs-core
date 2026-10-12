import { createHash, randomUUID } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { DISABLED_FEATURES } from './p0-r2c-dynamic-tools-experiment.mjs'

const execFile = promisify(execFileCallback)
export const P0_R2D_MODEL = 'p0-r2d-loopback-model'
export const P0_R2D_ROLE = 'REQUIREMENT_ANALYZER'
export const P0_R2D_BRIDGE = path.resolve('scripts/lib/p0-r2d-canonical-bridge.ts')
export const P0_R2D_CODEX = '/private/tmp/appraise-codex-0154-npm-cache/_npx/4897a91091a83573/node_modules/.bin/codex'

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  return JSON.stringify(value)
}

export async function loadCanonicalProfile({ bridge = P0_R2D_BRIDGE } = {}) {
  const { stdout } = await execFile(process.execPath, ['--import', 'tsx', bridge, 'profile'], { maxBuffer: 1_000_000 })
  const profile = JSON.parse(stdout)
  if (profile?.role !== P0_R2D_ROLE || !Array.isArray(profile?.tools) || profile.tools.length !== 2) {
    throw new Error('Canonical Requirement Analyzer projection did not produce exactly two tools.')
  }
  return profile
}

export function projectDynamicTools(profile) {
  return profile.tools.map(tool => ({
    description: tool.description ?? `Canonical ${tool.name} operation.`,
    inputSchema: tool.inputSchema,
    name: tool.name,
    type: 'function',
  }))
}

// Codex 0.154.0 serializes dynamic inputSchema into this pinned Responses wire shape.
// The pinned codec strips the root dialect marker and emits strict:false; local canonical argument validation
// remains mandatory. This is explicit version-specific encoding, never an allowlist learned from a request.
export function projectResponsesTools(profile) {
  return profile.tools.map(tool => ({
    description: tool.description ?? `Canonical ${tool.name} operation.`,
    name: tool.name,
    parameters: Object.fromEntries(Object.entries(tool.inputSchema).filter(([key]) => key !== '$schema')),
    strict: false,
    type: 'function',
  }))
}

export function composeR2dLaunch({ executable = P0_R2D_CODEX, gatePort, profile, root } = {}) {
  if (!path.isAbsolute(executable)) throw new Error('R2d requires an absolute Codex executable.')
  if (!Number.isInteger(gatePort) || gatePort < 1) throw new Error('R2d requires a loopback gate port.')
  const launchRoot = root ?? mkdtempSync(path.join(tmpdir(), 'appraise-p0-r2d-'))
  const stateRoot = path.join(launchRoot, 'state')
  const workingDirectory = path.join(launchRoot, 'workspace')
  mkdirSync(stateRoot, { mode: 0o700, recursive: true })
  mkdirSync(workingDirectory, { mode: 0o700, recursive: true })
  const configText = r2dConfig(gatePort)
  const configPath = path.join(stateRoot, 'config.toml')
  writeFileSync(configPath, configText, { encoding: 'utf8', mode: 0o600 })
  const dynamicTools = projectDynamicTools(profile)
  return {
    args: ['app-server', '--stdio', '--strict-config'],
    configPath,
    configText,
    dynamicTools,
    environment: {
      APPRAISE_P0_R2D_FAKE_AUTH: 'synthetic-present-not-retained',
      CODEX_HOME: stateRoot,
      HOME: stateRoot,
      LANG: 'C',
      PATH: '/opt/homebrew/bin:/usr/bin:/bin',
      TMPDIR: '/private/tmp',
    },
    executable,
    launchRoot,
    stateRoot,
    threadStartParams: {
      approvalPolicy: 'never',
      baseInstructions: 'Account-free R2d interlock experiment. Use only the two declared tools.',
      cwd: workingDirectory,
      developerInstructions: '',
      dynamicTools,
      ephemeral: true,
      model: P0_R2D_MODEL,
      modelProvider: 'p0-r2d-loopback',
      sandbox: 'read-only',
    },
    workingDirectory,
  }
}

export function createRequestInterlock({ authority, expectedTools, upstream }) {
  const trustedAuthority = freezeDeep(structuredClone(authority))
  const trustedTools = freezeDeep(structuredClone(expectedTools))
  if (!validAuthority(trustedAuthority))
    throw new Error('Request interlock requires a complete unexpired authority binding.')
  const seenRequests = new Set()
  return async ({ body, headers, method, url }) => {
    if (!validAuthority(trustedAuthority)) return { accepted: false, reason: 'stale_request_authority' }
    const immutableBody = Buffer.from(body)
    const requestHash = sha256(immutableBody)
    const validation = validateResponseRequest({
      body: immutableBody,
      expectedTools: trustedTools,
      headers,
      method,
      url,
    })
    if (!validation.accepted)
      return {
        accepted: false,
        observedTools: validation.observedTools ?? null,
        reason: validation.reason,
        requestHash,
        upstreamBody: null,
      }
    const binding = Object.freeze({
      ...trustedAuthority,
      profileDigest: trustedAuthority.profileDigest,
      requestHash,
      requestId: randomUUID(),
      toolsDigest: sha256(canonicalJson(trustedTools)),
    })
    const bindingKey = sha256(canonicalJson({ ...trustedAuthority, requestHash, toolsDigest: binding.toolsDigest }))
    if (seenRequests.has(bindingKey))
      return { accepted: false, reason: 'replayed_request_binding', requestHash, upstreamBody: null }
    seenRequests.add(bindingKey)
    const upstreamResult = await upstream({ body: Buffer.from(immutableBody), headers, binding })
    if (sha256(immutableBody) !== requestHash) throw new Error('Request bytes changed after gate validation.')
    return { accepted: true, binding, requestHash, upstreamBody: immutableBody, upstreamResult }
  }
}

export function validateResponseRequest({ body, expectedTools, headers = {}, method, url }) {
  if (method !== 'POST') return { accepted: false, reason: 'method_rejected' }
  if (new URL(url, 'http://127.0.0.1').pathname !== '/v1/responses') return { accepted: false, reason: 'path_rejected' }
  if (typeof headers.authorization !== 'string' || !/^Bearer\s+\S+$/.test(headers.authorization))
    return { accepted: false, reason: 'authorization_rejected' }
  if (
    !String(headers['content-type'] ?? '')
      .toLowerCase()
      .includes('application/json')
  )
    return { accepted: false, reason: 'content_type_rejected' }
  let parsed
  try {
    parsed = JSON.parse(Buffer.from(body).toString('utf8'))
  } catch {
    return { accepted: false, reason: 'json_rejected' }
  }
  const observedTools = Array.isArray(parsed?.tools) ? sanitizeWireTools(parsed.tools) : null
  if (parsed?.model !== P0_R2D_MODEL) return { accepted: false, observedTools, reason: 'model_rejected' }
  if (!Array.isArray(parsed?.tools)) return { accepted: false, observedTools, reason: 'tools_rejected' }
  if (canonicalJson(parsed.tools) !== canonicalJson(expectedTools))
    return { accepted: false, observedTools, reason: 'tools_rejected' }
  return { accepted: true, parsed }
}

export async function collectBoundedBody(stream, maxBytes = 128_000) {
  const chunks = []
  let length = 0
  for await (const chunk of stream) {
    length += chunk.length
    if (length > maxBytes) throw new Error('body_size_limit')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function validateBufferedSse({
  body,
  binding,
  profile,
  now = Date.now(),
  maxBytes = 128_000,
  validateArguments = validateArgumentsCanonical,
}) {
  if (!Buffer.isBuffer(body) || body.length === 0 || body.length > maxBytes)
    return { accepted: false, reason: 'sse_size_rejected' }
  if (!binding || binding.profileDigest !== profile.contractDigest || binding.expiresAt <= now)
    return { accepted: false, reason: 'stale_response_binding' }
  if (!body.toString('utf8').endsWith('\n\n')) return { accepted: false, reason: 'partial_sse' }
  const frames = body.toString('utf8').split('\n\n').filter(Boolean)
  const calls = new Map()
  let completed = false
  let responseId = null
  let completedCalls = []
  for (const frame of frames) {
    if (frame.split('\n').length !== 2) return { accepted: false, reason: 'malformed_sse' }
    const event = frame.match(/^event:\s*(.+)$/m)?.[1]
    const encoded = frame.match(/^data:\s*(.+)$/m)?.[1]
    if (!event || !encoded) return { accepted: false, reason: 'malformed_sse' }
    let data
    try {
      data = JSON.parse(encoded)
    } catch {
      return { accepted: false, reason: 'malformed_sse' }
    }
    if (
      !['response.created', 'response.output_item.added', 'response.output_item.done', 'response.completed'].includes(
        event,
      )
    )
      return { accepted: false, reason: 'unsupported_sse_event' }
    if (data?.type !== event) return { accepted: false, reason: 'sse_event_type_mismatch' }
    if (completed) return { accepted: false, reason: 'event_after_completed' }
    if (event === 'response.created' || event === 'response.completed') {
      const id = data?.response?.id
      if (typeof id !== 'string' || !id || (responseId !== null && id !== responseId))
        return { accepted: false, reason: 'response_identity_mismatch' }
      responseId = id
    }
    const item = data?.item
    if (item && item.type !== 'function_call') return { accepted: false, reason: 'unsupported_output_item' }
    if (item?.type === 'function_call') {
      const checked = await validateFunctionCall(item, profile, validateArguments)
      if (!checked.accepted) return checked
      const known = calls.get(item.call_id)
      if (known && canonicalJson(known) !== canonicalJson(item)) return { accepted: false, reason: 'replayed_call_id' }
      calls.set(item.call_id, item)
    }
    if (event === 'response.completed') {
      if (completed || data?.response?.status !== 'completed') return { accepted: false, reason: 'malformed_sse' }
      completed = true
      if (!Array.isArray(data?.response?.output)) return { accepted: false, reason: 'malformed_sse' }
      const completedIds = new Set()
      for (const item of data.response.output) {
        if (completedIds.has(item.call_id)) return { accepted: false, reason: 'replayed_call_id' }
        completedIds.add(item.call_id)
        if (item?.type !== 'function_call') return { accepted: false, reason: 'unsupported_output_item' }
        const checked = await validateFunctionCall(item, profile, validateArguments)
        if (!checked.accepted) return checked
        const known = calls.get(item.call_id)
        if (known && canonicalJson(known) !== canonicalJson(item))
          return { accepted: false, reason: 'replayed_call_id' }
        calls.set(item.call_id, item)
      }
      if ([...calls.keys()].some(id => !completedIds.has(id)))
        return { accepted: false, reason: 'incomplete_response_calls' }
      completedCalls = data.response.output
    }
  }
  if (!completed) return { accepted: false, reason: 'partial_sse' }
  return { accepted: true, calls: completedCalls }
}

export async function validateFunctionCall(item, profile, validateArguments = validateArgumentsCanonical) {
  if (!item || typeof item.call_id !== 'string' || !item.call_id || typeof item.name !== 'string')
    return { accepted: false, reason: 'malformed_function_call' }
  const tool = profile.tools.find(candidate => candidate.name === item.name)
  if (!tool) return { accepted: false, reason: 'forbidden_function_call' }
  let args
  try {
    args = JSON.parse(item.arguments)
  } catch {
    return { accepted: false, reason: 'malformed_function_arguments' }
  }
  if (!(await validateArguments(tool.name, args, profile.contractDigest)))
    return { accepted: false, reason: 'invalid_function_arguments' }
  return { accepted: true }
}

export async function validateArgumentsCanonical(
  toolName,
  argumentsValue,
  profileDigest,
  { bridge = P0_R2D_BRIDGE } = {},
) {
  const encoded = Buffer.from(JSON.stringify(argumentsValue)).toString('base64url')
  const { stdout } = await execFile(process.execPath, ['--import', 'tsx', bridge, 'validate', toolName, encoded], {
    maxBuffer: 100_000,
  })
  const result = JSON.parse(stdout)
  return result.accepted === true && result.profileDigest === profileDigest
}

export function registerReleasedCalls({ calls, binding, releasedCalls, seenCallIds }) {
  if (calls.some(call => seenCallIds.has(call.call_id))) return { accepted: false, reason: 'replayed_response_call' }
  for (const call of calls) {
    seenCallIds.add(call.call_id)
    releasedCalls.set(call.call_id, { ...call, originBinding: binding })
  }
  return { accepted: true }
}

export function consumeReleasedCall({ params, authority, binding, releasedCalls, now = Date.now() }) {
  if (
    !binding ||
    binding.expiresAt <= now ||
    ['attemptId', 'profileDigest', 'threadId', 'turnId'].some(key => binding[key] !== authority[key])
  )
    return { accepted: false, reason: 'callback_binding_mismatch' }
  if (params?.threadId !== authority.threadId || params?.turnId !== authority.turnId)
    return { accepted: false, reason: 'callback_scope_mismatch' }
  const call = releasedCalls.get(params?.callId)
  if (
    !call ||
    (call.originBinding && canonicalJson(call.originBinding) !== canonicalJson(binding)) ||
    params?.namespace != null ||
    call.name !== params?.tool ||
    canonicalJson(JSON.parse(call.arguments)) !== canonicalJson(params?.arguments)
  )
    return { accepted: false, reason: 'callback_not_released' }
  // Consume synchronously before the first await: duplicate delivery cannot invoke two effects.
  releasedCalls.delete(params.callId)
  return { accepted: true }
}

export function evaluateInterlockResults(receipts, profile) {
  const byArm = new Map(receipts.map(receipt => [receipt.result.arm, receipt.result]))
  const allowed = byArm.get('allowed')
  const rejectedRequest = byArm.get('request-rejection')
  const rejectedResponse = byArm.get('response-rejection')
  const findings = []
  const exact = (a, b) => canonicalJson(a) === canonicalJson(b)
  if (receipts.length !== 3 || byArm.size !== 3) findings.push('arm_set_invalid')
  if (
    !allowed ||
    allowed.error ||
    allowed.dispatchCount !== 1 ||
    allowed.upstreamCount !== 2 ||
    allowed.forwardedRequests.length !== 2 ||
    allowed.brokerReceiptDigests.length !== 1 ||
    allowed.requestRejections.length !== 0 ||
    allowed.responseRejections.length !== 0
  )
    findings.push('allowed_path_failed')
  if (
    !rejectedRequest ||
    rejectedRequest.error ||
    rejectedRequest.dispatchCount !== 0 ||
    rejectedRequest.upstreamCount !== 0 ||
    !exact(rejectedRequest.requestRejections, ['tools_rejected']) ||
    !exact(rejectedRequest.responseRejections, []) ||
    !exact(rejectedRequest.requestDiagnostics, [projectResponsesTools(profile)])
  )
    findings.push('request_interlock_failed')
  if (
    !rejectedResponse ||
    rejectedResponse.error ||
    rejectedResponse.upstreamCount !== 1 ||
    rejectedResponse.forwardedRequests.length !== 1 ||
    rejectedResponse.dispatchCount !== 0 ||
    !exact(rejectedResponse.responseRejections, ['forbidden_function_call']) ||
    !exact(rejectedResponse.requestRejections, [])
  )
    findings.push('response_interlock_failed')
  if (receipts.some(receipt => receipt.result.cleanup.survivingProcessCount !== 0 || !receipt.result.cleanup.confirmed))
    findings.push('cleanup_failed')
  if (receipts.some(receipt => receipt.result.resolved.mcpNames.length !== 0)) findings.push('mcp_present')
  if (receipts.some(receipt => receipt.result.canary?.denied !== true)) findings.push('seatbelt_canary_failed')
  if (
    receipts.some(receipt =>
      receipt.result.forwardedRequests.some(
        request =>
          request.gateRequestSha256 !== request.upstreamRequestSha256 ||
          request.gateByteLength !== request.upstreamByteLength,
      ),
    )
  )
    findings.push('request_bytes_changed')
  return { findings, qualified: findings.length === 0 }
}

export function sanitizedReceipt({ composition, profile, result, sourcePaths }) {
  return {
    schema: 'appraise.p0-r2d-interlock-receipt/v1',
    artifactIdentities: {
      configSha256: sha256(composition.configText),
      executableSha256: sha256(readFileSync(composition.executable)),
      profileDigest: profile.contractDigest,
      projectionSha256: sha256(canonicalJson(composition.dynamicTools)),
      sourceSha256: Object.fromEntries(sourcePaths.map(file => [path.basename(file), sha256(readFileSync(file))])),
    },
    result,
  }
}

function r2dConfig(gatePort) {
  const features = DISABLED_FEATURES.map(name => `${name} = false`).join('\n')
  return `model = "${P0_R2D_MODEL}"
model_provider = "p0-r2d-loopback"
sandbox_mode = "read-only"
approval_policy = "never"
allow_login_shell = false
web_search = "disabled"

[analytics]
enabled = false

[agents]
enabled = false

[memories]
generate_memories = false
use_memories = false

[tools.experimental_request_user_input]
enabled = false

[features]
${features}
default_mode_request_user_input = false

[model_providers.p0-r2d-loopback]
name = "P0 R2d loopback gate"
base_url = "http://127.0.0.1:${gatePort}/v1"
wire_api = "responses"
env_key = "APPRAISE_P0_R2D_FAKE_AUTH"
requires_openai_auth = false
supports_websockets = false
request_max_retries = 0
stream_max_retries = 0
`
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
  return value
}
function validAuthority(authority) {
  return (
    authority &&
    typeof authority.expiresAt === 'number' &&
    authority.expiresAt > Date.now() &&
    [
      'attemptId',
      'configSha256',
      'executableSha256',
      'processIdentity',
      'profileDigest',
      'protocol',
      'threadId',
      'turnId',
    ].every(key => typeof authority[key] === 'string' && authority[key].length > 0)
  )
}
function sanitizeWireTools(tools) {
  return tools.map(tool => {
    if (!tool || typeof tool !== 'object' || Array.isArray(tool)) return null
    const value = {}
    for (const key of ['description', 'inputSchema', 'name', 'parameters', 'strict', 'type']) {
      if (Object.hasOwn(tool, key)) value[key] = tool[key]
    }
    return value
  })
}
