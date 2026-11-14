import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rmSync, symlinkSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { syntheticNativeManifest } from '../../../../src/lib/quality-journey/codex-app-server/native-qualification.test-support'
import { requiredC0TaskInputPaths } from './inputs.mts'
import { createC0ConnectorCapability, readReviewedC0Manifest } from './manifest.mts'

test('C0 import exposes no executable entry point or native launch', async () => {
  const taskSurface = await import('./runner.mts')
  assert.deepEqual(Object.keys(taskSurface), ['prepareReviewedC0Task'])
})
test('C0 public manifest reading guards credential aliases before byte reads and exact commitment', () => {
  const f = syntheticNativeManifest()
  f.manifest.inputs = requiredC0TaskInputPaths(f.manifest.repositoryRoot).map(path => ({
    path,
    sha256: f.sha(readFileSync(path)),
  }))
  try {
    const manifestPath = path.join(f.parent, 'manifest.json')
    writeFileSync(manifestPath, JSON.stringify(f.manifest))
    const options = {
      manifestPath,
      manifestSha256: f.sha(JSON.stringify(f.manifest)),
      credentialSource: f.manifest.credentialSource,
      connectorCapability: f.capability,
    }
    assert.ok(readReviewedC0Manifest(options))
    assert.throws(() => readReviewedC0Manifest({ ...options, manifestSha256: '0'.repeat(64) }), /changed/)
    const alias = path.join(f.parent, 'credential-alias.json')
    symlinkSync(f.credential, alias)
    assert.throws(() => readReviewedC0Manifest({ ...options, manifestPath: alias }), /topology refused/)
  } finally {
    rmSync(f.parent, { recursive: true, force: true })
  }
})

test('C0 reserves exclusively, spends before a cancelled start, and never refunds or replays', async () => {
  const { createProviderFixture } = await import('../../../../src/test/quality-journey-provider-fixture')
  const { createManagedQualityJourneyRoleDelivery } =
    await import('../../../../src/services/coordinator/quality-journey-managed-role-delivery')
  const { captureNativeQualificationPlan, nativeQualificationDigest, renderNativeQualificationConfiguration } =
    await import('../../../../src/lib/quality-journey/codex-app-server/native-qualification-contract')
  const { canonicalContractJson } = await import('../../../../src/lib/catalog-contracts')
  const { lstatSync, readFileSync, realpathSync } = await import('node:fs')
  const { prepareReviewedC0Task } = await import('./runner.mts')
  const database = await createProviderFixture(),
    f = syntheticNativeManifest()
  f.manifest.inputs = requiredC0TaskInputPaths(f.manifest.repositoryRoot).map(path => ({
    path,
    sha256: f.sha(readFileSync(path)),
  }))
  try {
    const definitions = [
      { kind: 'tool' as const, name: 'quality_journey_analysis_get', inputSchema: { type: 'object', properties: {} } },
      {
        kind: 'tool' as const,
        name: 'quality_journey_analysis_submit',
        inputSchema: {
          type: 'object',
          properties: { idempotencyKey: { type: 'string' }, charter: { type: 'object' } },
        },
      },
    ]
    const delivery = await createManagedQualityJourneyRoleDelivery({
      binding: database.binding,
      client: database.client,
      canonicalDefinitions: definitions,
    })
    f.manifest.binding = Object.fromEntries(
      Object.keys(f.manifest.binding).map(key => [key, database.binding[key as keyof typeof database.binding]]),
    ) as typeof f.manifest.binding
    const identity = lstatSync(database.databasePath, { bigint: true })
    f.manifest.database = {
      path: realpathSync(database.databasePath),
      dev: String(identity.dev),
      ino: String(identity.ino),
    }
    f.manifest.roleProfileDigest = delivery.profileDigest
    f.manifest.enabledTools = delivery.profile.tools.map(tool => tool.name)
    f.manifest.configurationSha256 = f.sha(renderNativeQualificationConfiguration(f.manifest, f.capability))
    const envelope = [{ type: 'text', text: 'Cancelled synthetic C0 reservation test' }]
    f.manifest.envelopeDigest = nativeQualificationDigest(
      canonicalContractJson({ input: envelope, model: 'gpt-6.1-sol', effort: 'medium' }),
    )
    const options = {
      plan: captureNativeQualificationPlan(f.manifest, f.capability),
      input: { ...database.prepareInput, configurationDigest: `sha256:${f.manifest.configurationSha256}` },
      envelope,
      canonicalDefinitions: definitions,
      approvalEvidence: `sha256:${'d'.repeat(64)}`,
      evidenceDirectory: f.parent,
    }
    const original = await prepareReviewedC0Task(options, database.client)
    await original.cancel()
    const start = original.start()
    assert.equal(original.start(), start)
    await assert.rejects(start, /fenced/)
    const spent = JSON.parse(readFileSync(original.evidencePath, 'utf8'))
    assert.equal(spent.disposition, 'SPENT_BEFORE_EFFECTS')
    assert.equal(spent.outcome, 'UNKNOWN')
    assert.equal(spent.refundPermitted, false)
    assert.deepEqual(spent.allowance, f.manifest.allowance)
    const restarted = await prepareReviewedC0Task(options, database.client)
    assert.throws(() => restarted.start(), /EEXIST/)
    await restarted.cancel()
    assert.equal(await database.client.qualityJourneyProviderRun.count(), 0)
  } finally {
    await database.cleanup()
    rmSync(f.parent, { recursive: true, force: true })
  }
})

test('C0 generates a private new connector capability before packet review', () => {
  const first = createC0ConnectorCapability(),
    second = createC0ConnectorCapability()
  assert.match(first.capability, /^[a-f0-9]{64}$/)
  assert.match(first.commitment, /^sha256:[a-f0-9]{64}$/)
  assert.notEqual(first.capability, second.capability)
})

test('C0 hard deadline persists UNKNOWN and disconnects only the original capability before parent exit', async context => {
  const { createC0TaskLifetime } = await import('./lifetime.mts')
  const { mkdtempSync, readFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const parent = mkdtempSync(path.join(tmpdir(), 'appraise-c0-watchdog-')),
    evidencePath = path.join(parent, 'hard.json')
  context.mock.timers.enable({ apis: ['setTimeout'] })
  let disconnected = 0
  context.mock.method(process, 'exit', (code: number) => {
    assert.equal(code, 2)
    throw new Error('synthetic-parent-exit')
  })
  createC0TaskLifetime({
    caseMs: 10,
    evidencePath,
    disconnectOriginal: () => {
      disconnected++
      return false
    },
  })
  try {
    assert.throws(() => context.mock.timers.tick(10), /synthetic-parent-exit/)
    assert.equal(disconnected, 1)
    assert.deepEqual(JSON.parse(readFileSync(evidencePath, 'utf8')), {
      version: 'm13-c0-hard-deadline/v1',
      outcome: 'UNKNOWN',
      consumed: true,
      nextCasePermitted: false,
    })
  } finally {
    rmSync(parent, { recursive: true, force: true })
    context.mock.restoreAll()
    context.mock.timers.reset()
  }
})
