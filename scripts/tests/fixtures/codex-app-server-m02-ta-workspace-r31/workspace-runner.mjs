/** Reviewed T3 composition source; importing it performs no runtime effect. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { POLICY } from './policy.mjs'
import { createR31OwnedHostObserver, R31_INSTALLED_HOST_FILE } from './host-file.mjs'
import {
  createGitReadinessGate,
  GIT_READINESS_FAILURE_REASONS,
} from '../codex-app-server-m02-ta-matrix-r34/git-readiness.mjs'
import { createProcessStateDiagnostics } from '../codex-app-server-m02-ta-matrix-r34/process-state-diagnostic.mjs'
import { createChildPathDiagnostics } from '../codex-app-server-m02-ta-matrix-r30/child-path-diagnostic.mjs'
import { DurablePhaseJournal } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'
import { createMatrixJournalAdapter } from '../codex-app-server-m02-ta-matrix-r10/journal-adapter.mjs'
import { stageMatrixModules } from './matrix-stage.mjs'
import { createTrustedLauncher } from './workspace-launcher.mjs'
import { createOwnedScratchProofIssuer } from './owned-scratch-proof.mjs'
import { createWorkspaceNativeSession } from './native-session.mjs'
import { assertFixedNativePlanContract, verifyNativeContractConfiguration } from './native-contracts.mjs'
import { readWorkspaceChildReceipt } from './child-evidence.mjs'
import { verifyWorkspaceMcpReceipt } from './mcp-readiness.mjs'
import { writeWorkspaceCaseReceipt } from './case-receipts.mjs'
import { verifyWorkspacePreparation } from './preparation.mjs'

const sha = value => createHash('sha256').update(value).digest('hex')
const T3 = POLICY.cases.filter(item => item.phase === 'T3')
const prompt =
  'Complete this fixed synthetic M02 workspace case using only the one scripted Code Mode response. Do not request extra tools or retry.'
const initialize = () => ({
  clientInfo: { name: 'appraise_m02_t3', version: '1' },
  capabilities: { experimentalApi: false, explicitGatewayOauth: true, requestAttestation: false },
})
const turn = threadId => ({
  threadId,
  model: POLICY.model,
  effort: POLICY.reasoning,
  input: [{ type: 'text', text: prompt, text_elements: [] }],
})
const consistentOwnedExit = observation =>
  Boolean(
    observation?.exit &&
    observation?.close &&
    observation.exit.code === observation.close.code &&
    observation.exit.signal === observation.close.signal &&
    ((observation.exit.code === 0 && observation.exit.signal === null) ||
      (observation.exit.code === null && observation.exit.signal === 'SIGTERM')),
  )

async function zeroCanonical(bridge) {
  const { fixture } = await bridge.ready()
  const acceptances = await fixture.client.qualityJourneyExternalSubmissionAcceptance.count()
  const artifacts = await fixture.client.qualityJourneyArtifact.count()
  return Object.freeze({
    accepted: acceptances === 0 && artifacts === 0 && fixture.counts.effects === 0,
    acceptances,
    artifacts,
    effects: fixture.counts.effects,
    evidenceClass: 'DISPOSABLE_CANONICAL_DATABASE_READ',
  })
}

export function verifyWorkspaceCaseCounts(counts) {
  return (
    counts?.listenerStarts === 1 &&
    counts.codexStarts === 1 &&
    counts.mcpStarts === 1 &&
    counts.helperStarts === 0 &&
    counts.controlWrites === 3 &&
    counts.threadStarts === 1 &&
    counts.turnStarts === 1 &&
    counts.providerRequests === 2 &&
    counts.outerCalls === 1 &&
    counts.workspaceActions === 1 &&
    counts.scopedCalls === 0 &&
    counts.auditRequests === 0 &&
    counts.canonicalRequests === 2 &&
    counts.permissionReplies === 0
  )
}

/** Never called by preparation; ports for independent exact review and owned OS observation are mandatory. */
export async function runPreparedT3Workspace({
  prepared,
  verifyExactReview,
  authorize,
  observerOs,
  clock = Date.now,
  io,
  fileSystem = fs,
  createPorts = undefined,
  verifyPreparation = verifyWorkspacePreparation,
  stage = stageMatrixModules,
  createJournal = options => DurablePhaseJournal.create(options),
  createObserver = createR31OwnedHostObserver,
  chdir = directory => process.chdir(directory),
  validateRequest = undefined,
  loadCanonical = null,
  readChildReceipt = readWorkspaceChildReceipt,
  writeReceipt = writeWorkspaceCaseReceipt,
} = {}) {
  if (
    prepared?.manifest?.phase !== 'T3' ||
    prepared.manifest.root !== POLICY.roots.T3 ||
    prepared.manifest.nativeFileCreationUmask !== '0077' ||
    prepared.manifest.version !== 'appraise.m02-ta-workspace-r31/v1' ||
    prepared.manifest.ta03?.nativeScratchHelperInventory !== 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED' ||
    prepared.manifest.sourceHostBudget?.nativeScratchHelperInventory !== 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED' ||
    prepared.manifest.cases?.join(',') !== 'N01,N02' ||
    typeof verifyExactReview !== 'function' ||
    typeof authorize !== 'function' ||
    typeof observerOs?.identity !== 'function' ||
    typeof readChildReceipt !== 'function' ||
    typeof writeReceipt !== 'function'
  )
    throw new Error('reviewed T3 composition ports missing')
  if ((await verifyExactReview({ manifestDigest: prepared.manifestDigest, manifest: prepared.manifest })) !== true)
    throw new Error('exact T3 review absent')
  const checked = await verifyPreparation()
  if (checked.manifestDigest !== prepared.manifestDigest || checked.manifestFileSha256 !== prepared.manifestFileSha256)
    throw new Error('T3 preparation changed after exact review')
  if (fileSystem.existsSync(POLICY.roots.T3)) throw new Error('fixed T3 root already exists; no resume')
  const canonicalPin = prepared.manifest.artifacts.find(item => item.purpose === 'matrix-canonical-backend')
  if (!canonicalPin) throw new Error('pinned canonical backend absent')
  process.umask(0o077)
  if (process.umask() !== 0o077) throw new Error('private native umask unavailable')
  fileSystem.mkdirSync(POLICY.roots.T3, { mode: 0o700 })
  const root = fileSystem.lstatSync(POLICY.roots.T3)
  if (!root.isDirectory() || root.isSymbolicLink() || root.uid !== process.getuid() || (root.mode & 0o777) !== 0o700)
    throw new Error('new T3 root identity')
  const durable = createJournal({ directory: POLICY.roots.T3, phase: 'T3' })
  const journal = createMatrixJournalAdapter(durable)
  let canonical
  try {
    const stageRoot = join(POLICY.roots.T3, 'supervisor')
    const staged = await stage({
      prepared,
      stageRoot,
      phaseRoot: POLICY.roots.T3,
      expectedPhaseIdentity: { dev: root.dev, ino: root.ino },
    })
    const stageReceipt = join(stageRoot, 'module-stage.json')
    const fd = fileSystem.openSync(
      stageReceipt,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
      0o600,
    )
    try {
      fileSystem.writeFileSync(
        fd,
        `${JSON.stringify({
          schema: 'appraise.m02-ta-workspace-module-stage/v1',
          stagedDigest: staged.stagedDigest,
          copiedFiles: staged.copiedFiles,
          canonicalSha256: canonicalPin.sha256,
          resolutionClass: 'PRIVATE_PINNED_MODULES_AND_MIGRATIONS',
        })}\n`,
      )
      fileSystem.fsyncSync(fd)
    } finally {
      fileSystem.closeSync(fd)
    }
    const directory = fileSystem.openSync(
      stageRoot,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
    )
    try {
      fileSystem.fsyncSync(directory)
    } finally {
      fileSystem.closeSync(directory)
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
  } catch {
    if (!journal.snapshot().fenced) journal.markUnknown('ambiguous-effect')
    durable.close()
    return Object.freeze({
      status: 'UNKNOWN',
      completed: 0,
      failedCase: null,
      journal: journal.snapshot(),
      runtimeQualified: false,
    })
  }
  const issuer = createOwnedScratchProofIssuer({ activeCase: () => journal.snapshot().activeCase })
  let childPaths = null
  const launcher = createTrustedLauncher({
    prepared,
    precreatedRootIdentity: { dev: root.dev, ino: root.ino },
    journal,
    authorize,
    io,
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
    for (const item of T3) {
      const caseId = item.id
      let lateStage = 'CASE_START'
      const processStates = createProcessStateDiagnostics(observerOs)
      childPaths = createChildPathDiagnostics(processStates.ports, {
        expectedHostPath: R31_INSTALLED_HOST_FILE.path,
        interpreterPath: prepared.manifest.artifacts.find(entry => entry.purpose === 'interpreter')?.path,
        codexPath: POLICY.executable.path,
      })
      const gitReadiness = createGitReadinessGate({
        os: childPaths.ports,
        expectedHostPath: R31_INSTALLED_HOST_FILE.path,
        interpreterPath: prepared.manifest.artifacts.find(entry => entry.purpose === 'interpreter')?.path,
      })
      const canonicalBridge = canonical.createMatrixCanonicalBridge({
        role: item.role,
        caseId,
        workspace: join(POLICY.roots.T3, 'cases', caseId, 'supervisor'),
        onUnknown: () => {
          if (!journal.snapshot().fenced) journal.markUnknown('ambiguous-effect')
        },
      })
      let started = null,
        session = null,
        token = null,
        stopped = false
      try {
        started = await launcher.startCase({
          caseId,
          canonicalBridge,
          auditSession: null,
          verifyMcpStartupCase: async () => {
            if (!started) return false
            const childReceipt = await readChildReceipt(caseId, 'mcp-startup.json')
            const { bridge } = await canonicalBridge.ready()
            return verifyWorkspaceMcpReceipt({
              receipt: childReceipt,
              event: 'sdk-connect-returned',
              caseId,
              bootstrapProof: started.bootstrapProof,
              profileDigest: bridge.advertisedProfile.profileDigest,
            })
          },
          prepareScript: async ({ config }) => {
            verifyNativeContractConfiguration(config.config, caseId)
            const scratch = join(POLICY.roots.T3, 'cases', caseId, 'workspace', 'scratch')
            fileSystem.mkdirSync(scratch, { mode: 0o700 })
            const parent = fileSystem.lstatSync(scratch)
            if (
              !parent.isDirectory() ||
              parent.isSymbolicLink() ||
              parent.uid !== process.getuid() ||
              (parent.mode & 0o777) !== 0o700
            )
              throw new Error('owned scratch directory changed')
            token = await issuer.prepare({ caseId, manifestDigest: prepared.manifestDigest })
            session = createWorkspaceNativeSession({
              caseId,
              seal: prepared.seal,
              expectedConfigSha256: `sha256:${sha(JSON.stringify(config.config))}`,
              manifestDigest: prepared.manifestDigest,
              issuer,
              token,
              journal,
              ...(validateRequest ? { validateRequest } : {}),
              writeReceipt: (name, value) => writeReceipt(caseId, name, value),
            })
            assertFixedNativePlanContract(session.plan, config.config)
            return session
          },
        })
        await started.peer.request('initialize', initialize(), `${caseId}-initialize`)
        const threadId = await started.waitForThread()
        await started.peer.request('turn/start', turn(threadId), `${caseId}-turn-start`)
        lateStage = 'WAIT_TERMINAL'
        if ((await started.waitForTerminal()) !== 'terminal') throw new Error('T3 terminal phase mismatch')
        lateStage = 'GIT_READINESS'
        await gitReadiness.waitForReady(started.child, started.remainingCaseBudget)
        lateStage = 'HOST_LIVE_CHECK'
        await gitReadiness.assertCompletionBudget()
        const observedHost = started.observer.assertLiveHostBeforeCaseComplete()
        gitReadiness.assertFinalHost(observedHost)
        lateStage = 'OWNED_STOP_VERIFY'
        const hostCleanup = await started.observer.stopAndVerify()
        if (hostCleanup.originalHostGone !== true || !observedHost) throw new Error('owned host cleanup uncertain')
        stopped = true
        lateStage = 'OWNED_CLOSE_WAIT'
        const ownedExit = await started.waitForOwnedClose()
        const lifecycleKnown = consistentOwnedExit(ownedExit) && launcher.snapshot().ownedListeners === 0
        lateStage = 'CHILD_EXIT_READ'
        const childExit = await readChildReceipt(caseId, 'mcp-exit.json')
        const ready = await canonicalBridge.ready()
        lateStage = 'CHILD_EXIT_VERIFY'
        const childKnown = verifyWorkspaceMcpReceipt({
          receipt: childExit,
          event: 'node-exit-handler',
          caseId,
          bootstrapProof: started.bootstrapProof,
          profileDigest: ready.bridge.advertisedProfile.profileDigest,
        })
        lateStage = 'CANONICAL_OUTCOME'
        const canonicalWitness = await zeroCanonical(canonicalBridge)
        lateStage = 'EFFECT_COUNTS'
        const counts = journal.snapshot().counts
        const effectsKnown = verifyWorkspaceCaseCounts(counts)
        lateStage = 'SCRIPT_COMPLETION'
        const scriptKnown =
          session?.snapshot().index === 2 &&
          session.snapshot().fenced === false &&
          session.snapshot().responsePending === false &&
          session.snapshot().nativeStatus === 'FIXED_WORKSPACE_EFFECT_CORRELATED' &&
          session?.snapshot().completed === true &&
          session.snapshot().workspaceProofIssued === true &&
          session.snapshot().workspaceActionPending === false &&
          session.snapshot().outerPending === false
        const peer = started.peer.snapshot()
        lateStage = 'EVIDENCE_CONJUNCTION'
        const evidenceKnown =
          lifecycleKnown &&
          childKnown &&
          canonicalWitness.accepted &&
          effectsKnown &&
          scriptKnown &&
          peer.phase === 'terminal' &&
          peer.pending === null &&
          peer.turnId !== null &&
          gitReadiness.snapshot().readinessComplete === true &&
          peer.threadId === threadId &&
          journal.snapshot().pending.length === 0 &&
          !journal.snapshot().fenced
        if (!evidenceKnown) throw new Error('T3 case evidence incomplete')
        lateStage = 'CASE_WITNESS_WRITE'
        const witness = writeReceipt(caseId, 'case-outcome', {
          caseId,
          expected: item.expected,
          manifestDigest: prepared.manifestDigest,
          ownedCodex: ownedExit,
          listenerClosed: launcher.snapshot().ownedListeners === 0,
          hostObservation: observedHost,
          hostCleanup,
          gitReadiness: gitReadiness.snapshot(),
          processStates: processStates.snapshot(),
          childPathDiagnostics: childPaths.snapshot(),
          childEvidence: {
            evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
            sha256: sha(JSON.stringify(childExit)),
            receipt: childExit,
          },
          canonical: canonicalWitness,
          threadId,
          turnId: peer.turnId,
          counts,
          sourceHostCapacityReserved: journal.snapshot().sourceHostCapacity[caseId],
          nativeScratchHelperInventory: 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED',
          ta03ProposalSha256: prepared.manifest.ta03.proposalSha256,
          ta03ApprovalRecordSha256: prepared.manifest.ta03.approvalRecordSha256,
          journalSeq: journal.snapshot().seq,
          pending: journal.snapshot().pending.length,
          workspaceProofIssued: true,
          nativeStatus: session.snapshot().nativeStatus,
          outcomeEvidenceClass: 'TRUSTED_WORKSPACE_BYTES_AND_SCRIPTED_CORRELATION_NOT_CONTAINMENT',
        })
        if (!/^[a-f0-9]{64}$/.test(witness?.sha256 ?? '')) throw new Error('T3 durable witness missing')
        journal.bindCaseWitness({ caseId, sha256: witness.sha256 })
        lateStage = 'CANONICAL_CLOSE'
        await canonicalBridge.close()
        lateStage = 'CASE_COMMIT'
        await started.coordinator.complete({
          outcome: item.expected,
          cleanupKnown: true,
          verifyEvidence: () => evidenceKnown && journal.snapshot().pending.length === 0 && !journal.snapshot().fenced,
          verifyCanonical: () => canonicalWitness.accepted,
        })
        completed++
      } catch (error) {
        if (!journal.snapshot().fenced) journal.markUnknown('ambiguous-effect')
        if (started && !stopped) await started.stopOwned().catch(() => {})
        if (token && !session?.snapshot().workspaceProofIssued) await issuer.abandon(token).catch(() => {})
        await canonicalBridge.close().catch(() => {})
        try {
          writeReceipt(caseId, 'case-failure', {
            caseId,
            stage: lateStage,
            status: 'UNKNOWN',
            reason:
              new Map(GIT_READINESS_FAILURE_REASONS).get(error?.message) ?? 'BOUNDED_STAGE_ONLY_CAUSE_UNCLASSIFIED',
            nativeSession: session?.snapshot() ?? null,
            gitReadiness: gitReadiness.snapshot(),
            processStates: processStates.snapshot(),
            childPathDiagnostics: childPaths.snapshot(),
          })
        } catch {
          /* Diagnostic failure never replaces the authoritative UNKNOWN. */
        }
        return Object.freeze({
          status: 'UNKNOWN',
          completed,
          failedCase: caseId,
          failureStage: lateStage,
          journal: journal.snapshot(),
          runtimeQualified: false,
        })
      }
    }
    try {
      if (
        completed !== 2 ||
        journal.snapshot().completed.length !== 2 ||
        journal.snapshot().pending.length ||
        journal.snapshot().fenced
      )
        throw new Error('T3 terminal evidence incomplete')
      const terminal = durable.closeAndVerifyTerminal()
      if (
        terminal.status !== 'CLOSED_TERMINAL_CHECKPOINT_VERIFIED' ||
        terminal.snapshot.completed.length !== 2 ||
        terminal.snapshot.pending.length ||
        terminal.snapshot.fenced
      )
        throw new Error('T3 terminal checkpoint incomplete')
      return Object.freeze({
        status: 'T3_CASES_COMPLETED',
        completed,
        journal: terminal.snapshot,
        terminalJournalSha256: terminal.fileSha256,
        qualificationClass: 'TRUSTED_AGENT_SCRIPTED_NATIVE_FUNCTIONAL_CONFORMANCE_WITH_UNOBSERVED_HELPER_LIFETIME',
        nativeScratchHelperInventory: 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED',
        runtimeQualified: false,
      })
    } catch {
      return Object.freeze({
        status: 'UNKNOWN',
        completed,
        failedCase: null,
        journal: journal.snapshot(),
        runtimeQualified: false,
      })
    }
  } finally {
    durable.close()
  }
}
