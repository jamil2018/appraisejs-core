import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'

export const nativeQualificationFeatureControls = Object.freeze([
  'shell_tool',
  'apps',
  'async_compaction',
  'code_mode',
  'code_mode_only',
  'code_mode_host',
  'code_mode_prewarm',
  'goals',
  'multi_agent',
  'multi_agent_v2',
  'wake_on_agent_messages',
  'sleep_tool',
  'memories',
  'view_image',
  'hooks',
  'remote_plugin',
] as const)
type ConfigurationBinding = Readonly<{
  endpoint: Readonly<{ port: number; path: string }>
  enabledTools: readonly string[]
}>
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const criticalSchema = z
  .object({
    model: z.literal('gpt-6.1-sol'),
    model_provider: z.literal('openai'),
    model_reasoning_effort: z.literal('medium'),
    approval_policy: z.literal('never'),
    sandbox_mode: z.literal('read-only'),
    web_search: z.literal('disabled'),
    cli_auth_credentials_store: z.literal('file'),
    mcp_oauth_credentials_store: z.literal('file'),
    features: z
      .object(Object.fromEntries(nativeQualificationFeatureControls.map(key => [key, z.literal(false)])))
      .passthrough(),
    analytics: z.object({ enabled: z.literal(false) }).passthrough(),
    feedback: z.object({ enabled: z.literal(false) }).passthrough(),
    history: z.object({ persistence: z.literal('none') }).passthrough(),
  })
  .passthrough()
export function expectedNativeMcpConfiguration(binding: ConfigurationBinding, capability: string) {
  return Object.freeze({
    environment_id: 'local',
    url: `http://127.0.0.1:${binding.endpoint.port}${binding.endpoint.path}`,
    http_headers: { Authorization: `Bearer ${capability}` },
    enabled: true,
    required: true,
    enabled_tools: [...binding.enabledTools],
    tools: Object.fromEntries(binding.enabledTools.map(name => [name, { approval_mode: 'approve' }])),
    startup_timeout_sec: 10,
    tool_timeout_sec: 30,
  })
}
function populated(value: unknown): boolean {
  if (value === false || value == null || value === '') return false
  if (Array.isArray(value)) return value.some(populated)
  if (record(value)) return Object.values(value).some(populated)
  return true
}
function expectedMcp(config: Record<string, unknown>, expected: ReturnType<typeof expectedNativeMcpConfiguration>) {
  if (!record(config.mcp_servers) || !isDeepStrictEqual(Object.keys(config.mcp_servers), ['appraise_worker']))
    return false
  const server = config.mcp_servers.appraise_worker
  if (!record(server)) return false
  if (!Object.entries(expected).every(([key, value]) => isDeepStrictEqual(server[key], value))) return false
  return Object.entries(server).every(([key, value]) => Object.hasOwn(expected, key) || !populated(value))
}
const forbidden =
  /approvalmode|apikey|bearertoken|authorization|httpheaders|headers|password|secret|credential|accesstoken|refreshtoken|^(url|uri|baseurl|endpoint|endpointurl|apiendpoint|modelproviders|providers|proxy|host|command|args|notify|startupcommand|startupcommands|tools|builtintools|skills|networkaccess)$|hooks?|plugins?|capabilities/gi
function unsafeConfigurationFields(value: unknown, prefix = '', fields = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((nested, index) => unsafeConfigurationFields(nested, `${prefix}.${index}`, fields))
    return fields
  }
  if (!record(value)) return fields
  for (const [key, nested] of Object.entries(value)) {
    const location = prefix ? `${prefix}.${key}` : key
    // These exact slots were compared privately against the captured connector before this scan.
    if (
      [
        'cli_auth_credentials_store',
        'mcp_oauth_credentials_store',
        'mcp_servers.appraise_worker.tools',
        'mcp_servers.appraise_worker.url',
        'mcp_servers.appraise_worker.http_headers',
        'mcp_servers.appraise_worker.enabled_tools',
      ].includes(location)
    )
      continue
    if (populated(nested)) {
      // Every match is a fixed regex alternative, never the caller's full key, location, or value.
      for (const match of key.replace(/[_-]/g, '').matchAll(forbidden)) fields.add(match[0].toLowerCase())
    }
    unsafeConfigurationFields(nested, location, fields)
  }
  return fields
}
export type NativeConfigurationInspection = Readonly<{
  valid: boolean
  reason:
    | 'NONE'
    | 'CONFIGURATION_RESPONSE_INVALID'
    | 'PUBLIC_CONTROLS_UNVERIFIED'
    | 'FEATURE_CONTROL_UNVERIFIED'
    | 'FILE_CREDENTIAL_BACKEND_UNVERIFIED'
    | 'MCP_OAUTH_BACKEND_UNVERIFIED'
    | 'MCP_CONNECTOR_UNVERIFIED'
    | 'MCP_TOOL_APPROVAL_SCOPE_MISMATCH'
    | 'UNEXPECTED_ACTIVE_CONFIGURATION'
  feature?: (typeof nativeQualificationFeatureControls)[number]
  fields?: readonly string[]
}>
function inspectRequiredControls(config: Record<string, unknown>): NativeConfigurationInspection | null {
  if (config.cli_auth_credentials_store !== 'file')
    return { valid: false, reason: 'FILE_CREDENTIAL_BACKEND_UNVERIFIED' }
  if (config.mcp_oauth_credentials_store !== 'file') return { valid: false, reason: 'MCP_OAUTH_BACKEND_UNVERIFIED' }
  if (!record(config.features)) return { valid: false, reason: 'FEATURE_CONTROL_UNVERIFIED' }
  const features = config.features
  const feature = nativeQualificationFeatureControls.find(key => features[key] !== false)
  return feature ? { valid: false, reason: 'FEATURE_CONTROL_UNVERIFIED', feature } : null
}
function inspectConnector(
  config: Record<string, unknown>,
  expected: ReturnType<typeof expectedNativeMcpConfiguration>,
): NativeConfigurationInspection | null {
  if (
    record(config.mcp_servers) &&
    record(config.mcp_servers.appraise_worker) &&
    !isDeepStrictEqual(config.mcp_servers.appraise_worker.tools, expected.tools)
  )
    return { valid: false, reason: 'MCP_TOOL_APPROVAL_SCOPE_MISMATCH' }
  return expectedMcp(config, expected) ? null : { valid: false, reason: 'MCP_CONNECTOR_UNVERIFIED' }
}
/** Inspect only. No raw response values, credential slots or credential-byte hashes are retained. */
export function inspectNativeQualificationConfiguration(
  value: unknown,
  binding: ConfigurationBinding,
  capability: string,
): NativeConfigurationInspection {
  if (!record(value) || !record(value.config)) return { valid: false, reason: 'CONFIGURATION_RESPONSE_INVALID' }
  const config = value.config
  const controls = inspectRequiredControls(config)
  if (controls) return controls
  const connector = inspectConnector(config, expectedNativeMcpConfiguration(binding, capability))
  if (connector) return connector
  const fields = [...unsafeConfigurationFields(config)].sort()
  if (fields.length) return { valid: false, reason: 'UNEXPECTED_ACTIVE_CONFIGURATION', fields }
  const critical = criticalSchema.safeParse(config)
  if (!critical.success || !Object.values(critical.data.features).every(flag => flag === false))
    return { valid: false, reason: 'PUBLIC_CONTROLS_UNVERIFIED' }
  return { valid: true, reason: 'NONE' }
}
export function verifyNativeQualificationConfiguration(
  value: unknown,
  binding: ConfigurationBinding,
  capability: string,
) {
  return inspectNativeQualificationConfiguration(value, binding, capability).valid
}
