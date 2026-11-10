// Ordinary fixture lifetime only. No product authority, database access or operation wrapping.
import { retainDiagnosticFailure } from '../fixture-diagnostic-failures.mjs'
import { decodeServiceTerminalAck, decodeServiceTerminalHandoff } from '../fixture-terminal-codecs.mjs'

type FixtureFailure = Readonly<{ error: unknown; phase: string; operationPhase: string }>
type FixtureActualReference = Readonly<{ id: number; label: string; value: unknown }>
type FixtureRetentionState = {
  firstFailure: FixtureFailure | undefined
  lastActual: unknown
  referenceSequence: number
}

// Actual reference installation precedes both fallible retention arrays. Later fulfillment may still be retained.
export function retainFixtureActual<T>(
  state: FixtureRetentionState,
  references: FixtureActualReference[],
  retained: unknown[],
  fail: (error: unknown, label: string) => void,
  label: string,
  value: T,
): T {
  state.lastActual = value
  let retentionFailed = false
  let retentionFailure: unknown
  try {
    references.push({ id: ++state.referenceSequence, label, value })
  } catch (error) {
    retentionFailed = true
    retentionFailure = error
  }
  try {
    retained.push(value)
  } catch (error) {
    if (!retentionFailed) retentionFailure = error
    retentionFailed = true
  }
  if (retentionFailed) fail(retentionFailure, `${label}:retention`)
  return value
}

export function installFixtureFirstFailure(
  state: FixtureRetentionState,
  retained: unknown[],
  diagnostics: unknown[],
  reportFailure: (error: unknown, phase: string) => void,
  error: unknown,
  label: string,
  operationPhase: string,
): void {
  if (state.firstFailure) {
    retainDiagnosticFailure(diagnostics, error, 32)
    return
  }
  // Install irreversible cause and actual references before any fallible reporting.
  state.firstFailure = { error, phase: label, operationPhase }
  try {
    retained.push(state.firstFailure, error)
  } catch (retentionError) {
    retainDiagnosticFailure(diagnostics, retentionError, 32)
  }
  try {
    reportFailure(error, label)
  } catch (reportError) {
    retainDiagnosticFailure(diagnostics, reportError, 32)
  }
}
export function createFixtureAdmission(
  retained: unknown[],
  connected: () => boolean,
  reportFailure: (error: unknown, phase: string) => void,
) {
  let phase = 'owner-initialization'
  const state: FixtureRetentionState = { firstFailure: undefined, lastActual: undefined, referenceSequence: 0 }
  let terminalHandoff = false
  let operations = 0
  const diagnosticFailures: unknown[] = []
  const operationReferences: FixtureActualReference[] = []

  function fail(error: unknown, label = phase): void {
    installFixtureFirstFailure(state, retained, diagnosticFailures, reportFailure, error, label, phase)
  }

  function assertActive(label: string): void {
    if (state.firstFailure) throw state.firstFailure.error
    if (terminalHandoff) {
      const error = new Error(`Fixture admission after terminal handoff: ${label}`)
      fail(error, label)
      throw error
    }
    phase = label
    if (!connected()) {
      const error = new Error(`Unexpected original supervisor IPC loss: ${label}`)
      fail(error, label)
      throw error
    }
  }

  function keepActual<T>(label: string, value: T): T {
    return retainFixtureActual(state, operationReferences, retained, fail, label, value)
  }

  function admitActual<T>(label: string, start: () => T): T {
    assertActive(label)
    const value = start()
    keepActual(label, value)
    // Cap only future fixture admissions; the just-created actual object is already retained.
    if (++operations > 4096) fail(new Error('Fixture operation admission bound exceeded'), label)
    assertActive(`${label}:returned`)
    return value
  }

  function afterActual<T>(label: string, value: T): T {
    keepActual(`${label}:fulfilled`, value)
    assertActive(`${label}:continuation`)
    return value
  }

  function beginTerminalHandoff(label: string, publishCommit: () => void): void {
    assertActive(label)
    publishCommit()
    terminalHandoff = true
  }

  return Object.freeze({
    assertActive,
    admitActual,
    afterActual,
    keepActual,
    fail,
    beginTerminalHandoff,
    get unexpectedFailure() {
      return state.firstFailure
    },
    get expectedTerminalHandoff() {
      return terminalHandoff
    },
    get currentPhase() {
      return phase
    },
    referenceSummary: () => ({
      operations,
      referenceCount: operationReferences.length,
      retainedCount: retained.length,
      recent: operationReferences.slice(-8).map(({ id, label }) => ({ id, label })),
    }),
    // Read-only local lifetime diagnostics, never product-private state or authority.
    diagnostics: () => ({
      firstFailure: state.firstFailure,
      terminalHandoff,
      operations,
      lastActual: state.lastActual,
      diagnosticFailures,
      operationReferences,
    }),
  })
}

// Fixed authenticated terminal protocol: original result -> supervisor ACK -> owner handoff -> delivery callback -> disconnect.
export function createFixtureTerminal(
  admission: ReturnType<typeof createFixtureAdmission>,
  identity: Readonly<{ case: string; pid: number; nonce: string }>,
  sendHandoff: (value: Record<string, unknown>, delivered: (handoff: Record<string, unknown>) => void) => void,
  adapter: Readonly<{
    validateFinish(type: 'case-known-closed' | 'case-retained'): void
    prepareCommit(handoff: Record<string, unknown>): () => void
    finish(type: 'case-known-closed' | 'case-retained'): void
  }>,
) {
  let terminal:
    | Readonly<{ type: 'case-known-closed' | 'case-retained'; sequence: number; expectedFixtureSha256: string }>
    | undefined
  let ready = false
  let acknowledged = false
  let handoffStarted = false

  function register(value: Record<string, unknown>): void {
    admission.assertActive('terminal-report-register')
    admission.keepActual('terminal-report', value)
    if (terminal) throw new Error('Fixture terminal result already published')
    if (value.type !== 'case-known-closed' && value.type !== 'case-retained')
      throw new Error('Unexpected fixture terminal type')
    if (!Number.isSafeInteger(value.sequence) || Number(value.sequence) <= 0)
      throw new Error('Invalid fixture terminal sequence')
    if (typeof value.expectedFixtureSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.expectedFixtureSha256))
      throw new Error('Invalid original expected-fixture hash')
    terminal = {
      type: value.type,
      sequence: Number(value.sequence),
      expectedFixtureSha256: value.expectedFixtureSha256,
    }
  }

  function completeIfReady(): void {
    if (!ready || !acknowledged || handoffStarted) return
    admission.assertActive('terminal-handoff-report')
    adapter.validateFinish(terminal!.type)
    handoffStarted = true
    const value = admission.keepActual('terminal-handoff-object', {
      type: 'terminal-handoff',
      ...identity,
      terminalType: terminal!.type,
      terminalSequence: terminal!.sequence,
      expectedFixtureSha256: terminal!.expectedFixtureSha256,
    })
    sendHandoff(value, handoff => {
      if (admission.unexpectedFailure) return
      try {
        admission.assertActive('terminal-handoff-send-callback')
        admission.keepActual('terminal-original-sent-handoff', handoff)
        decodeServiceTerminalHandoff(handoff, {
          ...identity,
          terminalType: terminal!.type,
          terminalSequence: terminal!.sequence,
          expectedFixtureSha256: terminal!.expectedFixtureSha256,
        })
        const publishCommit = admission.keepActual(
          'terminal-exclusive-commit-publisher',
          adapter.prepareCommit(handoff),
        )
        // No await, IPC report or normal admission between this final check, exclusive publication and marker.
        admission.beginTerminalHandoff('authenticated-terminal-callback-commit', publishCommit)
        adapter.finish(terminal!.type)
      } catch (error) {
        admission.fail(error, 'terminal-callback-commit')
        throw error
      }
    })
  }

  function allowHandoff(): void {
    admission.assertActive('terminal-owner-continuation-complete')
    if (!terminal) throw new Error('Fixture terminal report missing')
    ready = true
    completeIfReady()
  }

  function acknowledge(raw: unknown): void {
    if (admission.unexpectedFailure) return
    admission.assertActive('terminal-acknowledgement')
    admission.keepActual('terminal-acknowledgement', raw)
    if (!raw || typeof raw !== 'object' || !terminal || acknowledged)
      throw new Error('Unexpected fixture terminal acknowledgement')
    decodeServiceTerminalAck(raw, {
      ...identity,
      terminalType: terminal.type,
      terminalSequence: terminal.sequence,
      expectedFixtureSha256: terminal.expectedFixtureSha256,
    })
    acknowledged = true
    completeIfReady()
  }

  return Object.freeze({ register, allowHandoff, acknowledge })
}
