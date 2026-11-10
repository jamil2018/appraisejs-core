// Actual original-send callback and postcallback held window; no product runtime imports.
import assert from 'node:assert/strict'
import type { Prisma } from '@prisma/client'
import type { createFixtureAdmission } from './custody-fixture-admission'
import type { OriginalFixture } from './custody-service-owner'
export type ServiceSendWindowState = {
  actualSendWindow: boolean
  faultTransportReturned: boolean
  faultTransportConsumed: boolean
  faultOuterScope: Readonly<{ callback: unknown; outer: Promise<unknown> }> | undefined
  faultRestore: (() => void) | undefined
}
export function createServiceOriginalSendCallback(
  scope: Readonly<{
    admission: ReturnType<typeof createFixtureAdmission>
    fixture: OriginalFixture
    name: string
    callback(tx: Prisma.TransactionClient): Promise<unknown>
    ipcFaultCase: boolean
    sendWindow: ServiceSendWindowState
    beforeOwnership: number
    enterIpcFaultWindow(
      callback: unknown,
      value: unknown,
      outer: ServiceSendWindowState['faultOuterScope'],
      client: OriginalFixture['client'],
      source: OriginalFixture['source'],
      restore: unknown,
    ): Promise<unknown>
    recordIpcFaultFence(error: unknown): void
    originalSendWindowObserved(
      current: { ownershipVersion: number },
      intent: { sendBoundaryId: string | null },
    ): boolean
    event(type: string, value: Record<string, unknown>): void
    writeExpectation(value: Record<string, unknown>): void
    scalarState(value: Record<string, unknown>): Record<string, unknown>
    crash(gate: string): Promise<never>
  }>,
): (tx: Prisma.TransactionClient) => Promise<unknown> {
  const {
    admission,
    name,
    callback,
    ipcFaultCase,
    sendWindow,
    beforeOwnership,
    enterIpcFaultWindow,
    recordIpcFaultFence,
    originalSendWindowObserved,
    event,
    writeExpectation,
    scalarState,
    crash,
  } = scope
  const { client, source, sourceId, permit, f, contender } = scope.fixture
  const { assertActive: assertFixtureActive, admitActual, afterActual } = admission
  return async tx => {
    assertFixtureActive('custody-service-owner.ts:461:16:entry')
    const value = afterActual(
      'custody-service-owner.ts:462:23:await',
      await admitActual('custody-service-owner.ts:462:23:await-operation', () =>
        admitActual('custody-service-owner.ts:462:29:operation', () => callback(tx)),
      ),
    )
    if (ipcFaultCase && sendWindow.faultTransportReturned && !sendWindow.faultTransportConsumed) {
      sendWindow.faultTransportConsumed = true
      try {
        afterActual(
          'POST_CALLBACK_SOURCE_STATE_READ',
          await enterIpcFaultWindow(
            callback,
            value,
            sendWindow.faultOuterScope,
            client,
            source,
            sendWindow.faultRestore,
          ),
        )
      } catch (error) {
        recordIpcFaultFence(error)
        throw error
      }
    }
    // Source reservation transaction precedes canonical send. Only the actual send callback has consumed the permit.
    const state = afterActual(
      'custody-service-owner.ts:464:23:await',
      await admitActual('custody-service-owner.ts:464:23:await-operation', () =>
        admitActual('custody-service-owner.ts:464:29:operation', () =>
          tx.qualityJourneyProviderSourceState.findUniqueOrThrow({ where: { sourceId } }),
        ),
      ),
    )
    const intent = afterActual(
      'custody-service-owner.ts:465:24:await',
      await admitActual('custody-service-owner.ts:465:24:await-operation', () =>
        admitActual('custody-service-owner.ts:465:30:operation', () =>
          tx.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
            where: { id: permit.intentId },
          }),
        ),
      ),
    )
    const current = afterActual(
      'custody-service-owner.ts:468:25:await',
      await admitActual('custody-service-owner.ts:468:25:await-operation', () =>
        admitActual('custody-service-owner.ts:468:31:operation', () =>
          tx.qualityJourney.findUniqueOrThrow({ where: { id: f.binding.journeyId } }),
        ),
      ),
    )
    if (admitActual('custody-service-owner.ts:469:13:operation', () => originalSendWindowObserved(current, intent))) {
      {
        assertFixtureActive('custody-service-owner.ts:470:11:operation')
        assert.ok(state.pendingBatchId)
      }
      afterActual(
        'custody-service-owner.ts:471:11:await',
        await admitActual('custody-service-owner.ts:471:11:await-operation', () =>
          admitActual('custody-service-owner.ts:471:17:operation', () =>
            contender.probe(f.binding.journeyId, sourceId, true),
          ),
        ),
      )
      sendWindow.actualSendWindow = true
      admitActual('custody-service-owner.ts:473:11:operation', () =>
        event('actual-send-callback-return', { pendingBatchId: state.pendingBatchId }),
      )
      if (name === 'pending-death') {
        admitActual('custody-service-owner.ts:475:13:operation', () =>
          writeExpectation({
            occupiedSource: admitActual('custody-service-owner.ts:476:31:operation', () => scalarState(state)),
            occupiedJourneyVersion: beforeOwnership,
            phase: 'PENDING_RESERVATION',
          }),
        )
        afterActual(
          'custody-service-owner.ts:480:13:await',
          await admitActual('custody-service-owner.ts:480:13:await-operation', () =>
            admitActual('custody-service-owner.ts:480:19:operation', () =>
              crash('PENDING_AFTER_ACTUAL_SEND_BEFORE_OUTER_FULFILLMENT'),
            ),
          ),
        )
      }
    }
    return value
  }
}
