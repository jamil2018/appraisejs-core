import { externalEffectAttempts } from './fixtures/codex-app-server-m02-ta-matrix-r23-composed/no-external-effects.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import test, { after } from 'node:test'
import { dispatchMatrixEntrypoint } from './fixtures/codex-app-server-m02-ta-matrix-r23/entrypoint.mjs'
import { runPreparedT2Matrix } from './fixtures/codex-app-server-m02-ta-matrix-r23/matrix-runner.mjs'
import { stageMatrixModules } from './fixtures/codex-app-server-m02-ta-matrix-r23/matrix-stage.mjs'
import { writeMatrixCaseReceipt } from './fixtures/codex-app-server-m02-ta-matrix-r23/case-receipts.mjs'
import { DurablePhaseJournal } from './fixtures/codex-app-server-m02-ta-phase-r10/phase-journal.mjs'
import { verifyR22Predecessor } from './fixtures/codex-app-server-m02-ta-matrix-r23/r22-evidence.mjs'
import { POLICY } from './fixtures/codex-app-server-m02-ta-matrix-r23/policy.mjs'
import { readConsumedR23OfflineInput } from './fixtures/codex-app-server-m02-ta-r23-investigation-01/fixed-input.mjs'
import { receipts } from './fixtures/codex-app-server-m02-ta-r23-investigation-01/receipts.mjs'
import { createOfflineEffects } from './fixtures/codex-app-server-m02-ta-r23-investigation-01/effects.mjs'
import { serializedCanonicalRead } from './fixtures/codex-app-server-m02-ta-r23-investigation-01/serialization.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const wire = object => Buffer.from(`${JSON.stringify(object, null, 2)}\n`)
const prepared = await readConsumedR23OfflineInput()
const observer = { identity() {}, listDirectChildren() {}, directChildMetadata() {} }
const serializationRoot = fs.mkdtempSync('/private/tmp/m02-r23-serialization-01-')
after(() => fs.rmSync(serializationRoot, { recursive: true, force: true }))
const staged = await stageMatrixModules({
  prepared,
  phaseRoot: serializationRoot,
  stageRoot: path.join(serializationRoot, 'supervisor'),
  offlineCanonicalBytes: prepared.canonicalBytes,
})
const results = new Map()
for (const { role } of prepared.seal.profiles.roles)
  results.set(role, await serializedCanonicalRead(prepared.seal, staged.bundlePath, role))

async function composed(options = {}, check = () => {}) {
  const directory = fs.mkdtempSync('/private/tmp/m02-r23-investigation-01-')
  const target = path.join(directory, 'phase')
  const canonicalFile = path.join(directory, 'canonical.mjs')
  fs.writeFileSync(canonicalFile, prepared.canonicalBytes, { mode: 0o600, flag: 'wx' })
  const effects = createOfflineEffects({
    prepared,
    target,
    policy: POLICY,
    canonicalFile,
    resultForCall: async ({ caseId, index }) => {
      const role = POLICY.cases.find(item => item.id === caseId).role
      const serialized = results.get(role)
      return serialized[Math.min(index, serialized.length - 1)]
    },
    ...options,
  })
  const previousCwd = process.cwd(),
    previousMask = process.umask()
  try {
    const approved = await receipts(prepared, directory)
    const result = await dispatchMatrixEntrypoint(approved.args, {
      ...approved.ports,
      loadAddon: async () => observer,
      verifyPrior: () => verifyR22Predecessor({ requireNewRootAbsent: false }),
      verify: async () => prepared, // Test seam only; consumed p9 is never qualified for reuse.
      run: options =>
        runPreparedT2Matrix({
          ...options,
          io: effects.io,
          fileSystem: effects.syncFs,
          verifyPreparation: async () => prepared,
          createJournal: ({ phase }) => DurablePhaseJournal.create({ directory: target, phase }),
          stage: async () => {
            fs.mkdirSync(path.join(target, 'supervisor'), { mode: 0o700 })
            return staged // Real staging already ran once against the exact fixed manifest.
          },
          loadCanonical: async () => effects.canonical,
          createObserver: effects.createObserver,
          chdir: () => process.chdir(path.join(target, 'supervisor')),
          readChildReceipt: effects.childReceipt,
          writeReceipt: (id, name, value) => writeMatrixCaseReceipt(id, name, value, effects.syncFs),
        }),
    })
    await effects.settle()
    check({ result, effects, target })
    assert.deepEqual(externalEffectAttempts, [])
    return result
  } finally {
    process.chdir(previousCwd)
    process.umask(previousMask)
    // Only this test's disposable directory; never a campaign root or historical cleanup.
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

test('frozen canonical bundle and real SDK serialize every role read through in-memory transport', () => {
  assert.equal(results.size, 6)
  for (const serialized of results.values())
    for (const result of serialized) {
      assert.equal(result.content[0].type, 'text')
      const value = JSON.parse(result.content[0].text)
      assert.ok(value)
      assert.equal(JSON.stringify(result).includes('synthetic-offline-assignment-secret'), false)
    }
})

test('fixed generated R23 manifest and serialized mock receipts compose all 24 cases with real canonical text serialization', async () => {
  await composed({}, ({ result, effects, target }) => {
    assert.equal(
      result.status,
      'T2_CASES_COMPLETED',
      JSON.stringify({ result, failures: effects.failures.map(x => x.message) }),
    )
    assert.equal(result.completed, 24)
    assert.equal(result.runtimeQualified, false)
    assert.equal(result.journal.fenced, false)
    assert.equal(effects.counts.fakeListeners, 24)
    assert.equal(effects.counts.fakeSpawns, 24)
    assert.equal(effects.counts.fakeStops, 24)
    assert.equal(effects.counts.providerRequests, 54)
    assert.deepEqual(effects.failures, [])
    for (const id of prepared.manifest.cases) {
      const receipt = JSON.parse(fs.readFileSync(path.join(target, 'cases', id, 'supervisor/case-outcome.json')))
      assert.equal(receipt.pending, 0)
      assert.equal(receipt.listenerClosed, true)
      assert.equal(receipt.manifestDigest, prepared.manifestDigest)
    }
  })
})

test('measured negative-overhead header crosses composed B01 before a deliberate B02 refusal', async () => {
  await composed(
    {
      transformOutput: (output, { caseId }) => {
        output.output[0].text =
          caseId === 'B01'
            ? 'Script completed\nWall time 0.100 seconds (code-mode 0.101 seconds; overhead -0.001 seconds)\nOutput:\n'
            : 'Script failed\nWall time 0.1 seconds\nOutput:\n'
        return output
      },
    },
    ({ result }) => {
      assert.equal(result.status, 'UNKNOWN')
      assert.equal(result.completed, 1)
      assert.equal(result.failedCase, 'B02')
    },
  )
})

const refusals = {
  failed: output => {
    output.output[0].text = 'Script failed\nWall time 0.1 seconds\nOutput:\n'
    return output
  },
  yielded: output => {
    output.output[0].text = 'Script running with cell ID synthetic\nWall time 0.1 seconds\nOutput:\n'
    return output
  },
  terminated: output => {
    output.output[0].text = 'Script terminated\nWall time 0.1 seconds\nOutput:\n'
    return output
  },
  stringOutput: output => {
    output.output = JSON.stringify(output.output)
    return output
  },
  extraText: output => {
    output.output.push({ type: 'input_text', text: 'synthetic' })
    return output
  },
  nestedResult: output => {
    const value = JSON.parse(output.output[1].text)
    value.result = {}
    output.output[1].text = JSON.stringify(value)
    return output
  },
  envelopeCorrelation: output => {
    const value = JSON.parse(output.output[1].text)
    value.callId = 'foreign'
    output.output[1].text = JSON.stringify(value)
    return output
  },
}
for (const [name, transformOutput] of Object.entries(refusals))
  test(`composed refusal ${name} retains UNKNOWN and pending provider reservation`, async () => {
    await composed({ transformOutput }, ({ result, effects, target }) => {
      assert.equal(result.status, 'UNKNOWN')
      assert.equal(result.completed, 0)
      assert.equal(result.failedCase, 'B01')
      assert.equal(result.journal.fenced, true)
      assert.ok(result.journal.pending.some(row => row.id === 'B01-listener-request-2'))
      const failure = JSON.parse(fs.readFileSync(path.join(target, 'cases/B01/supervisor/provider-failure.json')))
      assert.equal(failure.stage, 'CONTINUATION_DECODER')
      assert.equal(failure.failureClass, 'TRUSTED_GATE_REFUSAL')
      assert.equal(fs.existsSync(path.join(target, 'cases/B01/supervisor/case-outcome.json')), false)
      assert.equal(effects.counts.fakeSpawns, 1)
      assert.equal(effects.counts.fakeStops, 1)
    })
  })

test('missing scoped audit reproduces the same sanitized stage without establishing R23 attribution', async () => {
  await composed({ omitAudit: true }, ({ result, target }) => {
    assert.equal(result.status, 'UNKNOWN')
    assert.equal(result.completed, 0)
    const failure = JSON.parse(fs.readFileSync(path.join(target, 'cases/B01/supervisor/provider-failure.json')))
    assert.equal(failure.stage, 'CONTINUATION_DECODER')
    assert.equal(result.journal.counts.auditRequests, 0)
    assert.ok(result.journal.pending.some(row => row.id === 'B01-listener-request-2'))
  })
})

test('serialized R23 receipt gates reject drift, spent budgets, missing fields and synthetic run authority before effects', async () => {
  const directory = fs.mkdtempSync('/private/tmp/m02-r23-investigation-receipt-gates-')
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

test('unchanged native predecessor gate still refuses consumed p9 before effects', async () => {
  await assert.rejects(verifyR22Predecessor(), /forbidden historical or fresh root reappeared/)
  assert.deepEqual(externalEffectAttempts, [])
})

test('composed missing response-finish ACK preserves the outer reservation and fences', async () => {
  await composed({ loseResponseFinish: true }, ({ result, target }) => {
    assert.equal(result.status, 'UNKNOWN')
    assert.equal(result.completed, 0)
    assert.ok(result.journal.pending.some(row => row.kind === 'outerCalls'))
    assert.equal(fs.existsSync(path.join(target, 'cases/B01/supervisor/case-outcome.json')), false)
  })
})

test('composed failed cleanup witness cannot complete a case', async () => {
  await composed({ failCleanup: true }, ({ result, target, effects }) => {
    assert.equal(result.status, 'UNKNOWN')
    assert.equal(result.completed, 0)
    assert.equal(result.journal.fenced, true)
    assert.equal(fs.existsSync(path.join(target, 'cases/B01/supervisor/case-outcome.json')), false)
    assert.ok(effects.counts.fakeStops >= 1)
  })
})
