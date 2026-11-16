import { describe, expect, it } from 'vitest'
import {
  expectedNativeMcpConfiguration,
  inspectNativeQualificationConfiguration,
  nativeQualificationFeatureControls,
  verifyNativeQualificationConfiguration,
} from './native-qualification-configuration'

import {
  renderNativeQualificationConfiguration,
  type NativeQualificationManifest,
} from './native-qualification-contract'

const binding = {
  endpoint: { port: 39187, path: `/appraise-worker/${'a'.repeat(32)}` },
  enabledTools: ['quality_journey_analysis_get', 'quality_journey_analysis_submit'],
}
const capability = 'b'.repeat(64)
function configuration() {
  return {
    config: {
      model: 'gpt-6.1-sol',
      model_provider: 'openai',
      model_reasoning_effort: 'medium',
      approval_policy: 'never',
      sandbox_mode: 'read-only',
      web_search: 'disabled',
      cli_auth_credentials_store: 'file',
      mcp_oauth_credentials_store: 'file',
      features: Object.fromEntries(nativeQualificationFeatureControls.map(key => [key, false])),
      analytics: { enabled: false },
      feedback: { enabled: false },
      history: { persistence: 'none' },
      mcp_servers: { appraise_worker: structuredClone(expectedNativeMcpConfiguration(binding, capability)) },
    } as Record<string, unknown>,
  }
}
describe('native configuration inspect-only refusal', () => {
  it('requires explicit safe controls and the exact reviewed single HTTP connector without hashing raw config', () => {
    const value = configuration()
    value.config.harmless_public_default = 512
    expect(verifyNativeQualificationConfiguration(value, binding, capability)).toBe(true)
    expect(verifyNativeQualificationConfiguration(value, binding, 'c'.repeat(64))).toBe(false)
  })
  it.each([
    'api_key',
    'openai_api_key',
    'model_providers',
    'endpoint',
    'http_headers',
    'plugins',
    'hooks',
    'capabilities',
  ])('refuses unexpected nonempty %s', key => {
    const value = configuration()
    value.config[key] = { active: 'synthetic-forbidden-value' }
    expect(verifyNativeQualificationConfiguration(value, binding, capability)).toBe(false)
  })
  it.each(nativeQualificationFeatureControls)('refuses missing or enabled %s', key => {
    const value = configuration(),
      features = value.config.features as Record<string, unknown>
    delete features[key]
    expect(verifyNativeQualificationConfiguration(value, binding, capability)).toBe(false)
    features[key] = true
    expect(verifyNativeQualificationConfiguration(value, binding, capability)).toBe(false)
  })
  it('refuses foreign nested credentials, unexpected active features and extra MCP servers', () => {
    const value = configuration()
    value.config.other_defaults = [{ innocent: { api_key: 'synthetic' } }]
    expect(verifyNativeQualificationConfiguration(value, binding, capability)).toBe(false)
    delete value.config.other_defaults
    ;(value.config.features as Record<string, unknown>).unknown_tool = true
    expect(verifyNativeQualificationConfiguration(value, binding, capability)).toBe(false)
    delete (value.config.features as Record<string, unknown>).unknown_tool
    ;(value.config.mcp_servers as Record<string, unknown>).foreign = { enabled: true }
    expect(verifyNativeQualificationConfiguration(value, binding, capability)).toBe(false)
  })
  it('refuses header drift and foreign server commands even when the native fields have the expected values', () => {
    const value = configuration(),
      server = (value.config.mcp_servers as Record<string, Record<string, unknown>>).appraise_worker
    ;(server.http_headers as Record<string, unknown>).Extra = 'synthetic'
    expect(verifyNativeQualificationConfiguration(value, binding, capability)).toBe(false)
    delete (server.http_headers as Record<string, unknown>).Extra
    server.command = '/foreign/command'
    expect(verifyNativeQualificationConfiguration(value, binding, capability)).toBe(false)
  })
})

describe('serialized native MCP local environment binding', () => {
  function serializedConfiguration() {
    const value = configuration()
    // Literal native connector readback; do not derive this fixture from the verifier's expected-value helper.
    value.config.mcp_servers = {
      appraise_worker: {
        environment_id: 'local',
        url: `http://127.0.0.1:${binding.endpoint.port}${binding.endpoint.path}`,
        http_headers: { Authorization: `Bearer ${capability}` },
        enabled: true,
        required: true,
        enabled_tools: ['quality_journey_analysis_get', 'quality_journey_analysis_submit'],
        tools: {
          quality_journey_analysis_get: { approval_mode: 'approve' },
          quality_journey_analysis_submit: { approval_mode: 'approve' },
        },
        startup_timeout_sec: 10,
        tool_timeout_sec: 30,
      },
    }
    return value
  }
  it('accepts the serialized local connector with exact native tool approval and closed controls', () => {
    expect(inspectNativeQualificationConfiguration(serializedConfiguration(), binding, capability)).toEqual({
      valid: true,
      reason: 'NONE',
    })
  })
  it.each([undefined, null, 'remote', 'local-other', '', false])(
    'refuses absent or nonlocal environment_id %j',
    environment => {
      const value = serializedConfiguration()
      const server = (value.config.mcp_servers as Record<string, Record<string, unknown>>).appraise_worker
      if (environment === undefined) delete server.environment_id
      else server.environment_id = environment
      expect(inspectNativeQualificationConfiguration(value, binding, capability)).toEqual({
        valid: false,
        reason: 'MCP_CONNECTOR_UNVERIFIED',
      })
    },
  )
  it('renders the exact local environment explicitly once in the reviewed connector section', () => {
    const rendered = renderNativeQualificationConfiguration(binding as NativeQualificationManifest, capability)
    expect(rendered).toContain('[mcp_servers.appraise_worker]\nenvironment_id = "local"\n')
    expect(rendered.split('\n').filter(line => line === 'environment_id = "local"')).toHaveLength(1)
  })
})

describe('explicit MCP native prompt policy and sanitized refusal metadata', () => {
  it.each(['missing', 'wrong', 'extra'] as const)('refuses %s native per-tool approval scope', mode => {
    const value = configuration(),
      servers = value.config.mcp_servers as Record<string, Record<string, unknown>>
    const tools = servers.appraise_worker.tools as Record<string, Record<string, unknown>>
    if (mode === 'missing') delete tools.quality_journey_analysis_get
    if (mode === 'wrong') tools.quality_journey_analysis_get.approval_mode = 'auto'
    if (mode === 'extra') tools.foreign_tool = { approval_mode: 'approve' }
    expect(inspectNativeQualificationConfiguration(value, binding, capability)).toEqual({
      valid: false,
      reason: 'MCP_TOOL_APPROVAL_SCOPE_MISMATCH',
    })
  })
  it('requires a file-only MCP OAuth backend and retains only finite safe refusal reasons', () => {
    const value = configuration()
    delete value.config.mcp_oauth_credentials_store
    expect(inspectNativeQualificationConfiguration(value, binding, capability)).toEqual({
      valid: false,
      reason: 'MCP_OAUTH_BACKEND_UNVERIFIED',
    })
    value.config.mcp_oauth_credentials_store = 'file'
    ;(value.config.features as Record<string, unknown>).sleep_tool = true
    expect(inspectNativeQualificationConfiguration(value, binding, capability)).toEqual({
      valid: false,
      reason: 'FEATURE_CONTROL_UNVERIFIED',
      feature: 'sleep_tool',
    })
  })
  it('never broadens approval to an entire server or global unlisted tools', () => {
    const value = configuration(),
      servers = value.config.mcp_servers as Record<string, Record<string, unknown>>
    servers.appraise_worker.default_tools_approval_mode = 'approve'
    expect(verifyNativeQualificationConfiguration(value, binding, capability)).toBe(false)
  })
})

describe('current-native code-mode producer closure', () => {
  const controls = ['code_mode_only', 'code_mode_host', 'code_mode_prewarm'] as const
  it('renders each new explicit false control exactly once in the captured configuration', () => {
    const rendered = renderNativeQualificationConfiguration(binding as NativeQualificationManifest, capability)
    for (const key of controls) expect(rendered.split('\n').filter(line => line === `${key} = false`)).toHaveLength(1)
    expect(rendered).not.toMatch(/responses_websockets|supports_websockets|model_providers/)
  })
  it.each(controls)('refuses structured %s even when its enabled member is false', key => {
    const value = configuration()
    ;(value.config.features as Record<string, unknown>)[key] = { enabled: false }
    expect(inspectNativeQualificationConfiguration(value, binding, capability)).toEqual({
      valid: false,
      reason: 'FEATURE_CONTROL_UNVERIFIED',
      feature: key,
    })
  })
  it.each([true, false])('refuses code_mode_host options with disable_in_process_fallback=%s', fallback => {
    const value = configuration()
    ;(value.config.features as Record<string, unknown>).code_mode_host = {
      enabled: false,
      disable_in_process_fallback: fallback,
    }
    expect(verifyNativeQualificationConfiguration(value, binding, capability)).toBe(false)
  })
  it.each(controls)('rechecks %s after an accepted readback instead of retaining acceptance', key => {
    const value = configuration()
    expect(verifyNativeQualificationConfiguration(value, binding, capability)).toBe(true)
    ;(value.config.features as Record<string, unknown>)[key] = true
    expect(verifyNativeQualificationConfiguration(value, binding, capability)).toBe(false)
  })
})
