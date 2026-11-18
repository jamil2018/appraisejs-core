import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync, lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createServer, request } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { recoveryEvidenceRoot, recoveryDigest } from './recovery-read-binding.mts'
import { sealRecoverySnapshot, readRecoverySnapshotFresh } from './recovery-snapshot.mts'
import type { NativeOutcomeProfile } from '../../../../src/lib/quality-journey/codex-app-server/native-outcome-profile'
import type { NativeChildOutcomeObserver } from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-child'
import { createOriginalLossEndpoint } from './native-loss-endpoint.mts'
import {
  createNativeQualificationLossControl,
  bindNativeQualificationLossControl,
  bindNativeQualificationLossRuntime,
  inspectNativeQualificationLoss,
  waitNativeQualificationLossPhysicalRelease,
  waitNativeQualificationLossQuiescence,
  assertNativeQualificationLossQuiescent,
} from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-loss'

mkdirSync(recoveryEvidenceRoot, { recursive: true, mode: 0o700 })
const evidence = mkdtempSync(path.join(recoveryEvidenceRoot, 'integrated-r3-'))
const source = path.join(evidence, 'source')
mkdirSync(source, { mode: 0o700 })
const databasePath = path.join(source, 'fixture.sqlite')
execFileSync(process.execPath, ['e2e/apply-migrations.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: `file:${databasePath}` },
  stdio: 'pipe',
})
process.env.DATABASE_URL = `file:${databasePath}`
const client = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
;(globalThis as typeof globalThis & { prisma?: unknown }).prisma = client
const { createTargetProjectFixture } = await import('../../../../src/test/migrated-test-database')
const { addManagedProviderAssignment } = await import('../../../../src/test/quality-journey-provider-fixture')
const { registerAppraiseOperations } = await import('../../../../packages/appraisejs/src/mcp/registry')
const { createManagedQualityJourneyRoleDelivery } =
  await import('../../../../src/services/coordinator/quality-journey-managed-role-delivery')
const { getQualityJourney } = await import('../../../../src/services/coordinator/quality-journey-service')
const { getQualityJourneyAnalysis } =
  await import('../../../../src/services/coordinator/quality-journey-analysis-service')

const processRuntime = await import('../../../../src/services/coordinator/quality-journey-process-supervisor')
const { createQualityJourneyProcessSupervisor } = processRuntime
const { syntheticNativeManifest } =
  await import('../../../../src/lib/quality-journey/codex-app-server/native-qualification.test-support')
const { captureNativeQualificationPlan, nativeQualificationDigest, renderNativeQualificationConfiguration } =
  await import('../../../../src/lib/quality-journey/codex-app-server/native-qualification-contract')
const { expectedNativeMcpConfiguration, nativeQualificationFeatureControls, verifyNativeQualificationConfiguration } =
  await import('../../../../src/lib/quality-journey/codex-app-server/native-qualification-configuration')
const { launchNativeQualificationChild, claimOriginalNativeQualificationChild, originalNativeQualificationLossOwner } =
  await import('../../../../src/lib/quality-journey/codex-app-server/native-qualification-child')
const { NativeStartupMetadata, nativeStartupWarning } =
  await import('../../../../src/lib/quality-journey/codex-app-server/native-startup-metadata')
const { createManagedWorkerRegistrationProfile } =
  await import('../../../../src/lib/quality-journey/managed-worker-gateway')
const { canonicalContractJson } = await import('../../../../src/lib/catalog-contracts')

function assertOwnedCleanup(
  cleanup: ReturnType<ReturnType<typeof createQualityJourneyProcessSupervisor>['snapshot']>['cleanup'],
) {
  assert.equal(cleanup?.status, 'stopped')
  assert.equal(cleanup?.groupExitObserved, true)
  assert.equal(cleanup?.privateRootRemoved, true)
}

test(
  'controlled R3 original canonical Analysis -> zero-response HTTP drop -> exact canonical pause -> original cleanup -> fresh artifact snapshot',
  { timeout: 20_000 },
  async () => {
    await createTargetProjectFixture(client, {
      id: 'integrated-r3-target',
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:${source}`,
      canonicalPath: source,
      displayName: 'Controlled R3 canonical HTTP flow',
      fingerprint: `sha256:${'a'.repeat(64)}`,
    })
    const fixture = await addManagedProviderAssignment(
      client,
      'integrated-r3-target',
      `integrated-r3-${randomUUID()}`,
      900,
    )
    const before = (await getQualityJourney(fixture.scope, client)).journey
    const definitions = registerAppraiseOperations({
      server: { registerTool: () => ({}), registerResource: () => ({}) } as never,
      api: {} as never,
      options: { baseUrl: 'http://127.0.0.1:3000', cwd: process.cwd(), coordinatorId: 'controlled-r3' },
    })
    const registration = createManagedWorkerRegistrationProfile('REQUIREMENT_ANALYZER', definitions)
    const portProbe = createServer()
    await new Promise<void>(resolve => portProbe.listen(0, '127.0.0.1', resolve))
    const address = portProbe.address()
    assert.ok(address && typeof address !== 'string')
    const port = address.port
    await new Promise<void>(resolve => portProbe.close(() => resolve()))
    const n = syntheticNativeManifest(),
      capability = n.capability,
      route = `/appraise-worker/${'b'.repeat(32)}`
    const metadata = lstatSync(databasePath, { bigint: true })
    n.manifest.database = { path: databasePath, dev: String(metadata.dev), ino: String(metadata.ino) }
    n.manifest.binding = Object.fromEntries(
      Object.keys(n.manifest.binding).map(key => [key, fixture.prepareInput[key as keyof typeof fixture.prepareInput]]),
    ) as typeof n.manifest.binding
    n.manifest.endpoint = {
      ...n.manifest.endpoint,
      port,
      path: route,
      capabilityCommitment: recoveryDigest(capability),
    }
    n.manifest.roleProfileDigest = registration.contractDigest
    n.manifest.enabledTools = registration.tools.map(tool => tool.name)
    n.manifest.limits.requestMs = 2000
    n.manifest.limits.acknowledgementMs = 2000
    n.manifest.limits.cleanupMs = 5000
    const envelope = [{ type: 'text', text: 'approved' }] // Exact inert wire fixture sentinel, not an approval assertion.
    n.manifest.envelopeDigest = nativeQualificationDigest(
      canonicalContractJson({ input: envelope, model: 'gpt-5.5', effort: 'medium' }),
    )
    n.manifest.configurationSha256 = n.sha(renderNativeQualificationConfiguration(n.manifest, capability))
    const configuration = {
      origins: {},
      config: {
        model: 'gpt-5.5',
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
        mcp_servers: { appraise_worker: expectedNativeMcpConfiguration(n.manifest, capability) },
      },
    }
    const threadId = '019a8b91-41d3-7abc-8def-0123456789ab'
    const body = readFileSync(
      new URL(
        '../../../../src/lib/quality-journey/codex-app-server/fixtures/inert-startup-metadata.cjs',
        import.meta.url,
      ),
      'utf8',
    ).replaceAll('inert-thread', threadId)
    writeFileSync(
      n.manifest.native.path,
      `#!${process.execPath}\nconst startupScenario = 'same-chunk'\nconst startupWarning = ${JSON.stringify(nativeStartupWarning)}\nconst safeConfiguration = ${JSON.stringify(configuration)}\n` +
        body,
      { mode: 0o700 },
    )
    n.manifest.native.sha256 = n.sha(readFileSync(n.manifest.native.path))
    const plan = captureNativeQualificationPlan(n.manifest, capability),
      profile = Object.freeze({}) as NativeOutcomeProfile
    const envelopeDigest = n.manifest.envelopeDigest
    const control = createNativeQualificationLossControl({
      caseKind: 'R3_ACCEPTED_ANALYSIS_REPLY_LOSS',
      fixture,
      client,
      plan,
      profile,
      absoluteCleanupDeadline: Date.now() + n.manifest.limits.caseMs + n.manifest.limits.cleanupMs,
      pause: { idempotencyKey: 'integrated-r3-original-pause', reason: 'SCRIPTED_DISPOSABLE_TEST_HUMAN:M13_R3' },
    })
    bindNativeQualificationLossControl(control, {
      fixture,
      client,
      plan,
      profile,
      scope: { ...fixture.scope, workItemId: fixture.binding.workItemId, attemptId: fixture.binding.attemptId },
    })
    const delivery = await createManagedQualityJourneyRoleDelivery({
      binding: fixture.binding,
      canonicalDefinitions: definitions,
      client,
      qualificationLoss: control,
      nativeEnvelopeDigest: envelopeDigest,
    })
    let gatewayCalls = 0,
      analysisReads = 0,
      analysisSubmissions = 0,
      closeAtHold: Promise<Readonly<{ closed: boolean; effectUnknown: boolean }>> | undefined
    const endpoint = await createOriginalLossEndpoint(
      {
        host: '127.0.0.1',
        port,
        path: route,
        capability,
        capabilityCommitment: recoveryDigest(capability),
        profile: delivery.profile,
        expectedProfileDigest: delivery.profileDigest,
        sealedGrant: delivery.sealedGrant,
        bodyBytes: 262_144,
        httpRequests: 16,
        toolCalls: 4,
        requestMs: 8000,
        cleanupMs: 5000,
        async callGateway(call) {
          gatewayCalls++
          if (call.toolName === 'quality_journey_analysis_get') analysisReads++
          if (call.toolName === 'quality_journey_analysis_submit') analysisSubmissions++
          return delivery.invoke({
            callId: `original-http-${gatewayCalls}`,
            toolName: call.toolName,
            arguments: call.arguments,
          })
        },
      },
      control,
    )
    let child: Awaited<ReturnType<typeof launchNativeQualificationChild>> | undefined
    const startup = new NativeStartupMetadata()
    const observer: NativeChildOutcomeObserver = {
      validatedInitialize: () => startup.validatedInitialize(),
      closeStartup: () => startup.close(),
      startupReady: (deadline, signal) => startup.wait(deadline, signal),
      admitStartup: () => startup.admit(),
      beforeRequest(method) {
        if (method === 'thread/start') startup.assertReady()
      },
      operation(operation, method) {
        void operation
          .then(
            value => {
              if (method === 'initialize') startup.settledInitialize()
              if (method === 'config/read') {
                if (!verifyNativeQualificationConfiguration(value, n.manifest, capability))
                  throw new Error('Strict inert config refused')
                startup.verifiedConfiguration()
              }
            },
            () => startup.close(),
          )
          .catch(() => startup.close())
      },
      notification(method, params) {
        if (method === 'configWarning' || method === 'account/updated') startup.notification(method, params)
      },
      fault: () => startup.close(),
      cleanup: () => startup.close(),
    }
    const supervisor: ReturnType<typeof createQualityJourneyProcessSupervisor> = createQualityJourneyProcessSupervisor(
      { ...fixture.prepareInput, configurationDigest: `sha256:${n.manifest.configurationSha256}`, envelopeDigest },
      {
        capability: processRuntime.trustedJourneyProcessAdapter,
        configurationDigest: `sha256:${n.manifest.configurationSha256}`,
        input: envelope,
        turnAcknowledgementTimeoutMs: 2000,
        validateReadiness: value => !!value && typeof value === 'object' && 'codexHome' in value,
        nativeReadiness: {
          cwd: path.join(n.manifest.freshRoot, 'cwd'),
          validateConfiguration: value => verifyNativeQualificationConfiguration(value, n.manifest, capability),
          validateThread: value => (value as { thread?: { id?: string } }).thread?.id === threadId,
          validateRequiredMcp: value => Array.isArray((value as { data?: unknown }).data),
          mcpStatusParams: { serverName: 'appraise_worker', detail: 'full', limit: 1 },
        },
        async launch(callbacks) {
          child = await launchNativeQualificationChild(plan, {
            ...callbacks,
            qualificationLoss: control,
            assertAdmission() {
              if (supervisor.snapshot().fenced) throw new Error('Original SDK fenced')
            },
            fenceMcp: endpoint.fence,
            async closeMcp() {
              const closed = await endpoint.close()
              const proof = inspectNativeQualificationLoss(control).proof
              return closed.closed && proof.VALIDATED && proof.WITHHELD && proof.PAUSE_COMMITTED && !proof.UNPROVEN
            },
          })
          claimOriginalNativeQualificationChild(child, plan, observer)
          bindNativeQualificationLossRuntime(control, {
            owner: originalNativeQualificationLossOwner(child, plan),
            child,
            endpoint,
            logicalFence() {
              assert.equal(inspectNativeQualificationLoss(control).phase, 'HOLDING')
              endpoint.fence()
              assert.equal(endpoint.snapshot().originalHandlers?.workerCloseEntered, false)
              child!.transport.fence('qualification_loss')
              const first = child!.stop()
              assert.equal(child!.stop(), first)
              closeAtHold = endpoint.close()
              void supervisor.cancel().catch(() => {})
            },
          })
          return child
        },
      },
      client,
    )
    try {
      await supervisor.start()
    } catch {
      const observed = supervisor.snapshot(),
        transport = child?.transport.snapshot()
      writeFileSync(
        path.join(evidence, 'startup-refusal.json'),
        JSON.stringify(
          {
            phase: observed.state,
            reason: observed.reason,
            originalStartState: observed.originalStartState,
            turnStartEntered: observed.turnStartEntered,
            nativeThreadObserved: typeof observed.threadId === 'string',
            nativeTurnObserved: typeof observed.turnId === 'string',
            transport,
            loss: inspectNativeQualificationLoss(control),
          },
          null,
          2,
        ),
        { flag: 'wx', mode: 0o600 },
      )
      throw new Error(`Controlled inert R3 startup refused (${observed.reason ?? 'UNCLASSIFIED'})`)
    }
    assert.equal(supervisor.snapshot().originalStartState, 'FULFILLED')
    assert.equal(supervisor.snapshot().turnId, 'inert-turn')
    async function post(message: unknown, session?: string) {
      return new Promise<{
        responseSeen: boolean
        body: string
        information: number
        status?: number
        session?: string
        errorCode?: string
      }>(resolve => {
        const bytes = Buffer.from(JSON.stringify(message))
        let information = 0,
          responseSeen = false
        const original = request(
          {
            host: '127.0.0.1',
            port,
            path: route,
            method: 'POST',
            agent: false,
            headers: {
              authorization: `Bearer ${capability}`,
              'content-type': 'application/json',
              accept: 'application/json, text/event-stream',
              'content-length': bytes.length,
              ...(session ? { 'mcp-session-id': session, 'mcp-protocol-version': '2025-03-26' } : {}),
            },
          },
          response => {
            responseSeen = true
            const body: Buffer[] = []
            response.on('data', (chunk: Buffer) => body.push(chunk))
            response.on('end', () =>
              resolve({
                responseSeen,
                body: Buffer.concat(body).toString('utf8'),
                information,
                status: response.statusCode,
                session:
                  typeof response.headers['mcp-session-id'] === 'string'
                    ? response.headers['mcp-session-id']
                    : undefined,
              }),
            )
          },
        )
        original.on('information', () => {
          information++
        })
        original.on('error', error =>
          resolve({ responseSeen, body: '', information, errorCode: (error as NodeJS.ErrnoException).code ?? 'ERROR' }),
        )
        original.setTimeout(6000, () => original.destroy())
        original.end(bytes)
      })
    }
    const initialized = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'controlled-canonical-r3', version: '1' },
      },
    })
    assert.equal(initialized.status, 200)
    assert.ok(initialized.session)
    assert.equal(
      (await post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, initialized.session)).status,
      202,
    )
    assert.equal(
      (
        await post(
          {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: 'quality_journey_analysis_get', arguments: {} },
          },
          initialized.session,
        )
      ).status,
      200,
    )
    const args = {
      idempotencyKey: `runtime-generated-${randomUUID()}`,
      charter: {
        charterId: `charter-${randomUUID()}`,
        analysisRevisionId: `analysis-${randomUUID()}`,
        cycleId: fixture.created.journey.activeCycleId,
        requirementRevisionId: fixture.created.journey.activeRevisionIds.journey,
        objectives: ['Controlled canonical R3 proof'],
        scope: { included: ['Fixture'], excluded: [] },
        actors: ['Tester'],
        requirements: [{ requirementId: 'REQ-R3', statement: 'Accept one Analysis.', sourceRefs: ['brief:1'] }],
        obligations: [
          {
            obligationId: 'OBL-R3',
            requirementId: 'REQ-R3',
            statement: 'Recover canonical identity after response loss.',
            acceptanceSignals: ['Canonical Analysis identity'],
          },
        ],
        constraints: [],
        assumptions: [],
        risks: [],
        acceptanceSignals: ['Canonical Analysis identity'],
        retiredRequirementIds: [],
        questions: [],
        resolvedQuestionAnswerIds: [],
      },
    }
    const dropped = await post(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'quality_journey_analysis_submit', arguments: args },
      },
      initialized.session,
    )
    assert.deepEqual(dropped, { responseSeen: false, body: '', information: 0, errorCode: 'ECONNRESET' })
    assert.deepEqual(await waitNativeQualificationLossPhysicalRelease(control), {
      pauseCommitted: true,
      emergency: false,
    })
    assert.ok(closeAtHold)
    assert.equal((await closeAtHold).closed, true)
    await supervisor.waitOriginalStop()
    await waitNativeQualificationLossQuiescence(control)
    assertNativeQualificationLossQuiescent(control)
    assertOwnedCleanup(supervisor.snapshot().cleanup)
    const facts = inspectNativeQualificationLoss(control),
      reply = endpoint.snapshot().lossReply
    assert.deepEqual(facts.proof, { VALIDATED: true, WITHHELD: true, PAUSE_COMMITTED: true, UNPROVEN: false })
    assert.equal(facts.selection?.rawWorkerArgumentsDigest, recoveryDigest(args))
    assert.equal(facts.selection?.nativeEnvelopeDigest, envelopeDigest)
    assert.ok(facts.pause && facts.artifact && reply)
    assert.ok(facts.pause.expectedVersion > before.version)
    assert.equal(reply.closed, true)
    assert.equal(reply.zeroByteDelta, true)
    assert.equal(gatewayCalls, 2)
    assert.equal(analysisReads, 1)
    assert.equal(analysisSubmissions, 1)
    const paused = await getQualityJourney(fixture.scope, client)
    assert.equal(paused.journey.status, 'PAUSED')
    assert.equal(paused.journey.version, facts.pause.version)
    const analysis = await getQualityJourneyAnalysis(fixture.scope, client)
    assert.equal(analysis.revisions.length, 1)
    assert.equal(analysis.revisions[0].id, facts.artifact.id)
    assert.equal(analysis.revisions[0].contentHash, facts.artifact.contentHash)
    const { binding, sourceWitness } = await sealRecoverySnapshot({
      binding: {
        version: 'M13_SENDER_FREE_RECOVERY_READ_V1',
        actor: 'BOUND_DISPOSABLE_PROJECT_READER',
        caseKind: 'R3_ACCEPTED_ANALYSIS_REPLY_LOSS',
        ...fixture.scope,
        expectedVersion: facts.pause.version,
        expectedStateHash: facts.pause.expectedStateHash,
        pauseEventId: facts.pause.eventId,
        attemptId: fixture.binding.attemptId,
        expectedArtifact: { kind: 'ANALYSIS_REVISION', id: facts.artifact.id, contentHash: facts.artifact.contentHash },
      },
      originalDatabasePath: databasePath,
      evidenceRoot: recoveryEvidenceRoot,
      originalOwner: {
        async provePausedAndCleaned() {
          assertNativeQualificationLossQuiescent(control)
        },
        async closeOtherOriginalWriters() {},
        async checkpointOriginalAndDisconnect() {
          assertNativeQualificationLossQuiescent(control)
          const rows = await client.$queryRawUnsafe<Array<{ busy: number | bigint }>>('PRAGMA wal_checkpoint(TRUNCATE)')
          assert.equal(Number(rows[0].busy), 0)
          await client.$disconnect()
          return { busy: 0, activeTransactions: 0, disconnected: true }
        },
      },
    })
    const observation = await readRecoverySnapshotFresh(binding, sourceWitness)
    assert.equal(observation.artifact, 'MATCHED')
    assert.equal(observation.providerEffects, 'UNRESOLVED')
    assert.equal(observation.replacementGuard, 'REFUSED')
    assert.equal(observation.transferGuard, 'REFUSED')
    assert.equal(observation.hostingCleanupGuard, 'PASSED') // Genuine original local cleanup is durably observed; provider/HUB uncertainty is separate.
    writeFileSync(
      path.join(evidence, 'proof.json'),
      JSON.stringify(
        {
          scope: 'OFFLINE_GENUINE_INERT_NODE_SDK_CANONICAL_HTTP_READER_NO_REAL_PROVIDER_OR_PROFILE_QUALIFICATION',
          facts,
          reply,
          dropped,
          observation,
          gatewayCalls: { total: gatewayCalls, analysisReads, analysisSubmissions },
          ownedCleanup: supervisor.snapshot().cleanup,
          nativeRuntimeQualified: false,
        },
        null,
        2,
      ),
      { flag: 'wx', mode: 0o600 },
    )
  },
)
