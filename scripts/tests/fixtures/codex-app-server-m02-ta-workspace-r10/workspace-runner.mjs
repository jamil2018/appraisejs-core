/** Reviewed T3 composition source; importing it performs no runtime effect. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { POLICY } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { createOwnedHostObserver } from '../codex-app-server-m02-ta-owned-host-observer/observer.mjs'
import { DurablePhaseJournal } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'
import { createMatrixJournalAdapter } from '../codex-app-server-m02-ta-matrix-r10/journal-adapter.mjs'
import { stageMatrixModules } from '../codex-app-server-m02-ta-matrix-r10/matrix-stage.mjs'
import { createTrustedLauncher } from './workspace-launcher.mjs'
import { createOwnedScratchProofIssuer } from './owned-scratch-proof.mjs'
import { createWorkspaceNativeSession } from './native-session.mjs'
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
  effort: POLICY.reason,
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

/** Never called by preparation; ports for independent exact review and owned OS observation are mandatory. */
export async function runPreparedT3Workspace({
  prepared,
  verifyExactReview,
  authorize,
  observerOs,
  clock = Date.now,
  io,
  loadCanonical = null,
  readChildReceipt = readWorkspaceChildReceipt,
  writeReceipt = writeWorkspaceCaseReceipt,
} = {}) {
  if (
    prepared?.manifest?.phase !== 'T3' ||
    prepared.manifest.root !== POLICY.roots.T3 ||
    prepared.manifest.nativeFileCreationUmask !== '0077' ||
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
  const checked = await verifyWorkspacePreparation()
  if (checked.manifestDigest !== prepared.manifestDigest || checked.manifestFileSha256 !== prepared.manifestFileSha256)
    throw new Error('T3 preparation changed after exact review')
  if (fs.existsSync(POLICY.roots.T3)) throw new Error('fixed T3 root already exists; no resume')
  const canonicalPin = prepared.manifest.artifacts.find(item => item.purpose === 'matrix-canonical-backend')
  if (!canonicalPin) throw new Error('pinned canonical backend absent')
  process.umask(0o077)
  if (process.umask() !== 0o077) throw new Error('private native umask unavailable')
  fs.mkdirSync(POLICY.roots.T3, { mode: 0o700 })
  const root = fs.lstatSync(POLICY.roots.T3)
  if (!root.isDirectory() || root.isSymbolicLink() || root.uid !== process.getuid() || (root.mode & 0o777) !== 0o700)
    throw new Error('new T3 root identity')
  const durable = DurablePhaseJournal.create({ directory: POLICY.roots.T3, phase: 'T3' })
  const journal = createMatrixJournalAdapter(durable)
  let canonical
  try {
    const stageRoot = join(POLICY.roots.T3, 'supervisor')
    const staged = await stageMatrixModules({
      prepared,
      stageRoot,
      phaseRoot: POLICY.roots.T3,
      expectedPhaseIdentity: { dev: root.dev, ino: root.ino },
    })
    const stageReceipt = join(stageRoot, 'module-stage.json')
    const fd = fs.openSync(
      stageReceipt,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
      0o600,
    )
    try {
      fs.writeFileSync(
        fd,
        `${JSON.stringify({
          schema: 'appraise.m02-ta-workspace-module-stage/v1',
          stagedDigest: staged.stagedDigest,
          copiedFiles: staged.copiedFiles,
          canonicalSha256: canonicalPin.sha256,
          resolutionClass: 'PRIVATE_PINNED_MODULES_AND_MIGRATIONS',
        })}\n`,
      )
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    const directory = fs.openSync(stageRoot, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
    try {
      fs.fsyncSync(directory)
    } finally {
      fs.closeSync(directory)
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
      createOwnedHostObserver({ spawnOwnedCodex, allowedDirectChildPaths, os: observerOs }),
    recordProtocolFailure: details => {
      const caseId = journal.snapshot().activeCase
      if (caseId) writeReceipt(caseId, 'protocol-failure', { caseId, ...details })
    },
  })
  let completed = 0
  try {
    for (const item of T3) {
      const caseId = item.id
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
            const scratch = join(POLICY.roots.T3, 'cases', caseId, 'workspace', 'scratch')
            fs.mkdirSync(scratch, { mode: 0o700 })
            const parent = fs.lstatSync(scratch)
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
              writeReceipt: (name, value) => writeReceipt(caseId, name, value),
            })
            return session
          },
        })
        await started.peer.request('initialize', initialize(), `${caseId}-initialize`)
        const threadId = await started.waitForThread()
        await started.peer.request('turn/start', turn(threadId), `${caseId}-turn-start`)
        if ((await started.waitForTerminal()) !== 'terminal') throw new Error('T3 terminal phase mismatch')
        const observedHost = started.observer.assertLiveHostBeforeCaseComplete()
        const hostCleanup = await started.observer.stopAndVerify()
        if (hostCleanup.originalHostGone !== true || !observedHost) throw new Error('owned host cleanup uncertain')
        stopped = true
        const ownedExit = await started.waitForOwnedClose()
        const lifecycleKnown = consistentOwnedExit(ownedExit) && launcher.snapshot().ownedListeners === 0
        const childExit = await readChildReceipt(caseId, 'mcp-exit.json')
        const ready = await canonicalBridge.ready()
        const childKnown = verifyWorkspaceMcpReceipt({
          receipt: childExit,
          event: 'node-exit-handler',
          caseId,
          bootstrapProof: started.bootstrapProof,
          profileDigest: ready.bridge.advertisedProfile.profileDigest,
        })
        const canonicalWitness = await zeroCanonical(canonicalBridge)
        const counts = journal.snapshot().counts
        const effectsKnown =
          counts.threadStarts === 1 &&
          counts.turnStarts === 1 &&
          counts.providerRequests === 2 &&
          counts.outerCalls === 1 &&
          counts.scopedCalls === 0 &&
          counts.auditRequests === 0 &&
          counts.canonicalRequests === 0 &&
          counts.permissionReplies === 0
        const scriptKnown =
          session?.snapshot().completed === true &&
          session.snapshot().workspaceProofIssued === true &&
          session.snapshot().outerPending === false
        const peer = started.peer.snapshot()
        const evidenceKnown =
          lifecycleKnown &&
          childKnown &&
          canonicalWitness.accepted &&
          effectsKnown &&
          scriptKnown &&
          peer.phase === 'terminal' &&
          peer.threadId === threadId &&
          journal.snapshot().pending.length === 0 &&
          !journal.snapshot().fenced
        if (!evidenceKnown) throw new Error('T3 case evidence incomplete')
        const witness = writeReceipt(caseId, 'case-outcome', {
          caseId,
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
          threadId,
          turnId: peer.turnId,
          counts,
          sourceHostCapacityReserved: journal.snapshot().sourceHostCapacity[caseId],
          actualNativeHelperStarts: 'UNKNOWN',
          journalSeq: journal.snapshot().seq,
          pending: journal.snapshot().pending.length,
          workspaceProofIssued: true,
          nativeStatus: session.snapshot().nativeStatus,
          outcomeEvidenceClass: 'TRUSTED_WORKSPACE_BYTES_AND_SCRIPTED_CORRELATION_NOT_CONTAINMENT',
        })
        if (!/^[a-f0-9]{64}$/.test(witness?.sha256 ?? '')) throw new Error('T3 durable witness missing')
        journal.bindCaseWitness({ caseId, sha256: witness.sha256 })
        await canonicalBridge.close()
        await started.coordinator.complete({
          outcome: item.expected,
          cleanupKnown: true,
          verifyEvidence: () => evidenceKnown && journal.snapshot().pending.length === 0 && !journal.snapshot().fenced,
          verifyCanonical: () => canonicalWitness.accepted,
        })
        completed++
      } catch {
        if (!journal.snapshot().fenced) journal.markUnknown('ambiguous-effect')
        if (started && !stopped) await started.stopOwned().catch(() => {})
        if (token && !session?.snapshot().workspaceProofIssued) await issuer.abandon(token).catch(() => {})
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
    try {
      const terminal = durable.closeAndVerifyTerminal()
      return Object.freeze({
        status: 'T3_CASES_COMPLETED',
        completed,
        journal: terminal.snapshot,
        terminalJournalSha256: terminal.fileSha256,
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
