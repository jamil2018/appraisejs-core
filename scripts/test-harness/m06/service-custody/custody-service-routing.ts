// Fixed fixture routing and actual main orchestration. Import grants no product operation.
import type { createFixtureAdmission } from './custody-fixture-admission'
import type { OriginalFixture, ComplementTrace } from './custody-service-owner'

export function dispatchServiceComplementAfterCommit(
  name: string,
  operations: Readonly<{
    disposed(): Promise<void>
    otherKey(): Promise<void>
    encodingHole(): Promise<void>
  }>,
): Promise<void> | undefined {
  const cases: Readonly<Record<string, (() => Promise<void>) | undefined>> = {
    'disposed-original-after-writer-close': operations.disposed,
    'old-commit-other-key-retirement': operations.otherKey,
    'unrelated-pre-sql-retirement': operations.encodingHole,
  }
  return cases[name]?.()
}

export async function runServiceOwnerMain(
  name: string,
  admission: ReturnType<typeof createFixtureAdmission>,
  operations: Readonly<{
    complementNames: ReadonlySet<string>
    instrumentComplementPersistence(): ComplementTrace
    createOriginalFixture(): Promise<OriginalFixture>
    performOriginalSend(fixture: OriginalFixture): Promise<void>
    crash(gate: string): Promise<never>
    runComplement(fixture: OriginalFixture, trace: ComplementTrace): Promise<void | undefined>
    finishOriginalOwner(fixture: OriginalFixture): Promise<void>
    runOutcomeCase(fixture: OriginalFixture): Promise<void>
  }>,
) {
  const { assertActive: assertFixtureActive, admitActual, afterActual } = admission
  assertFixtureActive('custody-service-owner.ts:903:1:entry')
  const trace = operations.complementNames.has(name)
    ? admitActual('16h:install-observers', operations.instrumentComplementPersistence)
    : undefined
  const fixture = afterActual(
    'custody-service-owner.ts:904:19:await',
    await admitActual('custody-service-owner.ts:904:19:await-operation', () =>
      admitActual('custody-service-owner.ts:904:25:operation', () => operations.createOriginalFixture()),
    ),
  )
  if (trace) admitActual('16h:bind-observers', () => trace.bind(fixture))
  if (name !== 'paused-send')
    afterActual(
      'custody-service-owner.ts:905:31:await',
      await admitActual('custody-service-owner.ts:905:31:await-operation', () =>
        admitActual('custody-service-owner.ts:905:37:operation', () => operations.performOriginalSend(fixture)),
      ),
    )
  if (name === 'pre-receipt-death')
    afterActual(
      'custody-service-owner.ts:906:37:await',
      await admitActual('custody-service-owner.ts:906:37:await-operation', () =>
        admitActual('custody-service-owner.ts:906:43:operation', () =>
          operations.crash('AFTER_FLUSH_BEFORE_RECEIPT_RESERVATION'),
        ),
      ),
    )
  if (trace) {
    afterActual('16h:case', await admitActual('16h:case', () => operations.runComplement(fixture, trace)))
    return admitActual('16h:finish-owner', () => operations.finishOriginalOwner(fixture))
  }
  afterActual(
    'custody-service-owner.ts:907:3:await',
    await admitActual('custody-service-owner.ts:907:3:await-operation', () =>
      admitActual('custody-service-owner.ts:907:9:operation', () => operations.runOutcomeCase(fixture)),
    ),
  )
  return admitActual('custody-service-owner.ts:908:10:operation', () => operations.finishOriginalOwner(fixture))
}
