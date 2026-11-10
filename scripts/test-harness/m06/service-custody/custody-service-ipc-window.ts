// Actual held IPC-window binding; no owner/product/client import or resource creation at import.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import type { createFixtureAdmission } from './custody-fixture-admission'
import {
  createIpcFaultGate,
  publishIpcFaultArtifact,
  type IpcFaultReferenceIds,
  type IpcFaultWindow,
} from './custody-fixture-ipc-fault.ts'
export type ServiceIpcWindowState = {
  waiting: boolean
  frame:
    Readonly<{ window: IpcFaultWindow; references: Readonly<Record<keyof IpcFaultReferenceIds, unknown>> }> | undefined
}
export function enterServiceIpcFaultWindow(
  admission: ReturnType<typeof createFixtureAdmission>,
  state: ServiceIpcWindowState,
  identity: Readonly<{ case: string; pid: number; nonce: string }>,
  workspace: string,
  eventFile: string,
  channel: Pick<NodeJS.Process, 'send'>,
  nextSequence: () => number,
  retain: (error: unknown) => void,
  callback: unknown,
  callbackValue: unknown,
  outerScope: Readonly<{ callback: unknown; outer: Promise<unknown> }> | undefined,
  client: unknown,
  source: unknown,
  restore: unknown,
): Promise<unknown> {
  const { assertActive: assertFixtureActive, admitActual } = admission
  assertFixtureActive('ipc-fault-window-entry')
  try {
    const gate = admitActual('ipc-fault-original-deferred', () => createIpcFaultGate(workspace))
    admission.keepActual('ipc-fault-original-deferred-promise', gate.promise)
    // One retained container owns all six actual objects before any per-role assertion/report can fail.
    const references = admission.keepActual('ipc-fault-all-actual-references', {
      callback,
      client,
      gate,
      outer: outerScope?.outer,
      restore,
      source,
    })
    admission.keepActual('ipc-fault-actual-callback-value', callbackValue)
    assertFixtureActive('ipc-fault-reference-binding')
    assert.equal(outerScope?.callback, callback, 'Actual outer must belong to this original callback')
    assert.ok(outerScope?.outer)
    assert.equal(typeof restore, 'function')
    assert.equal(new Set(Object.values(references)).size, 6)
    const referenceIds = {} as Record<keyof IpcFaultReferenceIds, number>
    for (const role of ['callback', 'client', 'gate', 'outer', 'restore', 'source'] as const) {
      admission.keepActual('ipc-fault-role:' + role, references[role])
      const records = admission.diagnostics().operationReferences
      const actual = records[records.length - 1]
      assert.equal(actual.value, references[role])
      referenceIds[role] = actual.id
    }
    admitActual('ipc-fault-preregistered-filesystem-observer', () => gate.observe(() => admission.unexpectedFailure))
    const window = admission.keepActual(
      'ipc-fault-original-window',
      Object.freeze({
        version: 1 as const,
        type: 'ipc-fault-window' as const,
        case: identity.case,
        pid: identity.pid,
        nonce: identity.nonce,
        sequence: nextSequence(),
        phase: 'IPC_FAULT_GATE_PENDING' as const,
        nextFixtureOperation: 'POST_CALLBACK_SOURCE_STATE_READ' as const,
        windowId: createHash('sha256').update(`${identity.nonce}:${identity.pid}:original-send-callback`).digest('hex'),
        admissionCount: admission.referenceSummary().operations,
        referenceIds: Object.freeze(referenceIds),
      }),
    )
    gate.arm(window)
    state.frame = admission.keepActual(
      'ipc-fault-actual-window-and-references',
      Object.freeze({ window, references: Object.freeze(references) }),
    )
    state.waiting = true
    assertFixtureActive('ipc-fault-window-publication')
    publishIpcFaultArtifact(workspace, 'ipc-fault-window.json', window)
    const encoded = JSON.stringify(window)
    assert.ok(Buffer.byteLength(encoded) <= 16384)
    appendFileSync(eventFile, encoded + '\n')
    assertFixtureActive('ipc-fault-window-send')
    const sent = channel.send!(window, error => {
      if (error) retain(error)
    })
    admission.keepActual('ipc-fault-original-window-send-result', sent)
    // No later normal admission/phase change before the sole fault await; successful report ACKs are inert.
    assertFixtureActive('IPC_FAULT_GATE_PENDING')
    return gate.promise
  } catch (error) {
    admission.fail(error, 'ipc-fault-window-preparation')
    throw error
  }
}
