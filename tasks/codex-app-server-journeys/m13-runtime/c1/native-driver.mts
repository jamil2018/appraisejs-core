import { realpathSync, existsSync, statSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs'
import path from 'node:path'
import {
  assertNativePublicInput,
  verifyNativeCredential,
  readNativePublicBytes,
} from '../../../../src/lib/quality-journey/codex-app-server/native-credential-topology'
import { nativeQualificationDigest } from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-contract'
import type { createProviderSourceNativePrismaClient } from '../../../../src/lib/quality-journey/provider-source-database'
import { createNativeJourneyLineage, scriptedDisposableHuman, type NativeLineageEvent } from './native-lineage.mts'
import {
  prepareOriginalNativeDriverCase,
  persistNativeDriverPublic,
  type NativeCasePreparation,
} from './native-driver-prepare.mts'
import { driverDigest, readNativeDriverControl, type NativeDriverControl } from './native-driver-control.mts'
import { prepareOriginalNativeExecution, type NativeExecutionPreparation } from './native-execution.mts'
import {
  prepareNativeTriageSubject,
  prepareOriginalNativeTriager,
  prepareNativeReportClosure,
  closeOriginalNativeReport,
  type NativeClosureChoice,
} from './native-execution-report.mts'

export type { NativeCasePreparation, NativeDriverControl, NativeExecutionPreparation, NativeClosureChoice }
type Prepared = Awaited<ReturnType<typeof prepareOriginalNativeDriverCase>>
const successors = Object.freeze({
  SCOUT: 'RESOURCE_EXPLORER',
  RESOURCE_EXPLORER: 'TEST_SCENARIO_DESIGNER',
  TEST_SCENARIO_DESIGNER: 'AUTOMATOR',
  AUTOMATOR: 'REAL_EXECUTION_REQUIRED',
})

/** Original task parent only. Construction/import never launches native, model, account, listener or browser work. */
export function createNativeQualificationParent(
  provided: Readonly<{ repositoryRoot: string; evidenceRoot: string; baseUrl?: string }>,
) {
  const options = Object.freeze({ ...provided })
  const lineage = createNativeJourneyLineage(options.baseUrl, options.evidenceRoot)
  let current: Prepared | undefined
  let privateEvent: NativeLineageEvent | undefined
  let originalSource: ReturnType<typeof createProviderSourceNativePrismaClient> | undefined
  let preparationEntered = false,
    discoveryStarted = false,
    closed = false,
    unknown = false
  let boundary: Readonly<Record<string, unknown>> | undefined
  let execution: Awaited<ReturnType<typeof prepareOriginalNativeExecution>> | undefined
  let executionPreparationEntered = false,
    triagerClaimEntered = false,
    closureEntered = false
  let triageBoundary: Awaited<ReturnType<typeof prepareNativeTriageSubject>> | undefined
  let reportClosure: Awaited<ReturnType<typeof prepareNativeReportClosure>> | undefined
  const history: Array<
    Readonly<{ campaignId: string; kind: string; preparedDigest: string; candidateDigest: string | null }>
  > = []
  function requireOriginalReconciled(kind?: NativeLineageEvent['kind']) {
    if (unknown || closed || !current || current.control.snapshot().phase !== 'RECONCILED' || originalSource)
      throw new Error('Original native lineage requires completed reconciliation and source disposal')
    if (kind && current.kind !== kind) throw new Error('Exact native lineage predecessor required')
    return current
  }
  function publicSummary() {
    return Object.freeze({
      version: 'M13_NATIVE_LINEAGE_SUMMARY_V1',
      cases: structuredClone(history),
      persona: scriptedDisposableHuman,
      humanWaitMetric: 'UNQUALIFIED' as const,
      runtimeQualified: false as const,
      physicalQualified: false as const,
      modelHttpRequestsHardCapped: false as const,
    })
  }
  async function prepare(event: NativeLineageEvent, packet: NativeCasePreparation) {
    if (originalSource || unknown || closed) throw new Error('No replacement source factory is admitted')
    privateEvent = event
    const predecessor = current
    try {
      const prepared = await prepareOriginalNativeDriverCase(event, packet, {
        ...options,
        assertParentCurrent() {
          if (unknown || closed || current !== predecessor) throw new Error('Original preparation parent was fenced')
        },
        retainOriginalSource(pair) {
          originalSource = pair
        },
        sourceDisposed() {
          originalSource = undefined
        },
      })
      if (unknown || closed || current !== predecessor) throw new Error('Original preparation parent was fenced')
      current = prepared
      return prepared.publicPrepared()
    } catch {
      unknown = true
      throw new Error('Native driver preparation remains blocked; original evidence retained')
    }
  }
  function currentCase() {
    if (!current || unknown || closed) throw new Error('Original current native case required')
    return current
  }
  function assertSameCurrent(original: Prepared) {
    if (currentCase() !== original) throw new Error('Original case parent changed')
  }
  function continuationSubject() {
    const original = requireOriginalReconciled()
    const kind = original.kind
    if (!(kind in successors)) throw new Error('Role continuation boundary required')
    return {
      version: 'M13_NATIVE_NEXT_ROLE_V1',
      predecessor: original.publicPrepared().preparedDigest,
      nextRole: successors[kind as keyof typeof successors],
      lineage: publicSummary(),
    }
  }
  return Object.freeze({
    async prepareInitialCase(packet: NativeCasePreparation) {
      if (preparationEntered || current || closed) throw new Error('One fresh original driver preparation required')
      preparationEntered = true
      return prepare(await lineage.prepareInitial(), packet)
    },
    async prepareAnalysisFollowup(packet: NativeCasePreparation, persona: typeof scriptedDisposableHuman) {
      requireOriginalReconciled('ANALYSIS_INITIAL')
      if (persona !== scriptedDisposableHuman) throw new Error('Explicit scripted disposable test human required')
      return prepare(await lineage.prepareAnalysisFollowup(persona), packet)
    },
    startVerifiedCase(control: NativeDriverControl) {
      return currentCase().control.startVerifiedCase(control)
    },
    async freezeCandidate() {
      const original = currentCase()
      const candidate = await original.control.freezeCandidate()
      assertSameCurrent(original)
      return candidate
    },
    acceptIndependentReview(control: NativeDriverControl) {
      return currentCase().control.acceptIndependentReview(control)
    },
    async reconcile(observationKey: string) {
      const original = currentCase()
      if (!privateEvent) throw new Error('Original canonical case binding unavailable')
      await original.control.reconcile(observationKey)
      assertSameCurrent(original)
      const accepted = original.control.acceptedForLineage()
      lineage.acceptCurrentCanonicalResult(original.kind.startsWith('ANALYSIS') ? accepted.result : accepted)
      const prepared = original.publicPrepared()
      const item = Object.freeze({
        campaignId: prepared.manifest.campaignId,
        kind: original.kind,
        preparedDigest: prepared.preparedDigest,
        candidateDigest: original.control.snapshot().candidateDigest,
      })
      history.push(item)
      persistNativeDriverPublic(path.join(original.directory, 'lineage-reconciled.json'), item)
      return publicSummary()
    },
    b3AcceptanceSubject() {
      requireOriginalReconciled('ANALYSIS_FOLLOWUP')
      if (history.length !== 2 || history[0].kind !== 'ANALYSIS_INITIAL')
        throw new Error('Exact two-turn B3 lineage required')
      const subject = publicSummary()
      return Object.freeze({ subject, subjectDigest: driverDigest(subject) })
    },
    async prepareDiscoveryBoundary(control: NativeDriverControl) {
      const original = requireOriginalReconciled('ANALYSIS_FOLLOWUP')
      if (boundary || history.length !== 2) throw new Error('One B3 acceptance before B4 allocation required')
      readNativeDriverControl(control, 'B3_ACCEPTANCE', driverDigest(publicSummary()), original.credentialSource)
      const value = await lineage.prepareDiscoveryBoundary(scriptedDisposableHuman)
      assertSameCurrent(original)
      const { client, ...scope } = value
      const environment = await client.environment.findUniqueOrThrow({ where: { id: scope.environmentId } })
      assertSameCurrent(original)
      boundary = Object.freeze({
        version: 'M13_NATIVE_DISCOVERY_BOUNDARY_V1',
        ...scope,
        targetBaseUrl: environment.baseUrl,
        browserRuntime: 'CANONICAL_HEADLESS_CHROMIUM',
        browserSessionLimit: 1,
        accessMode: 'ANONYMOUS',
        runtimeQualified: false,
        physicalQualified: false,
        persona: scriptedDisposableHuman,
        browserStarted: false,
        nativeCaseAllocated: false,
        humanWaitMetric: 'UNQUALIFIED',
      })
      return Object.freeze({ subject: structuredClone(boundary), subjectDigest: driverDigest(boundary) })
    },
    async startVerifiedDiscoveryBrowser(control: NativeDriverControl, scoutPacket: NativeCasePreparation) {
      const original = requireOriginalReconciled('ANALYSIS_FOLLOWUP')
      if (!boundary || discoveryStarted) throw new Error('One separately prepared discovery-browser allowance required')
      discoveryStarted = true
      try {
        readNativeDriverControl(control, 'DISCOVERY_BROWSER', driverDigest(boundary), original.credentialSource)
        const event = await lineage.releaseVerifiedDiscoveryBoundary()
        assertSameCurrent(original)
        if (event.kind !== 'SCOUT') throw new Error('Original Scout successor required')
        return prepare(event, scoutPacket)
      } catch {
        unknown = true
        throw new Error('Discovery boundary stopped UNKNOWN; original evidence retained')
      }
    },
    nextRoleSubject() {
      const subject = continuationSubject()
      return Object.freeze({ subject, subjectDigest: driverDigest(subject) })
    },
    async prepareNextRole(control: NativeDriverControl, packet: NativeCasePreparation) {
      const original = requireOriginalReconciled(),
        subject = continuationSubject()
      if (subject.nextRole === 'REAL_EXECUTION_REQUIRED')
        throw new Error('Use the separate real-execution preparation boundary')
      readNativeDriverControl(control, 'NEXT_ROLE', driverDigest(subject), original.credentialSource)
      const event = await lineage.prepareNextRole()
      assertSameCurrent(original)
      if (event.kind === 'REAL_EXECUTION_REQUIRED' || event.kind !== subject.nextRole)
        throw new Error('Exact next role required')
      return prepare(event, packet)
    },
    async prepareRealExecutionBoundary(control: NativeDriverControl, limits: NativeExecutionPreparation) {
      const original = requireOriginalReconciled('AUTOMATOR'),
        subject = continuationSubject()
      if (executionPreparationEntered) throw new Error('One original execution preparation required')
      executionPreparationEntered = true
      readNativeDriverControl(control, 'NEXT_ROLE', driverDigest(subject), original.credentialSource)
      try {
        const next = await lineage.prepareNextRole()
        assertSameCurrent(original)
        if (next.kind !== 'REAL_EXECUTION_REQUIRED') throw new Error('Real execution boundary required')
        execution = await prepareOriginalNativeExecution(
          lineage.executionFixture(),
          original.publicPrepared().manifest,
          options.repositoryRoot,
          options.evidenceRoot,
          limits,
          () => assertSameCurrent(original),
        )
        if (unknown || closed) {
          await execution.control.cancelAndRetain()
          throw new Error('Original execution parent was fenced')
        }
        assertSameCurrent(original)
        boundary = execution.publicPrepared().subject
        return execution.publicPrepared()
      } catch {
        unknown = true
        throw new Error('Original execution preparation remains UNKNOWN; no replacement or launch admitted')
      }
    },
    startVerifiedExecution(control: NativeDriverControl, persona: typeof scriptedDisposableHuman) {
      requireOriginalReconciled('AUTOMATOR')
      if (!execution) throw new Error('Original execution preparation required')
      return execution.control.startVerified(control, persona)
    },
    pollOriginalExecution() {
      requireOriginalReconciled('AUTOMATOR')
      if (!execution) throw new Error('Original execution owner required')
      return execution.control.pollOriginal()
    },
    async prepareTriageBoundary() {
      const original = requireOriginalReconciled('AUTOMATOR')
      if (!execution || triageBoundary) throw new Error('One sealed original triage boundary required')
      const observed = execution.control.requireSealed()
      const prepared = await prepareNativeTriageSubject(lineage.executionFixture(), observed)
      assertSameCurrent(original)
      triageBoundary = prepared
      persistNativeDriverPublic(path.join(options.evidenceRoot, 'triage-prepared.json'), triageBoundary)
      return structuredClone(triageBoundary)
    },
    async prepareTriagerCase(control: NativeDriverControl, packet: NativeCasePreparation) {
      const original = requireOriginalReconciled('AUTOMATOR')
      if (!execution || !triageBoundary || triagerClaimEntered)
        throw new Error('One original reviewed Triager preparation required')
      const observed = execution.control.requireSealed()
      readNativeDriverControl(control, 'TRIAGE', triageBoundary.subjectDigest, original.credentialSource)
      triagerClaimEntered = true
      try {
        const event = await prepareOriginalNativeTriager(
          lineage.executionFixture(),
          observed,
          triageBoundary.subjectDigest,
          () => assertSameCurrent(original),
        )
        assertSameCurrent(original)
        lineage.recordOriginalTriager(event)
        return prepare(event, packet)
      } catch {
        unknown = true
        throw new Error('Original Triager preparation stopped UNKNOWN; evidence retained')
      }
    },
    async prepareReportClosure(choice: NativeClosureChoice) {
      const original = requireOriginalReconciled('TRIAGER')
      if (!execution || reportClosure) throw new Error('One original explicit report decision required')
      execution.control.requireSealed()
      const prepared = await prepareNativeReportClosure(lineage.executionFixture(), choice)
      assertSameCurrent(original)
      reportClosure = prepared
      persistNativeDriverPublic(path.join(options.evidenceRoot, 'report-closure-prepared.json'), reportClosure)
      return structuredClone(reportClosure)
    },
    async closeVerifiedReport(control: NativeDriverControl, persona: typeof scriptedDisposableHuman) {
      const original = requireOriginalReconciled('TRIAGER')
      if (!execution || !reportClosure || closureEntered || persona !== scriptedDisposableHuman)
        throw new Error('One explicit scripted disposable report/closure review required')
      readNativeDriverControl(control, 'REPORT_REVIEW_CLOSURE', reportClosure.subjectDigest, original.credentialSource)
      closureEntered = true
      try {
        const receipt = await closeOriginalNativeReport(
          lineage.executionFixture(),
          reportClosure,
          execution.control.requireSealed(),
          () => assertSameCurrent(original),
        )
        assertSameCurrent(original)
        persistNativeDriverPublic(path.join(options.evidenceRoot, 'report-closed.json'), receipt)
        return receipt
      } catch {
        unknown = true
        throw new Error('Original report closure remains UNKNOWN; no replay or revision admitted')
      }
    },
    async archiveReconciledEvidence() {
      const original = requireOriginalReconciled()
      if (execution) execution.control.requireSealed()
      verifyNativeCredential(original.credentialSource)
      const owned = lineage.fixtureOwned()
      await lineage.stopAndRetain()
      assertSameCurrent(original)
      closed = true
      const source = realpathSync(owned.databasePath),
        destination = path.join(options.evidenceRoot, 'canonical-journey-archive.db')
      assertNativePublicInput(source, original.credentialSource)
      if (existsSync(`${source}-wal`) && statSync(`${source}-wal`).size !== 0)
        throw new Error('Original database checkpoint remains pending; archive refused')
      const sourceBytes = readNativePublicBytes(source, original.credentialSource, 512 * 1024 * 1024)
      const descriptor = openSync(destination, 'wx', 0o600)
      try {
        writeFileSync(descriptor, sourceBytes)
        fsyncSync(descriptor)
      } finally {
        closeSync(descriptor)
      }
      const sourceDigest = nativeQualificationDigest(sourceBytes),
        archiveDigest = nativeQualificationDigest(
          readNativePublicBytes(destination, original.credentialSource, 512 * 1024 * 1024),
        )
      if (sourceDigest !== archiveDigest)
        throw new Error('Canonical archive readback mismatch; original database retained')
      const receipt = Object.freeze({
        version: 'M13_NATIVE_CLOSED_DATABASE_ARCHIVE_V1',
        path: destination,
        sha256: archiveDigest,
        originalDatabaseRetained: true,
        authorityReconstructible: false,
        physicalQualified: false,
        runtimeQualified: false,
        lineage: publicSummary(),
      })
      persistNativeDriverPublic(path.join(options.evidenceRoot, 'canonical-journey-archive.json'), receipt)
      return receipt
    },
    async retainUnknown() {
      unknown = true
      const runtimePending =
        execution &&
        execution.control.snapshot().originalExecutionEntered &&
        execution.control.snapshot().phase !== 'SEALED'
      try {
        if (current) await current.control.cancelAndRetain()
        if (execution) await execution.control.cancelAndRetain()
      } finally {
        if (!runtimePending) await lineage.stopAndRetain()
      }
      return Object.freeze({
        phase: 'UNKNOWN' as const,
        databaseRetained: true,
        sourceRetained: !!originalSource,
        originalRuntimeClientRetained: !!runtimePending,
        nextCasePermitted: false,
      })
    },
    snapshot: () =>
      Object.freeze({
        version: 'M13_NATIVE_DRIVER_STATUS_V1',
        current: current?.control.snapshot() ?? null,
        kind: current?.kind ?? null,
        originalSourceRetained: !!originalSource,
        unknown,
        closed,
        preparedBoundary: boundary ? structuredClone(boundary) : null,
        execution: execution?.control.snapshot() ?? null,
        lineage: publicSummary(),
        fixture: lineage.snapshot(),
      }),
  })
}
