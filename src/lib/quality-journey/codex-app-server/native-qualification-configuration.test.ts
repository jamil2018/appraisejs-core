import { describe, expect, it } from 'vitest'
import {
  expectedNativeMcpConfiguration,
  inspectNativeQualificationConfiguration,
  nativeQualificationFeatureControls,
  verifyNativeQualificationConfiguration,
} from './native-qualification-configuration'

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
