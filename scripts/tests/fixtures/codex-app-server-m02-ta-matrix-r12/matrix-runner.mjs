/** Reviewed T2 composition. Import performs no native, socket, database or filesystem effect. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { POLICY } from './policy.mjs'
import { createR11OwnedHostObserver } from '../codex-app-server-m02-ta-owned-host-observer-r11/observer.mjs'
import { DurablePhaseJournal } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'
import { createMatrixJournalAdapter } from '../codex-app-server-m02-ta-matrix-r10/journal-adapter.mjs'
import { createTrustedLauncher } from './launcher.mjs'
import { createMatrixAuditSession } from '../codex-app-server-m02-ta-matrix-r10/audit-session.mjs'
import { buildMatrixCaseOperations } from '../codex-app-server-m02-ta-matrix-r10/case-script-plan.mjs'
import { createMatrixScriptSession } from '../codex-app-server-m02-ta-matrix-r10/script-session.mjs'
import { createB14NativeSession } from '../codex-app-server-m02-ta-matrix-r10/native-session.mjs'
import { createB14PermissionEvidence } from '../codex-app-server-m02-ta-matrix-r10/b14-permission-evidence.mjs'
import {
  createP00ProtocolVerifiers,
  verifyP00Completion,
} from '../codex-app-server-m02-ta-matrix-r10/p00-readiness.mjs'
import { readMatrixChildReceipt } from './child-evidence.mjs'
import { verifyMcpChildReceipt } from '../codex-app-server-m02-ta-matrix-r10/mcp-readiness.mjs'
import { writeMatrixCaseReceipt } from './case-receipts.mjs'
import { stageMatrixModules } from './matrix-stage.mjs'
import { verifyR12MatrixPreparation } from './preparation.mjs'
import { writeStartupFailure } from './startup-failure.mjs'

const sha = value => createHash('sha256').update(value).digest('hex')
const T2 = POLICY.cases.filter(item => item.phase === 'T2')
const prompt =
  'Complete this fixed synthetic M02 case using only the one scripted Code Mode response. Do not request extra tools or retry.'
const initialize = caseId => ({
  clientInfo: { name: 'appraise_m02_t2', version: '1' },
  capabilities: { experimentalApi: caseId === 'B14', explicitGatewayOauth: true, requestAttestation: false },
})
const turn = threadId => ({
  threadId,
  model: POLICY.model,
  effort: POLICY.reasoning,
  input: [{ type: 'text', text: prompt, text_elements: [] }],
})
const consistentOwnedExit = observation => {
  const exit = observation?.exit,
    close = observation?.close
  return Boolean(
    exit &&
    close &&
    exit.code === close.code &&
    exit.signal === close.signal &&
    ((exit.code === 0 && exit.signal === null) || (exit.code === null && exit.signal === 'SIGTERM')),
  )
}

async function canonicalOutcome(item, canonicalBridge) {
  if (item.id === 'P00')
    return { accepted: true, evidenceClass: 'NO_CANONICAL_START', acceptances: 0, artifacts: 0, effects: 0 }
  const { fixture, bridge } = await canonicalBridge.ready()
  const count = await fixture.client.qualityJourneyExternalSubmissionAcceptance.count()
  const artifacts = await fixture.client.qualityJourneyArtifact.count()
  const base = {
    acceptances: count,
    artifacts,
    effects: fixture.counts.effects,
    evidenceClass: 'DISPOSABLE_CANONICAL_DATABASE_READ',
  }
  if (item.expected !== 'accepted')
    return { ...base, accepted: count === 0 && artifacts === 0 && fixture.counts.effects === 0 }
  if (count !== 1 || artifacts !== 1 || fixture.counts.effects !== 1) return { ...base, accepted: false }
  const correlation = bridge.lastSubmissionCorrelation
  if (!correlation?.requestId || !correlation.idempotencyKey) return { ...base, accepted: false }
  const replay = await bridge.reconcileSubmission({ requestId: correlation.requestId })
  if (replay.outcome !== 'ACCEPTED' || !replay.receiptId || replay.artifactIds.length !== 1)
    return { ...base, accepted: false }
  const persisted = await fixture.readPersistedAcceptance({ idempotencyKey: correlation.idempotencyKey })
  return {
    ...base,
    accepted: persisted.acceptanceId === replay.receiptId && replay.artifactIds[0] === persisted.artifactId,
    receiptId: replay.receiptId,
    artifactIds: replay.artifactIds,
  }
}

/**
 * The caller must provide an independent exact-review verifier and an authority callback checked
 * again by native ports before every owned effect. This function is never invoked by preparation.
 */
export async function runPreparedT2Matrix({
  prepared,
  verifyExactReview,
  authorize,
  observerOs,
  clock = Date.now,
  io = undefined,
  loadCanonical = null,
  readChildReceipt = readMatrixChildReceipt,
  writeReceipt = writeMatrixCaseReceipt,
} = {}) {
  if (
    prepared?.manifest?.phase !== 'T2' ||
    prepared.manifest.root !== POLICY.roots.T2 ||
    prepared.manifest.nativeFileCreationUmask !== '0077' ||
    prepared.manifest.cases?.join(',') !== T2.map(item => item.id).join(',') ||
    typeof verifyExactReview !== 'function' ||
    typeof authorize !== 'function' ||
    typeof observerOs?.identity !== 'function' ||
    typeof readChildReceipt !== 'function' ||
    typeof writeReceipt !== 'function'
  )
    throw new Error('reviewed T2 composition ports missing')
  if ((await verifyExactReview({ manifestDigest: prepared.manifestDigest, manifest: prepared.manifest })) !== true)
    throw new Error('exact T2 review absent')
  const checked = await verifyR12MatrixPreparation()
  if (checked.manifestDigest !== prepared.manifestDigest || checked.manifestFileSha256 !== prepared.manifestFileSha256)
    throw new Error('T2 preparation changed after exact review')
  if (fs.existsSync(POLICY.roots.T2)) throw new Error('fixed T2 root already exists; no resume')
  const canonicalPin = prepared.manifest.artifacts.find(item => item.purpose === 'matrix-canonical-backend')
  if (!canonicalPin) throw new Error('matrix canonical pin absent')
  process.umask(0o077)
  if (process.umask() !== 0o077) throw new Error('private native umask unavailable')
  fs.mkdirSync(POLICY.roots.T2, { mode: 0o700 })
  const root = fs.lstatSync(POLICY.roots.T2)
  if (!root.isDirectory() || root.isSymbolicLink() || root.uid !== process.getuid() || (root.mode & 0o777) !== 0o700)
    throw new Error('new T2 root identity')
  const durable = DurablePhaseJournal.create({ directory: POLICY.roots.T2, phase: 'T2' })
  const journal = createMatrixJournalAdapter(durable)
  let canonical
  try {
    const stageRoot = join(POLICY.roots.T2, 'supervisor')
    const staged = await stageMatrixModules({
      prepared,
      stageRoot,
      phaseRoot: POLICY.roots.T2,
      expectedPhaseIdentity: { dev: root.dev, ino: root.ino },
    })
    const stageReceipt = join(stageRoot, 'module-stage.json')
    const receipt = fs.openSync(
      stageReceipt,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
      0o600,
    )
    try {
      fs.writeSync(
        receipt,
        Buffer.from(
          `${JSON.stringify({
            schema: 'appraise.m02-ta-matrix-module-stage/v1',
            stagedDigest: staged.stagedDigest,
            copiedFiles: staged.copiedFiles,
            canonicalSha256: canonicalPin.sha256,
            resolutionClass: 'PRIVATE_PINNED_MODULES_AND_MIGRATIONS',
          })}\n`,
        ),
      )
      fs.fsyncSync(receipt)
    } finally {
      fs.closeSync(receipt)
    }
    const stageDirectory = fs.openSync(
      stageRoot,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
    )
    try {
      fs.fsyncSync(stageDirectory)
    } finally {
      fs.closeSync(stageDirectory)
    }
    process.chdir(stageRoot)
    canonical = loadCanonical
      ? await loadCanonical(staged.bundlePath)
      : await import(pathToFileURL(staged.bundlePath).href)
    if (
      typeof canonical?.createMatrixCanonicalBridge !== 'function' ||
      typeof canonical?.canonicalPacket !== 'function'
    )
      throw new Error('canonical bundle exports missing')
  } catch (error) {
    try {
      writeStartupFailure({ stage: 'MODULE_STAGE_OR_IMPORT', error })
    } catch {
      /* journal remains authoritative UNKNOWN */
    }
    if (!journal.snapshot().fenced) journal.markUnknown('stage-or-import-uncertain')
    durable.close()
    return Object.freeze({
      status: 'UNKNOWN',
      completed: 0,
      failedCase: null,
      journal: journal.snapshot(),
      runtimeQualified: false,
    })
  }
  const launcher = createTrustedLauncher({
    prepared,
    precreatedRootIdentity: { dev: root.dev, ino: root.ino },
    journal,
    authorize,
    io,
    clock,
    verifyMcpStartup: () => false,
    verifyRequiredMcpFailure: () => false,
    verifyRequiredMcpTelemetry: () => false,
    createObserver: ({ spawnOwnedCodex, allowedDirectChildPaths }) =>
      createR11OwnedHostObserver({ spawnOwnedCodex, allowedDirectChildPaths, os: observerOs }),
    recordProtocolFailure: details => {
      const caseId = journal.snapshot().activeCase
      if (caseId) writeReceipt(caseId, 'protocol-failure', { caseId, ...details })
    },
  })
  let completed = 0
  try {
    for (const item of T2) {
      const caseId = item.id
      const canonicalBridge = canonical.createMatrixCanonicalBridge({
        role: item.role,
        caseId,
        workspace: join(POLICY.roots.T2, 'cases', caseId, 'supervisor'),
        onUnknown: () => {
          if (!journal.snapshot().fenced) journal.markUnknown('canonical-ambiguity')
        },
      })
      const auditSession = caseId === 'P00' ? null : createMatrixAuditSession({ caseId, journal })
      const p00 = caseId === 'P00' ? createP00ProtocolVerifiers({ journal, readReceipt: readChildReceipt }) : null
      let started = null,
        script = null,
        stopped = false
      try {
        started = await launcher.startCase({
          caseId,
          canonicalBridge,
          auditSession,
          verifyRequiredMcpFailureCase: p00?.verifyRequiredMcpFailure,
          verifyRequiredMcpTelemetryCase: p00?.verifyRequiredMcpTelemetry,
          verifyMcpStartupCase: async () => {
            if (!started || caseId === 'P00') return false
            const childReceipt = await readChildReceipt(caseId, 'mcp-startup.json')
            const { bridge } = await canonicalBridge.ready()
            return verifyMcpChildReceipt({
              receipt: childReceipt,
              event: 'sdk-connect-returned',
              caseId,
              bootstrapProof: started.bootstrapProof,
              profileDigest: bridge.advertisedProfile.profileDigest,
            })
          },
          prepareScript: async ({ config, getPeer }) => {
            if (caseId === 'P00') return null
            const receipt = (name, value) => writeReceipt(caseId, name, value)
            if (caseId === 'B14') {
              let permissionGate
              script = createB14NativeSession({
                seal: prepared.seal,
                journal,
                expectedConfigSha256: `sha256:${sha(JSON.stringify(config.config))}`,
                permissionEvidence: () => permissionGate.permissionEvidence(),
                writeReceipt: receipt,
              })
              permissionGate = createB14PermissionEvidence({
                journal,
                getPeer,
                plan: script.plan,
                writeReceipt: receipt,
              })
              return {
                handle: script.handle,
                verifyPermissionRequest: permissionGate.verifyRequest,
                verifyPermissionTerminal: permissionGate.verifyTerminal,
                permissionGate,
              }
            }
            const { fixture } = await canonicalBridge.ready()
            const operations = await buildMatrixCaseOperations({
              caseId,
              fixture,
              canonicalPacket: canonical.canonicalPacket,
            })
            script = createMatrixScriptSession({
              caseId,
              seal: prepared.seal,
              journal,
              operations,
              auditSession,
              writeReceipt: receipt,
            })
            return script
          },
        })
        await started.peer.request('initialize', initialize(caseId), `${caseId}-initialize`)
        if (caseId !== 'P00') {
          const threadId = await started.waitForThread()
          await started.peer.request('turn/start', turn(threadId), `${caseId}-turn-start`)
        }
        const terminal = await started.waitForTerminal()
        if (terminal !== (caseId === 'P00' ? 'required-mcp-failed' : 'terminal'))
          throw new Error('matrix terminal phase mismatch')
        let observedHost = null
        let hostCleanup = null
        if (caseId !== 'P00') observedHost = started.observer.assertLiveHostBeforeCaseComplete()
        if (caseId === 'P00') await started.stopOwned()
        else {
          hostCleanup = await started.observer.stopAndVerify()
          if (hostCleanup.originalHostGone !== true || !observedHost) throw new Error('owned host cleanup uncertain')
        }
        stopped = true
        const ownedExit = await started.waitForOwnedClose()
        const lifecycleKnown = consistentOwnedExit(ownedExit) && launcher.snapshot().ownedListeners === 0
        const childExit = await readChildReceipt(caseId, 'mcp-exit.json')
        const canonicalWitness = await canonicalOutcome(item, canonicalBridge)
        const canonicalKnown = canonicalWitness.accepted === true
        const ready = caseId === 'P00' ? null : await canonicalBridge.ready()
        const childKnown =
          caseId === 'P00'
            ? verifyP00Completion({ ...p00.snapshot(), journal: journal.snapshot(), ownedCodexExit: ownedExit })
                .accepted
            : verifyMcpChildReceipt({
                receipt: childExit,
                event: 'node-exit-handler',
                caseId,
                bootstrapProof: started.bootstrapProof,
                profileDigest: ready.bridge.advertisedProfile.profileDigest,
              })
        const counts = journal.snapshot().counts
        const expectedScoped =
          caseId === 'B14' ? 0 : caseId === 'P00' ? 0 : script.plans.filter(plan => !plan.rejection).length
        const expectedProvider = caseId === 'P00' ? 0 : caseId === 'B14' ? 2 : script.plans.length + 1
        const effectsKnown =
          caseId === 'P00'
            ? counts.turnStarts === 0 && counts.providerRequests === 0 && counts.scopedCalls === 0
            : counts.turnStarts === 1 &&
              counts.providerRequests === expectedProvider &&
              counts.outerCalls === (caseId === 'B14' ? 1 : item.script.operations.length) &&
              counts.scopedCalls === expectedScoped &&
              counts.auditRequests === expectedScoped * 2 &&
              (caseId !== 'B14' || counts.permissionReplies === 1)
        const scriptKnown = caseId === 'P00' || script?.snapshot().completed === true
        const evidenceKnown =
          lifecycleKnown &&
          childKnown &&
          canonicalKnown &&
          effectsKnown &&
          scriptKnown &&
          journal.snapshot().pending.length === 0 &&
          !journal.snapshot().fenced
        if (!evidenceKnown) throw new Error('case evidence incomplete')
        const witness = writeReceipt(caseId, 'case-outcome', {
          caseId,
          status: 'OBSERVED_BEFORE_CASE_COMMIT',
          expected: item.expected,
          manifestDigest: prepared.manifestDigest,
          ownedCodex: ownedExit,
          listenerClosed: launcher.snapshot().ownedListeners === 0,
          hostObservation: observedHost,
          hostCleanup,
          childEvidence: {
            evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
            sha256: sha(JSON.stringify(childExit)),
            receipt: childExit,
          },
          canonical: canonicalWitness,
          counts,
          journalSeq: journal.snapshot().seq,
          pending: journal.snapshot().pending.length,
          outcomeEvidenceClass: 'TRUSTED_SCRIPTED_CONFORMANCE_NOT_CONTAINMENT',
        })
        journal.bindCaseWitness({ caseId, sha256: witness.sha256 })
        await canonicalBridge.close()
        await started.coordinator.complete({
          outcome: item.expected,
          cleanupKnown: true,
          verifyEvidence: () =>
            lifecycleKnown &&
            childKnown &&
            canonicalKnown &&
            effectsKnown &&
            scriptKnown &&
            journal.snapshot().pending.length === 0 &&
            !journal.snapshot().fenced,
          verifyCanonical: () => canonicalKnown,
        })
        completed++
      } catch (error) {
        if (caseId === 'B01' && journal.snapshot().counts.codexStarts === 0) {
          try {
            writeStartupFailure({ stage: 'FIRST_CASE_START', error })
          } catch {
            /* journal remains authoritative UNKNOWN */
          }
        }
        if (!journal.snapshot().fenced) journal.markUnknown('ambiguous-effect')
        if (started && !stopped) await started.stopOwned().catch(() => {})
        await canonicalBridge.close().catch(() => {})
        return Object.freeze({
          status: 'UNKNOWN',
          completed,
          failedCase: caseId,
          journal: journal.snapshot(),
          runtimeQualified: false,
        })
      }
    }
    let closure
    try {
      closure = durable.closeAndVerifyTerminal()
    } catch {
      return Object.freeze({
        status: 'UNKNOWN',
        completed,
        failedCase: null,
        journal: journal.snapshot(),
        runtimeQualified: false,
      })
    }
    return Object.freeze({
      status: 'T2_CASES_COMPLETED',
      completed,
      journal: journal.snapshot(),
      closure: {
        status: closure.status,
        seq: closure.seq,
        terminalHash: closure.terminalHash,
        fileSha256: closure.fileSha256,
      },
      runtimeQualified: false,
    })
  } finally {
    durable.close()
  }
}
