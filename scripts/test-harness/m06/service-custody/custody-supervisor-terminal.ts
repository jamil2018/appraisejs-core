// Fixture supervisor terminal decision and its original publication effects; inert at import.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { readFixtureTerminalCallbackEvidence } from './custody-fixture-terminal-receipt.ts'

type Message = Record<string, unknown>
type TerminalState = Readonly<{
  settled: boolean
  terminalAckDelivered: boolean
  terminalHandoff: Message | undefined
  ownerDisconnected: boolean
  terminal: Message | undefined
  knownExit: Readonly<{ code: number | null; signal: NodeJS.Signals | null }> | undefined
}>
type TerminalIdentity = Readonly<{
  case: string
  pid: number
  nonce: string
  ownerScript: string
  expectedFixtureSha256: string
  nativePid: number | undefined
}>
export type ServiceTerminalDecision = Readonly<{
  identity: TerminalIdentity
  terminal: Message
  handoff: Message
  knownExit: TerminalState['knownExit']
}>
export function decideServiceTerminalClosure(
  state: TerminalState,
  identity: TerminalIdentity,
  assertActive: () => void,
): ServiceTerminalDecision | undefined {
  if (state.settled || !state.terminalAckDelivered || !state.terminalHandoff || !state.ownerDisconnected) return
  assertActive()
  if (state.terminal?.type !== 'case-retained' && !state.knownExit) return
  assert.ok(state.terminal?.type === 'case-retained' || state.terminal?.type === 'case-known-closed')
  return Object.freeze({
    identity: Object.freeze(identity),
    terminal: state.terminal,
    handoff: state.terminalHandoff,
    knownExit: state.knownExit,
  })
}

export function publishServiceTerminalDecision(
  decision: ServiceTerminalDecision,
  effects: Readonly<{
    child: Pick<ChildProcess, 'unref' | 'stdout' | 'stderr'>
    workspace: string
    retained: unknown[]
    assertActive(): void
    assertRetainedCase(name: string): void
    complete(): void
  }>,
): void {
  const { identity, terminal, handoff, knownExit } = decision
  const callbackCommit = readFixtureTerminalCallbackEvidence(effects.workspace, {
    case: identity.case,
    pid: identity.pid,
    nonce: identity.nonce,
    ownerScript: identity.ownerScript,
    terminalType: terminal.type as 'case-retained' | 'case-known-closed',
    terminalSequence: Number(terminal.sequence),
    handoffSequence: Number(handoff.sequence),
    expectedFixtureSha256: identity.expectedFixtureSha256,
  })
  effects.retained.push(callbackCommit)
  // The reader's final failure-file re-read remains immediately before this positive decision/publication.
  effects.assertActive()
  if (terminal.type === 'case-retained') {
    effects.assertRetainedCase(identity.case)
    writeFileSync(
      path.join(effects.workspace, 'retained-owner.json'),
      JSON.stringify(
        {
          ...terminal,
          handoff,
          callbackCommit,
          terminalState: 'POINT_IN_TIME_CALLBACK_COMMIT_WITH_DISCONNECT_EXTERNAL_LIVENESS_UNVERIFIED',
        },
        null,
        2,
      ) + '\n',
    )
    effects.child.unref()
    effects.child.stdout?.destroy()
    effects.child.stderr?.destroy()
  } else {
    if (!knownExit) return
    assert.equal(terminal.type, 'case-known-closed')
    assert.equal(knownExit.code, 0)
    assert.equal(knownExit.signal, null)
  }
  effects.complete()
}

export function reportServiceSupervisorStop(
  error: unknown,
  scope: Readonly<{
    child: Pick<ChildProcess, 'pid' | 'connected' | 'disconnect' | 'unref' | 'stdout' | 'stderr'>
    terminal: Message | undefined
    handoff: Message | undefined
    diagnostics: unknown[]
    retained: unknown[]
    alreadySettled: boolean
    retainResources?: boolean
    deadline: ReturnType<typeof setTimeout>
    workspace: string
    nativePid: number | undefined
    nonce: string | undefined
    case: string
    reject(error: unknown): void
  }>,
): void {
  const remember = (failure: unknown) => {
    try {
      scope.diagnostics.push(failure)
    } catch {}
  }
  try {
    scope.retained.push(scope.child, error, scope.terminal, scope.handoff, scope.diagnostics)
  } catch (failure) {
    remember(failure)
  }
  if (scope.alreadySettled) return
  clearTimeout(scope.deadline)
  try {
    writeFileSync(
      path.join(scope.workspace, 'supervisor-stop.json'),
      JSON.stringify(
        {
          pid: scope.child.pid,
          nativePid: scope.nativePid,
          nonce: scope.nonce,
          case: scope.case,
          reason: String(error),
          action: 'RETAIN_NO_KILL_NO_CLEANUP',
        },
        null,
        2,
      ) + '\n',
    )
  } catch (failure) {
    remember(failure)
  }
  if (!scope.retainResources) {
    try {
      if (scope.child.connected) scope.child.disconnect()
    } catch (failure) {
      remember(failure)
    }
    try {
      scope.child.unref()
    } catch (failure) {
      remember(failure)
    }
    try {
      scope.child.stdout?.destroy()
    } catch (failure) {
      remember(failure)
    }
    try {
      scope.child.stderr?.destroy()
    } catch (failure) {
      remember(failure)
    }
  }
  scope.reject(error)
}
