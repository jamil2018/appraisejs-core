import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const DYNAMIC_TOOL_NAME = 'appraise_dynamic_probe'
export const DYNAMIC_TOOL_SCHEMA = Object.freeze({
  additionalProperties: false,
  properties: { probe: { type: 'string' } },
  required: ['probe'],
  type: 'object',
})

export const DISABLED_FEATURES = Object.freeze([
  'apps',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'computer_use',
  'goals',
  'hooks',
  'image_generation',
  'memories',
  'multi_agent',
  'plugin_sharing',
  'plugins',
  'remote_plugin',
  'shell_tool',
  'skill_mcp_dependency_install',
  'skill_search',
  'sleep_tool',
  'unified_exec',
  'view_image',
  'workspace_dependencies',
])

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

export function dynamicTool() {
  return {
    description: 'Synthetic account-free dynamic-tool probe. Return the probe unchanged.',
    inputSchema: DYNAMIC_TOOL_SCHEMA,
    name: DYNAMIC_TOOL_NAME,
    type: 'function',
  }
}

export function composeDynamicToolsLaunch({ executable, port, arm, root } = {}) {
  if (!path.isAbsolute(executable)) throw new Error('An absolute App Server executable is required.')
  if (!Number.isInteger(port) || port < 1) throw new Error('A loopback listener port is required.')
  if (!['empty', 'one-strict'].includes(arm)) throw new Error(`Unsupported dynamic-tools arm: ${arm}`)
  const launchRoot = root ?? mkdtempSync(path.join(tmpdir(), 'appraise-p0-r2c-'))
  const stateRoot = path.join(launchRoot, 'state')
  const workingDirectory = path.join(launchRoot, 'workspace')
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 })
  mkdirSync(workingDirectory, { recursive: true, mode: 0o700 })
  const dynamicTools = arm === 'empty' ? [] : [dynamicTool()]
  const configText = configFor({ port })
  const configPath = path.join(stateRoot, 'config.toml')
  writeFileSync(configPath, configText, { encoding: 'utf8', mode: 0o600 })
  return {
    args: ['app-server', '--stdio', '--strict-config'],
    configPath,
    configText,
    dynamicTools,
    environment: {
      APPRAISE_P0_R2C_FAKE_AUTH: 'present-but-never-retained',
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
      baseInstructions: 'Account-free dynamic-tools experiment. Never use undeclared capabilities.',
      cwd: workingDirectory,
      developerInstructions: '',
      dynamicTools,
      ephemeral: true,
      model: 'p0-r2c-loopback-model',
      modelProvider: 'p0-r2c-loopback',
      sandbox: 'read-only',
    },
    workingDirectory,
  }
}

export function summarizeResponsesRequest(raw, headers = {}) {
  let body
  let parseValid = true
  try {
    body = JSON.parse(Buffer.from(raw).toString('utf8'))
  } catch {
    body = null
    parseValid = false
  }
  const toolsFieldPresent = Boolean(body && Object.prototype.hasOwnProperty.call(body, 'tools'))
  const toolsArrayValid = toolsFieldPresent && Array.isArray(body.tools)
  const tools = toolsArrayValid ? body.tools : []
  return {
    authorization: {
      present: typeof headers.authorization === 'string',
      scheme: typeof headers.authorization === 'string' ? headers.authorization.split(/\s+/, 1)[0] : null,
    },
    bodyBytes: Buffer.byteLength(raw),
    bodySha256: sha256(raw),
    parseValid,
    toolNames: tools.map(tool => tool?.name ?? null),
    toolsArrayValid,
    toolsFieldPresent,
    tools: tools.map(tool => ({
      definitionSha256: sha256(canonicalJson(tool)),
      name: tool?.name ?? null,
      origin: tool?.type ?? null,
      schemaHash: tool?.inputSchema
        ? sha256(canonicalJson(tool.inputSchema))
        : tool?.parameters
          ? sha256(canonicalJson(tool.parameters))
          : null,
    })),
  }
}

export function evaluateExperimentResults(results) {
  const findings = []
  if (!Array.isArray(results) || results.length !== 2) return { qualified: false, findings: ['arm_set_invalid'] }
  const byArm = new Map(results.map(result => [result?.arm, result]))
  if (byArm.size !== 2 || !byArm.has('empty') || !byArm.has('one-strict')) findings.push('arm_set_invalid')
  const empty = byArm.get('empty')
  const strict = byArm.get('one-strict')
  validateCommonArm(empty, 1, findings, 'empty')
  validateCommonArm(strict, 2, findings, 'one-strict')
  if (empty) {
    if (empty.dispatches?.length !== 0) findings.push('empty_dispatch_unexpected')
    if (!exactRequestTools(empty.requests?.[0], [])) findings.push('empty_manifest_invalid')
  }
  if (strict) {
    if (
      strict.dispatches?.length !== 1 ||
      strict.dispatches[0]?.method !== 'item/tool/call' ||
      strict.dispatches[0]?.outcome !== 'allowed_synthetic_dispatch' ||
      strict.dispatches[0]?.received?.namespace !== null ||
      strict.dispatches[0]?.received?.tool !== DYNAMIC_TOOL_NAME
    )
      findings.push('allowed_dispatch_missing')
    const strictRequests = Array.isArray(strict.requests) ? strict.requests : []
    if (!strictRequests.every(request => exactRequestTools(request, [DYNAMIC_TOOL_NAME])))
      findings.push('strict_manifest_invalid')
    const definitions = strictRequests.map(request => request?.tools?.[0])
    if (
      definitions.length !== 2 ||
      definitions.some(
        definition =>
          definition?.origin !== 'function' ||
          definition?.schemaHash !== sha256(canonicalJson(DYNAMIC_TOOL_SCHEMA)) ||
          typeof definition?.definitionSha256 !== 'string',
      ) ||
      definitions[0]?.definitionSha256 !== definitions[1]?.definitionSha256
    )
      findings.push('strict_tool_identity_invalid')
  }
  return { qualified: findings.length === 0, findings: [...new Set(findings)] }
}

export function evaluateDispatch(params, { expectedThreadId, expectedTurnId, seenCallIds = new Set() } = {}) {
  const callId = params?.callId
  if (!params || params.threadId !== expectedThreadId) return { outcome: 'rejected_cross_thread', accepted: false }
  if (params.turnId !== expectedTurnId) return { outcome: 'rejected_stale_turn', accepted: false }
  if (typeof callId !== 'string' || callId.length === 0) return { outcome: 'rejected_invalid_call_id', accepted: false }
  if (seenCallIds.has(callId)) return { outcome: 'rejected_replay', accepted: false }
  seenCallIds.add(callId)
  if (params.namespace !== null && params.namespace !== undefined)
    return { outcome: 'rejected_namespace', accepted: false }
  if (params.tool !== DYNAMIC_TOOL_NAME) return { outcome: 'rejected_unknown_tool', accepted: false }
  if (
    !params.arguments ||
    typeof params.arguments !== 'object' ||
    typeof params.arguments.probe !== 'string' ||
    Object.keys(params.arguments).length !== 1
  )
    return { outcome: 'rejected_malformed_arguments', accepted: false }
  return {
    outcome: 'allowed_synthetic_dispatch',
    accepted: true,
    contentItems: [{ type: 'inputText', text: 'synthetic-ok' }],
  }
}

function configFor({ port }) {
  const features = DISABLED_FEATURES.map(name => `${name} = false`).join('\n')
  return `model = "p0-r2c-loopback-model"
model_provider = "p0-r2c-loopback"
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

[model_providers.p0-r2c-loopback]
name = "P0 R2c non-forwarding loopback"
base_url = "http://localhost:${port}/v1"
wire_api = "responses"
env_key = "APPRAISE_P0_R2C_FAKE_AUTH"
requires_openai_auth = false
supports_websockets = false
request_max_retries = 0
stream_max_retries = 0
`
}

function validateCommonArm(result, expectedRequestCount, findings, arm) {
  if (!result || result.error) findings.push(`${arm}_runtime_error`)
  if (!result?.cleanup?.confirmed || result.cleanup.survivingProcessCount !== 0) findings.push(`${arm}_cleanup_failed`)
  if (result?.requestCount !== expectedRequestCount || result?.requests?.length !== expectedRequestCount)
    findings.push(`${arm}_request_count_invalid`)
  if (!Array.isArray(result?.resolved?.mcpNames) || result.resolved.mcpNames.length !== 0)
    findings.push(`${arm}_mcp_present`)
  if (result?.resolved?.webSearch !== 'disabled') findings.push(`${arm}_web_search_not_disabled`)
  if (typeof result?.resolved?.featureDigest !== 'string') findings.push(`${arm}_feature_evidence_missing`)
  if (
    !Array.isArray(result?.requests) ||
    result.requests.some(request => !request?.authorization?.present || request.authorization.scheme !== 'Bearer')
  )
    findings.push(`${arm}_authorization_evidence_invalid`)
}

function exactRequestTools(request, names) {
  return (
    request?.parseValid === true &&
    request?.toolsFieldPresent === true &&
    request?.toolsArrayValid === true &&
    JSON.stringify(request.toolNames) === JSON.stringify(names) &&
    request?.tools?.length === names.length
  )
}
