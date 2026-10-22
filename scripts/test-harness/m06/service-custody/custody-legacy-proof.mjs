// Complete genuine-legacy fixture proof, supplied with the original prepared resources/operations.
// No historical or current product import at runtime; no IO or resource creation at import.
import assert from 'node:assert/strict'
/** @param {{
 * name: string, nonce: string, client: import('@prisma/client').PrismaClient, retained: unknown[],
 * event: (type:string, detail?:Record<string,unknown>)=>Promise<void>, writeExpectation: (update:Record<string,unknown>)=>void,
 * assertActive: (phase:string)=>void, admission: ReturnType<typeof import('./custody-fixture-admission').createFixtureAdmission>,
 * phase: <T>(label:string,start:()=>PromiseLike<T>)=>Promise<T>,
 * admit: <P extends PromiseLike<unknown>>(label:string,start:()=>P)=>P,
 * source: ReturnType<typeof import('./legacy-fixtures/src/lib/quality-journey/codex-app-server/outcome-source.ts.fixture').createSyntheticOutcomeCustodian>,
 * physicalSource: import('./legacy-fixtures/src/lib/quality-journey/provider-reconciliation-contract.ts.fixture').ProviderPhysicalOutcomeSource,
 * physicalEvidence: Parameters<import('./legacy-fixtures/src/lib/quality-journey/provider-reconciliation-contract.ts.fixture').ProviderPhysicalOutcomeSource['inspect']>[0],
 * input: Parameters<typeof import('./legacy-fixtures/src/services/coordinator/quality-journey-provider-run-service.ts.fixture').reconcileConsumedQualityJourneyProviderIntent>[0],
 * receipt: unknown, requestHash: string, armed: {run:{id:string}},
 * isCommittedLegacyCase: ()=>boolean, isMissingLegacyCommit: (error:unknown)=>boolean,
 * originalRefusal: (error:unknown,reason:string)=>boolean,
 * prepareFreshSourceRefusal: (source:import('./legacy-fixtures/src/lib/quality-journey/provider-reconciliation-contract.ts.fixture').ProviderPhysicalOutcomeSource)=>void,
 * originalReconcile: typeof import('./legacy-fixtures/src/services/coordinator/quality-journey-provider-run-service.ts.fixture').reconcileConsumedQualityJourneyProviderIntent,
 * reconcile: typeof import('@/services/coordinator/quality-journey-provider-run-service').reconcileConsumedQualityJourneyProviderIntent,
 * trustedProviderReconciliation: typeof import('@/lib/quality-journey/provider-intent-contract').trustedProviderReconciliation,
 * unavailableNativeProviderReconciliation: typeof import('@/lib/quality-journey/provider-reconciliation-contract').unavailableNativeProviderReconciliation,
 * ServiceError: typeof import('@/services/shared/errors').ServiceError
 * }} scope */
export async function provePreparedLegacyCase(scope) {
  const {
    name,
    nonce,
    client,
    retained,
    event,
    writeExpectation,
    assertActive,
    phase,
    admit,
    source,
    physicalSource,
    physicalEvidence,
    input,
    receipt,
    requestHash,
    armed,
    isCommittedLegacyCase,
    isMissingLegacyCommit,
    originalRefusal,
    prepareFreshSourceRefusal,
    originalReconcile,
    reconcile,
    unavailableNativeProviderReconciliation,
    ServiceError,
  } = scope
  /** @type {typeof import('@/lib/quality-journey/provider-intent-contract').trustedProviderReconciliation} */
  const trustedProviderReconciliation = scope.trustedProviderReconciliation
  const { assertActive: assertFixtureActive, admitActual, afterActual } = scope.admission
  if (admitActual('custody-legacy-owner.mjs:208:7:operation', () => isCommittedLegacyCase())) {
    const commit = admitActual('custody-legacy-owner.mjs:209:20:operation', () =>
      admit(
        'original-commit',
        () => (
          assertFixtureActive('custody-legacy-owner.mjs:209:45:entry'),
          admitActual('custody-legacy-owner.mjs:210:7:operation', () =>
            originalReconcile(input, source.context, trustedProviderReconciliation, client),
          )
        ),
      ),
    )
    retained.push(commit)
    const original = afterActual(
      'custody-legacy-owner.mjs:213:22:await',
      await admitActual('custody-legacy-owner.mjs:213:22:await-operation', () =>
        admitActual('custody-legacy-owner.mjs:213:28:operation', () =>
          phase(
            'original-commit-fulfilled',
            () => (assertFixtureActive('custody-legacy-owner.mjs:213:63:entry'), commit),
          ),
        ),
      ),
    )
    admitActual('custody-legacy-owner.mjs:214:5:operation', () => assert.equal(original.replayed, false))
    admitActual('custody-legacy-owner.mjs:215:5:operation', () => assert.deepEqual(original.receipt, receipt))
    afterActual(
      'custody-legacy-owner.mjs:216:5:await',
      await admitActual('custody-legacy-owner.mjs:216:5:await-operation', () =>
        admitActual('custody-legacy-owner.mjs:216:11:operation', () =>
          phase(
            'original-commit-report',
            () => (
              assertFixtureActive('custody-legacy-owner.mjs:216:43:entry'),
              admitActual('custody-legacy-owner.mjs:217:7:operation', () =>
                event('legacy-original-commit-outer-fulfilled', { observationId: original.observation.id }),
              )
            ),
          ),
        ),
      ),
    )
    assertActive('committed-source-dispose')
    admitActual('custody-legacy-owner.mjs:220:5:operation', () => source.dispose())
    assertActive('committed-disposed-inspect')
    admitActual('custody-legacy-owner.mjs:222:5:operation', () =>
      assert.throws(
        () => (
          assertFixtureActive('custody-legacy-owner.mjs:223:7:entry'),
          admitActual('custody-legacy-owner.mjs:223:13:operation', () => physicalSource.inspect(physicalEvidence))
        ),
        error => (
          assertFixtureActive('custody-legacy-owner.mjs:224:7:entry'),
          admitActual('custody-legacy-owner.mjs:224:16:operation', () => originalRefusal(error, 'key_loss_or_disposed'))
        ),
      ),
    )
    const replay = { intentId: input.intentId, observationKey: input.observationKey, replayRequestHash: requestHash }
    const transaction = client.$transaction
    let replayCanonicalGateEntries = 0
    client.$transaction = (/** @type {unknown[]} */ ...args) => {
      assertFixtureActive('custody-legacy-owner.mjs:229:27:entry')
      replayCanonicalGateEntries++
      return admitActual('custody-legacy-owner.mjs:231:14:operation', () => Reflect.apply(transaction, client, args))
    }
    try {
      for (let i = 0; i < 2; i++) {
        const operation = admitActual('custody-legacy-owner.mjs:235:27:operation', () =>
          admit(
            'clean-replay',
            () => (
              assertFixtureActive('custody-legacy-owner.mjs:235:49:entry'),
              admitActual('custody-legacy-owner.mjs:236:11:operation', () =>
                reconcile(replay, unavailableNativeProviderReconciliation, trustedProviderReconciliation, client),
              )
            ),
          ),
        )
        retained.push(operation)
        const value = afterActual(
          'custody-legacy-owner.mjs:239:23:await',
          await admitActual('custody-legacy-owner.mjs:239:23:await-operation', () =>
            admitActual('custody-legacy-owner.mjs:239:29:operation', () =>
              phase(
                'clean-replay-result',
                () => (assertFixtureActive('custody-legacy-owner.mjs:239:58:entry'), operation),
              ),
            ),
          ),
        )
        admitActual('custody-legacy-owner.mjs:240:9:operation', () => assert.equal(value.replayed, true))
        admitActual('custody-legacy-owner.mjs:241:9:operation', () =>
          assert.equal(value.observation.id, original.observation.id),
        )
        admitActual('custody-legacy-owner.mjs:242:9:operation', () => assert.deepEqual(value.receipt, receipt))
      }
      for (const mismatch of [
        admitActual('custody-legacy-owner.mjs:245:9:operation', () =>
          Object.assign(
            admitActual('custody-legacy-owner.mjs:245:23:operation', () => Object.assign({}, replay)),
            { observationKey: 'wrong-original-key' },
          ),
        ),
        admitActual('custody-legacy-owner.mjs:246:9:operation', () =>
          Object.assign(
            admitActual('custody-legacy-owner.mjs:246:23:operation', () => Object.assign({}, replay)),
            {
              replayRequestHash: `sha256:${admitActual('custody-legacy-owner.mjs:246:81:operation', () => 'f'.repeat(64))}`,
            },
          ),
        ),
        admitActual('custody-legacy-owner.mjs:247:9:operation', () =>
          Object.assign(
            admitActual('custody-legacy-owner.mjs:247:23:operation', () => Object.assign({}, replay)),
            { intentId: `wrong-${nonce}` },
          ),
        ),
      ]) {
        const operation = admitActual('custody-legacy-owner.mjs:249:27:operation', () =>
          admit(
            'clean-replay-negative',
            () => (
              assertFixtureActive('custody-legacy-owner.mjs:249:58:entry'),
              admitActual('custody-legacy-owner.mjs:250:11:operation', () =>
                reconcile(mismatch, unavailableNativeProviderReconciliation, trustedProviderReconciliation, client),
              )
            ),
          ),
        )
        afterActual(
          'custody-legacy-owner.mjs:252:9:await',
          await admitActual('custody-legacy-owner.mjs:252:9:await-operation', () =>
            admitActual('custody-legacy-owner.mjs:252:15:operation', () =>
              phase(
                'clean-replay-negative-result',
                () => (
                  assertFixtureActive('custody-legacy-owner.mjs:252:53:entry'),
                  admitActual('custody-legacy-owner.mjs:253:11:operation', () =>
                    assert.rejects(
                      operation,
                      error => (
                        assertFixtureActive('custody-legacy-owner.mjs:255:13:entry'),
                        error instanceof ServiceError &&
                          error.code === 'CONFLICT' &&
                          error.message ===
                            'No exact committed provider reconciliation exists in the clean replay resolver.'
                      ),
                    ),
                  )
                ),
              ),
            ),
          ),
        )
      }
      admitActual('custody-legacy-owner.mjs:262:7:operation', () => assert.equal(replayCanonicalGateEntries, 0))
    } finally {
      assertFixtureActive('custody-legacy-owner.mjs:263:15:finally')
      client.$transaction = transaction
    }
    admitActual('custody-legacy-owner.mjs:266:5:operation', () =>
      writeExpectation({
        phase: 'GENUINE_OLD_COMMITTED_FULL_JSON_REPLAY',
        observationId: original.observation.id,
        replayCanonicalGateEntries,
      }),
    )
  } else {
    admitActual('custody-legacy-owner.mjs:272:5:operation', () => prepareFreshSourceRefusal(physicalSource))
    const transaction = client.$transaction
    let canonicalGateEntries = 0
    client.$transaction = (/** @type {unknown[]} */ ...args) => {
      assertFixtureActive('custody-legacy-owner.mjs:275:27:entry')
      canonicalGateEntries++
      return admitActual('custody-legacy-owner.mjs:277:14:operation', () => Reflect.apply(transaction, client, args))
    }
    try {
      const operation = admitActual('custody-legacy-owner.mjs:280:25:operation', () =>
        admit(
          'fresh-refusal',
          () => (
            assertFixtureActive('custody-legacy-owner.mjs:280:48:entry'),
            admitActual('custody-legacy-owner.mjs:281:9:operation', () =>
              reconcile(input, source.context, trustedProviderReconciliation, client),
            )
          ),
        ),
      )
      retained.push(operation)
      afterActual(
        'custody-legacy-owner.mjs:284:7:await',
        await admitActual('custody-legacy-owner.mjs:284:7:await-operation', () =>
          admitActual('custody-legacy-owner.mjs:284:13:operation', () =>
            phase(
              'fresh-refusal-result',
              () => (
                assertFixtureActive('custody-legacy-owner.mjs:284:43:entry'),
                admitActual('custody-legacy-owner.mjs:285:9:operation', () =>
                  assert.rejects(
                    operation,
                    error => (
                      assertFixtureActive('custody-legacy-owner.mjs:285:35:entry'),
                      name === 'legacy-fs-valid-fresh-refusal'
                        ? admitActual('custody-legacy-owner.mjs:287:15:operation', () => isMissingLegacyCommit(error))
                        : admitActual('custody-legacy-owner.mjs:288:15:operation', () =>
                            originalRefusal(
                              error,
                              name === 'legacy-fs-disposed-fresh-refusal'
                                ? 'key_loss_or_disposed'
                                : 'journal_unavailable',
                            ),
                          )
                    ),
                  ),
                )
              ),
            ),
          ),
        ),
      )
      admitActual('custody-legacy-owner.mjs:294:7:operation', () => assert.equal(canonicalGateEntries, 0))
    } finally {
      assertFixtureActive('custody-legacy-owner.mjs:295:15:finally')
      client.$transaction = transaction
    }
    admitActual('custody-legacy-owner.mjs:298:5:operation', () =>
      writeExpectation({ phase: 'FRESH_FS_REFUSED_BEFORE_CANONICAL_TRANSACTION', canonicalGateEntries }),
    )
    assertActive('fresh-refusal-source-dispose')
    admitActual('custody-legacy-owner.mjs:300:5:operation', () => source.dispose())
    // Original corruption bytes remain preserved; known-finished source disposal only closes its owned descriptor.
  }
  afterActual(
    'custody-legacy-owner.mjs:303:3:operation',
    (assertFixtureActive('custody-legacy-owner.mjs:303:3:operation'),
    assert.equal(
      afterActual(
        'custody-legacy-owner.mjs:303:16:await',
        await admitActual('custody-legacy-owner.mjs:303:16:await-operation', () =>
          admitActual('custody-legacy-owner.mjs:303:22:operation', () =>
            phase(
              'final-source-count',
              () => (
                assertFixtureActive('custody-legacy-owner.mjs:303:50:entry'),
                admitActual('custody-legacy-owner.mjs:303:56:operation', () =>
                  client.qualityJourneyProviderSourceState.count(),
                )
              ),
            ),
          ),
        ),
      ),
      0,
    )),
  )
  afterActual(
    'custody-legacy-owner.mjs:304:3:operation',
    (assertFixtureActive('custody-legacy-owner.mjs:304:3:operation'),
    assert.equal(
      afterActual(
        'custody-legacy-owner.mjs:304:16:await',
        await admitActual('custody-legacy-owner.mjs:304:16:await-operation', () =>
          admitActual('custody-legacy-owner.mjs:304:22:operation', () =>
            phase(
              'final-ledger-count',
              () => (
                assertFixtureActive('custody-legacy-owner.mjs:304:50:entry'),
                admitActual('custody-legacy-owner.mjs:304:56:operation', () =>
                  client.qualityJourneyProviderSourceLedgerRecord.count(),
                )
              ),
            ),
          ),
        ),
      ),
      0,
    )),
  )
  afterActual(
    'custody-legacy-owner.mjs:305:3:operation',
    (assertFixtureActive('custody-legacy-owner.mjs:305:3:operation'),
    assert.equal(
      afterActual(
        'custody-legacy-owner.mjs:307:7:await',
        await admitActual('custody-legacy-owner.mjs:307:7:await-operation', () =>
          admitActual('custody-legacy-owner.mjs:307:13:operation', () =>
            phase(
              'final-run-read',
              () => (
                assertFixtureActive('custody-legacy-owner.mjs:307:37:entry'),
                admitActual('custody-legacy-owner.mjs:308:9:operation', () =>
                  client.qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: armed.run.id } }),
                )
              ),
            ),
          ),
        ),
      ).turnsReserved,
      1,
    )),
  )
  afterActual(
    'custody-legacy-owner.mjs:313:3:operation',
    (assertFixtureActive('custody-legacy-owner.mjs:313:3:operation'),
    assert.equal(
      afterActual(
        'custody-legacy-owner.mjs:314:5:await',
        await admitActual('custody-legacy-owner.mjs:314:5:await-operation', () =>
          admitActual('custody-legacy-owner.mjs:314:11:operation', () =>
            phase(
              'final-observation-count',
              () => (
                assertFixtureActive('custody-legacy-owner.mjs:314:44:entry'),
                admitActual('custody-legacy-owner.mjs:314:50:operation', () =>
                  client.qualityJourneyProviderObservation.count(),
                )
              ),
            ),
          ),
        ),
      ),
      admitActual('custody-legacy-owner.mjs:315:5:operation', () => isCommittedLegacyCase()) ? 1 : 0,
    )),
  )
}
