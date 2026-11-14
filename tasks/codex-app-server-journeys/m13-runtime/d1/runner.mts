import { hasValue } from '../runtime-common.mts'
import { manifestCli } from '../runtime-common.mts'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { casePaths, verifyEffectiveConfig, CONFIGURATION_REASONS } from '../b1/runner.mts'
import { B1Transport, loadValidators, SERVER_NAME } from '../b1/transport.mjs'
import {
  notificationInputPaths as sharedInputPaths,
  loadNotificationMethods,
  notificationDiagnosticEvent as methodDiagnosticEvent,
} from '../d0/runner.mts'
import { isDeepStrictEqual } from 'node:util'

import {
  readDiagnosticConfiguration,
  object,
  diagnosticCommonPath,
  runOwnedDiagnostic,
  diagnosticResult,
  verifyDiagnosticManifest,
} from '../diagnostic-common.mts'
const sourcePath = fileURLToPath(import.meta.url)
type ValueType = 'absent' | 'null' | 'array' | 'object' | 'string' | 'number' | 'boolean' | 'other'
type FieldFact = { present: boolean; type: ValueType; matchExpected: boolean }
type PublicFieldFact = FieldFact & { enumTag: 'EXPECTED' | 'NULL' | 'OTHER' | 'ABSENT' }
type Violation = {
  category: 'CREDENTIAL_VALUE' | 'ENDPOINT_OVERRIDE' | 'STARTUP_COMMAND' | 'HOOK_PLUGIN' | 'CAPABILITY'
  path: string[]
  type: ValueType
  nonempty: true
}
export type ConfigFacts = ReturnType<typeof projectConfigFacts>
const credentials = ['apikey', 'openaiapikey', 'bearertoken', 'authorization', 'httpheaders', 'experimentalbearertoken']
const endpoints = ['url', 'baseurl', 'endpoint', 'endpointurl', 'apiendpoint', 'modelproviders', 'bearertokenenvvar']
const startup = ['command', 'args', 'notify', 'startupcommand', 'startupcommands']
const staticKeys = new Set([
  'model',
  'model_reasoning_effort',
  'approval_policy',
  'sandbox_mode',
  'analytics',
  'enabled',
  'cli_auth_credentials_store',
  'mcp_servers',
  SERVER_NAME,
  'command',
  'args',
  'env',
  'env_vars',
  'required',
  'startup_timeout_sec',
  'enabled_tools',
  'model_provider',
])
const staticNormalized = new Set([...credentials, ...endpoints, ...startup])
function valueType(value: unknown, present = true): ValueType {
  if (!present) return 'absent'
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (object(value)) return 'object'
  const type = typeof value
  return ['string', 'number', 'boolean'].includes(type) ? (type as ValueType) : 'other'
}
function fieldFact(container: Record<string, unknown> | undefined, key: string, expected: unknown): FieldFact {
  const present = !!container && Object.hasOwn(container, key)
  const value = container?.[key]
  return { present, type: valueType(value, present), matchExpected: present && isDeepStrictEqual(value, expected) }
}
function featurePathKey(key: string, prefix: string[]) {
  if (prefix.length === 0 && key === 'features') return key
  if (prefix.length === 1 && prefix[0] === 'features' && ['hooks', 'remote_plugin', 'plugins'].includes(key)) return key
}
function safeKey(key: string, prefix: string[]): string {
  const featureKey = featurePathKey(key, prefix)
  if (featureKey) return featureKey
  if (staticKeys.has(key)) return key
  const normalized = key.replace(/[_-]/g, '').toLowerCase()
  if (staticNormalized.has(normalized)) return normalized
  if (/hooks?|plugins?/i.test(normalized)) return 'HOOK_PLUGIN_KEY'
  if (/capabilities/i.test(key)) return 'CAPABILITY_KEY'
  return 'OTHER_KEY'
}
function criticalFacts(config: Record<string, unknown> | undefined) {
  const critical: Record<string, PublicFieldFact> = {}
  for (const [key, expected] of Object.entries({
    model: 'gpt-6.1-sol',
    model_reasoning_effort: 'medium',
    approval_policy: 'never',
    sandbox_mode: 'read-only',
  })) {
    const fact = fieldFact(config, key, expected)
    critical[key] = {
      ...fact,
      enumTag: !fact.present ? 'ABSENT' : fact.type === 'null' ? 'NULL' : fact.matchExpected ? 'EXPECTED' : 'OTHER',
    }
  }
  return critical
}
function containerField(config: Record<string, unknown> | undefined, key: string) {
  const present = !!config && Object.hasOwn(config, key)
  const value = config?.[key]
  return { present, type: valueType(value, present) }
}
function analyticsFacts(config: Record<string, unknown> | undefined) {
  const analytics = object(config?.analytics) ? config.analytics : undefined
  const enabled = fieldFact(analytics, 'enabled', false)
  return {
    ...containerField(config, 'analytics'),
    enabled: { ...enabled, boolean: typeof analytics?.enabled === 'boolean' ? analytics.enabled : null },
  }
}
function featureFacts(config: Record<string, unknown> | undefined) {
  const features = object(config?.features) ? config.features : undefined
  const featureFact = (key: string) => {
    const { present, type, matchExpected } = fieldFact(features, key, false)
    return { present, type, matchExpectedFalse: matchExpected }
  }
  const plugins = fieldFact(features, 'plugins', false)
  return {
    ...containerField(config, 'features'),
    hooks: featureFact('hooks'),
    remote_plugin: featureFact('remote_plugin'),
    plugins: {
      present: plugins.present,
      type: plugins.type,
      booleanTag: !plugins.present
        ? 'ABSENT'
        : features?.plugins === false
          ? 'FALSE'
          : features?.plugins === true
            ? 'TRUE'
            : 'OTHER',
    },
  }
}
function providerFacts(config: Record<string, unknown> | undefined) {
  return {
    ...containerField(config, 'model_provider'),
    matchExpected: config?.model_provider == null || config.model_provider === 'openai',
    enumTag:
      !config || !Object.hasOwn(config, 'model_provider')
        ? 'ABSENT'
        : config.model_provider == null
          ? 'NULL'
          : config.model_provider === 'openai'
            ? 'EXPECTED'
            : 'OTHER',
  }
}
function mcpFacts(config: Record<string, unknown> | undefined, root: string) {
  const serversValue = config?.mcp_servers
  const servers = object(serversValue) ? serversValue : undefined
  const serverValue = servers?.[SERVER_NAME]
  const server = object(serverValue) ? serverValue : undefined
  const expectedFields = {
    command: realpathSync(process.execPath),
    args: [fileURLToPath(new URL('../b1/fixture.mjs', import.meta.url)), 'healthy', casePaths(root, 'healthy').journal],
    env: {},
    env_vars: [],
    enabled: true,
    required: true,
    startup_timeout_sec: 5,
    enabled_tools: ['fixture_observe'],
  }
  const serverFields: Record<string, FieldFact> = {}
  for (const [key, expected] of Object.entries(expectedFields)) serverFields[key] = fieldFact(server, key, expected)
  const expectedServerPresent = !!servers && Object.hasOwn(servers, SERVER_NAME)
  return {
    ...containerField(config, 'mcp_servers'),
    serverCount: servers ? Object.keys(servers).length : null,
    expectedServerPresent,
    onlyExpectedServer: expectedServerPresent && Object.keys(servers!).length === 1,
    expectedServerType: valueType(serverValue, expectedServerPresent),
    fields: serverFields,
  }
}
function violationCategories(key: string, value: unknown, path: string[]) {
  const normalized = key.replace(/[_-]/g, '').toLowerCase()
  if (!hasValue(value)) return []
  const matched: Violation['category'][] = []
  if (credentials.includes(normalized)) matched.push('CREDENTIAL_VALUE')
  if (endpoints.includes(normalized)) matched.push('ENDPOINT_OVERRIDE')
  const expectedCommand = [`mcp_servers.${SERVER_NAME}.command`, `mcp_servers.${SERVER_NAME}.args`].includes(
    path.join('.'),
  )
  if (!expectedCommand && startup.includes(normalized)) matched.push('STARTUP_COMMAND')
  if (/hooks?|plugins?/i.test(normalized)) matched.push('HOOK_PLUGIN')
  if (/capabilities/i.test(key)) matched.push('CAPABILITY')
  return matched
}
function appendViolations(violations: Violation[], matched: Violation['category'][], path: string[], value: unknown) {
  for (const category of matched) {
    if (violations.length >= 256) {
      return false
    }
    violations.push({
      category,
      path: path.map((key, index) => safeKey(key, path.slice(0, index))),
      type: valueType(value),
      nonempty: true,
    })
  }
  return true
}
type ScanNode = { value: Record<string, unknown>; path: string[] }
/** Bounded depth-first traversal; field counting and path projection are independent responsibilities. */
class ConfigScan {
  readonly violations: Violation[] = []
  readonly pending: ScanNode[] = []
  readonly seen = new WeakSet<object>()
  scannedFields = 0
  scanComplete = true
  scanField(key: string, value: unknown, parent: string[]) {
    if (++this.scannedFields > 8192) {
      this.scanComplete = false
      this.pending.length = 0
      return false
    }
    const path = [...parent, key]
    if (path.join('.') === 'cli_auth_credentials_store') return true
    const matched = violationCategories(key, value, path)
    if (!appendViolations(this.violations, matched, path, value)) this.scanComplete = false
    if (object(value)) this.pending.push({ value, path })
    return true
  }
  scanNode(current: ScanNode) {
    if (this.seen.has(current.value)) {
      this.scanComplete = false
      return
    }
    this.seen.add(current.value)
    if (current.path.length > 48) {
      this.scanComplete = false
      return
    }
    for (const [key, value] of Object.entries(current.value)) {
      if (!this.scanField(key, value, current.path)) break
    }
  }
}
function scanConfig(config: Record<string, unknown> | undefined) {
  const scan = new ConfigScan()
  if (config) scan.pending.push({ value: config, path: [] })
  while (scan.pending.length) scan.scanNode(scan.pending.pop()!)
  return {
    genericViolations: scan.violations,
    scanComplete: scan.scanComplete,
    scannedFields: Math.min(scan.scannedFields, 8192),
  }
}
/** Every retained string is static source vocabulary. Values, unknown key names, and payload hashes are excluded. */
export function projectConfigFacts(response: unknown, root: string) {
  const responseObject = object(response)
  const configPresent = responseObject && Object.hasOwn(response, 'config')
  const configValue = responseObject ? response.config : undefined
  const config = object(configValue) ? configValue : undefined
  return {
    responseObject,
    configPresent,
    configType: valueType(configValue, configPresent),
    critical: criticalFacts(config),
    analytics: analyticsFacts(config),
    features: featureFacts(config),
    credentialStore: fieldFact(config, 'cli_auth_credentials_store', 'ephemeral'),
    mcp: mcpFacts(config, root),
    provider: providerFacts(config),
    ...scanConfig(config),
  }
}
export function configurationReason(error: unknown): string {
  if (
    object(error) &&
    typeof error.configurationReason === 'string' &&
    (CONFIGURATION_REASONS as readonly string[]).includes(error.configurationReason)
  )
    return error.configurationReason
  return 'NOT_REPORTED'
}
export function configurationInputPaths(schemaRoot: string) {
  return [...new Set([...sharedInputPaths(schemaRoot), diagnosticCommonPath, sourcePath])]
}
export function configurationDiagnosticEvent(value: unknown, methods: Set<string>) {
  if (
    object(value) &&
    value.category === 'remote_control_disabled' &&
    Number.isSafeInteger(value.count) &&
    Number(value.count) >= 1 &&
    Number(value.count) <= 32
  )
    return { category: 'remote_control_disabled' as const, count: Number(value.count) }
  return methodDiagnosticEvent(value, methods)
}
/** This diagnostic has no thread/status/account/model/turn/tool method in its callable protocol surface. */
export async function runConfigurationDiagnosticProtocol(
  client: Pick<B1Transport, 'initialize' | 'configRead' | 'assertHealthy'>,
  root: string,
  observeFacts: (facts: ConfigFacts) => void = () => {},
) {
  const config = await readDiagnosticConfiguration(client, root)
  observeFacts(projectConfigFacts(config, root))
  client.assertHealthy()
  verifyEffectiveConfig(config, root, 'healthy')
}

/** One additive cause-observation allocation. Importing source never reserves or launches a process. */
async function runDiagnostic(manifestPath: string, manifestSha256: string) {
  const manifest = verifyDiagnosticManifest(manifestPath, manifestSha256, 'd1', configurationInputPaths)
  const validate = loadValidators(manifest.schemaRoot)
  const methods = loadNotificationMethods(manifest.schemaRoot)
  let configFacts: ConfigFacts | undefined
  let firstConfigurationFailure = 'NOT_REPORTED'
  const state = await runOwnedDiagnostic(manifest, manifestSha256, {
    validate,
    selectEvent: value => configurationDiagnosticEvent(value, methods),
    protocol: (client, record) =>
      runConfigurationDiagnosticProtocol(client, manifest.freshRoot, facts => {
        configFacts = facts
        record({ category: 'configuration_facts', facts })
      }),
    stopped: error => {
      firstConfigurationFailure = configurationReason(error)
      return { firstConfigurationFailure }
    },
  })
  const { record, physicalCleanup } = state
  const result = {
    ...diagnosticResult(state),
    disposition: !physicalCleanup ? 'UNKNOWN' : configFacts ? 'CONFIGURATION_FACTS_OBSERVED' : 'NO_FACTS_OBSERVED',
    configFacts: configFacts ?? null,
    firstConfigurationFailure,
  }
  record(result)
  return result
}
manifestCli(sourcePath, runDiagnostic, result => result.disposition === 'CONFIGURATION_FACTS_OBSERVED')
