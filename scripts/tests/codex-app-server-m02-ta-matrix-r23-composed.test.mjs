import { externalEffectAttempts } from './fixtures/codex-app-server-m02-ta-matrix-r23-composed/no-external-effects.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  dispatchMatrixEntrypoint,
  readFixedReceipt,
} from './fixtures/codex-app-server-m02-ta-matrix-r23/entrypoint.mjs'
import { runPreparedT2Matrix } from './fixtures/codex-app-server-m02-ta-matrix-r23/matrix-runner.mjs'
import {
  verifyR23MatrixPreparation,
  MATRIX_MANIFEST,
} from './fixtures/codex-app-server-m02-ta-matrix-r23/preparation.mjs'
import { prepareR23MatrixManifest } from './fixtures/codex-app-server-m02-ta-matrix-r23/manifest.mjs'
import { serializeR23Preparation } from './fixtures/codex-app-server-m02-ta-matrix-r23/preparation.mjs'
import { stageMatrixModules } from './fixtures/codex-app-server-m02-ta-matrix-r23/matrix-stage.mjs'
import { writeMatrixCaseReceipt } from './fixtures/codex-app-server-m02-ta-matrix-r23/case-receipts.mjs'
import { DurablePhaseJournal } from './fixtures/codex-app-server-m02-ta-phase-r10/phase-journal.mjs'
import { POLICY, ROOT } from './fixtures/codex-app-server-m02-ta-matrix-r23/policy.mjs'
import { createOfflineEffects } from './fixtures/codex-app-server-m02-ta-matrix-r23-composed/effects.mjs'

const repo = process.cwd()
const entry = path.join(repo, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r23/entrypoint.mjs')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const wire = object => Buffer.from(`${JSON.stringify(object, null, 2)}\n`)
const observer = { identity() {}, listDirectChildren() {}, directChildMetadata() {} }

/** Generated mock approvals are read from disposable bytes, never the actual fixed decision path. */
async function receipts(
  prepared,
  directory,
  { revision = '23', program = entry, manifestPath = MATRIX_MANIFEST } = {},
) {
  const review = JSON.parse(fs.readFileSync(path.join(repo, '.appraisejs/m02-t2-r21-exact-review.json')))
  const decision = JSON.parse(fs.readFileSync(path.join(repo, '.appraisejs/m02-t2-r21-recovery-user-decision.json')))
  const prefix = [
    '/usr/bin/env',
    '-i',
    'PATH=/usr/bin:/bin',
    'LANG=C',
    '/opt/homebrew/Cellar/node/26.11.0/bin/node',
    program,
    '--run',
    manifestPath,
    prepared.manifestDigest,
    prepared.manifestFileSha256,
  ]
  Object.assign(review, {
    schema: `appraise.m02-ta-t2-r${revision}-exact-review/v1`,
    reviewer: `/root/r${revision}_review`,
    verdict: `ACCEPT_ONE_FIXED_T2_R${revision}_INVOCATION`,
    runtimeVerdict: 'NOT_RUN',
    exactInvocationPrefix: prefix,
    manifest: {
      path: manifestPath,
      fileSha256: prepared.manifestFileSha256,
      manifestDigest: prepared.manifestDigest,
      phase: 'T2',
      root: prepared.manifest.root,
      cases: prepared.manifest.cases,
    },
    entrypointSha256: sha(fs.readFileSync(program)),
    recoveryProposalSha256: prepared.manifest.recoveryProposalSha256,
    ta04Authority: prepared.manifest.ta04Authority,
    r21TerminalEvidence: prepared.manifest.r21TerminalEvidence,
    rootPackageQualification: Object.fromEntries(Object.entries(prepared.manifest.rootPackageQualification).reverse()),
    r22BlockedEvidence: Object.fromEntries(Object.entries(prepared.manifest.r22BlockedEvidence).reverse()),
    combinedListenerAllocationCeilingIncludingR16: 33,
    historicalAvailability: prepared.manifest.historicalAvailability,
    preflightEvidence: Object.fromEntries(Object.entries(prepared.manifest.preflightEvidence).reverse()),
  })
  const reviewBytes = wire(review)
  const reviewSha = sha(reviewBytes)
  Object.assign(decision, {
    schema: `appraise.m02-ta-t2-r${revision}-recovery-user-decision/v1`,
    verdict: `APPROVE_ONE_FIXED_T2_R${revision}_RECOVERY`,
    scope: 'ONE_NEW_FULL_T2_P9_INVOCATION_NO_RESUME',
    manifestDigest: prepared.manifestDigest,
    manifestFileSha256: prepared.manifestFileSha256,
    exactReviewSha256: reviewSha,
    proposal: { path: prepared.manifest.recoveryProposalPath, sha256: prepared.manifest.recoveryProposalSha256 },
    exactInvocationPrefix: [...prefix, reviewSha],
    ta04Authority: prepared.manifest.ta04Authority,
    r21TerminalEvidence: prepared.manifest.r21TerminalEvidence,
    rootPackageQualification: Object.fromEntries(Object.entries(prepared.manifest.rootPackageQualification).reverse()),
    r22BlockedEvidence: Object.fromEntries(Object.entries(prepared.manifest.r22BlockedEvidence).reverse()),
    combinedListenerAllocationCeilingIncludingR16: 33,
    historicalAvailability: prepared.manifest.historicalAvailability,
    preflightEvidence: structuredClone(prepared.manifest.preflightEvidence),
    cumulativeWholeCampaignCeilings: Object.fromEntries(
      Object.entries(prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings).reverse(),
    ),
  })
  const decisionBytes = wire(decision)
  const decisionSha = sha(decisionBytes)
  fs.writeFileSync(path.join(directory, 'mock-review.json'), reviewBytes, { flag: 'wx', mode: 0o600 })
  fs.writeFileSync(path.join(directory, 'mock-decision.json'), decisionBytes, { flag: 'wx', mode: 0o600 })
  const read = name => () => readFixedReceipt(path.join(directory, name))
  return {
    args: ['--run', manifestPath, prepared.manifestDigest, prepared.manifestFileSha256, reviewSha, decisionSha],
    ports: {
      environment: { PATH: '/usr/bin:/bin', LANG: 'C' },
      execPath: '/opt/homebrew/Cellar/node/26.11.0/bin/node',
      programPath: program,
      cwd: repo,
      readReview: read('mock-review.json'),
      readDecision: read('mock-decision.json'),
      loadAddon: async () => observer,
    },
  }
}

test('actual R23 generated manifest and independently serialized receipts compose entrypoint, runner, launcher and adapter for 24 cases', async () => {
  const directory = fs.mkdtempSync('/private/tmp/m02-r23-composed-')
  const derived = await prepareR23MatrixManifest()
  const manifestBytes = serializeR23Preparation(derived)
  fs.writeFileSync(path.join(directory, 'generated-manifest.json'), manifestBytes, { mode: 0o600, flag: 'wx' })
  const canonicalFile = path.join(directory, 'generated-canonical.mjs')
  fs.writeFileSync(canonicalFile, derived.canonicalBytes, { mode: 0o600, flag: 'wx' })
  const prepared = fs.existsSync(MATRIX_MANIFEST)
    ? await verifyR23MatrixPreparation()
    : {
        ...derived,
        ...JSON.parse(fs.readFileSync(path.join(directory, 'generated-manifest.json'))),
        manifestFileSha256: sha(manifestBytes),
      }
  const target = path.join(directory, 'phase')
  const effects = createOfflineEffects({ prepared, target, policy: POLICY, canonicalFile })
  const previousCwd = process.cwd(),
    previousMask = process.umask()
  try {
    const approved = await receipts(prepared, directory)
    const result = await dispatchMatrixEntrypoint(approved.args, {
      ...approved.ports,
      verify: async () => prepared,
      run: options =>
        runPreparedT2Matrix({
          ...options,
          io: effects.io,
          fileSystem: effects.syncFs,
          verifyPreparation: async () => prepared,
          createJournal: ({ phase }) => DurablePhaseJournal.create({ directory: target, phase }),
          stage: options =>
            stageMatrixModules({
              ...options,
              phaseRoot: target,
              stageRoot: path.join(target, 'supervisor'),
              offlineCanonicalBytes: derived.canonicalBytes,
            }),
          loadCanonical: async () => effects.canonical,
          createObserver: effects.createObserver,
          chdir: () => process.chdir(path.join(target, 'supervisor')),
          readChildReceipt: effects.childReceipt,
          writeReceipt: (id, name, value) => writeMatrixCaseReceipt(id, name, value, effects.syncFs),
        }),
    })
    await effects.settle()
    if (effects.failures.length) throw effects.failures[0]
    const startupPath = path.join(target, 'startup-failure.json')
    const startup = fs.existsSync(startupPath) ? fs.readFileSync(startupPath, 'utf8') : null
    assert.equal(result.status, 'T2_CASES_COMPLETED', JSON.stringify({ result, startup, counts: effects.counts }))
    assert.equal(result.completed, 24)
    assert.equal(result.runtimeQualified, false)
    assert.equal(result.journal.fenced, false)
    assert.equal(effects.counts.fakeListeners, 24)
    assert.equal(effects.counts.fakeSpawns, 24)
    assert.equal(effects.counts.fakeStops, 24)
    assert.equal(effects.counts.providerRequests, 54, 'finite scripts issue 54 requests within ceiling 58')
    assert.deepEqual(externalEffectAttempts, [])
    const journal = fs.readFileSync(path.join(target, 'phase-journal.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
    const outcomes = []
    for (const id of prepared.manifest.cases) {
      const bytes = fs.readFileSync(path.join(target, 'cases', id, 'supervisor/case-outcome.json'))
      const receipt = JSON.parse(bytes)
      assert.equal(receipt.pending, 0)
      assert.equal(receipt.listenerClosed, true)
      assert.equal(receipt.manifestDigest, prepared.manifestDigest)
      outcomes.push(sha(bytes))
    }
    assert.equal(outcomes.length, 24)
    for (const hash of outcomes)
      assert.ok(JSON.stringify(journal).includes(hash), 'durable case witness binds actual receipt bytes')
    assert.equal(fs.existsSync(ROOT), false, 'no fixed runtime root created')
  } finally {
    process.chdir(previousCwd)
    process.umask(previousMask)
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('serialized R23 receipt gates reject drift, spent budgets, missing fields and synthetic run authority before effects', async () => {
  const derived = await prepareR23MatrixManifest()
  const prepared = { ...derived, manifestFileSha256: sha(serializeR23Preparation(derived)) }
  const directory = fs.mkdtempSync('/private/tmp/m02-r23-receipt-gates-')
  try {
    const changes = [
      [
        'review',
        value => {
          value.rootPackageQualification.currentSha256 = '0'.repeat(64)
        },
      ],
      [
        'review',
        value => {
          delete value.rootPackageQualification.predecessorBytes
        },
      ],
      [
        'review',
        value => {
          value.r22BlockedEvidence.nativeAllocationsConsumed = 1
        },
      ],
      [
        'decision',
        value => {
          delete value.rootPackageQualification
        },
      ],
      [
        'decision',
        value => {
          value.rootPackageQualification.runtimeAuthority = true
        },
      ],
      [
        'decision',
        value => {
          delete value.r22BlockedEvidence
        },
      ],
      [
        'decision',
        value => {
          value.scope = 'ONE_NEW_FULL_T2_P8_INVOCATION_NO_RESUME'
        },
      ],
      [
        'review',
        value => {
          value.preflightEvidence.extra = true
        },
      ],
      [
        'review',
        value => {
          value.manifest.root = '/private/tmp/appraise-m02-ta-matrix-p8'
        },
      ],
      [
        'review',
        value => {
          value.r21TerminalEvidence.status = 'SUCCESS'
        },
      ],
      [
        'review',
        value => {
          delete value.historicalAvailability.archiveWitnesses[0].archiveBytes
        },
      ],
      [
        'decision',
        value => {
          value.cumulativeWholeCampaignCeilings.sourceCapacity = 78
        },
      ],
      [
        'decision',
        value => {
          value.cumulativeWholeCampaignCeilings.listenerStarts = 31
        },
      ],
      [
        'decision',
        value => {
          value.combinedListenerAllocationCeilingIncludingR16 = 32
        },
      ],
      [
        'decision',
        value => {
          value.r21TerminalEvidence.cleanup = 'COMPLETE'
        },
      ],
      [
        'decision',
        value => {
          delete value.preflightEvidence.actualHostMode
        },
      ],
      [
        'decision',
        value => {
          value.specimenOnly = true
        },
      ],
    ]
    for (const [index, [kind, change]] of changes.entries()) {
      const scenario = path.join(directory, String(index))
      fs.mkdirSync(scenario, { mode: 0o700 })
      const approved = await receipts(prepared, scenario)
      const file = path.join(scenario, `mock-${kind}.json`)
      const receipt = JSON.parse(fs.readFileSync(file))
      change(receipt)
      const bytes = wire(receipt)
      fs.writeFileSync(file, bytes)
      approved.args[kind === 'review' ? 4 : 5] = sha(bytes)
      let effects = 0
      const failEffect = async () => {
        effects++
        throw new Error('effect reached')
      }
      await assert.rejects(
        dispatchMatrixEntrypoint(approved.args, {
          ...approved.ports,
          verify: async () => prepared,
          verifyHostFile: failEffect,
          verifyPrior: failEffect,
          loadAddon: failEffect,
          run: failEffect,
        }),
        /exact R23 review|R23 user decision/,
      )
      assert.equal(effects, 0)
    }
    assert.deepEqual(externalEffectAttempts, [])
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
