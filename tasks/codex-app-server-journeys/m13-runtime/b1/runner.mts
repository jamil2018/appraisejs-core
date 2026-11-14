import { privateRpcPath } from '../private-rpc.mjs'
import { closeSync, openSync, readFileSync, readSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import type { stopOwnedProcessGroup } from '../../../../src/lib/process/owned-process-stop.ts'
import { B1Refusal, B1Transport, digest, loadValidators, SCHEMA_FILES, SERVER_NAME } from './transport.mjs'

type Mode = 'healthy' | 'missing'
type Input = { path: string; sha256: string }
export type B1Manifest = {
  version: 'm13-b1/v1'
  campaignId: string
  freshRoot: string
  native: Input
  schemaRoot: string
  inputs: Input[]
  cases: [{ mode: 'healthy'; configSha256: string }, { mode: 'missing'; configSha256: string }]
}
type SafeEvent = { category: string; hash?: string; [key: string]: unknown }
const sourceDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(sourceDirectory, '../../../..')
const supervisorPath = join(repositoryRoot, 'scripts/owned-process-supervisor.mjs')
const sdkRequire = createRequire(new URL('../../../../packages/appraisejs/package.json', import.meta.url))
import {
  object,
  hasValue,
  verifyFreshRoot,
  runUntilRefused,
  OwnedAcquisition,
  withDeadline,
  runtimeCommonPath,
  sha256,
  verifyFrozenInputs,
  reserveCampaign,
  writeClosedConfig,
  writeLaunchSpent,
  closedEnvironment,
  manifestCli,
} from '../runtime-common.mts'
import type { RecordEvent } from '../runtime-common.mts'
function assert(condition: unknown, category: string): asserts condition {
  if (!condition) throw new B1Refusal(category)
}

function installedInputPaths(): string[] {
  const ajv = fileURLToPath(import.meta.resolve('ajv'))
  const sdkServer = sdkRequire.resolve('@modelcontextprotocol/sdk/server/index.js')
  const execa = fileURLToPath(import.meta.resolve('execa'))
  return [
    join(dirname(ajv), '../package.json'),
    ajv,
    join(dirname(sdkServer), '../../../package.json'),
    sdkServer,
    sdkRequire.resolve('@modelcontextprotocol/sdk/server/stdio.js'),
    sdkRequire.resolve('@modelcontextprotocol/sdk/types.js'),
    join(dirname(execa), 'package.json'),
    execa,
  ].map(path => resolve(path))
}

export function requiredInputPaths(schemaRoot: string): string[] {
  return [
    privateRpcPath,
    ...installedInputPaths(),
    runtimeCommonPath,
    ...['runner.mts', 'transport.mjs', 'fixture.mjs'].map(file => join(sourceDirectory, file)),
    ...[
      'src/lib/process/owned-process-stop.ts',
      'src/lib/process/task-spawner.ts',
      'scripts/owned-process-supervisor.mjs',
      'package.json',
      'package-lock.json',
      'packages/appraisejs/package.json',
      'packages/appraisejs/package-lock.json',
    ].map(file => join(repositoryRoot, file)),
    realpathSync(process.execPath),
    ...SCHEMA_FILES.map(file => join(schemaRoot, file)),
  ]
}

export function casePaths(campaignRoot: string, mode: Mode) {
  const root = join(campaignRoot, mode)
  return {
    root,
    home: join(root, 'home'),
    codexHome: join(root, 'codex-home'),
    tmp: join(root, 'tmp'),
    cwd: join(root, 'cwd'),
    journal: join(root, 'fixture.jsonl'),
  }
}

/** Deterministic, private B1 configuration; never reads ambient Codex configuration. */
export function renderConfig(campaignRoot: string, mode: Mode): string {
  const paths = casePaths(campaignRoot, mode)
  return [
    'model = "gpt-6.1-sol"',
    'model_reasoning_effort = "medium"',
    'cli_auth_credentials_store = "ephemeral"',
    'approval_policy = "never"',
    'sandbox_mode = "read-only"',
    '[features]',
    'hooks = false',
    'remote_plugin = false',
    '[analytics]',
    'enabled = false',
    '[feedback]',
    'enabled = false',
    '[history]',
    'persistence = "none"',
    `[mcp_servers.${SERVER_NAME}]`,
    'enabled = true',
    'required = true',
    `command = ${JSON.stringify(realpathSync(process.execPath))}`,
    `args = ${JSON.stringify([join(sourceDirectory, 'fixture.mjs'), mode, paths.journal])}`,
    'env_vars = []',
    'env = {}',
    'startup_timeout_sec = 5',
    'enabled_tools = ["fixture_observe"]',
    '',
  ].join('\n')
}

export function verifyManifest(manifestPath: string, expectedHash: string): B1Manifest {
  assert(/^[a-f0-9]{64}$/.test(expectedHash), 'manifest_hash_refused')
  const bytes = readFileSync(manifestPath)
  assert(digest(bytes) === expectedHash, 'manifest_hash_mismatch')
  const manifest = JSON.parse(bytes.toString('utf8')) as B1Manifest
  assert(manifest.version === 'm13-b1/v1', 'manifest_version_refused')
  assert(/^[a-zA-Z0-9_-]{1,80}$/.test(manifest.campaignId), 'campaign_id_refused')
  assert(
    isAbsolute(manifest.freshRoot) && isAbsolute(manifest.native.path) && isAbsolute(manifest.schemaRoot),
    'absolute_path_required',
  )
  verifyFreshRoot(manifest.freshRoot, 'b1', assert)
  assert(
    manifest.cases?.length === 2 && manifest.cases[0].mode === 'healthy' && manifest.cases[1].mode === 'missing',
    'case_manifest_refused',
  )
  const required = requiredInputPaths(manifest.schemaRoot)
  verifyFrozenInputs(manifest.inputs, required, assert, false)
  assert(
    /^[a-f0-9]{64}$/.test(manifest.native.sha256) && sha256(manifest.native.path) === manifest.native.sha256,
    'native_hash_mismatch',
  )
  for (const item of manifest.cases)
    assert(digest(renderConfig(manifest.freshRoot, item.mode)) === item.configSha256, 'config_hash_mismatch')
  return manifest
}

type JsonObject = Record<string, unknown>

export const CONFIGURATION_REASONS = Object.freeze([
  'CONFIG_RESPONSE_OR_CONFIG_NOT_OBJECT',
  'PUBLIC_MODEL_MISSING',
  'PUBLIC_MODEL_MISMATCH',
  'PUBLIC_REASONING_EFFORT_MISSING',
  'PUBLIC_REASONING_EFFORT_MISMATCH',
  'PUBLIC_APPROVAL_POLICY_MISSING',
  'PUBLIC_APPROVAL_POLICY_MISMATCH',
  'PUBLIC_SANDBOX_MODE_MISSING',
  'PUBLIC_SANDBOX_MODE_MISMATCH',
  'PUBLIC_ANALYTICS_ENABLED_MISSING',
  'PUBLIC_ANALYTICS_ENABLED_MISMATCH',
  'PUBLIC_FEATURES_NOT_OBJECT',
  'PUBLIC_FEATURE_HOOKS_MISSING',
  'PUBLIC_FEATURE_HOOKS_MISMATCH',
  'PUBLIC_FEATURE_REMOTE_PLUGIN_MISSING',
  'PUBLIC_FEATURE_REMOTE_PLUGIN_MISMATCH',
  'PRIVATE_AUTH_STORE_MISMATCH',
  'MCP_CONTAINER_NOT_OBJECT',
  'MCP_SERVER_SET_MISMATCH',
  'MCP_EXPECTED_SERVER_NOT_OBJECT',
  'MCP_COMMAND_MISSING',
  'MCP_COMMAND_MISMATCH',
  'MCP_ARGS_MISSING',
  'MCP_ARGS_MISMATCH',
  'MCP_ENV_MISSING',
  'MCP_ENV_MISMATCH',
  'MCP_ENV_VARS_MISMATCH',
  'MCP_ENABLED_MISSING',
  'MCP_ENABLED_MISMATCH',
  'MCP_REQUIRED_MISSING',
  'MCP_REQUIRED_MISMATCH',
  'MCP_STARTUP_TIMEOUT_SEC_MISSING',
  'MCP_STARTUP_TIMEOUT_SEC_MISMATCH',
  'MCP_ENABLED_TOOLS_MISSING',
  'MCP_ENABLED_TOOLS_MISMATCH',
  'GENERIC_CREDENTIAL_OR_ENDPOINT_NONEMPTY',
  'GENERIC_STARTUP_OR_HOOK_PLUGIN_NONEMPTY',
  'GENERIC_CAPABILITY_NONEMPTY',
  'PUBLIC_PROVIDER_OVERRIDE',
] as const)
type ConfigurationReason = (typeof CONFIGURATION_REASONS)[number]
function configurationRefusal(category: string, configurationReason: ConfigurationReason): never {
  const error = new B1Refusal(category) as B1Refusal & { configurationReason: ConfigurationReason }
  error.configurationReason = configurationReason
  throw error
}
function assertConfiguration(condition: unknown, category: string, reason: ConfigurationReason): asserts condition {
  if (!condition) configurationRefusal(category, reason)
}

function verifyPublicFields(config: JsonObject) {
  const critical: JsonObject = {
    model: 'gpt-6.1-sol',
    model_reasoning_effort: 'medium',
    approval_policy: 'never',
    sandbox_mode: 'read-only',
  }
  const criticalReasons: Record<string, readonly [ConfigurationReason, ConfigurationReason]> = {
    model: ['PUBLIC_MODEL_MISSING', 'PUBLIC_MODEL_MISMATCH'],
    model_reasoning_effort: ['PUBLIC_REASONING_EFFORT_MISSING', 'PUBLIC_REASONING_EFFORT_MISMATCH'],
    approval_policy: ['PUBLIC_APPROVAL_POLICY_MISSING', 'PUBLIC_APPROVAL_POLICY_MISMATCH'],
    sandbox_mode: ['PUBLIC_SANDBOX_MODE_MISSING', 'PUBLIC_SANDBOX_MODE_MISMATCH'],
  }
  for (const [key, expected] of Object.entries(critical)) {
    if (!Object.hasOwn(config, key)) configurationRefusal('CONFIGURATION_UNVERIFIED', criticalReasons[key][0])
    assertConfiguration(config[key] === expected, 'configuration_refused', criticalReasons[key][1])
  }
}
function verifyFeatureControls(config: JsonObject) {
  if (!object(config.analytics) || !Object.hasOwn(config.analytics, 'enabled'))
    configurationRefusal('CONFIGURATION_UNVERIFIED', 'PUBLIC_ANALYTICS_ENABLED_MISSING')
  assertConfiguration(config.analytics.enabled === false, 'configuration_refused', 'PUBLIC_ANALYTICS_ENABLED_MISMATCH')
  if (!object(config.features)) configurationRefusal('CONFIGURATION_UNVERIFIED', 'PUBLIC_FEATURES_NOT_OBJECT')
  for (const [key, missing, mismatch] of [
    ['hooks', 'PUBLIC_FEATURE_HOOKS_MISSING', 'PUBLIC_FEATURE_HOOKS_MISMATCH'],
    ['remote_plugin', 'PUBLIC_FEATURE_REMOTE_PLUGIN_MISSING', 'PUBLIC_FEATURE_REMOTE_PLUGIN_MISMATCH'],
  ] as const) {
    if (!Object.hasOwn(config.features, key)) configurationRefusal('CONFIGURATION_UNVERIFIED', missing)
    assertConfiguration(config.features[key] === false, 'configuration_refused', mismatch)
  }
}
function verifyPrivateFields(config: JsonObject, campaignRoot: string, mode: Mode) {
  if (Object.hasOwn(config, 'cli_auth_credentials_store'))
    assertConfiguration(
      config.cli_auth_credentials_store === 'ephemeral',
      'configuration_refused',
      'PRIVATE_AUTH_STORE_MISMATCH',
    )
  if (Object.hasOwn(config, 'mcp_servers')) {
    assertConfiguration(object(config.mcp_servers), 'configuration_refused', 'MCP_CONTAINER_NOT_OBJECT')
    verifyMcpConfig(config.mcp_servers, campaignRoot, mode)
  }
}
function verifyMcpConfig(servers: JsonObject, campaignRoot: string, mode: Mode) {
  assertConfiguration(
    isDeepStrictEqual(Object.keys(servers), [SERVER_NAME]),
    'configuration_refused',
    'MCP_SERVER_SET_MISMATCH',
  )
  const server = servers[SERVER_NAME]
  assertConfiguration(object(server), 'configuration_refused', 'MCP_EXPECTED_SERVER_NOT_OBJECT')
  const expectedServer: JsonObject = {
    command: realpathSync(process.execPath),
    args: [join(sourceDirectory, 'fixture.mjs'), mode, casePaths(campaignRoot, mode).journal],
    env: {},
    env_vars: [],
    enabled: true,
    required: true,
    startup_timeout_sec: 5,
    enabled_tools: ['fixture_observe'],
  }
  const serverReasons: Record<string, readonly [ConfigurationReason, ConfigurationReason]> = {
    command: ['MCP_COMMAND_MISSING', 'MCP_COMMAND_MISMATCH'],
    args: ['MCP_ARGS_MISSING', 'MCP_ARGS_MISMATCH'],
    env: ['MCP_ENV_MISSING', 'MCP_ENV_MISMATCH'],
    enabled: ['MCP_ENABLED_MISSING', 'MCP_ENABLED_MISMATCH'],
    required: ['MCP_REQUIRED_MISSING', 'MCP_REQUIRED_MISMATCH'],
    startup_timeout_sec: ['MCP_STARTUP_TIMEOUT_SEC_MISSING', 'MCP_STARTUP_TIMEOUT_SEC_MISMATCH'],
    enabled_tools: ['MCP_ENABLED_TOOLS_MISSING', 'MCP_ENABLED_TOOLS_MISMATCH'],
  }
  for (const [key, expected] of Object.entries(expectedServer)) {
    // Only this frozen empty whitelist may be omitted by the public projection.
    if (key === 'env_vars') {
      assertConfiguration(
        !Object.hasOwn(server, key) || isDeepStrictEqual(server[key], expected),
        'configuration_refused',
        'MCP_ENV_VARS_MISMATCH',
      )
      continue
    }
    if (!Object.hasOwn(server, key)) configurationRefusal('CONFIGURATION_UNVERIFIED', serverReasons[key][0])
    assertConfiguration(isDeepStrictEqual(server[key], expected), 'configuration_refused', serverReasons[key][1])
  }
}
const credentialAndEndpointSlots = new Set([
  'apikey',
  'openaiapikey',
  'bearertoken',
  'authorization',
  'httpheaders',
  'experimentalbearertoken',
  'url',
  'baseurl',
  'endpoint',
  'endpointurl',
  'apiendpoint',
  'modelproviders',
  'bearertokenenvvar',
])
function verifyAdditionalField(key: string, nested: unknown, path: string) {
  const normalized = key.replace(/[_-]/g, '').toLowerCase()
  if (!hasValue(nested)) return
  if (credentialAndEndpointSlots.has(normalized))
    configurationRefusal('CONFIGURATION_UNVERIFIED', 'GENERIC_CREDENTIAL_OR_ENDPOINT_NONEMPTY')
  const expectedCommand = [`mcp_servers.${SERVER_NAME}.command`, `mcp_servers.${SERVER_NAME}.args`].includes(path)
  const startupCommand =
    !expectedCommand && ['command', 'args', 'notify', 'startupcommand', 'startupcommands'].includes(normalized)
  if (startupCommand || /hooks?|plugins?/i.test(normalized))
    configurationRefusal('CONFIGURATION_UNVERIFIED', 'GENERIC_STARTUP_OR_HOOK_PLUGIN_NONEMPTY')
  if (/capabilities/i.test(key)) configurationRefusal('CONFIGURATION_UNVERIFIED', 'GENERIC_CAPABILITY_NONEMPTY')
}
function inspectConfiguration(value: JsonObject, prefix = '') {
  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (path === 'cli_auth_credentials_store') continue
    verifyAdditionalField(key, nested, path)
    if (object(nested)) inspectConfiguration(nested, path)
  }
}
/** Validate the generated public projection; omitted private settings remain explicitly unattested. */
export function verifyEffectiveConfig(response: unknown, campaignRoot: string, mode: Mode): void {
  if (!object(response) || !object(response.config))
    configurationRefusal('CONFIGURATION_UNVERIFIED', 'CONFIG_RESPONSE_OR_CONFIG_NOT_OBJECT')
  const config = response.config
  verifyPublicFields(config)
  verifyFeatureControls(config)
  verifyPrivateFields(config, campaignRoot, mode)
  inspectConfiguration(config)
  assertConfiguration(
    config.model_provider == null || config.model_provider === 'openai',
    'configuration_provider_override_refused',
    'PUBLIC_PROVIDER_OVERRIDE',
  )
}

export function verifyFixtureJournal(path: string, mode: Mode) {
  const descriptor = openSync(path, 'r')
  const bounded = Buffer.alloc(64 * 1024 + 1)
  let size: number
  try {
    size = readSync(descriptor, bounded, 0, bounded.length, 0)
  } finally {
    closeSync(descriptor)
  }
  assert(size <= 64 * 1024, 'fixture_journal_limit')
  const bytes = bounded.subarray(0, size)
  const rows = bytes
    .toString('utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
  const counts = { startup: 0, toolsList: 0, toolsCall: 0, startupExit19: 0 }
  for (const row of rows) {
    assert(Object.keys(row).length === 1, 'fixture_journal_refused')
    if (row.event === 'startup') counts.startup++
    else if (row.event === 'tools-list') counts.toolsList++
    else if (row.event === 'tools-call') counts.toolsCall++
    else if (row.event === 'startup_exit_19') counts.startupExit19++
    else throw new B1Refusal('fixture_journal_refused')
  }
  assert(counts.startup === 1 && counts.toolsCall === 0, 'fixture_effect_refused')
  assert(
    mode === 'healthy'
      ? counts.toolsList >= 1 && counts.startupExit19 === 0
      : counts.toolsList === 0 && counts.startupExit19 === 1,
    'fixture_witness_refused',
  )
  return counts
}

/** The campaign timer always disconnects the currently held original supervisor. */
export class CampaignLifetime {
  owned = new OwnedAcquisition()
  transport: B1Transport | undefined
  expired = false
  readonly timer: ReturnType<typeof setTimeout>
  constructor(readonly record: RecordEvent) {
    this.timer = setTimeout(() => {
      this.expired = true
      this.transport?.abort('campaign_deadline')
      try {
        record({ category: 'campaign_deadline', disposition: 'UNKNOWN', consumed: true })
      } finally {
        try {
          this.owned.disconnect()
        } finally {
          process.exit(2)
        }
      }
    }, 180_000)
  }
  beginCase() {
    assert(!this.expired, 'campaign_deadline')
    this.owned = new OwnedAcquisition()
    this.transport = undefined
  }
}
export class CaseLifetime {
  readonly started = Date.now()
  workExpired = false
  hardExpired = false
  workFailure: SafeEvent | undefined
  witnessed = false
  cleaned = false
  physicalCleanup: Awaited<ReturnType<typeof stopOwnedProcessGroup>> | undefined
  readonly workTimer: ReturnType<typeof setTimeout>
  readonly hardTimer: ReturnType<typeof setTimeout>
  constructor(
    readonly campaign: CampaignLifetime,
    readonly mode: Mode,
  ) {
    this.workTimer = setTimeout(() => {
      this.workExpired = true
      campaign.transport?.abort('case_work_deadline')
    }, 80_000)
    this.hardTimer = setTimeout(() => {
      this.hardExpired = true
      campaign.transport?.abort('case_hard_deadline')
      this.hardExit('case_hard_deadline')
    }, 90_000)
  }
  hardExit(category: string): never {
    try {
      this.campaign.record({ category, case: this.mode, disposition: 'UNKNOWN', consumed: true })
    } finally {
      try {
        this.campaign.owned.disconnect()
      } finally {
        process.exit(2)
      }
    }
  }
  recordFailure(error: unknown) {
    this.workFailure = {
      category: error instanceof B1Refusal ? error.category : 'case_refused',
      ...(error instanceof B1Refusal && error.hash ? { hash: error.hash } : {}),
    }
    this.campaign.record({ ...this.workFailure, case: this.mode })
  }
  observedBeforeDeadline() {
    return !this.hardExpired && !this.campaign.expired
  }
  async stopAndDrain() {
    assert(this.campaign.owned.original, 'ownership_unavailable')
    const observation = await this.campaign.owned.stop()
    this.physicalCleanup = observation
    this.campaign.record({ category: 'owned_group_exit_observed', case: this.mode, observation })
    await this.campaign.transport?.waitForDrain()
    return observation
  }
  async cleanup() {
    clearTimeout(this.workTimer)
    try {
      const cleanupObservation = await withDeadline(
        10_000,
        () => this.hardExit('cleanup_deadline'),
        () => this.stopAndDrain(),
      )
      this.cleaned = this.observedBeforeDeadline()
      this.campaign.record({
        category: this.cleaned ? 'cleanup_verified' : 'cleanup_unknown',
        case: this.mode,
        ...(this.cleaned ? { cleanupObservation } : {}),
      })
    } catch {
      if (this.physicalCleanup) {
        this.cleaned = this.observedBeforeDeadline()
        this.workFailure ??= { category: 'protocol_drain_refused' }
        this.campaign.record({
          category: 'cleanup_protocol_refused',
          case: this.mode,
          observation: this.physicalCleanup,
        })
      } else {
        this.campaign.record({ category: 'cleanup_unknown', case: this.mode, disposition: 'UNKNOWN' })
        this.campaign.owned.disconnect()
      }
    } finally {
      clearTimeout(this.hardTimer)
    }
  }
  fixtureCounts(path: string) {
    try {
      return verifyFixtureJournal(path, this.mode)
    } catch {
      this.workFailure ??= { category: 'fixture_witness_refused' }
    }
  }
  passed() {
    const category = this.campaign.transport?.failureCategory
    const protocolHealthy = !category || category === 'transport_closed'
    return (
      this.witnessed &&
      this.cleaned &&
      !this.workFailure &&
      protocolHealthy &&
      !this.workExpired &&
      !this.hardExpired &&
      !this.campaign.expired
    )
  }
  result(fixtureCounts: ReturnType<typeof verifyFixtureJournal> | undefined) {
    return {
      category: 'case_result',
      case: this.mode,
      disposition: this.passed() ? 'PASS' : this.cleaned ? 'REFUSED' : 'UNKNOWN',
      counts: this.campaign.transport?.counts ?? null,
      protocolFailure: this.campaign.transport?.failureCategory ?? null,
      fixtureCounts: fixtureCounts ?? null,
      elapsedMs: Date.now() - this.started,
    }
  }
}
function configurationObservation(configResponse: { config: JsonObject }, mode: Mode): SafeEvent {
  const servers = configResponse.config.mcp_servers
  return {
    category: 'configuration_observation',
    case: mode,
    configInput: 'REQUESTED_HASH_VERIFIED',
    publicFields: 'REPORTED_MATCHED',
    mcpEnvVarsProjection: object(servers)
      ? Object.hasOwn(servers[SERVER_NAME] as object, 'env_vars')
        ? 'REPORTED_EMPTY_MATCHED'
        : 'OMITTED_FROZEN_EMPTY_NORMALIZED'
      : 'PRIVATE_MCP_NOT_REPORTED',
    omittedPrivateFields: ['cli_auth_credentials_store', 'mcp_servers', 'hooks', 'plugins'].filter(
      key => !Object.hasOwn(configResponse.config, key),
    ),
    privateFieldAbsence: 'NOT_REPORTED_NOT_INDEPENDENTLY_ATTESTED',
  }
}
/** Finite protocol seam for synthetic streams; it cannot acquire a process or reserve a case. */
export async function runB1Protocol(
  transport: Pick<B1Transport, 'initialize' | 'configRead' | 'startThread' | 'listStatus' | 'assertHealthy'>,
  root: string,
  mode: Mode,
  record: RecordEvent,
) {
  const paths = casePaths(root, mode)
  const initialized = await transport.initialize(10_000)
  assert(initialized.codexHome === realpathSync(paths.codexHome), 'codex_home_mismatch')
  const configResponse = await transport.configRead(paths.cwd)
  verifyEffectiveConfig(configResponse, root, mode)
  record(configurationObservation(configResponse, mode))
  let witnessed = false
  try {
    await transport.startThread(paths.cwd, mode === 'missing')
    assert(mode === 'healthy', 'required_mcp_unexpected_success')
    await transport.listStatus()
    witnessed = true
  } catch (error) {
    if (mode === 'missing' && error instanceof B1Refusal && error.category === 'required_mcp_refused') witnessed = true
    else throw error
  }
  transport.assertHealthy()
  return witnessed
}
async function acquireB1Case(
  campaign: CampaignLifetime,
  state: CaseLifetime,
  manifest: B1Manifest,
  configSha256: string,
) {
  const paths = casePaths(manifest.freshRoot, state.mode)
  assert(sha256(join(paths.codexHome, 'config.toml')) === configSha256, 'config_hash_mismatch')
  return withDeadline(
    10_000,
    () => {
      campaign.record({
        category: 'PHASE_DEADLINE_UNKNOWN',
        case: state.mode,
        phase: 'launch',
        disposition: 'UNKNOWN',
        consumed: true,
      })
      process.exit(2)
    },
    () =>
      campaign.owned.acquire(manifest.native.path, ['app-server'], {
        supervisorPath,
        cwd: paths.cwd,
        env: closedEnvironment(paths),
        privateStdio: true,
        streamLogs: false,
        captureOutput: false,
        retainProcessRecord: false,
      }),
  )
}
async function runB1Case(
  campaign: CampaignLifetime,
  manifest: B1Manifest,
  item: B1Manifest['cases'][number],
  validate: ReturnType<typeof loadValidators>,
  manifestSha256: string,
) {
  campaign.beginCase()
  const paths = casePaths(manifest.freshRoot, item.mode)
  const config = renderConfig(manifest.freshRoot, item.mode)
  writeClosedConfig(paths, config)
  assert(digest(config) === item.configSha256, 'config_hash_mismatch')
  writeFileSync(paths.journal, '', { flag: 'wx', mode: 0o600 })
  const state = new CaseLifetime(campaign, item.mode)
  campaign.record({ category: 'case_reserved', case: item.mode })
  writeLaunchSpent(paths.root, manifestSha256)
  try {
    const original = await acquireB1Case(campaign, state, manifest, item.configSha256)
    assert(!state.workExpired && !state.hardExpired && !campaign.expired, 'acquisition_deadline')
    const { stdin, stdout, stderr } = original.process
    assert(stdin && stdout && stderr, 'private_stdio_unavailable')
    campaign.transport = new B1Transport({ stdin, stdout, stderr, validate, event: campaign.record })
    state.witnessed = await runB1Protocol(campaign.transport, manifest.freshRoot, item.mode, campaign.record)
  } catch (error) {
    state.recordFailure(error)
  } finally {
    await state.cleanup()
  }
  return state.result(state.fixtureCounts(paths.journal))
}

/** Executes only an externally reviewed, hash-bound B1 campaign. Importing this file launches nothing. */
async function runCampaign(manifestPath: string, manifestSha256: string) {
  const manifest = verifyManifest(manifestPath, manifestSha256)
  const validate = loadValidators(manifest.schemaRoot)
  const record = reserveCampaign(manifest, manifestSha256)
  const campaign = new CampaignLifetime(record)
  const results: SafeEvent[] = []
  try {
    await runUntilRefused(
      manifest.cases,
      item => runB1Case(campaign, manifest, item, validate, manifestSha256),
      result => {
        results.push(result)
        record(result)
      },
    )
  } finally {
    clearTimeout(campaign.timer)
    record({
      category: 'campaign_result',
      disposition:
        results.length === 2 && results.every(result => result.disposition === 'PASS') ? 'PASS' : 'UNKNOWN_OR_REFUSED',
    })
  }
  return results
}
manifestCli(
  fileURLToPath(import.meta.url),
  runCampaign,
  results => results.length === 2 && results.every(result => result.disposition === 'PASS'),
)
