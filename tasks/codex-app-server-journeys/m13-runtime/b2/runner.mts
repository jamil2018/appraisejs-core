import {
  object,
  hasValue as nonempty,
  verifyFreshRoot,
  runtimeCommonPath,
  OwnedAcquisition,
  reserveCampaign,
  closedEnvironment,
  writeClosedConfig,
  writeLaunchSpent,
  withDeadline,
  manifestCli,
} from '../runtime-common.mts'
import type { RecordEvent } from '../runtime-common.mts'
import { privateRpcPath } from '../private-rpc.mjs'
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { stopOwnedProcessGroup } from '../../../../src/lib/process/owned-process-stop.ts'
import { B2Transport, loadValidators, SCHEMA_FILES } from './transport.mjs'
import {
  B2Refusal,
  CREDENTIAL_SOURCE_PATH,
  assertHashInputIsNotCredential,
  createOwnedCredentialLink,
  describeCredentialSource,
  removeOwnedCredentialLink,
  verifyCredentialSource,
  verifyOwnedCredentialLink,
} from './topology.mjs'

type SourceDescriptor = {
  path: string
  canonicalPath: string
  uid: string
  mode: string
  dev: string
  ino: string
  nlink: string
  size: string
  mtimeNs: string
  ctimeNs: string
}
const approvedCredentialIdentity = Object.freeze({
  path: CREDENTIAL_SOURCE_PATH,
  canonicalPath: CREDENTIAL_SOURCE_PATH,
  uid: '503',
  mode: '384',
  dev: '16777230',
  ino: '89690255',
  nlink: '1',
})
type ManifestReadOperations = {
  describeSource: (path: string) => SourceDescriptor
  canonicalPath: (path: string) => string
  identity: (path: string) => { dev: bigint; ino: bigint }
  readBytes: (path: string) => Buffer
}
const manifestReadOperations: ManifestReadOperations = {
  describeSource: describeCredentialSource,
  canonicalPath: realpathSync,
  identity: path => statSync(path, { bigint: true }),
  readBytes: path => readFileSync(path),
}
type Input = { path: string; sha256: string }
export type B2Manifest = {
  version: 'm13-b2/v1'
  campaignId: string
  freshRoot: string
  native: Input
  schemaRoot: string
  inputs: Input[]
  configSha256: string
  credentialSource: SourceDescriptor
}
const sourceDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(sourceDirectory, '../../../..')
const supervisorPath = join(repositoryRoot, 'scripts/owned-process-supervisor.mjs')
function assert(condition: unknown, category: string): asserts condition {
  if (!condition) throw new B2Refusal(category)
}
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
function hashPublicInput(path: string, source: SourceDescriptor) {
  assertHashInputIsNotCredential(path, source)
  return digest(readFileSync(path))
}
export function requiredInputPaths(schemaRoot: string): string[] {
  const ajv = fileURLToPath(import.meta.resolve('ajv'))
  const execa = fileURLToPath(import.meta.resolve('execa'))
  return [
    privateRpcPath,
    runtimeCommonPath,
    join(dirname(ajv), '../package.json'),
    ajv,
    join(dirname(execa), 'package.json'),
    execa,
    ...['runner.mts', 'transport.mjs', 'topology.mjs'].map(file => join(sourceDirectory, file)),
    ...[
      'src/lib/process/owned-process-stop.ts',
      'src/lib/process/task-spawner.ts',
      'scripts/owned-process-supervisor.mjs',
      'package.json',
      'package-lock.json',
    ].map(file => join(repositoryRoot, file)),
    realpathSync(process.execPath),
    ...SCHEMA_FILES.map(file => join(schemaRoot, file)),
  ].map(path => resolve(path))
}
function casePaths(root: string) {
  return {
    root,
    home: join(root, 'home'),
    codexHome: join(root, 'codex-home'),
    tmp: join(root, 'tmp'),
    cwd: join(root, 'cwd'),
    credentialLink: join(root, 'codex-home/auth.json'),
  }
}
export function renderConfig(): string {
  return [
    'model = "gpt-6.1-sol"',
    'model_reasoning_effort = "medium"',
    'cli_auth_credentials_store = "file"',
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
    '[mcp_servers]',
    '',
  ].join('\n')
}

export function verifyEffectiveConfig(response: unknown): void {
  if (!object(response) || !object(response.config)) throw new B2Refusal('CONFIGURATION_UNVERIFIED')
  const config = response.config
  for (const [key, expected] of Object.entries({
    model: 'gpt-6.1-sol',
    model_reasoning_effort: 'medium',
    approval_policy: 'never',
    sandbox_mode: 'read-only',
  })) {
    assert(Object.hasOwn(config, key) && config[key] === expected, 'CONFIGURATION_UNVERIFIED')
  }
  assert(object(config.analytics) && config.analytics.enabled === false, 'CONFIGURATION_UNVERIFIED')
  assert(
    object(config.features) &&
      Object.hasOwn(config.features, 'hooks') &&
      config.features.hooks === false &&
      Object.hasOwn(config.features, 'remote_plugin') &&
      config.features.remote_plugin === false,
    'CONFIGURATION_UNVERIFIED',
  )
  if (Object.hasOwn(config, 'cli_auth_credentials_store'))
    assert(config.cli_auth_credentials_store === 'file', 'CONFIGURATION_UNVERIFIED')
  if (Object.hasOwn(config, 'mcp_servers'))
    assert(object(config.mcp_servers) && Object.keys(config.mcp_servers).length === 0, 'CONFIGURATION_UNVERIFIED')
  assert(config.model_provider == null || config.model_provider === 'openai', 'UNEXPECTED_PROVIDER_AUTH')
  const inspect = (value: Record<string, unknown>) => {
    for (const [key, nested] of Object.entries(value)) {
      if (key === 'cli_auth_credentials_store') continue
      const normalized = key.replace(/[_-]/g, '').toLowerCase()
      const forbidden = [
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
        'command',
        'args',
        'notify',
        'startupcommand',
        'startupcommands',
      ]
      if ((forbidden.includes(normalized) || /hooks?|plugins?|capabilities/i.test(normalized)) && nonempty(nested))
        throw new B2Refusal('CONFIGURATION_UNVERIFIED')
      if (object(nested)) inspect(nested)
    }
  }
  inspect(config)
}
export function assertEligibleAccount(account: {
  accountType: string
  present: boolean
  requiresOpenaiAuth: boolean
}): void {
  assert(account.present, 'AUTHENTICATION_REQUIRED')
  assert(
    account.accountType === 'chatgpt',
    account.accountType === 'apiKey' ? 'API_KEY_AUTH_REFUSED' : 'UNEXPECTED_PROVIDER_AUTH',
  )
  assert(account.requiresOpenaiAuth === true, 'UNEXPECTED_PROVIDER_AUTH')
}
export function verifySourceDescriptor(source: unknown): asserts source is SourceDescriptor {
  assert(object(source), 'credential_descriptor_refused')
  assert(
    Object.keys(source).sort().join(',') ===
      ['path', 'canonicalPath', 'uid', 'mode', 'dev', 'ino', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].sort().join(','),
    'credential_descriptor_refused',
  )
  for (const key of ['uid', 'mode', 'dev', 'ino', 'nlink', 'size', 'mtimeNs', 'ctimeNs'])
    assert(typeof source[key] === 'string' && /^\d+$/.test(source[key]), 'credential_descriptor_refused')
  for (const [key, expected] of Object.entries(approvedCredentialIdentity))
    assert(source[key] === expected, 'credential_descriptor_refused')
  assert(process.getuid?.() === Number(approvedCredentialIdentity.uid), 'credential_descriptor_refused')
}
/** The optional I/O seam is source-test-only; the CLI and native case always use the fixed defaults. */
export function verifyManifest(
  manifestPath: string,
  expectedHash: string,
  io: ManifestReadOperations = manifestReadOperations,
): B2Manifest {
  assert(/^[a-f0-9]{64}$/.test(expectedHash), 'manifest_hash_refused')
  // Verify the fixed source identity before opening any manifest, including a possible secret alias.
  verifySourceDescriptor(io.describeSource(approvedCredentialIdentity.path))
  assert(io.canonicalPath(manifestPath) !== approvedCredentialIdentity.canonicalPath, 'credential_hash_input_refused')
  const manifestIdentity = io.identity(manifestPath)
  assert(
    !(
      manifestIdentity.dev.toString() === approvedCredentialIdentity.dev &&
      manifestIdentity.ino.toString() === approvedCredentialIdentity.ino
    ),
    'credential_hash_input_refused',
  )
  const bytes = io.readBytes(manifestPath)
  assert(digest(bytes) === expectedHash, 'manifest_hash_mismatch')
  const manifest = JSON.parse(bytes.toString('utf8')) as B2Manifest
  assert(
    Object.keys(manifest).sort().join(',') ===
      ['version', 'campaignId', 'freshRoot', 'native', 'schemaRoot', 'inputs', 'configSha256', 'credentialSource']
        .sort()
        .join(','),
    'manifest_shape_refused',
  )
  assert(
    manifest.version === 'm13-b2/v1' && /^[a-zA-Z0-9_-]{1,80}$/.test(manifest.campaignId),
    'manifest_identity_refused',
  )
  verifyFreshRoot(manifest.freshRoot, 'b2', assert)
  assert(isAbsolute(manifest.schemaRoot) && isAbsolute(manifest.native.path), 'absolute_path_required')
  verifySourceDescriptor(manifest.credentialSource)
  verifyCredentialSource(manifest.credentialSource)
  const required = requiredInputPaths(manifest.schemaRoot)
  assert(
    Array.isArray(manifest.inputs) &&
      manifest.inputs.length === required.length &&
      new Set(manifest.inputs.map(input => input.path)).size === required.length,
    'input_inventory_refused',
  )
  for (const path of required) {
    const input = manifest.inputs.find(item => item.path === path)
    assert(
      input && Object.keys(input).sort().join(',') === 'path,sha256' && /^[a-f0-9]{64}$/.test(input.sha256),
      'input_inventory_refused',
    )
    assert(hashPublicInput(path, manifest.credentialSource) === input.sha256, 'source_hash_mismatch')
  }
  assert(
    Object.keys(manifest.native).sort().join(',') === 'path,sha256' &&
      /^[a-f0-9]{64}$/.test(manifest.native.sha256) &&
      hashPublicInput(manifest.native.path, manifest.credentialSource) === manifest.native.sha256,
    'native_hash_mismatch',
  )
  assert(digest(renderConfig()) === manifest.configSha256, 'config_hash_mismatch')
  return manifest
}
/** One original capability and credential-link identity, retained through final physical observation. */
export class B2Lifetime {
  readonly owned: OwnedAcquisition
  transport: B2Transport | undefined
  link: ReturnType<typeof createOwnedCredentialLink> | undefined
  cleaned = false
  metadataVerified = false
  linkRemoved = false
  account: { accountType: string; present: boolean; requiresOpenaiAuth: boolean } | undefined
  failure: string | undefined
  physicalCleanup: Awaited<ReturnType<typeof stopOwnedProcessGroup>> | undefined
  readonly started = Date.now()
  readonly hardTimer: ReturnType<typeof setTimeout>
  readonly workTimer: ReturnType<typeof setTimeout>
  constructor(
    readonly record: RecordEvent,
    owned = new OwnedAcquisition(),
  ) {
    this.owned = owned
    this.hardTimer = setTimeout(() => this.hardExit('case_hard_deadline'), 90_000)
    this.workTimer = setTimeout(() => {
      this.transport?.abort('case_work_deadline')
      this.failure = 'case_work_deadline'
    }, 60_000)
  }
  hardExit(category: string): never {
    try {
      this.record({ category, disposition: 'UNKNOWN', consumed: true })
    } finally {
      try {
        this.owned.disconnect()
      } finally {
        process.exit(2)
      }
    }
  }
  async stopAndDrain() {
    const observation = await this.owned.stop()
    this.physicalCleanup = observation
    this.cleaned = true
    this.record({ category: 'owned_group_exit_observed', cleanupObservation: observation })
    if (this.transport) await this.transport.waitForDrain()
    return observation
  }
  async observeCleanup() {
    if (this.owned.original) {
      const cleanupObservation = await withDeadline(
        30_000,
        () => this.hardExit('cleanup_deadline'),
        () => this.stopAndDrain(),
      )
      this.cleaned = true
      this.record({ category: 'cleanup_verified', cleanupObservation })
    } else if (this.owned.attempted) this.hardExit('cleanup_unobserved')
    else {
      this.cleaned = true
      this.record({ category: 'cleanup_not_required_no_launch_attempt' })
    }
  }
  async cleanup() {
    clearTimeout(this.workTimer)
    try {
      await this.observeCleanup()
    } catch (error) {
      if (this.physicalCleanup) {
        const protocolCategory = error instanceof B2Refusal ? error.category : 'protocol_drain_refused'
        this.failure ??= protocolCategory
        this.record({
          category: 'cleanup_protocol_refused',
          cleanupObservation: this.physicalCleanup,
          protocolCategory,
          disposition: 'PARKED',
        })
      } else {
        this.failure ??= 'cleanup_unknown'
        this.hardExit('cleanup_unknown')
      }
    }
  }
  verifyMetadata(source: SourceDescriptor) {
    try {
      verifyCredentialSource(source)
      if (this.link) verifyOwnedCredentialLink(this.link)
      this.metadataVerified = true
      this.record({ category: 'credential_metadata_unchanged' })
    } catch {
      this.failure ??= 'credential_metadata_or_link_changed'
      this.record({ category: 'credential_metadata_or_link_changed', disposition: 'PARKED' })
    }
  }
  removeLink() {
    if (!this.link) return
    try {
      removeOwnedCredentialLink(this.link)
      this.linkRemoved = true
      this.record({ category: 'owned_credential_link_removed' })
    } catch {
      this.failure ??= 'credential_link_replaced'
      this.record({ category: 'credential_link_not_removed', disposition: 'PARKED' })
    }
  }
  finalizeCredential(source: SourceDescriptor) {
    // No credential metadata or unlink operation is reached while original cleanup is UNKNOWN.
    if (this.cleaned) {
      this.verifyMetadata(source)
      this.removeLink()
    }
    clearTimeout(this.hardTimer)
  }
  passed() {
    const category = this.transport?.failureCategory
    const protocolHealthy = !category || category === 'transport_closed'
    return (
      !!this.account && this.cleaned && this.metadataVerified && this.linkRemoved && !this.failure && protocolHealthy
    )
  }
  result() {
    return {
      category: 'case_result',
      disposition: this.passed() ? 'PASS' : this.cleaned ? 'PARKED' : 'UNKNOWN',
      counts: this.transport?.counts ?? null,
      launchAttempted: this.owned.attempted,
      protocolFailure: this.transport?.failureCategory ?? null,
      account: this.account ?? null,
      metadataVerified: this.metadataVerified,
      linkRemoved: this.linkRemoved,
      elapsedMs: Date.now() - this.started,
      fileAccessIsolation: 'NOT_OS_ATTESTED',
      refreshSemantics: 'FALSE_NO_REQUESTED_PROACTIVE_REFRESH',
    }
  }
}
function prepareB2Case(state: B2Lifetime, manifest: B2Manifest, manifestSha256: string) {
  const paths = casePaths(manifest.freshRoot)
  writeClosedConfig(paths, renderConfig(), true)
  state.link = createOwnedCredentialLink(manifest.credentialSource, paths.credentialLink)
  state.record({
    category: 'credential_link_created',
    linkIdentity: state.link,
    sourceMetadata: manifest.credentialSource,
  })
  writeLaunchSpent(paths.root, manifestSha256)
  assert(
    hashPublicInput(join(paths.codexHome, 'config.toml'), manifest.credentialSource) === manifest.configSha256,
    'config_hash_mismatch',
  )
  verifyCredentialSource(manifest.credentialSource)
  verifyOwnedCredentialLink(state.link)
  return paths
}
function recordB2Event(
  record: RecordEvent,
  value: Parameters<NonNullable<ConstructorParameters<typeof B2Transport>[0]['event']>>[0],
) {
  if (value.category === 'remote_control_disabled' || value.category === 'account_update_observed')
    record({ category: value.category, count: value.count })
  else record({ category: 'notification_method', method: value.method, sequence: value.sequence, phase: value.phase })
}
/** Finite synthetic seam; account values have already been reduced by the owning private transport. */
export async function runB2Protocol(
  transport: Pick<B2Transport, 'initialize' | 'configRead' | 'accountRead' | 'assertHealthy'>,
  root: string,
  record: RecordEvent,
  observeAccount: (account: NonNullable<B2Lifetime['account']>) => void,
) {
  const paths = casePaths(root)
  const initialized = await transport.initialize()
  assert(initialized.codexHome === realpathSync(paths.codexHome), 'codex_home_mismatch')
  const config = await transport.configRead(paths.cwd)
  verifyEffectiveConfig(config)
  record({
    category: 'configuration_observation',
    configInput: 'REQUESTED_HASH_VERIFIED',
    publicFields: 'REPORTED_MATCHED',
    omittedPrivateFields: ['cli_auth_credentials_store', 'mcp_servers', 'hooks', 'plugins'].filter(
      key => !Object.hasOwn(config.config, key),
    ),
    privateFieldAbsence: 'NOT_REPORTED_NOT_INDEPENDENTLY_ATTESTED',
  })
  const account = await transport.accountRead()
  observeAccount(account)
  assertEligibleAccount(account)
  transport.assertHealthy()
  record({ category: 'account_observation', ...account, refreshRequested: false })
}
async function executeB2Case(
  state: B2Lifetime,
  manifest: B2Manifest,
  manifestSha256: string,
  validate: ReturnType<typeof loadValidators>,
) {
  const paths = prepareB2Case(state, manifest, manifestSha256)
  const original = await withDeadline(
    10_000,
    () => state.hardExit('launch_phase_deadline'),
    () =>
      state.owned.acquire(manifest.native.path, ['app-server'], {
        supervisorPath,
        cwd: paths.cwd,
        env: closedEnvironment(paths),
        privateStdio: true,
        streamLogs: false,
        captureOutput: false,
        retainProcessRecord: false,
      }),
  )
  assert(!state.failure, 'case_work_deadline')
  const { stdin, stdout, stderr } = original.process
  assert(stdin && stdout && stderr, 'private_stdio_unavailable')
  state.transport = new B2Transport({
    stdin,
    stdout,
    stderr,
    validate,
    event: value => recordB2Event(state.record, value),
  })
  await runB2Protocol(state.transport, manifest.freshRoot, state.record, account => {
    state.account = account
  })
}
/** One additive native account observation; importing source does not reserve, link, or launch anything. */
async function runCase(manifestPath: string, manifestSha256: string) {
  const manifest = verifyManifest(manifestPath, manifestSha256)
  const validate = loadValidators(manifest.schemaRoot)
  const record = reserveCampaign(manifest, manifestSha256)
  const state = new B2Lifetime(record)
  try {
    await executeB2Case(state, manifest, manifestSha256, validate)
  } catch (error) {
    state.failure = error instanceof B2Refusal ? error.category : 'case_refused'
    record({
      category: state.failure ?? 'case_refused',
      disposition: 'PARKED',
      ...(state.account ? { account: state.account } : {}),
    })
  } finally {
    await state.cleanup()
    state.finalizeCredential(manifest.credentialSource)
  }
  const result = state.result()
  record(result)
  return result
}
manifestCli(fileURLToPath(import.meta.url), runCase, result => result.disposition === 'PASS')
