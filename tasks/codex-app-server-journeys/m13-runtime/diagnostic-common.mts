import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { stopOwnedProcessGroup } from '../../../src/lib/process/owned-process-stop.ts'
import { casePaths, renderConfig } from './b1/runner.mts'
import { B1Refusal, B1Transport, loadValidators } from './b1/transport.mjs'
import {
  verifyFreshRoot,
  sha256,
  verifyFrozenInputs,
  reserveCampaign,
  writeClosedConfig,
  writeLaunchSpent,
  closedEnvironment,
  OwnedAcquisition,
  withDeadline,
} from './runtime-common.mts'
import type { SafeEvent, RecordEvent } from './runtime-common.mts'

type Input = { path: string; sha256: string }
export type DiagnosticManifest = {
  version: string
  campaignId: string
  freshRoot: string
  native: Input
  schemaRoot: string
  inputs: Input[]
  configSha256: string
}
export const diagnosticCommonPath = fileURLToPath(import.meta.url)
const supervisorPath = fileURLToPath(new URL('../../../scripts/owned-process-supervisor.mjs', import.meta.url))
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
function assert(condition: unknown, category: string): asserts condition {
  if (!condition) throw new B1Refusal(category)
}
export { object } from './runtime-common.mts'
export function verifyDiagnosticManifest(
  manifestPath: string,
  expectedHash: string,
  phase: 'd0' | 'd1',
  requiredInputs: (schemaRoot: string) => string[],
): DiagnosticManifest {
  assert(/^[a-f0-9]{64}$/.test(expectedHash), 'manifest_hash_refused')
  const bytes = readFileSync(manifestPath)
  assert(digest(bytes) === expectedHash, 'manifest_hash_mismatch')
  const manifest = JSON.parse(bytes.toString('utf8')) as DiagnosticManifest
  assert(
    Object.keys(manifest).sort().join(',') ===
      ['version', 'campaignId', 'freshRoot', 'native', 'schemaRoot', 'inputs', 'configSha256'].sort().join(','),
    'manifest_shape_refused',
  )
  assert(
    manifest.version === `m13-${phase}/v1` && /^[a-zA-Z0-9_-]{1,80}$/.test(manifest.campaignId),
    'manifest_identity_refused',
  )
  verifyFreshRoot(manifest.freshRoot, phase, assert)
  assert(isAbsolute(manifest.schemaRoot) && isAbsolute(manifest.native.path), 'absolute_path_required')
  const required = requiredInputs(manifest.schemaRoot)
  verifyFrozenInputs(manifest.inputs, required, assert, true)
  assert(
    Object.keys(manifest.native).sort().join(',') === 'path,sha256' &&
      /^[a-f0-9]{64}$/.test(manifest.native.sha256) &&
      sha256(manifest.native.path) === manifest.native.sha256,
    'native_hash_mismatch',
  )
  assert(digest(renderConfig(manifest.freshRoot, 'healthy')) === manifest.configSha256, 'config_hash_mismatch')
  return manifest
}

function prepareDiagnostic(manifest: DiagnosticManifest, manifestSha256: string) {
  const paths = casePaths(manifest.freshRoot, 'healthy')
  writeClosedConfig(paths, renderConfig(manifest.freshRoot, 'healthy'))
  const configPath = join(paths.codexHome, 'config.toml')
  writeFileSync(paths.journal, '', { flag: 'wx', mode: 0o600 })
  assert(sha256(configPath) === manifest.configSha256, 'config_hash_mismatch')
  writeLaunchSpent(paths.root, manifestSha256)
}
async function acquireDiagnostic(manifest: DiagnosticManifest, owned: OwnedAcquisition) {
  const paths = casePaths(manifest.freshRoot, 'healthy')
  return await owned.acquire(manifest.native.path, ['app-server'], {
    supervisorPath,
    cwd: paths.cwd,
    env: closedEnvironment(paths),
    privateStdio: true,
    streamLogs: false,
    captureOutput: false,
    retainProcessRecord: false,
  })
}
async function observePassiveWindow(refusalSignal: Promise<void>, started: number) {
  let passiveTimer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      refusalSignal,
      new Promise<void>(resolveWindow => {
        passiveTimer = setTimeout(resolveWindow, Math.min(3_000, Math.max(0, started + 30_000 - Date.now())))
      }),
    ])
  } finally {
    if (passiveTimer) clearTimeout(passiveTimer)
  }
}
async function cleanupDiagnostic(owned: OwnedAcquisition, client: B1Transport | undefined, record: RecordEvent) {
  let drainDisposition = 'NOT_OBSERVED'
  let failure: string | undefined
  const physicalCleanup = await owned.stop()
  // Physical observation survives an expected diagnostic protocol/drain refusal.
  record({ category: 'owned_group_exit_observed', observation: physicalCleanup })
  try {
    if (client) {
      await client.waitForDrain()
      drainDisposition = 'DRAINED'
    } else drainDisposition = 'CODEC_NOT_STARTED'
  } catch (error) {
    drainDisposition = 'DRAINED_PROTOCOL_REFUSED'
    failure = error instanceof B1Refusal ? error.category : 'protocol_drain_refused'
  }
  record({ category: 'diagnostic_stream_drain', disposition: drainDisposition })
  return { physicalCleanup, drainDisposition, failure }
}
/** Holds only the original acquired supervisor handle and its bounded diagnostic lifetime. */
class DiagnosticLifetime {
  readonly owned = new OwnedAcquisition()
  client: B1Transport | undefined
  physicalCleanup: Awaited<ReturnType<typeof stopOwnedProcessGroup>> | undefined
  drainDisposition = 'NOT_OBSERVED'
  failure: string | undefined
  workExpired = false
  started = Date.now()
  readonly hardTimer: ReturnType<typeof setTimeout>
  readonly workTimer: ReturnType<typeof setTimeout>
  constructor(readonly record: RecordEvent) {
    this.hardTimer = setTimeout(() => this.hardExit('diagnostic_hard_deadline'), 40_000)
    this.workTimer = setTimeout(() => {
      this.workExpired = true
      this.client?.abort('diagnostic_work_deadline')
    }, 30_000)
  }
  hardExit(category: string): never {
    try {
      this.record({ category, disposition: 'UNKNOWN', consumed: true, runtimeQualification: 'NOT_PERFORMED' })
    } finally {
      try {
        this.owned.disconnect()
      } finally {
        process.exit(2)
      }
    }
  }
  async acquire(manifest: DiagnosticManifest) {
    const original = await withDeadline(
      10_000,
      () => this.hardExit('diagnostic_launch_deadline'),
      () => acquireDiagnostic(manifest, this.owned),
    )
    assert(!this.workExpired, 'diagnostic_work_deadline')
    const { stdin, stdout, stderr } = original.process
    assert(stdin && stdout && stderr, 'private_stdio_unavailable')
    return { stdin, stdout, stderr }
  }
  async cleanup() {
    clearTimeout(this.workTimer)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      if (!this.owned.original) {
        if (this.owned.attempted) this.hardExit('diagnostic_cleanup_unobserved')
        this.record({ category: 'no_native_launch_attempt' })
        return
      }
      timer = setTimeout(() => this.hardExit('diagnostic_cleanup_deadline'), 10_000)
      const cleanup = await cleanupDiagnostic(this.owned, this.client, this.record)
      this.physicalCleanup = cleanup.physicalCleanup
      this.drainDisposition = cleanup.drainDisposition
      this.failure ??= cleanup.failure
    } catch {
      this.hardExit('diagnostic_cleanup_unknown')
    } finally {
      if (timer) clearTimeout(timer)
      clearTimeout(this.hardTimer)
    }
  }
}

/** Only the two diagnostic CLIs call this lifecycle; importing it has no effects. */
export async function runOwnedDiagnostic(
  manifest: DiagnosticManifest,
  manifestSha256: string,
  options: {
    validate: ReturnType<typeof loadValidators>
    selectEvent: (value: unknown) => SafeEvent | undefined
    protocol: (client: B1Transport, record: RecordEvent) => Promise<void>
    stopped?: (error: unknown) => Record<string, unknown>
  },
) {
  const record = reserveCampaign(manifest, manifestSha256)
  const observedMethods: SafeEvent[] = []
  let settleRefusal: (() => void) | undefined
  const refusalSignal = new Promise<void>(resolveRefusal => {
    settleRefusal = resolveRefusal
  })
  const event = (value: unknown) => {
    const selected = options.selectEvent(value)
    if (!selected) return
    observedMethods.push(selected)
    record(selected)
    // Codec refusal follows the metadata event synchronously.
    queueMicrotask(() => {
      if (lifetime.client?.failureCategory) settleRefusal?.()
    })
  }
  const lifetime = new DiagnosticLifetime(record)
  try {
    prepareDiagnostic(manifest, manifestSha256)
    const streams = await lifetime.acquire(manifest)
    lifetime.client = new B1Transport({ ...streams, validate: options.validate, event })
    await options.protocol(lifetime.client, record)
    await observePassiveWindow(refusalSignal, lifetime.started)
    lifetime.client.assertHealthy()
  } catch (error) {
    lifetime.failure = error instanceof B1Refusal ? error.category : 'diagnostic_refused'
    record({ category: 'diagnostic_protocol_stopped', reason: lifetime.failure, ...options.stopped?.(error) })
  } finally {
    await lifetime.cleanup()
  }
  return { observedMethods, ...lifetime }
}

/** Common safe result fields; phase predicates and extra facts stay with their diagnostic. */
export function diagnosticResult(state: Awaited<ReturnType<typeof runOwnedDiagnostic>>) {
  return {
    category: 'diagnostic_result',
    counts: state.client?.counts ?? null,
    protocolCategory: state.failure ?? state.client?.failureCategory ?? null,
    notificationMethods: state.observedMethods,
    physicalCleanup: state.physicalCleanup ?? null,
    streamDrain: state.drainDisposition,
    workExpired: state.workExpired,
    elapsedMs: Date.now() - state.started,
    runtimeQualification: 'NOT_PERFORMED',
  }
}

export async function readDiagnosticConfiguration(
  client: Pick<B1Transport, 'initialize' | 'configRead' | 'assertHealthy'>,
  root: string,
) {
  const paths = casePaths(root, 'healthy')
  client.assertHealthy()
  const initialized = await client.initialize(10_000)
  client.assertHealthy()
  assert(initialized.codexHome === realpathSync(paths.codexHome), 'codex_home_mismatch')
  return client.configRead(paths.cwd)
}
