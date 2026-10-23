import { compositionServiceCase } from './custody-service-composition-selection.ts'
import {
  assertServiceComplementRetainedOutcome,
  assertServiceRetainedAmbiguousResult,
  assertServiceRetainedComplementResult,
  dispatchServiceCaseResult,
} from './custody-service-retained-proof.ts'
import { encodeServiceTerminalAck, decodeServiceTerminalHandoff } from '../fixture-terminal-codecs.mjs'
import {
  decideServiceTerminalClosure,
  publishServiceTerminalDecision,
  reportServiceSupervisorStop,
} from './custody-supervisor-terminal.ts'
import {
  routeServiceOwnerMessage,
  classifyServiceCase,
  type ServiceOwnerMessageState,
} from './custody-supervisor-routing.ts'
import { assertActivationRetainedOutcome } from './custody-activation-proof.ts'
import assert from 'node:assert/strict'
import { execFileSync as originalExecFileSync, fork as originalFork } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as originalFs from 'node:fs'
import path from 'node:path'
import { fixtureDateTime } from './custody-fixture-datetime.ts'
import type {
  ProviderReconciliationReceipt,
  assertCommittedProviderSourceReplay,
  assertProviderReceiptCanonicalIdentity,
  providerReconciliationRequestHash,
} from '@/lib/quality-journey/provider-reconciliation-contract'
import type { canonicalContractJson } from '@/lib/catalog-contracts'
import { randomUUID as originalRandomUUID } from 'node:crypto'
import {
  createServiceSupervisorRegistry,
  failServiceSupervisor,
  assertServiceSupervisorActive,
  reserveServiceOwnerSlot,
  launchServiceOwner,
  markServiceCaseAssertionsPassed,
  releaseServiceSupervisorRegistry,
  type ServiceSupervisionEffects,
} from './custody-service-supervision.ts'
import type { ServiceFixtureExpect } from './custody-service-expect.ts'
import { readFixtureTerminalCallbackEvidence } from './custody-fixture-terminal-receipt.ts'
import { readTerminalEvidenceFile } from '../fixture-evidence-read.mjs'
const legacyNames = [
  'legacy-fs-valid-fresh-refusal',
  'legacy-fs-disposed-fresh-refusal',
  'legacy-fs-sealed-corrupt-fresh-refusal',
  'legacy-committed-clean-replay',
] as const
export const serviceCases = [
  'positive',
  'late-writer',
  'lost-reply',
  'callback-throw',
  'timeout',
  'early-revoke',
  'paused-send',
  'pre-hold-dispose',
  'negative-inputs',
  'activation-unknown',
  'late-ack',
  'controlled-commit-rollback',
  'pending-death',
  'pre-receipt-death',
  'before-commit-death',
  'around-commit-death',
  'after-commit-death',
  ...legacyNames,
  'disposed-original-after-writer-close',
  'wrong-original-client',
  'old-commit-other-key-retirement',
  'unrelated-pre-sql-retirement',
  'retired-release-sync-cleanup-throw',
] as const
const retainedComplements: Readonly<Record<string, string>> = {
  'old-commit-other-key-retirement': 'KNOWN_COMMITTED_OTHER_REQUEST_RETIRED',
  'unrelated-pre-sql-retirement': 'KNOWN_COMMITTED_UNRELATED_PRE_SQL_RETIRED',
  'retired-release-sync-cleanup-throw': 'KNOWN_COMMITTED_CLEANUP_RETIRED_UNKNOWN',
}
const crashes = new Set<string>([
  'pending-death',
  'pre-receipt-death',
  'before-commit-death',
  'around-commit-death',
  'after-commit-death',
])
const ambiguous = new Set<string>([
  'callback-throw',
  'timeout',
  'early-revoke',
  'paused-send',
  'controlled-commit-rollback',
  'activation-unknown',
])
const gates: Record<string, string> = {
  'pending-death': 'PENDING_AFTER_ACTUAL_SEND_BEFORE_OUTER_FULFILLMENT',
  'pre-receipt-death': 'AFTER_FLUSH_BEFORE_RECEIPT_RESERVATION',
  'before-commit-death': 'RECONCILIATION_CALLBACK_AFTER_ATOMIC_MUTATIONS_BEFORE_ENGINE_RETURN',
  'around-commit-death': 'RECONCILIATION_CALLBACK_RETURN_TO_OUTER_FULFILLMENT_RACE',
  'after-commit-death': 'KNOWN_DURABLE_OUTER_FULFILLMENT_WITHHELD_REPLY',
}
type Message = Record<string, unknown>
export type ServiceMatrixManifest = {
  version: number
  root: string
  bundle: string
  bundleSha256: string
  generated: string
  legacyBundle: string
  legacyBundleSha256: string
  nativeScript: string
  inspectorScript: string
  inputs: Array<{ filename: string; sha256: string }>
}
export type ServiceCaseName = (typeof serviceCases)[number] | typeof compositionServiceCase
export const freshRemainingServiceCases: readonly ServiceCaseName[] = [
  'activation-unknown',
  'late-ack',
  'controlled-commit-rollback',
  'pending-death',
  'pre-receipt-death',
  'before-commit-death',
  'around-commit-death',
  'after-commit-death',
  'legacy-fs-valid-fresh-refusal',
  'legacy-fs-disposed-fresh-refusal',
  'legacy-fs-sealed-corrupt-fresh-refusal',
  'legacy-committed-clean-replay',
  'disposed-original-after-writer-close',
  'wrong-original-client',
  'old-commit-other-key-retirement',
  'unrelated-pre-sql-retirement',
  'retired-release-sync-cleanup-throw',
]
export type ServiceMatrixProofs = Readonly<{
  canonicalContractJson: typeof canonicalContractJson
  assertCommittedProviderSourceReplay: typeof assertCommittedProviderSourceReplay
  assertProviderReceiptCanonicalIdentity: typeof assertProviderReceiptCanonicalIdentity
  providerReconciliationRequestHash: typeof providerReconciliationRequestHash
}>
export type ServiceMatrixEffects = Readonly<{
  fs: Pick<
    typeof originalFs,
    'appendFileSync' | 'existsSync' | 'mkdirSync' | 'mkdtempSync' | 'readFileSync' | 'realpathSync' | 'writeFileSync'
  >
  execFileSync: typeof originalExecFileSync
  fork: typeof originalFork
  randomUUID: typeof originalRandomUUID
  process: Pick<NodeJS.Process, 'pid' | 'execPath' | 'argv' | 'env' | 'cwd' | 'kill'>
  setInterval: typeof setInterval
  clearInterval: typeof clearInterval
  setTimeout: typeof setTimeout
  clearTimeout: typeof clearTimeout
}>
const originalEffects: ServiceMatrixEffects = {
  fs: originalFs,
  execFileSync: originalExecFileSync,
  fork: originalFork,
  randomUUID: originalRandomUUID,
  process,
  setInterval,
  clearInterval,
  setTimeout,
  clearTimeout,
}
export function createServiceMatrix(
  expect: ServiceFixtureExpect,
  selected: readonly ServiceCaseName[],
  proofs: ServiceMatrixProofs,
  effects: ServiceMatrixEffects = originalEffects,
) {
  assert.equal(new Set(selected).size, selected.length)
  for (const name of selected)
    assert.ok((serviceCases as readonly string[]).includes(name) || name === compositionServiceCase)
  const {
    canonicalContractJson,
    assertCommittedProviderSourceReplay,
    assertProviderReceiptCanonicalIdentity,
    providerReconciliationRequestHash,
  } = proofs
  const { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } = effects.fs
  const { execFileSync, randomUUID, process, setTimeout, clearTimeout } = effects
  const supervisionEffects: ServiceSupervisionEffects = {
    fork: effects.fork,
    setInterval: effects.setInterval,
    clearInterval: effects.clearInterval,
    writeFileSync,
  }
  const supervisor = createServiceSupervisorRegistry(selected, supervisionEffects)
  let manifest: ServiceMatrixManifest
  const digest = (filename: string) => createHash('sha256').update(readFileSync(filename)).digest('hex')
  const artifactRoot = path.resolve('.appraisejs/custody-service-tests')
  const evidence = process.env.CUSTODY_SERVICE_EVIDENCE ?? artifactRoot

  function initializeManifest() {
    try {
      assertMatrixNotStopped()
      mkdirSync(artifactRoot, { recursive: true })
      const external = process.env.CUSTODY_SERVICE_OWNER_BUNDLE
      let directory: string
      if (external) directory = path.dirname(path.resolve(external))
      else {
        directory = mkdtempSync(path.join(artifactRoot, 'build-'))
        execFileSync(
          process.execPath,
          ['scripts/test-harness/m06/service-custody/build-custody-service-owner.mjs', directory],
          { cwd: process.cwd(), env: { PATH: process.env.PATH }, stdio: 'pipe' },
        )
      }
      manifest = JSON.parse(readFileSync(path.join(directory, 'owner-manifest.json'), 'utf8')) as ServiceMatrixManifest
      assert.equal(manifest.version, 1)
      assert.equal(realpathSync(manifest.root), realpathSync(process.cwd()))
      assert.ok(
        path.resolve(manifest.bundle).startsWith(path.join(realpathSync(process.cwd()), '.appraisejs') + path.sep),
      )
      assert.equal(realpathSync(manifest.bundle), realpathSync(path.join(directory, 'owner-bundle.mjs')))
      if (external) assert.equal(realpathSync(external), realpathSync(manifest.bundle))
      assert.equal(digest(manifest.bundle), manifest.bundleSha256)
      assert.equal(realpathSync(manifest.legacyBundle), realpathSync(path.join(directory, 'legacy-owner-bundle.mjs')))
      assert.equal(digest(manifest.legacyBundle), manifest.legacyBundleSha256)
      if (external) {
        // Rebuild current declared source statically and compare, rather than trusting an arbitrary env path/manifest.
        const verificationDirectory = mkdtempSync(path.join(artifactRoot, 'verify-build-'))
        execFileSync(
          process.execPath,
          [
            'scripts/test-harness/m06/service-custody/build-custody-service-owner.mjs',
            verificationDirectory,
            manifest.generated,
          ],
          { cwd: process.cwd(), env: { PATH: process.env.PATH }, stdio: 'pipe' },
        )
        const rebuilt = JSON.parse(
          readFileSync(path.join(verificationDirectory, 'owner-manifest.json'), 'utf8'),
        ) as ServiceMatrixManifest
        assert.equal(rebuilt.bundleSha256, manifest.bundleSha256)
        assert.equal(rebuilt.legacyBundleSha256, manifest.legacyBundleSha256)
        assert.deepEqual(rebuilt.inputs, manifest.inputs)
      }
      assert.ok(manifest.inputs.length > 10)
      for (const input of manifest.inputs)
        assert.equal(digest(input.filename), input.sha256, `Frozen input changed: ${input.filename}`)
      const expectedHarness = path.resolve('scripts/test-harness/m06/service-custody')
      assert.equal(
        realpathSync(manifest.nativeScript),
        realpathSync(path.join(expectedHarness, 'custody-native-contender.mjs')),
      )
      assert.equal(
        realpathSync(manifest.inspectorScript),
        realpathSync(path.join(expectedHarness, 'custody-inspect-after-exit.mjs')),
      )
      for (const filename of [
        path.resolve('src/services/coordinator/quality-journey-provider-run-service.ts'),
        path.resolve('scripts/test-harness/m06/service-custody/custody-service-owner.ts'),
        manifest.nativeScript,
        manifest.inspectorScript,
      ])
        assert.ok(
          manifest.inputs.some(input => realpathSync(input.filename) === realpathSync(filename)),
          `Missing exact input ${filename}`,
        )
    } catch (error) {
      failServiceSupervisor(supervisor, undefined, 'MANIFEST_INITIALIZATION', error)
      throw supervisor.firstError
    }
  }

  async function awaitNativeExit(workspace: string, nativePid: number) {
    assertMatrixNotStopped()
    const receipt = path.join(workspace, 'native-lifetime.jsonl')
    for (let attempt = 0; attempt < 100; attempt += 1) {
      assertMatrixNotStopped()
      if (existsSync(receipt)) {
        const records = readFileSync(receipt, 'utf8')
          .trim()
          .split('\n')
          .map(line => JSON.parse(line) as Message)
        const closed = records.some(
          row =>
            row.pid === nativePid &&
            ['EXPLICIT_KNOWN_CLOSE', 'OWNER_IPC_DISCONNECTED_KNOWN_NO_HELD_OPERATION_CLOSED'].includes(
              String(row.type),
            ),
        )
        if (closed) {
          try {
            process.kill(nativePid, 0)
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
            throw error
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 20))
      assertMatrixNotStopped()
    }
    throw new Error('Native contender has no known-closure and exit evidence; inspection refused, no kill')
  }

  const retainedSupervisorReferences: unknown[] = []

  async function runCase(name: string, workspace: string) {
    assertMatrixNotStopped()
    const legacy = (legacyNames as readonly string[]).includes(name)
    const nonce = randomUUID()
    const specification = Object.freeze({
      executable: process.execPath,
      script: legacy ? manifest.legacyBundle : manifest.bundle,
      args: Object.freeze([name, workspace, manifest.nativeScript, nonce]),
      cwd: process.cwd(),
      environment: Object.freeze({
        PATH: process.env.PATH,
        DATABASE_URL: `file:${path.join(workspace, 'canonical.db')}`,
      }),
      case: name,
      workspace,
      nativeScript: manifest.nativeScript,
      nonce,
    })
    const slot = reserveServiceOwnerSlot(supervisor, specification)
    const child = launchServiceOwner(supervisor, slot, process.pid, supervisionEffects)
    retainedSupervisorReferences.push(child)
    const messageState: ServiceOwnerMessageState = {
      pid: child.pid,
      case: name,
      nonce,
      ownerStarted: false,
      databasePath: path.join(workspace, 'canonical.db'),
      lastOwnerSequence: 0,
      acceptingMessages: true,
    }
    let nativePid: number | undefined
    let terminal: Message | undefined
    let killConsumed = false
    let expectedFixtureSha256: string | undefined
    let settled = false
    let crashAdmission = true
    let terminalAckStarted = false
    let terminalAckDelivered = false
    let terminalHandoff: Message | undefined
    let ownerDisconnected = false
    let knownExit: { code: number | null; signal: NodeJS.Signals | null } | undefined
    let stopOwner: (error: unknown) => void = error => {
      failServiceSupervisor(supervisor, slot, 'OWNER_STREAM', error)
    }
    child.stdout?.on('data', chunk => {
      if (settled || supervisor.failed) return
      try {
        appendFileSync(path.join(workspace, 'owner.stdout'), chunk)
      } catch (error) {
        stopOwner(error)
      }
    })
    child.stderr?.on('data', chunk => {
      if (settled || supervisor.failed) return
      try {
        appendFileSync(path.join(workspace, 'owner.stderr'), chunk)
      } catch (error) {
        stopOwner(error)
      }
    })
    child.stdout?.on('error', error => stopOwner(error))
    child.stderr?.on('error', error => stopOwner(error))
    return new Promise<{
      pid: number
      nativePid?: number
      nonce: string
      expectedFixtureSha256: string
      terminal?: Message
      killed: boolean
    }>((resolve, reject) => {
      const stopReportingFailures: unknown[] = []
      function retainFailure(error: unknown) {
        failServiceSupervisor(supervisor, slot, 'OWNER_SUPERVISION', error)
        const alreadySettled = settled
        settled = true
        messageState.acceptingMessages = false
        crashAdmission = false
        terminalAckStarted = false
        terminalAckDelivered = false
        reportServiceSupervisorStop(error, {
          child,
          terminal,
          handoff: terminalHandoff,
          diagnostics: stopReportingFailures,
          retained: retainedSupervisorReferences,
          alreadySettled,
          retainResources: true,
          deadline,
          workspace,
          nativePid,
          nonce: messageState.nonce,
          case: name,
          reject,
        })
      }
      stopOwner = retainFailure
      // Deadline bounds the supervisor's wait only. It never signals an owner or contender.
      const deadline = setTimeout(
        () => retainFailure(new Error('Fixture deadline UNKNOWN; actual owner and operation retained')),
        60000,
      )
      child.on('error', retainFailure)
      function registerNativeReady(value: Message) {
        if (value.type === 'native-message') {
          const native = value.value as Message
          if (native.type === 'ready') {
            assert.ok(Number.isSafeInteger(native.pid))
            assert.notEqual(native.pid, child.pid)
            nativePid = Number(native.pid)
          }
        }
      }

      function bindExpectedFixturePacket(value: Message) {
        if (['crash-ready', 'case-known-closed', 'case-retained'].includes(String(value.type))) {
          assert.match(String(value.expectedFixtureSha256), /^[a-f0-9]{64}$/)
          assert.equal(digest(path.join(workspace, 'expected-fixture.json')), value.expectedFixtureSha256)
          expectedFixtureSha256 = String(value.expectedFixtureSha256)
        }
      }

      function consumeExactCrashReceipt(value: Message) {
        assert.equal(crashes.has(name), true)
        assert.equal(killConsumed, false)
        assert.equal(value.gate, gates[name])
        assert.equal(value.databasePath, path.join(workspace, 'canonical.db'))
        assert.equal(value.lifecycle, 'OWNED_OFFLINE_FIXTURE_ONLY')
        assert.ok(nativePid)
        // Exact spawned ChildProcess handle/PID, its fresh nonce, case, file and actual requested gate are all bound.
        writeFileSync(
          path.join(workspace, 'supervisor-kill-receipt.json'),
          JSON.stringify({ ...value, nativePid, action: 'SIGKILL_EXACT_SPAWNED_OFFLINE_OWNER_ONLY' }, null, 2) + '\n',
        )
        // Receipt reporting may fail; recheck irrevocable admission immediately before the only signal.
        assert.equal(settled, false)
        assert.equal(messageState.acceptingMessages, true)
        assert.equal(crashAdmission, true)
        assert.equal(killConsumed, false)
        killConsumed = true
        crashAdmission = false
        assert.equal(child.kill('SIGKILL'), true)
      }

      function acceptTerminalOutcome(value: Message) {
        assert.equal(terminal, undefined)
        assertMatrixNotStopped()
        if (name === 'activation-unknown') {
          assert.equal(value.type, 'case-retained')
          const bytes = readFileSync(path.join(workspace, 'expected-fixture.json'))
          assert.ok(bytes.length <= 128 * 1024)
          assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedFixtureSha256)
          assertActivationRetainedOutcome(value, JSON.parse(bytes.toString()) as Message)
        }
        messageState.acceptingMessages = false
        crashAdmission = false
        terminal = value
        retainedSupervisorReferences.push(value)
        if (value.type === 'case-retained') {
          assert.equal(ambiguous.has(name) || Object.hasOwn(retainedComplements, name), true)
          if (Object.hasOwn(retainedComplements, name))
            assertServiceComplementRetainedOutcome(name, value, retainedComplements)
          assert.equal(killConsumed, false)
          assert.ok(nativePid)
          // Preliminary point-in-time check only; external post-supervisor liveness remains separately required.
          assert.doesNotThrow(() => process.kill(child.pid!, 0))
          writeFileSync(
            path.join(workspace, 'retained-owner.json'),
            JSON.stringify({ ...value, terminalState: 'PRELIMINARY_ACK_PENDING' }, null, 2) + '\n',
          )
        }
        const acknowledgement = encodeServiceTerminalAck({
          case: name,
          pid: child.pid!,
          nonce: messageState.nonce!,
          terminalType: value.type as 'case-known-closed' | 'case-retained',
          terminalSequence: Number(value.sequence),
          expectedFixtureSha256: expectedFixtureSha256!,
        })
        assert.equal(settled, false)
        assertMatrixNotStopped()
        assert.equal(terminalAckStarted, false)
        terminalAckStarted = true
        // Final active recheck is adjacent to this exact IPC admission. No ACK is sent after failure STOP.
        assert.equal(settled, false)
        assertMatrixNotStopped()
        const sent = child.send(acknowledgement, error => {
          if (settled || supervisor.failed) return
          if (error) return retainFailure(error)
          try {
            assertMatrixNotStopped()
            terminalAckDelivered = true
            finishAuthenticatedTerminal()
          } catch (failure) {
            retainFailure(failure)
          }
        })
        retainedSupervisorReferences.push(sent)
      }

      function receiveTerminalHandoff(value: Message) {
        assertMatrixNotStopped()
        assert.ok(terminal)
        assert.equal(terminalAckStarted, true)
        assert.equal(terminalHandoff, undefined)
        // Whole grammar shares the original owner callback scope; routing already authenticated sequence and identity.
        decodeServiceTerminalHandoff(value, {
          case: name,
          pid: child.pid!,
          nonce: messageState.nonce!,
          terminalType: terminal.type as 'case-known-closed' | 'case-retained',
          terminalSequence: Number(terminal.sequence),
          expectedFixtureSha256: expectedFixtureSha256!,
        })
        assert.equal(value.databasePath, undefined)
        assert.equal(Buffer.byteLength(JSON.stringify(value)) <= 4096, true)
        terminalHandoff = value
        retainedSupervisorReferences.push(value)
        writeFileSync(path.join(workspace, 'terminal-handoff.json'), JSON.stringify(value, null, 2) + '\n')
        finishAuthenticatedTerminal()
      }
      function finishAuthenticatedTerminal() {
        const decision = decideServiceTerminalClosure(
          { settled, terminalAckDelivered, terminalHandoff, ownerDisconnected, terminal, knownExit },
          {
            case: name,
            pid: child.pid!,
            nonce: messageState.nonce!,
            ownerScript: legacy ? manifest.legacyBundle : manifest.bundle,
            expectedFixtureSha256: expectedFixtureSha256!,
            nativePid,
          },
          assertMatrixNotStopped,
        )
        if (!decision) return
        publishServiceTerminalDecision(decision, {
          child,
          workspace,
          retained: retainedSupervisorReferences,
          assertActive: assertMatrixNotStopped,
          assertRetainedCase: current =>
            assert.equal(ambiguous.has(current) || Object.hasOwn(retainedComplements, current), true),
          complete() {
            slot.disposition = 'AUTHENTICATED_TERMINAL'
            slot.terminalScope = {
              case: decision.identity.case,
              pid: decision.identity.pid,
              nonce: decision.identity.nonce,
              ownerScript: decision.identity.ownerScript,
              expectedFixtureSha256: decision.identity.expectedFixtureSha256,
              terminalType: decision.terminal.type as 'case-retained' | 'case-known-closed',
              terminalSequence: Number(decision.terminal.sequence),
              handoffSequence: Number(decision.handoff.sequence),
            }
            settled = true
            messageState.acceptingMessages = false
            crashAdmission = false
            clearTimeout(deadline)
            resolve({
              pid: child.pid!,
              nativePid,
              nonce: messageState.nonce!,
              expectedFixtureSha256: expectedFixtureSha256!,
              terminal,
              killed: false,
            })
          },
        })
      }
      function handleOwnerMessage(raw: unknown) {
        if (settled) return
        try {
          assertMatrixNotStopped()
          routeServiceOwnerMessage(raw, messageState, {
            append: encoded => appendFileSync(path.join(workspace, 'supervisor-events.jsonl'), encoded + '\n'),
            failure: retainFailure,
            handoff: receiveTerminalHandoff,
            nativeReady: registerNativeReady,
            bindExpected: bindExpectedFixturePacket,
            crash: consumeExactCrashReceipt,
            terminal: acceptTerminalOutcome,
          })
        } catch (error) {
          retainFailure(error)
        }
      }
      child.on('message', handleOwnerMessage)
      child.on('disconnect', () => {
        if (settled) return
        try {
          if (killConsumed) {
            ownerDisconnected = true
            return
          }
          assert.ok(
            terminal && terminalAckStarted && terminalHandoff,
            'Owner disconnected before authenticated terminal handoff',
          )
          ownerDisconnected = true
          finishAuthenticatedTerminal()
        } catch (error) {
          retainFailure(error)
        }
      })
      child.on('exit', (code, signal) => {
        if (settled) return
        try {
          assertMatrixNotStopped()
          assert.ok(nativePid || legacy)
          if (crashes.has(name)) {
            assert.equal(killConsumed, true)
            assert.equal(signal, 'SIGKILL')
            slot.exit = { code, signal }
            slot.disposition = 'EXACT_CRASH_KNOWN_EXIT'
            settled = true
            messageState.acceptingMessages = false
            crashAdmission = false
            clearTimeout(deadline)
            resolve({
              pid: child.pid!,
              nativePid,
              nonce: messageState.nonce!,
              expectedFixtureSha256: expectedFixtureSha256!,
              terminal,
              killed: true,
            })
          } else {
            knownExit = { code, signal }
            assert.equal(code, 0)
            assert.equal(signal, null)
            assert.equal(terminal?.type, 'case-known-closed')
            finishAuthenticatedTerminal()
          }
        } catch (error) {
          retainFailure(error)
        }
      })
    })
  }

  function assertFields(actual: Message, expected: Message, ignored: readonly string[] = []) {
    for (const [key, value] of Object.entries(expected))
      if (!ignored.includes(key)) expect(actual[key], key).toEqual(value)
  }

  function assertRecovered(name: string, result: Message, expected: Message) {
    const identity = expected.identity as Message
    const control = expected.control as Message
    const counts = result.counts as Message
    const hub = result.hub as Message
    const composition = name === compositionServiceCase
    const allObservations = result.observations as Message[]
    const observations = composition
      ? allObservations.filter(row => row.intentId === identity.intentId)
      : allObservations
    const states = result.state as Message[]
    const intents = result.intents as Message[]
    const runs = result.runs as Message[]
    const journeys = result.journeys as Message[]
    const state = states.find(row => row.sourceId === identity.sourceId)!
    const controlState = states.find(row => row.sourceId === control.sourceId)!
    const intent = intents.find(row => row.id === identity.intentId)!
    const controlIntent = intents.find(row => row.id === control.intentId)!
    const run = runs.find(row => row.id === identity.runId)!
    const temporal = assertCommonRecoveredScope()
    const pendingFields = [
      'pendingBatchId',
      'pendingBatchStartHead',
      'pendingBatchRecordAllowance',
      'pendingBatchByteAllowance',
      'pendingBatchRequestDigest',
    ] as const
    const baseSource = expected.occupiedSource as Message
    if (hub.version === 1) {
      assertOccupiedOutcome()
    } else {
      assertCommittedOutcome()
    }
    if (
      [
        'before-commit-death',
        'pending-death',
        'pre-receipt-death',
        'pre-hold-dispose',
        'activation-unknown',
        'late-ack',
      ].includes(name)
    )
      expect(hub.version).toBe(1)
    if (
      [
        'after-commit-death',
        'positive',
        'late-writer',
        'lost-reply',
        'negative-inputs',
        'disposed-original-after-writer-close',
        'wrong-original-client',
      ].includes(name)
    )
      expect(hub.version).toBe(2)
    expect(result.integrity).toEqual([{ integrity_check: 'ok' }])
    expect(result.foreignKeys).toEqual([])

    function assertCommonRecoveredScope(): Message {
      assertRecoveredTopology()
      const temporal = assertOriginalRunAndIntent()
      assertDiagnosticControl()
      assertOriginalSourceLedger()
      expect(journeys[0]).toMatchObject({
        id: identity.journeyId,
        targetProjectId: identity.targetProjectId,
        ownershipVersion: composition
          ? Number((expected.composition as Message).finalOwnershipVersion)
          : Number(expected.occupiedJourneyVersion) + Number(expected.postCommitControls),
      })
      return temporal
    }

    function assertRecoveredTopology() {
      assert.ok(state && controlState && intent && controlIntent && run)
      expect(counts).toMatchObject({
        journeys: 1,
        slots: 1,
        runs: composition ? 2 : 1,
        intents: composition ? 3 : 2,
        sources: 2,
      })
      expect(states).toHaveLength(2)
      expect(intents).toHaveLength(composition ? 3 : 2)
      expect(runs).toHaveLength(composition ? 2 : 1)
      expect(journeys).toHaveLength(1)
      expect(allObservations).toHaveLength(Number(counts.observations))
    }

    function assertOriginalRunAndIntent(): Message {
      expect(run.turnsReserved).toBe(expected.turnsReserved)
      expect(run.turnsReserved).toBe(1)
      expect(expected.frozenTurnCap).toBe(3)
      expect(Number(run.turnsReserved)).toBeLessThanOrEqual(Number(expected.frozenTurnCap))
      const temporal = expected.originalTemporal as Message
      const runDates = temporal.run as Message
      const intentDates = temporal.intent as Message
      for (const [field, value] of Object.entries(runDates)) expect(fixtureDateTime(run[field]), field).toBe(value)
      for (const [field, value] of Object.entries(intentDates))
        expect(fixtureDateTime(intent[field]), field).toBe(value)
      assertFields(run, expected.originalRun as Message, ['status', 'threadId'])
      assertFields(intent, expected.originalIntent as Message, ['status', 'threadId', 'turnId'])
      expect(intent.providerRunId).toBe(identity.runId)
      expect(intent.sendBoundaryId).toBe(identity.sendBoundaryId)
      expect(intent.providerNamespace).toBe(identity.providerNamespace)
      expect(intent.claimEpoch).toBe(identity.claimEpoch)
      expect(run.journeyId).toBe(identity.journeyId)
      expect(run.targetProjectId).toBe(identity.targetProjectId)
      expect(run.providerNamespace).toBe(identity.providerNamespace)
      expect(run.configurationDigest).toBe(identity.configurationDigest)
      expect(Number(intent.turnOrdinal)).toBeGreaterThanOrEqual(1)
      expect(Number(intent.turnOrdinal)).toBeLessThanOrEqual(3)
      return temporal
    }

    function assertDiagnosticControl() {
      expect(controlIntent).toMatchObject({
        providerRunId: identity.runId,
        turnOrdinal: control.ordinal,
        providerNamespace: control.providerNamespace,
        sendBoundaryId: null,
        status: composition ? 'INVALIDATED' : 'PENDING',
        armedAt: null,
        claimEpoch: 0,
        claimOwner: null,
        acknowledgedAt: null,
        reconciledAt: null,
      })
      if (composition) expect(fixtureDateTime(controlIntent.invalidatedAt)).not.toBeNull()
      else expect(controlIntent.invalidatedAt).toBeNull()
      expect(control.ordinal).not.toBe(intent.turnOrdinal)
      expect(Number(control.ordinal)).toBeGreaterThanOrEqual(1)
      expect(Number(control.ordinal)).toBeLessThanOrEqual(3)
      assertFields(controlState, expected.controlSource as Message)
    }

    function assertOriginalSourceLedger() {
      expect(state.sourceIncarnation).toBe(identity.sourceIncarnation)
      expect(state.providerRunId).toBe(identity.runId)
      expect(state.intentId).toBe(identity.intentId)
      expect(state.providerNamespace).toBe(identity.providerNamespace)
      expect(state.identityJson).toBe(identity.identityJson)
      expect(state.protocolDigest).toBe(identity.protocolDigest)
      expect(state.qualificationDigest).toBe(identity.qualificationDigest)
      const ledger = result.ledger as Message[]
      expect(ledger).toHaveLength(1)
      expect(ledger[0]).toMatchObject({
        sourceId: identity.sourceId,
        count: state.sequence,
        first: 1,
        last: state.sequence,
        byteCount: state.byteCount,
      })
      expect(counts.ledger).toBe(state.sequence)
    }

    function assertOccupiedOutcome() {
      expect(hub).toMatchObject({
        id: 'HUB',
        providerRunId: identity.runId,
        intentId: identity.intentId,
        sendBoundaryId: identity.sendBoundaryId,
        version: 1,
      })
      expect(temporal.reservedAt).not.toBeNull()
      expect(fixtureDateTime(hub.reservedAt)).toBe(temporal.reservedAt)
      assertFields(state, baseSource)
      expect(state.committedObservationId).toBeNull()
      expect(state.committedRequestHash).toBeNull()
      expect(intent.reconciledAt).toBeNull()
      expect(intent.invalidatedAt).toBeNull()
      expect(run.terminalReconciledAt).toBeNull()
      expect(run.terminalRetentionAt).toBeNull()
      if (name === 'late-ack') {
        assertLateAcknowledgement()
      } else {
        expect(counts.observations).toBe(0)
        expect(observations).toEqual([])
        expect(run.status).toBe((expected.originalRun as Message).status)
        expect(run.threadId).toBe((expected.originalRun as Message).threadId)
        expect(intent.status).toBe((expected.originalIntent as Message).status)
        expect(intent.threadId).toBe((expected.originalIntent as Message).threadId)
        expect(intent.turnId).toBe((expected.originalIntent as Message).turnId)
        expect(intent.acknowledgedAt).toBeNull()
      }
      if (name === 'pending-death') {
        assertPendingReservation()
      } else {
        for (const field of pendingFields) expect(state[field], field).toBeNull()
      }
      if (name === 'pre-receipt-death') {
        assertBeforeReceipt()
      }
      if (expected.receipt) {
        expect(result.receiptReservations).toBe(1)
        expect(state.sealedHead).toBe(state.head)
        expect(state.sealedEnvelopeDigest).toBe(
          (expected.receipt as ProviderReconciliationReceipt).physical.evidenceDigest,
        )
      }
    }

    function assertLateAcknowledgement() {
      expect(expected.phase).toBe('KNOWN_FULFILLED_LATE_ACK_CONFLICT')
      expect(state.lifecycle).toBe('REVOKED')
      expect(run.status).toBe('CONFLICT')
      expect(run.threadId).toBe('late-thread')
      expect(intent).toMatchObject({ status: 'ACKNOWLEDGED', threadId: 'late-thread', turnId: 'late-turn' })
      expect(intent.acknowledgedAt).not.toBeNull()
      expect(counts.observations).toBe(2)
      expect(observations.map(row => row.kind).sort()).toEqual(['ACKNOWLEDGED', 'RECONCILIATION_CONFLICT'])
      const ack = observations.find(row => row.kind === 'ACKNOWLEDGED')!
      const conflict = observations.find(row => row.kind === 'RECONCILIATION_CONFLICT')!
      assertFields(ack, expected.acknowledgement as Message, ['createdAt'])
      expect(conflict).toMatchObject({
        intentId: identity.intentId,
        observationKey: `reconciliation-conflict:${String(expected.requestHash).slice(7)}`,
        requestHash: expected.requestHash,
        sendBoundaryId: identity.sendBoundaryId,
        providerNamespace: identity.providerNamespace,
        threadId: null,
        turnId: null,
      })
      expect(JSON.parse(String(conflict.reconciliationJson))).toEqual(expected.receipt)
      expect(conflict.evidenceDigest).toBe(
        `sha256:${createHash('sha256').update(canonicalContractJson(expected.receipt)).digest('hex')}`,
      )
    }
    function assertPendingReservation() {
      expect(expected.phase).toBe('PENDING_RESERVATION')
      expect(state.lifecycle).toBe('ACTIVE')
      for (const field of pendingFields) expect(state[field], field).not.toBeNull()
      expect(state.pendingBatchId).toEqual(expect.any(String))
      expect(Number(state.pendingBatchRecordAllowance)).toBeGreaterThan(0)
      expect(Number(state.pendingBatchRecordAllowance)).toBeLessThanOrEqual(1024)
      expect(Number(state.pendingBatchByteAllowance)).toBeGreaterThan(0)
      expect(Number(state.pendingBatchByteAllowance)).toBeLessThanOrEqual(1024 * 1024)
      expect(String(state.pendingBatchStartHead)).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(String(state.pendingBatchRequestDigest)).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(state.sealedHead).toBeNull()
      expect(state.sealedEnvelopeDigest).toBeNull()
    }
    function assertBeforeReceipt() {
      expect(expected.phase).toBe('AFTER_FLUSH_BEFORE_RECEIPT')
      expect(state.lifecycle).toBe('ACTIVE')
      expect(state.sealedHead).toBeNull()
      expect(state.sealedEnvelopeDigest).toBeNull()
      expect(result.receiptReservations).toBe(0)
    }
    function assertCommittedOutcome() {
      if (composition) {
        const evidence = expected.composition as Message
        const b = evidence.successorRun as Message
        const topology = evidence.intentTopology as { baseline: string[]; current: string[]; added: string }
        expect(result.profile).toBe('ORIGINAL_COMPOSITION16Z')
        expect(evidence.originalHelperState).toBe('FULFILLED')
        expect(evidence.physicalB).toBe('UNKNOWN')
        expect(evidence.canonicalBStatus).toBe('ACKNOWLEDGED')
        expect(counts).toMatchObject({ attempts: 2, authorizations: 2 })
        const attempts = result.attempts as Message[]
        expect(attempts.map(attempt => attempt.attempt)).toEqual([1, 2])
        expect(attempts[1]!.id).toBe(b.attemptId)
        expect(new Set(attempts.map(attempt => attempt.authorizationId)).size).toBe(2)
        expect(topology.baseline).toHaveLength(2)
        expect(topology.current).toHaveLength(3)
        expect(topology.baseline.slice().sort()).toEqual([String(identity.intentId), String(control.intentId)].sort())
        expect(topology.current.slice().sort()).toEqual(intents.map(row => String(row.id)).sort())
        const actualBRun = runs.find(row => row.id === b.id)!
        const actualBIntent = intents.find(row => row.id === topology.added)!
        expect(actualBRun).toMatchObject({
          id: b.id,
          status: 'ACKNOWLEDGED',
          terminalReconciledAt: null,
          turnsReserved: 1,
          attemptId: b.attemptId,
        })
        expect(actualBIntent).toMatchObject({
          id: topology.added,
          providerRunId: b.id,
          turnOrdinal: 1,
          status: 'ACKNOWLEDGED',
          reconciledAt: null,
        })
        expect(actualBIntent.sendBoundaryId).toEqual(expect.any(String))
        expect(hub).toMatchObject({
          id: 'HUB',
          providerRunId: b.id,
          intentId: topology.added,
          sendBoundaryId: actualBIntent.sendBoundaryId,
          version: 3,
        })
        expect(
          allObservations.filter(row => row.intentId === topology.added && row.kind === 'ACKNOWLEDGED'),
        ).toHaveLength(1)
        expect(
          allObservations
            .filter(row => row.intentId === topology.added)
            .map(row => row.kind)
            .sort(),
        ).toEqual(
          [
            'ACKNOWLEDGED',
            'TRANSPORT_ACTIVE',
            'TRANSPORT_DRAINED_UNCERTAIN',
            'TRANSPORT_READY',
            'TRANSPORT_STARTUP',
          ].sort(),
        )
        expect(allObservations).toHaveLength(6)
        expect((evidence.actualSnapshot as Message).cleanup).toMatchObject({
          status: 'stopped',
          groupExitObserved: true,
        })
      } else {
        expect(hub).toMatchObject({
          id: 'HUB',
          providerRunId: null,
          intentId: null,
          sendBoundaryId: null,
          reservedAt: null,
          version: 2,
        })
      }
      expect(counts.observations).toBe(composition ? 6 : 1)
      expect(observations).toHaveLength(1)
      const observation = observations[0]
      expect(observation).toMatchObject({
        intentId: identity.intentId,
        observationKey: identity.observationKey,
        kind: 'NONSTART',
        requestHash: expected.requestHash,
        sendBoundaryId: identity.sendBoundaryId,
        providerNamespace: identity.providerNamespace,
        threadId: null,
        turnId: null,
      })
      const receipt = JSON.parse(String(observation.reconciliationJson)) as ProviderReconciliationReceipt
      expect(receipt).toEqual(expected.receipt)
      expect(
        providerReconciliationRequestHash(String(identity.intentId), String(identity.observationKey), receipt),
      ).toBe(expected.requestHash)
      expect(observation.evidenceDigest).toBe(
        `sha256:${createHash('sha256').update(canonicalContractJson(receipt)).digest('hex')}`,
      )
      expect(intent.status).toBe('NONSTART_RECONCILED')
      expect(intent.reconciledAt).not.toBeNull()
      expect(intent.acknowledgedAt).toBeNull()
      expect(intent.threadId).toBeNull()
      expect(intent.turnId).toBeNull()
      expect(run.status).toBe('NONSTART_RECONCILED')
      expect(run.threadId).toBeNull()
      expect(run.terminalReconciledAt).not.toBeNull()
      expect(run.terminalRetentionAt).not.toBeNull()
      assertFields(state, {
        ...baseSource,
        lifecycle: 'COMMITTED',
        commitFenceVersion: Number(baseSource.commitFenceVersion) + 1 + Number(expected.postCommitControls),
        committedObservationId: observation.id,
        committedRequestHash: expected.requestHash,
      })
      for (const field of pendingFields) expect(state[field], field).toBeNull()
      assertRecoveredReceiptIdentity(receipt, identity)
      assertCommittedProviderSourceReplay(
        state as never,
        { id: String(observation.id), requestHash: String(observation.requestHash) },
        receipt,
      )
    }
  }

  function assertRecoveredReceiptIdentity(receipt: ProviderReconciliationReceipt, identity: Message) {
    assertProviderReceiptCanonicalIdentity(receipt, {
      runId: String(identity.runId),
      intentId: String(identity.intentId),
      sendBoundaryId: String(identity.sendBoundaryId),
      claimEpoch: Number(identity.claimEpoch),
      providerNamespace: String(identity.providerNamespace),
      configurationDigest: String(identity.configurationDigest),
      runThreadId: null,
      intentThreadId: null,
      turnId: null,
    })
  }

  function assertLegacyRecovered(name: string, result: Message, expected: Message) {
    expect(result.profile).toBe('GENUINE_LEGACY_FS')
    expect(expected.profile).toBe('GENUINE_LEGACY_FS')
    const committed = name === 'legacy-committed-clean-replay'
    expect(result.counts).toEqual({
      journeys: 1,
      slots: 1,
      runs: 1,
      intents: 1,
      sources: 0,
      observations: committed ? 1 : 0,
      ledger: 0,
    })
    expect(result.state).toEqual([])
    expect(result.ledger).toEqual([])
    const identity = expected.identity as Message
    const hub = result.hub as Message
    const run = (result.runs as Message[])[0]
    const intent = (result.intents as Message[])[0]
    expect(run).toMatchObject({
      id: identity.runId,
      journeyId: identity.journeyId,
      targetProjectId: identity.targetProjectId,
      providerNamespace: identity.providerNamespace,
      configurationDigest: identity.configurationDigest,
      turnsReserved: 1,
    })
    expect(intent).toMatchObject({
      id: identity.intentId,
      providerRunId: identity.runId,
      sendBoundaryId: identity.sendBoundaryId,
      providerNamespace: identity.providerNamespace,
      claimEpoch: identity.claimEpoch,
    })
    assertFields(run, expected.originalRun as Message, [
      'createdAt',
      'earliestIntentAt',
      'unresolvedRetentionAt',
      'terminalReconciledAt',
      'terminalRetentionAt',
      'status',
    ])
    assertFields(intent, expected.originalIntent as Message, [
      'createdAt',
      'claimExpiresAt',
      'armedAt',
      'acknowledgementDueAt',
      'turnDueAt',
      'acknowledgedAt',
      'invalidatedAt',
      'reconciledAt',
      'status',
    ])
    const temporal = expected.originalTemporal as Message
    for (const [field, value] of Object.entries(temporal.run as Message))
      expect(fixtureDateTime(run[field]), field).toBe(value)
    for (const [field, value] of Object.entries(temporal.intent as Message))
      expect(fixtureDateTime(intent[field]), field).toBe(value)
    expect(expected.turnsReserved).toBe(1)
    expect(expected.frozenTurnCap).toBe(3)
    expect(expected.canonicalGateEntries).toBe(0)
    expect(intent.acknowledgedAt).toBeNull()
    expect(intent.invalidatedAt).toBeNull()
    if (committed) {
      expect(expected.replayCanonicalGateEntries).toBe(0)
      expect(hub).toMatchObject({
        id: 'HUB',
        providerRunId: null,
        intentId: null,
        sendBoundaryId: null,
        reservedAt: null,
        version: 2,
      })
      expect(run.status).toBe('NONSTART_RECONCILED')
      expect(intent.status).toBe('NONSTART_RECONCILED')
      expect(intent.reconciledAt).not.toBeNull()
      expect(run.terminalReconciledAt).not.toBeNull()
      expect(run.terminalRetentionAt).not.toBeNull()
      const observations = result.observations as Message[]
      expect(observations).toHaveLength(1)
      const observation = observations[0]
      expect(observation).toMatchObject({
        id: expected.observationId,
        intentId: identity.intentId,
        observationKey: identity.observationKey,
        kind: 'NONSTART',
        requestHash: expected.requestHash,
        sendBoundaryId: identity.sendBoundaryId,
        providerNamespace: identity.providerNamespace,
        threadId: null,
        turnId: null,
      })
      expect(JSON.parse(String(observation.reconciliationJson))).toEqual(expected.receipt)
      expect(observation.evidenceDigest).toBe(
        `sha256:${createHash('sha256').update(canonicalContractJson(expected.receipt)).digest('hex')}`,
      )
      const receipt = expected.receipt as ProviderReconciliationReceipt
      expect(
        providerReconciliationRequestHash(String(identity.intentId), String(identity.observationKey), receipt),
      ).toBe(expected.requestHash)
      assertRecoveredReceiptIdentity(receipt, identity)
    } else {
      expect(hub).toMatchObject({
        id: 'HUB',
        providerRunId: identity.runId,
        intentId: identity.intentId,
        sendBoundaryId: identity.sendBoundaryId,
        version: 1,
      })
      expect(fixtureDateTime(hub.reservedAt)).toBe(temporal.reservedAt)
      expect(temporal.reservedAt).not.toBeNull()
      expect(run.status).toBe((expected.originalRun as Message).status)
      expect(intent.status).toBe((expected.originalIntent as Message).status)
      expect(intent.reconciledAt).toBeNull()
      expect(run.terminalReconciledAt).toBeNull()
      expect(run.terminalRetentionAt).toBeNull()
      expect(result.observations).toEqual([])
    }
    expect(result.integrity).toEqual([{ integrity_check: 'ok' }])
    expect(result.foreignKeys).toEqual([])
  }

  function inspectExitedOwner(workspace: string, owner: Awaited<ReturnType<typeof runCase>>, legacy: boolean) {
    assertMatrixNotStopped()
    const inspected = execFileSync(
      process.execPath,
      [
        manifest.inspectorScript,
        path.join(workspace, 'canonical.db'),
        String(owner.pid),
        legacy ? 'NONE' : String(owner.nativePid),
        legacy
          ? 'GENUINE_LEGACY_FS'
          : owner.terminal?.case === compositionServiceCase
            ? 'ORIGINAL_COMPOSITION16Z'
            : 'ORIGINAL_C1',
      ],
      { cwd: process.cwd(), env: { PATH: process.env.PATH }, encoding: 'utf8', maxBuffer: 1024 * 1024 },
    )
    const result = JSON.parse(inspected) as Record<string, unknown>
    writeFileSync(path.join(workspace, 'inspection.json'), JSON.stringify(result, null, 2) + '\n')
    return result
  }

  function assertExitedOwnerRecovery(
    name: ServiceCaseName,
    result: Record<string, unknown>,
    legacy: boolean,
    expected: Message,
  ) {
    expect(result.ownerGone).toBe(true)
    if (legacy) assertLegacyRecovered(name, result, expected)
    else assertRecovered(name, result, expected)
  }

  function assertMatrixNotStopped() {
    assertServiceSupervisorActive(supervisor)
  }

  async function runSelectedCase(name: ServiceCaseName) {
    try {
      assert.ok(selected.includes(name), 'Unselected SERVICE case')

      assertMatrixNotStopped()
      mkdirSync(evidence, { recursive: true })
      const workspace = mkdtempSync(path.join(evidence, `${name}-`))
      // Detect changed frozen source/tools immediately before each owner is created.
      assert.equal(digest(manifest.bundle), manifest.bundleSha256)
      assert.equal(digest(manifest.legacyBundle), manifest.legacyBundleSha256)
      for (const input of manifest.inputs) assert.equal(digest(input.filename), input.sha256)
      const owner = await runCase(name, workspace)
      assertMatrixNotStopped()
      assert.equal(digest(path.join(workspace, 'expected-fixture.json')), owner.expectedFixtureSha256)
      const expectedText = readFileSync(path.join(workspace, 'expected-fixture.json'), 'utf8')
      assert.ok(Buffer.byteLength(expectedText) <= 128 * 1024)
      const expected = JSON.parse(expectedText) as Message
      expect(expected).toMatchObject({
        version: 1,
        case: name,
        pid: owner.pid,
        nonce: owner.nonce,
        databasePath: path.join(workspace, 'canonical.db'),
      })
      const legacy = (legacyNames as readonly string[]).includes(name)
      if (legacy) expect(owner.nativePid).toBeUndefined()
      else await awaitNativeExit(workspace, owner.nativePid!)
      assertMatrixNotStopped()
      const family = classifyServiceCase(name, ambiguous, retainedComplements)
      const result = dispatchServiceCaseResult(family, {
        'retained-ambiguous': () =>
          assertServiceRetainedAmbiguousResult(name, owner, expected, expect, pid => {
            process.kill(pid, 0)
          }),
        'retained-complement': () =>
          assertServiceRetainedComplementResult(
            name,
            owner,
            expected,
            retainedComplements,
            expect,
            providerReconciliationRequestHash,
            pid => {
              process.kill(pid, 0)
            },
          ),
        'exited-recovery': () => {
          const result = inspectExitedOwner(workspace, owner, legacy)
          assertExitedOwnerRecovery(name, result, legacy, expected)
        },
      })
      markServiceCaseAssertionsPassed(
        supervisor,
        supervisor.slots.find(slot => slot.case === name)!,
        owner,
      )
      return result
    } catch (error) {
      failServiceSupervisor(
        supervisor,
        supervisor.slots.find(slot => slot.case === name),
        'CASE_ASSERTIONS',
        error,
      )
      throw error
    }
  }
  function releaseAfterFinalAssertions(): void {
    releaseServiceSupervisorRegistry(
      supervisor,
      slot => {
        const workspace = slot.specification!.workspace
        if (slot.terminalScope) readFixtureTerminalCallbackEvidence(workspace, slot.terminalScope)
        else {
          assert.equal(slot.disposition, 'EXACT_CRASH_KNOWN_EXIT')
          assert.equal(slot.exit?.signal, 'SIGKILL')
          assert.equal(
            readTerminalEvidenceFile(path.join(workspace, 'owner-failure-latch.json'), 16384),
            undefined,
            'Owner first failure prevents original supervisor release',
          )
        }
      },
      supervisionEffects,
    )
  }
  return Object.freeze({
    initializeManifest,
    runSelectedCase,
    releaseAfterFinalAssertions,
    fail(error: unknown) {
      failServiceSupervisor(supervisor, undefined, 'MAIN_CONTROLLER', error)
    },
    diagnostics: () => supervisor,
    assertions: Object.freeze({ assertRecovered, assertLegacyRecovered, assertExitedOwnerRecovery }),
  })
}
