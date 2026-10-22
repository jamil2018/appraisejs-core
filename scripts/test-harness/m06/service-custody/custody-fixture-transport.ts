// Actual current/legacy fixture handoff and failure evidence. Import creates no owner or resource.
import assert from 'node:assert/strict'
import { appendFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { createFixtureAdmission } from './custody-fixture-admission'

type Message = Record<string, unknown>
type Admission = ReturnType<typeof createFixtureAdmission>
type Channel = Pick<NodeJS.Process, 'connected' | 'send' | 'disconnect'>
type Identity = Readonly<{ case: string; pid: number; nonce: string }>

export function sendFixtureTerminalHandoff(
  admission: Admission,
  channel: Channel,
  eventFile: () => string,
  nextSequence: () => number,
  retain: (error: unknown) => void,
  value: Message,
  delivered: (handoff: Message) => void,
): void {
  admission.assertActive('terminal-handoff-send')
  const handoff = admission.keepActual('terminal-handoff-message', { ...value, sequence: nextSequence() })
  const encoded = JSON.stringify(handoff)
  assert.ok(Buffer.byteLength(encoded) <= 4096)
  appendFileSync(eventFile(), encoded + '\n')
  if (!channel.connected || !channel.send)
    throw new Error('Original supervisor IPC unavailable during terminal handoff')
  const sent = channel.send(handoff, error => {
    if (error) return retain(error)
    if (admission.unexpectedFailure) return
    try {
      admission.assertActive('terminal-handoff-delivered')
      delivered(handoff)
    } catch (failure) {
      retain(failure)
    }
  })
  admission.keepActual('terminal-handoff-send-result', sent)
}

// The two fixed original families differ only in failure-frame sequence presence.
export function fixtureRetainedFailureReport(
  identity: Identity,
  error: unknown,
  nextCurrentSequence: (() => number) | undefined,
  remember: (error: unknown) => void,
): Message {
  let value: Message = { type: 'failure-retained', ...identity, message: 'UNKNOWN' }
  try {
    value = nextCurrentSequence
      ? { ...value, sequence: nextCurrentSequence(), message: String(error).slice(0, 4096) }
      : { ...value, message: String(error).slice(0, 4096) }
  } catch (failure) {
    remember(failure)
  }
  return value
}

export function persistFixtureRetainedFailure(
  workspace: string,
  eventFile: () => string,
  value: Message,
  remember: (error: unknown) => void,
): void {
  try {
    const encoded = JSON.stringify(value, null, 2) + '\n'
    if (Buffer.byteLength(encoded) > 16 * 1024) throw new Error('Bounded fixture failure receipt exceeded')
    writeFileSync(path.join(workspace, 'owner-failure-latch.json'), encoded)
  } catch (error) {
    remember(error)
  }
  try {
    appendFileSync(eventFile(), JSON.stringify(value) + '\n')
  } catch (error) {
    remember(error)
  }
}

export function notifyFixtureRetainedFailure(
  channel: Channel,
  value: Message,
  remember: (error: unknown) => void,
): void {
  try {
    if (channel.connected)
      channel.send?.(value, error => {
        if (error) remember(error)
      })
  } catch (error) {
    remember(error)
  }
}

export function disconnectFixtureRetainedOwner(channel: Channel, remember: (error: unknown) => void): void {
  try {
    if (channel.connected) channel.disconnect?.()
  } catch (error) {
    remember(error)
  }
}

// Current owner only: its normal report remains synchronous and never becomes a legacy reporting Promise.
export function serviceNormalReportDelivered(
  admission: Admission,
  ipcFaultWaiting: boolean,
  type: string,
  error: Error | null,
  retain: (error: unknown) => void,
): void {
  if (error) return retain(error)
  if (admission.unexpectedFailure || admission.expectedTerminalHandoff || ipcFaultWaiting) return
  try {
    admission.assertActive('normal-report-delivered:' + type)
  } catch (failure) {
    retain(failure)
  }
}

export function routeNativeFixtureReply(
  admission: Admission,
  raw: unknown,
  effects: Readonly<{
    rejectFatal(value: Message): void
    report(value: Message): void
    retain(error: unknown): void
    ready(value: Message): void
    pending(value: Message): void
  }>,
): void {
  const value = admission.keepActual('native-reply', raw as Message)
  if (value.type === 'fatal') return effects.rejectFatal(value)
  if (!admission.unexpectedFailure) {
    try {
      effects.report(value)
    } catch (error) {
      effects.retain(error)
    }
  }
  if (value.type === 'ready') effects.ready(value)
  else effects.pending(value)
}
