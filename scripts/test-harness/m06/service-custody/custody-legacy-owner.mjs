import { provePreparedLegacyCase } from './custody-legacy-proof.mjs'
import assert from 'node:assert/strict'
import { appendFileSync, lstatSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { OutcomeSourceUnknownError as LegacyOutcomeSourceUnknownError } from './legacy-fixtures/src/lib/quality-journey/codex-app-server/outcome-source-contract.ts.fixture'
import { createSyntheticOutcomeCustodian } from './legacy-fixtures/src/lib/quality-journey/codex-app-server/outcome-source.ts.fixture'
import {
  validateProviderReconciliationEvidence,
  providerReconciliationRequestHash,
} from './legacy-fixtures/src/lib/quality-journey/provider-reconciliation-contract.ts.fixture'
import {
  writeQualityJourneyProviderTransport as originalWrite,
  reconcileConsumedQualityJourneyProviderIntent as originalReconcile,
} from './legacy-fixtures/src/services/coordinator/quality-journey-provider-run-service.ts.fixture'
import { ServiceError } from '@/services/shared/errors'
import { addManagedProviderAssignment } from '@/test/quality-journey-provider-fixture'
import {
  bindProviderSendPermitTransport,
  sealConsumedProviderSender,
  trustedProviderReconciliation,
} from '@/lib/quality-journey/provider-intent-contract'
import { unavailableNativeProviderReconciliation } from '@/lib/quality-journey/provider-reconciliation-contract'
import {
  prepareQualityJourneyProviderRun as prepare,
  claimQualityJourneyProviderIntent as claim,
  armQualityJourneyProviderIntent as arm,
  reconcileConsumedQualityJourneyProviderIntent as reconcile,
} from '@/services/coordinator/quality-journey-provider-run-service'
import { fixtureOriginalTemporal } from './custody-fixture-datetime'
export const legacyCases = [
  'legacy-fs-valid-fresh-refusal',
  'legacy-fs-disposed-fresh-refusal',
  'legacy-fs-sealed-corrupt-fresh-refusal',
  'legacy-committed-clean-replay',
]
/** Genuine old bodies provide all evidence and committed JSON; this entry supplies only fixture inputs/assertions. */
/** @param {{name:string, workspace:string, nonce:string, client:import('@prisma/client').PrismaClient, retained:unknown[], event:(type:string,detail?:Record<string,unknown>)=>Promise<void>, writeExpectation:(update:Record<string,unknown>)=>void, assertActive:(phase:string)=>void, admission:ReturnType<typeof import('./custody-fixture-admission').createFixtureAdmission>}} options */
export async function runLegacyCase(options) {
  options.assertActive('custody-legacy-owner.mjs:37:1:entry')
  const { name, workspace, nonce, client, retained, event, writeExpectation, assertActive } = options
  const { assertActive: assertFixtureActive, admitActual, afterActual } = options.admission
  /** @template {PromiseLike<unknown>} P @param {string} label @param {()=>P} start @returns {P} */
  function admit(label, start) {
    return admitActual(label, start)
  }
  /** @template T @param {string} label @param {()=>PromiseLike<T>} start @returns {Promise<T>} */
  async function phase(label, start) {
    assertFixtureActive('custody-legacy-owner.mjs:47:3:entry')
    const result = afterActual(
      'custody-legacy-owner.mjs:48:20:await',
      await admitActual('custody-legacy-owner.mjs:48:20:await-operation', () =>
        admitActual('custody-legacy-owner.mjs:48:26:operation', () => admit(label, start)),
      ),
    )
    retained.push(result)
    assertActive(`${label}:continuation`)
    return result
  }
  /** @param {unknown} error @param {string} reason */
  const originalRefusal = (error, reason) => (
    assertFixtureActive('custody-legacy-owner.mjs:54:27:entry'),
    error instanceof LegacyOutcomeSourceUnknownError && error.reason === reason
  )
  function assertDistinctLegacyJournal() {
    assertFixtureActive('custody-legacy-owner.mjs:55:3:entry')
    const journalStat = admitActual('custody-legacy-owner.mjs:56:25:operation', () => lstatSync(journalPath))
    const canonicalStat = admitActual('custody-legacy-owner.mjs:57:27:operation', () =>
      lstatSync(admitActual('custody-legacy-owner.mjs:57:37:operation', () => path.join(workspace, 'canonical.db'))),
    )
    {
      assertFixtureActive('custody-legacy-owner.mjs:58:5:operation')
      assert.ok(
        admitActual('custody-legacy-owner.mjs:58:15:operation', () => journalStat.isFile()) &&
          admitActual('custody-legacy-owner.mjs:58:39:operation', () => canonicalStat.isFile()),
      )
    }
    {
      assertFixtureActive('custody-legacy-owner.mjs:59:5:operation')
      assert.ok(journalStat.dev !== canonicalStat.dev || journalStat.ino !== canonicalStat.ino)
    }
    admitActual('custody-legacy-owner.mjs:60:5:operation', () => assert.equal(journalStat.mode & 0o777, 0o600))
    return { journalStat, canonicalStat }
  }
  function isCommittedLegacyCase() {
    assertFixtureActive('custody-legacy-owner.mjs:63:3:entry')
    return name === 'legacy-committed-clean-replay'
  }
  /** @param {unknown} error */
  function isMissingLegacyCommit(error) {
    assertFixtureActive('custody-legacy-owner.mjs:67:3:entry')
    return (
      error instanceof ServiceError &&
      error.code === 'CONFLICT' &&
      error.message === 'No exact committed legacy provider reconciliation exists.'
    )
  }
  assertActive('fixture-start')
  {
    assertFixtureActive('custody-legacy-owner.mjs:75:3:operation')
    assert.ok(admitActual('custody-legacy-owner.mjs:75:13:operation', () => legacyCases.includes(name)))
  }
  const targetProjectId = 'custody-legacy-offline'
  afterActual(
    'custody-legacy-owner.mjs:77:3:await',
    await admitActual('custody-legacy-owner.mjs:77:3:await-operation', () =>
      admitActual('custody-legacy-owner.mjs:77:9:operation', () =>
        phase(
          'target-project-create',
          () => (
            assertFixtureActive('custody-legacy-owner.mjs:77:40:entry'),
            admitActual('custody-legacy-owner.mjs:78:5:operation', () =>
              client.targetProject.create({
                data: {
                  id: targetProjectId,
                  kind: 'LOCAL_WORKSPACE',
                  canonicalIdentity: `path:${workspace}`,
                  canonicalPath: workspace,
                  displayName: 'Genuine legacy FS fixture',
                  fingerprint: `sha256:${admitActual('custody-legacy-owner.mjs:85:32:operation', () => 'a'.repeat(64))}`,
                },
              }),
            )
          ),
        ),
      ),
    ),
  )
  const f = afterActual(
    'custody-legacy-owner.mjs:89:13:await',
    await admitActual('custody-legacy-owner.mjs:89:13:await-operation', () =>
      admitActual('custody-legacy-owner.mjs:89:19:operation', () =>
        phase(
          'assignment-create',
          () => (
            assertFixtureActive('custody-legacy-owner.mjs:89:46:entry'),
            admitActual('custody-legacy-owner.mjs:89:52:operation', () =>
              addManagedProviderAssignment(client, targetProjectId),
            )
          ),
        ),
      ),
    ),
  )
  f.prepareInput.providerNamespace = `synthetic:legacy:${admitActual('custody-legacy-owner.mjs:90:58:operation', () => path.basename(workspace))}`
  const prepared = afterActual(
    'custody-legacy-owner.mjs:91:20:await',
    await admitActual('custody-legacy-owner.mjs:91:20:await-operation', () =>
      admitActual('custody-legacy-owner.mjs:91:26:operation', () =>
        phase(
          'prepare',
          () => (
            assertFixtureActive('custody-legacy-owner.mjs:91:43:entry'),
            admitActual('custody-legacy-owner.mjs:91:49:operation', () => prepare(f.prepareInput, client))
          ),
        ),
      ),
    ),
  )
  const request = admitActual('custody-legacy-owner.mjs:92:19:operation', () =>
    Object.assign(
      admitActual('custody-legacy-owner.mjs:92:33:operation', () => Object.assign({}, f.binding)),
      {
        intentId: prepared.intent.id,
        claimOwner: 'offline-legacy',
      },
    ),
  )
  const claimed = afterActual(
    'custody-legacy-owner.mjs:96:19:await',
    await admitActual('custody-legacy-owner.mjs:96:19:await-operation', () =>
      admitActual('custody-legacy-owner.mjs:96:25:operation', () =>
        phase(
          'claim',
          () => (
            assertFixtureActive('custody-legacy-owner.mjs:96:40:entry'),
            admitActual('custody-legacy-owner.mjs:96:46:operation', () => claim(request, client))
          ),
        ),
      ),
    ),
  )
  const armed = afterActual(
    'custody-legacy-owner.mjs:97:17:await',
    await admitActual('custody-legacy-owner.mjs:97:17:await-operation', () =>
      admitActual('custody-legacy-owner.mjs:97:23:operation', () =>
        phase(
          'arm',
          () => (
            assertFixtureActive('custody-legacy-owner.mjs:97:36:entry'),
            admitActual('custody-legacy-owner.mjs:98:5:operation', () =>
              arm(
                admitActual('custody-legacy-owner.mjs:98:9:operation', () =>
                  Object.assign(
                    admitActual('custody-legacy-owner.mjs:98:23:operation', () => Object.assign({}, request)),
                    { claimEpoch: claimed.intent.claimEpoch },
                  ),
                ),
                client,
              ),
            )
          ),
        ),
      ),
    ),
  )
  const permit = armed.permit
  {
    assertFixtureActive('custody-legacy-owner.mjs:101:3:operation')
    assert.ok(permit)
  }
  assertActive('source-create')
  const directory = admitActual('custody-legacy-owner.mjs:103:21:operation', () =>
    path.join(workspace, 'legacy-ledger'),
  )
  admitActual('custody-legacy-owner.mjs:104:3:operation', () => mkdirSync(directory))
  const journalPath = admitActual('custody-legacy-owner.mjs:105:23:operation', () =>
    path.join(directory, 'observations.jsonl'),
  )
  const source = admitActual('custody-legacy-owner.mjs:106:18:operation', () =>
    createSyntheticOutcomeCustodian({
      identity: admitActual('custody-legacy-owner.mjs:107:15:operation', () =>
        Object.assign(
          admitActual('custody-legacy-owner.mjs:107:29:operation', () => Object.assign({}, permit)),
          {
            providerNamespace: f.prepareInput.providerNamespace,
            configurationDigest: f.prepareInput.configurationDigest,
          },
        ),
      ),
      journalPath,
    }),
  )
  retained.push(source)
  const physicalSource = source.context.source
  {
    assertFixtureActive('custody-legacy-owner.mjs:115:3:operation')
    assert.ok(physicalSource)
  }
  const { journalStat, canonicalStat } = admitActual('custody-legacy-owner.mjs:116:42:operation', () =>
    assertDistinctLegacyJournal(),
  )
  afterActual(
    'custody-legacy-owner.mjs:117:3:await',
    await admitActual('custody-legacy-owner.mjs:117:3:await-operation', () =>
      admitActual('custody-legacy-owner.mjs:117:9:operation', () =>
        phase(
          'journal-identity-report',
          () => (
            assertFixtureActive('custody-legacy-owner.mjs:117:42:entry'),
            admitActual('custody-legacy-owner.mjs:118:5:operation', () =>
              event('legacy-distinct-journal-inode', {
                journalPath,
                journal: { dev: journalStat.dev, ino: journalStat.ino },
                canonical: { dev: canonicalStat.dev, ino: canonicalStat.ino },
              }),
            )
          ),
        ),
      ),
    ),
  )
  assertActive('bind-original-transport')
  admitActual('custody-legacy-owner.mjs:125:3:operation', () =>
    bindProviderSendPermitTransport(permit, source.transport.owner, f.prepareInput),
  )
  /** @type {Record<string,unknown>} */
  const cyclic = {}
  cyclic.self = cyclic
  assertActive('encoding-hole')
  const hole = admitActual('custody-legacy-owner.mjs:130:16:operation', () =>
    source.transport.request('thread/start', cyclic),
  )
  retained.push(hole)
  afterActual(
    'custody-legacy-owner.mjs:132:3:await',
    await admitActual('custody-legacy-owner.mjs:132:3:await-operation', () =>
      admitActual('custody-legacy-owner.mjs:132:9:operation', () =>
        phase(
          'encoding-hole-observed',
          () => (
            assertFixtureActive('custody-legacy-owner.mjs:132:41:entry'),
            admitActual('custody-legacy-owner.mjs:132:47:operation', () => assert.rejects(hole))
          ),
        ),
      ),
    ),
  )
  const send = admitActual('custody-legacy-owner.mjs:133:16:operation', () =>
    admit(
      'original-send',
      () => (
        assertFixtureActive('custody-legacy-owner.mjs:133:39:entry'),
        admitActual('custody-legacy-owner.mjs:134:5:operation', () =>
          originalWrite(
            admitActual('custody-legacy-owner.mjs:135:7:operation', () =>
              Object.assign(
                admitActual('custody-legacy-owner.mjs:135:21:operation', () => Object.assign({}, f.binding)),
                { permit, consume: true },
              ),
            ),
            () => (
              assertFixtureActive('custody-legacy-owner.mjs:136:7:entry'),
              admitActual('custody-legacy-owner.mjs:136:13:operation', () => source.transport.request('turn/start', {}))
            ),
            client,
          ),
        )
      ),
    ),
  )
  retained.push(send)
  const boxed = afterActual(
    'custody-legacy-owner.mjs:141:17:await',
    await admitActual('custody-legacy-owner.mjs:141:17:await-operation', () =>
      admitActual('custody-legacy-owner.mjs:141:23:operation', () =>
        phase('original-send-fulfilled', () => (assertFixtureActive('custody-legacy-owner.mjs:141:56:entry'), send)),
      ),
    ),
  )
  retained.push(boxed.reply)
  afterActual(
    'custody-legacy-owner.mjs:143:3:await',
    await admitActual('custody-legacy-owner.mjs:143:3:await-operation', () =>
      admitActual('custody-legacy-owner.mjs:143:9:operation', () =>
        phase(
          'original-send-reply-observed',
          () => (
            assertFixtureActive('custody-legacy-owner.mjs:143:47:entry'),
            admitActual('custody-legacy-owner.mjs:143:53:operation', () => assert.rejects(boxed.reply))
          ),
        ),
      ),
    ),
  )
  afterActual(
    'custody-legacy-owner.mjs:144:3:await',
    await admitActual('custody-legacy-owner.mjs:144:3:await-operation', () =>
      admitActual('custody-legacy-owner.mjs:144:9:operation', () =>
        phase(
          'original-send-report',
          () => (
            assertFixtureActive('custody-legacy-owner.mjs:144:39:entry'),
            admitActual('custody-legacy-owner.mjs:144:45:operation', () =>
              event('legacy-original-send-outer-fulfilled'),
            )
          ),
        ),
      ),
    ),
  )
  assertActive('source-close-and-issue')
  admitActual('custody-legacy-owner.mjs:146:3:operation', () => source.close())
  const seal = admitActual('custody-legacy-owner.mjs:147:16:operation', () => source.transport.sealSender())
  const senderExcluded = admitActual('custody-legacy-owner.mjs:148:26:operation', () =>
    sealConsumedProviderSender(permit, seal, { threadId: null, turnId: null }),
  )
  const physicalEvidence = admitActual('custody-legacy-owner.mjs:149:28:operation', () =>
    source.issueNonstart(senderExcluded, seal),
  )
  retained.push(permit, seal, senderExcluded, physicalEvidence)
  const receipt = admitActual('custody-legacy-owner.mjs:151:19:operation', () =>
    validateProviderReconciliationEvidence(senderExcluded, physicalEvidence, source.context),
  )
  const input = {
    intentId: permit.intentId,
    observationKey: 'original-legacy-nonstart',
    senderExcluded,
    physicalEvidence,
  }
  const requestHash = admitActual('custody-legacy-owner.mjs:158:23:operation', () =>
    providerReconciliationRequestHash(input.intentId, input.observationKey, receipt),
  )
  const hub = afterActual(
    'custody-legacy-owner.mjs:159:15:await',
    await admitActual('custody-legacy-owner.mjs:159:15:await-operation', () =>
      admitActual('custody-legacy-owner.mjs:159:21:operation', () =>
        phase(
          'original-slot-read',
          () => (
            assertFixtureActive('custody-legacy-owner.mjs:159:49:entry'),
            admitActual('custody-legacy-owner.mjs:160:5:operation', () =>
              client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } }),
            )
          ),
        ),
      ),
    ),
  )
  const dateFields = admitActual('custody-legacy-owner.mjs:162:22:operation', () =>
    fixtureOriginalTemporal(hub.reservedAt, armed),
  )
  admitActual('custody-legacy-owner.mjs:163:3:operation', () => assert.notEqual(dateFields.reservedAt, null))
  admitActual('custody-legacy-owner.mjs:164:3:operation', () =>
    writeExpectation({
      version: 1,
      profile: 'GENUINE_LEGACY_FS',
      case: name,
      nonce,
      pid: process.pid,
      databasePath: admitActual('custody-legacy-owner.mjs:170:19:operation', () =>
        path.join(workspace, 'canonical.db'),
      ),
      identity: {
        journeyId: f.binding.journeyId,
        targetProjectId,
        runId: armed.run.id,
        intentId: permit.intentId,
        sendBoundaryId: permit.sendBoundaryId,
        claimEpoch: permit.claimEpoch,
        providerNamespace: f.prepareInput.providerNamespace,
        configurationDigest: f.prepareInput.configurationDigest,
        observationKey: input.observationKey,
      },
      originalTemporal: dateFields,
      originalRun: admitActual('custody-legacy-owner.mjs:183:18:operation', () =>
        JSON.parse(admitActual('custody-legacy-owner.mjs:183:29:operation', () => JSON.stringify(armed.run))),
      ),
      originalIntent: admitActual('custody-legacy-owner.mjs:184:21:operation', () =>
        JSON.parse(admitActual('custody-legacy-owner.mjs:184:32:operation', () => JSON.stringify(armed.intent))),
      ),
      turnsReserved: 1,
      frozenTurnCap: 3,
      receipt,
      requestHash,
      canonicalGateEntries: 0,
    }),
  )
  /** @param {import('./legacy-fixtures/src/lib/quality-journey/provider-reconciliation-contract.ts.fixture').ProviderPhysicalOutcomeSource} physicalSource */
  function prepareFreshSourceRefusal(physicalSource) {
    assertFixtureActive('custody-legacy-owner.mjs:192:3:entry')
    assertActive('fresh-source-refusal-setup')
    if (name === 'legacy-fs-disposed-fresh-refusal')
      admitActual('custody-legacy-owner.mjs:194:54:operation', () => source.dispose())
    if (name === 'legacy-fs-sealed-corrupt-fresh-refusal')
      admitActual('custody-legacy-owner.mjs:195:60:operation', () =>
        appendFileSync(journalPath, 'fixture-sealed-corruption\n'),
      )
    if (name === 'legacy-fs-valid-fresh-refusal')
      admitActual('custody-legacy-owner.mjs:197:7:operation', () =>
        assert.deepEqual(
          admitActual('custody-legacy-owner.mjs:197:24:operation', () => physicalSource.inspect(physicalEvidence)),
          receipt.physical,
        ),
      )
    else
      admitActual('custody-legacy-owner.mjs:199:7:operation', () =>
        assert.throws(
          () => (
            assertFixtureActive('custody-legacy-owner.mjs:200:9:entry'),
            admitActual('custody-legacy-owner.mjs:200:15:operation', () => physicalSource.inspect(physicalEvidence))
          ),
          error => (
            assertFixtureActive('custody-legacy-owner.mjs:201:9:entry'),
            admitActual('custody-legacy-owner.mjs:202:11:operation', () =>
              originalRefusal(
                error,
                name === 'legacy-fs-disposed-fresh-refusal' ? 'key_loss_or_disposed' : 'journal_read_or_corrupt',
              ),
            )
          ),
        ),
      )
  }
  return provePreparedLegacyCase({
    name,
    nonce,
    client,
    retained,
    event,
    writeExpectation,
    assertActive,
    admission: options.admission,
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
    trustedProviderReconciliation,
    unavailableNativeProviderReconciliation,
    ServiceError,
  })
}
