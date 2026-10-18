import { createStageProgress } from './stage-progress.mjs'
/** Reviewed T2 composition. Import performs no native, socket, database or filesystem effect. */
import fs from 'node:fs'
import { createGitReadinessGate } from './git-readiness.mjs'
import { createChildPathDiagnostics } from './child-path-diagnostic.mjs'
import { createProcessStateDiagnostics } from './process-state-diagnostic.mjs'
import { writeLateCaseFailure } from './late-case-diagnostic.mjs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { POLICY } from './policy.mjs'
import { createR51OwnedHostObserver, R51_INSTALLED_HOST_FILE } from './host-file.mjs'
import { DurablePhaseJournal } from './phase-journal.mjs'
import { createMatrixJournalAdapter } from '../codex-app-server-m02-ta-matrix-r10/journal-adapter.mjs'
import { createTrustedLauncher } from './launcher.mjs'
import { createMatrixAuditSession } from '../codex-app-server-m02-ta-matrix-r10/audit-session.mjs'
import { buildMatrixCaseOperations } from '../codex-app-server-m02-ta-matrix-r10/case-script-plan.mjs'
import { createMatrixScriptSession } from './script-session.mjs'
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
import { verifyR51MatrixPreparation } from './preparation.mjs'
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
  prepareCaseAdmission,
  observerOs,
  clock = Date.now,
  io = undefined,
  createPorts = undefined,
  fileSystem = fs,
  verifyPreparation = verifyR51MatrixPreparation,
  stage = stageMatrixModules,
  createJournal = options => DurablePhaseJournal.create(options),
  createObserver = createR51OwnedHostObserver,
  chdir = directory => process.chdir(directory),
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
    typeof prepareCaseAdmission !== 'function' ||
    typeof observerOs?.identity !== 'function' ||
    typeof readChildReceipt !== 'function' ||
    typeof writeReceipt !== 'function'
  )
    throw new Error('reviewed T2 composition ports missing')
  if ((await verifyExactReview({ manifestDigest: prepared.manifestDigest, manifest: prepared.manifest })) !== true)
    throw new Error('exact T2 review absent')
  const checked = await verifyPreparation()
  if (checked.manifestDigest !== prepared.manifestDigest || checked.manifestFileSha256 !== prepared.manifestFileSha256)
    throw new Error('T2 preparation changed after exact review')
  if (fileSystem.existsSync(POLICY.roots.T2)) throw new Error('fixed T2 root already exists; no resume')
  const canonicalPin = prepared.manifest.artifacts.find(item => item.purpose === 'matrix-canonical-backend')
  if (!canonicalPin) throw new Error('matrix canonical pin absent')
  process.umask(0o077)
  if (process.umask() !== 0o077) throw new Error('private native umask unavailable')
  fileSystem.mkdirSync(POLICY.roots.T2, { mode: 0o700 })
  const root = fileSystem.lstatSync(POLICY.roots.T2)
  if (!root.isDirectory() || root.isSymbolicLink() || root.uid !== process.getuid() || (root.mode & 0o777) !== 0o700)
    throw new Error('new T2 root identity')
  const durable = createJournal({ directory: POLICY.roots.T2, phase: 'T2' })
  let progress
  try {
    progress = createStageProgress({ directory: POLICY.roots.T2, io: fileSystem })
  } catch (error) {
    durable.markUnknown('STAGE_PROGRESS_UNCERTAIN')
    durable.close()
    throw error
  }
  const baseJournal = createMatrixJournalAdapter(durable)
  const journal = Object.freeze({
    ...baseJournal,
    finish: input => {
      const caseId = baseJournal.snapshot().activeCase
      progress.record(caseId, 'CASE_FINISH_APPEND_ENTER')
      const result = baseJournal.finish(input)
      progress.record(caseId, 'CASE_FINISH_APPEND_RETURN')
      return result
    },
  })
  let canonical
  try {
    const stageRoot = join(POLICY.roots.T2, 'supervisor')
    const staged = await stage({
      prepared,
      stageRoot,
      phaseRoot: POLICY.roots.T2,
      expectedPhaseIdentity: { dev: root.dev, ino: root.ino },
    })
    const stageReceipt = join(stageRoot, 'module-stage.json')
    const receipt = fileSystem.openSync(
      stageReceipt,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
      0o600,
    )
    try {
      fileSystem.writeSync(
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
      fileSystem.fsyncSync(receipt)
    } finally {
      fileSystem.closeSync(receipt)
    }
    const stageDirectory = fileSystem.openSync(
      stageRoot,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
    )
    try {
      fileSystem.fsyncSync(stageDirectory)
    } finally {
      fileSystem.closeSync(stageDirectory)
    }
    chdir(stageRoot)
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
      writeStartupFailure({ stage: 'MODULE_STAGE', error, io: fileSystem })
    } catch {
      /* journal remains authoritative UNKNOWN */
    }
    if (!journal.snapshot().fenced) journal.markUnknown('stage-or-import-uncertain')
    try {
      progress.close()
    } finally {
      durable.close()
    }
    return Object.freeze({
      status: 'UNKNOWN',
      completed: 0,
      failedCase: null,
      journal: journal.snapshot(),
      runtimeQualified: false,
    })
  }
  let childPaths = null
  const launcher = createTrustedLauncher({
    prepared,
    precreatedRootIdentity: { dev: root.dev, ino: root.ino },
    journal,
    authorize,
    prepareCaseAdmission,
    io,
    diagnosticIo: fileSystem,
    ...(createPorts ? { createPorts } : {}),
    clock,
    verifyMcpStartup: () => false,
    verifyRequiredMcpFailure: () => false,
    verifyRequiredMcpTelemetry: () => false,
    createObserver: ({ spawnOwnedCodex, allowedDirectChildPaths }) =>
      createObserver({ spawnOwnedCodex, allowedDirectChildPaths, os: childPaths.ports }),
    recordProtocolFailure: details => {
      const caseId = journal.snapshot().activeCase
      if (caseId) writeReceipt(caseId, 'protocol-failure', { caseId, ...details })
    },
  })
  let completed = 0
  try {
    for (const item of T2) {
      const processStates = createProcessStateDiagnostics(observerOs)
      childPaths = createChildPathDiagnostics(processStates.ports, {
        expectedHostPath: R51_INSTALLED_HOST_FILE.path,
        interpreterPath: prepared.manifest.artifacts.find(item => item.purpose === 'interpreter')?.path,
        codexPath: POLICY.executable.path,
      })
      const gitReadiness = createGitReadinessGate({
        os: childPaths.ports,
        expectedHostPath: R51_INSTALLED_HOST_FILE.path,
        interpreterPath: prepared.manifest.artifacts.find(item => item.purpose === 'interpreter')?.path,
      })
      let lateStage = 'CASE_START'
      const lateGates = {
        lifecycle: null,
        child: null,
        canonical: null,
        effectCounts: null,
        script: null,
        pendingEmpty: null,
        unfenced: null,
      }
      const caseId = item.id
      const recordProgress = stage => progress.record(caseId, stage)
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
        stopped = false,
        activeStageMarker = null,
        activeDiagnosticMarker = null,
        activeOutputMarker = null
      try {
        recordProgress('NEXT_CASE_ENTER')
        started = await launcher.startCase({
          recordProgress,
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
              onStage: stage => activeStageMarker?.(stage),
              onDiagnostic: detail => activeDiagnosticMarker?.(detail),
              onOutputObservation: observation => activeOutputMarker?.(observation),
            })
            return {
              ...script,
              handle: input => {
                activeStageMarker = input.markStage
                activeDiagnosticMarker = input.markDiagnostic
                activeOutputMarker = input.markOutput
                try {
                  return script.handle(input)
                } finally {
                  activeStageMarker = null
                  activeDiagnosticMarker = null
                  activeOutputMarker = null
                }
              },
            }
          },
        })
        await started.peer.request('initialize', initialize(caseId), `${caseId}-initialize`)
        if (caseId !== 'P00') {
          const threadId = await started.waitForThread()
          await started.peer.request('turn/start', turn(threadId), `${caseId}-turn-start`)
        }
        lateStage = 'WAIT_TERMINAL'
        const terminal = await started.waitForTerminal()
        lateStage = 'TERMINAL_PHASE_CHECK'
        if (terminal !== (caseId === 'P00' ? 'required-mcp-failed' : 'terminal'))
          throw new Error('matrix terminal phase mismatch')
        lateStage = 'PATH_PROFILE_CHECK'
        await started.verifyPathDirectory()
        let observedHost = null
        let hostCleanup = null
        lateStage = 'GIT_READINESS'
        if (caseId !== 'P00') await gitReadiness.waitForReady(started.child, started.remainingCaseBudget)
        lateStage = 'HOST_LIVE_CHECK'
        if (caseId !== 'P00') {
          await gitReadiness.assertCompletionBudget()
          observedHost = started.observer.assertLiveHostBeforeCaseComplete()
          gitReadiness.assertFinalHost(observedHost)
        }
        if (caseId === 'P00') await started.stopOwned()
        else {
          lateStage = 'OWNED_STOP_VERIFY'
          hostCleanup = await started.observer.stopAndVerify()
          if (hostCleanup.originalHostGone !== true || !observedHost) throw new Error('owned host cleanup uncertain')
        }
        stopped = true
        lateStage = 'OWNED_CLOSE_WAIT'
        const ownedExit = await started.waitForOwnedClose()
        const lifecycleKnown = consistentOwnedExit(ownedExit) && launcher.snapshot().ownedListeners === 0
        lateGates.lifecycle = lifecycleKnown
        lateStage = 'CHILD_EXIT_READ'
        const childExit = await readChildReceipt(caseId, 'mcp-exit.json')
        lateStage = 'CANONICAL_OUTCOME'
        const canonicalWitness = await canonicalOutcome(item, canonicalBridge)
        const canonicalKnown = canonicalWitness.accepted === true
        lateGates.canonical = canonicalKnown
        lateStage = 'CHILD_EXIT_VERIFY'
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
        lateGates.child = childKnown
        lateStage = 'EFFECT_COUNTS'
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
        lateGates.effectCounts = effectsKnown
        lateStage = 'SCRIPT_COMPLETION'
        const scriptKnown = caseId === 'P00' || script?.snapshot().completed === true
        lateGates.script = scriptKnown
        lateGates.pendingEmpty = journal.snapshot().pending.length === 0
        lateGates.unfenced = !journal.snapshot().fenced
        lateStage = 'EVIDENCE_CONJUNCTION'
        const environmentProfile = await started.verifyPathDirectory()
        const evidenceKnown =
          lifecycleKnown &&
          childKnown &&
          canonicalKnown &&
          effectsKnown &&
          scriptKnown &&
          journal.snapshot().pending.length === 0 &&
          !journal.snapshot().fenced
        if (!evidenceKnown) throw new Error('case evidence incomplete')
        lateStage = 'CASE_WITNESS_WRITE'
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
          ...(caseId === 'B14'
            ? { permissionRequestDiagnostic: started.peer.snapshot().permissionDiagnostic ?? null }
            : {}),
          journalSeq: journal.snapshot().seq,
          pending: journal.snapshot().pending.length,
          outcomeEvidenceClass: 'TRUSTED_SCRIPTED_CONFORMANCE_NOT_CONTAINMENT',
          childPaths: childPaths.snapshot(),
          gitReadiness: gitReadiness.snapshot(),
          processStates: processStates.snapshot(),
          environmentProfile,
        })
        journal.bindCaseWitness({ caseId, sha256: witness.sha256 })
        lateStage = 'CANONICAL_CLOSE'
        await canonicalBridge.close()
        lateStage = 'CASE_COMMIT'
        recordProgress('CASE_COMPLETE_ENTER')
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
        recordProgress('CASE_COMPLETE_RETURN')
        completed++
      } catch (error) {
        if (caseId === 'B01' && journal.snapshot().counts.codexStarts === 0) {
          try {
            writeStartupFailure({ stage: error?.operationStage ?? 'FIRST_CASE_START', error, io: fileSystem })
          } catch {
            /* journal remains authoritative UNKNOWN */
          }
        }
        if (!journal.snapshot().fenced) journal.markUnknown('ambiguous-effect')
        if (started && !stopped) await started.stopOwned().catch(() => {})
        await canonicalBridge.close().catch(() => {})
        let lateFailure = null
        try {
          lateFailure = writeLateCaseFailure({
            caseId,
            stage: lateStage,
            error,
            gates: lateGates,
            childPaths: childPaths.snapshot(),
            gitReadiness: gitReadiness.snapshot(),
            processStates: processStates.snapshot(),
            io: fileSystem,
          })
        } catch {
          /* Diagnostic failure must not prevent UNKNOWN or owned stop. */
        }
        return Object.freeze({
          status: 'UNKNOWN',
          completed,
          failedCase: caseId,
          lateCaseDiagnostic: lateFailure ?? { status: 'UNAVAILABLE', stage: lateStage },
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
      status: 'T2_CASES_COMPLETED_NOT_CONTAINMENT',
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
    try {
      progress.close()
    } finally {
      durable.close()
    }
  }
}
