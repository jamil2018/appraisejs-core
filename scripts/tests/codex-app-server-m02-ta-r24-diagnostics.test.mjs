import { externalEffectAttempts } from './fixtures/codex-app-server-m02-ta-matrix-r23-composed/no-external-effects.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { prepareCodeModeCall, digest } from './fixtures/codex-app-server-m02-ta-codec-r10/codec.mjs'
import {
  decodeWithDiagnostic,
  DIAGNOSTIC_CATEGORIES,
  classifyOutputObservation,
  OUTPUT_STATUSES,
  SCRIPT_FAILURE_MARKERS,
} from './fixtures/codex-app-server-m02-ta-matrix-r24/continuation-diagnostic.mjs'
import {
  FiniteBufferedResponses,
  scriptDigest,
} from './fixtures/codex-app-server-m02-ta-matrix-r24/finite-responses.mjs'
import { createProviderFailureRecorder } from './fixtures/codex-app-server-m02-ta-matrix-r24/provider-failure.mjs'
import { createOfflineScriptFixture } from './fixtures/codex-app-server-m02-ta-r24-diagnostics-offline/script-fixture.mjs'
import { POLICY, casePolicy } from './fixtures/codex-app-server-m02-ta-runtime-r9/policy.mjs'

const SECRET = 'sensitive-provider-output-or-error'
function codecFixture() {
  const planned = prepareCodeModeCall({ caseId: 'B01', index: 0, operation: 'quality_journey_analysis_get', args: {} })
  const result = { content: [{ type: 'text', text: SECRET }] }
  return {
    planned,
    input: [
      {
        type: 'custom_tool_call_output',
        call_id: planned.callId,
        output: [
          { type: 'input_text', text: 'Script completed\nWall time 0.1 seconds\nOutput:\n' },
          {
            type: 'input_text',
            text: JSON.stringify({
              schema: 'appraise.m02-code-mode-envelope/v1',
              caseId: 'B01',
              index: 0,
              callId: planned.callId,
              operation: planned.operation,
              disposition: 'MCP_RESULT',
              result,
            }),
          },
        ],
      },
    ],
    audit: [
      {
        callId: planned.callId,
        normalizedName: planned.normalizedName,
        id: 'offline-rpc',
        operation: planned.operation,
        argumentsHash: digest({}),
        complete: true,
        result,
      },
    ],
  }
}

for (const [category, mutate] of [
  ['PLAN', value => (value.planned = { ...value.planned })],
  ['OUTER_CORRELATION', value => (value.input[0].call_id = 'foreign')],
  ['OUTPUT_SHAPE', value => (value.input[0].output = SECRET)],
  ['COMPLETION_HEADER', value => (value.input[0].output[0].text = SECRET)],
  ['ENVELOPE', value => (value.input[0].output[1].text = SECRET)],
  ['AUDIT', value => (value.audit = [])],
  ['NESTED_RESULT', value => (value.audit[0].result = {})],
  ['OTHER', value => (value.input[0].output[1].text = null)],
])
  test(`R24 real codec reports only fixed ${category} before preserving its refusal`, () => {
    const value = codecFixture()
    mutate(value)
    const observed = []
    let original
    assert.throws(
      () => decodeWithDiagnostic(value, detail => observed.push(detail)),
      error => {
        original = error
        return true
      },
    )
    assert.deepEqual(observed, [{ component: 'R10_CODEC', category }])
    assert.equal(Object.isFrozen(observed[0]), true)
    assert.equal(JSON.stringify(observed).includes(SECRET), false)
    assert.throws(
      () =>
        decodeWithDiagnostic(value, () => {
          throw new Error(SECRET)
        }),
      error => error.message === original.message,
    )
  })

test('R24 preserves measured completion header and top-level metadata projection', () => {
  const value = codecFixture()
  value.input[0].output[0].text =
    'Script completed\nWall time 0.100 seconds (code-mode 0.101 seconds; overhead -0.001 seconds)\nOutput:\n'
  value.audit[0].result._meta = { private: SECRET }
  assert.equal(decodeWithDiagnostic(value, () => assert.fail('unexpected diagnostic')).status, 'RESULT_CORRELATED')
})

function producerFixture(onDiagnostic, decodeResult = () => true) {
  const plan = {
    caseId: 'B01',
    calls: casePolicy('B01').script.operations.map((_, index) => ({ callId: `offline-${index}`, input: 'text(1)' })),
    terminalText: 'SYNTHETIC_COMPLETE',
  }
  return new FiniteBufferedResponses({
    caseId: 'B01',
    plan,
    planSha256: scriptDigest(plan),
    validateDescriptor: () => true,
    decodeResult,
    onDiagnostic,
  })
}
for (const [category, reason, request] of [
  ['CONTINUATION_SHAPE', 'CONTINUATION_SHAPE', { input: [] }],
  [
    'CALL_CORRELATION',
    'CALL_ID_MISMATCH',
    { input: [{ type: 'custom_tool_call_output', call_id: 'foreign', output: [] }] },
  ],
  [
    'OUTPUT_CEILING',
    'OUTPUT_CEILING',
    { input: [{ type: 'custom_tool_call_output', call_id: 'offline-0', output: SECRET.repeat(3000) }] },
  ],
])
  test(`R24 finite producer preserves ${reason} and no-resend fence with a failing observer`, () => {
    for (const throws of [false, true]) {
      const observed = []
      const producer = producerFixture(detail => {
        observed.push(detail)
        if (throws) throw new Error(SECRET)
      })
      assert.equal(producer.next({ descriptor: {}, request: { input: [] } }).status, 'READY')
      assert.deepEqual(producer.next({ descriptor: {}, request }), { status: 'UNKNOWN', reason })
      assert.deepEqual(observed, [{ component: 'PRODUCER', category }])
      assert.equal(producer.snapshot().fenced, true)
      assert.throws(() => producer.next({ descriptor: {}, request }), /no resend/)
    }
  })

function durableFixture(caseId = 'B01', overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'appraise-r24-diagnostics-'))
  fs.chmodSync(root, 0o700)
  const supervisor = path.join(root, 'cases', caseId, 'supervisor')
  for (const directory of [path.join(root, 'cases'), path.join(root, 'cases', caseId), supervisor])
    fs.mkdirSync(directory, { mode: 0o700 })
  const state = {
    activeCase: caseId,
    current: caseId,
    fenced: false,
    counts: { providerRequests: 0 },
    ids: [],
    pending: [],
  }
  const journal = { snapshot: () => structuredClone(state) }
  const recorder = createProviderFailureRecorder({ caseId, journal, root, ...overrides })
  const reserve = index => {
    state.counts.providerRequests = index
    const id = `${caseId}-listener-request-${index}`
    state.ids.push(id)
    state.pending.push({ id, kind: 'providerRequests', caseId })
  }
  const file = path.join(supervisor, 'provider-failure.json')
  return {
    root,
    supervisor,
    state,
    recorder,
    reserve,
    file,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  }
}

test('real session codec and audit refusals persist first diagnostic before PRODUCER_ERROR without ACK or resend', async () => {
  for (const [component, category, mutate] of [
    ['R10_CODEC', 'COMPLETION_HEADER', f => (f.transcript.at(-1).output[0].text = SECRET)],
    [
      'R10_CODEC',
      'NESTED_RESULT',
      f =>
        (f.transcript.at(-1).output[1].text = f.transcript
          .at(-1)
          .output[1].text.replace('"offline":true', '"offline":false')),
    ],
    ['AUDIT', 'INCOMPLETE', f => (f.auditSession.snapshot = () => ({ pending: 1, scopedDispatchCount: 0, calls: [] }))],
    [
      'AUDIT',
      'PLAN_CORRELATION',
      f => {
        const snapshot = f.auditSession.snapshot
        f.auditSession.snapshot = () => {
          const value = snapshot()
          value.calls[0].callId = 'foreign'
          return value
        }
      },
    ],
  ]) {
    const d = durableFixture()
    try {
      const observed = []
      let context
      const f = await createOfflineScriptFixture('B01', {
        onDiagnostic: detail => {
          observed.push(detail)
          d.recorder.markDetail(context, detail)
        },
      })
      f.requestAndAck()
      await f.executeCurrent()
      mutate(f)
      const pre = d.recorder.beginPreReservation()
      d.reserve(1)
      context = d.recorder.bindRequest(pre, 1)
      assert.throws(() => f.request(), /provider continuation UNKNOWN: PRODUCER_ERROR/)
      d.recorder.mark(context, 'CONTINUATION_DECODER')
      d.state.fenced = true
      d.recorder.record(context, 'TRUSTED_GATE_REFUSAL')
      const receipt = JSON.parse(fs.readFileSync(d.file, 'utf8'))
      assert.equal(receipt.schema, 'appraise.m02-ta-matrix-r24-provider-failure/v1')
      assert.equal(receipt.diagnosticComponent, component)
      assert.equal(receipt.diagnosticCategory, category)
      assert.deepEqual(observed[0], { component, category })
      assert.deepEqual(observed.at(-1), { component: 'PRODUCER', category: 'OTHER' })
      assert.equal(fs.readFileSync(d.file, 'utf8').includes(SECRET), false)
      assert.equal(f.session.snapshot().fenced, true)
      assert.equal(f.reservations.length, 1)
      assert.equal(f.acknowledgements.length, 1)
      assert.equal(f.completions.length, 0)
      assert.equal(d.state.pending.length, 1)
      assert.throws(() => f.request(), /no resend/)
    } finally {
      d.cleanup()
    }
  }
})

test('rejection envelope and registry audit checks receive fixed categories before codec invocation', async () => {
  for (const [component, category, mutate] of [
    ['SESSION', 'REJECTION_ENVELOPE', f => (f.transcript.at(-1).output[1].text = SECRET)],
    ['SESSION', 'REJECTION_ENVELOPE', f => (f.transcript.at(-1).output[1].text = 'null')],
    [
      'AUDIT',
      'REGISTRY_ABSENCE',
      f => (f.auditSession.snapshot = () => ({ pending: 0, scopedDispatchCount: 1, logicalAttempts: 1 })),
    ],
  ]) {
    const observed = []
    const f = await createOfflineScriptFixture('B07-A09', { onDiagnostic: detail => observed.push(detail) })
    f.requestAndAck()
    await f.executeCurrent()
    mutate(f)
    assert.throws(() => f.request(), /provider continuation UNKNOWN/)
    assert.deepEqual(observed[0], { component, category })
    assert.deepEqual(observed.at(-1), { component: 'PRODUCER', category: 'OTHER' })
    assert.equal(f.reservations.length, 1)
  }
})

test('all 22 real R24 scripted sessions preserve cumulative completion and diagnostic callback isolation', async () => {
  for (const item of POLICY.cases.filter(item => item.phase === 'T2' && !['P00', 'B14'].includes(item.id))) {
    const f = await createOfflineScriptFixture(item.id, {
      onDiagnostic: () => {
        throw new Error(SECRET)
      },
      onOutputObservation: () => {
        throw new Error(SECRET)
      },
    })
    const pending = f.request()
    assert.throws(() => f.request(), /no resend/)
    pending.afterWrite()
    assert.throws(() => pending.afterWrite(), /duplicate scripted response ACK/)
    for (const plan of f.session.plans) {
      await f.executeCurrent()
      assert.equal(f.requestAndAck().receipt.decodedStatus, plan.rejection ? 'NO_MCP_DISPATCH' : 'RESULT_CORRELATED')
    }
    assert.equal(f.session.snapshot().completed, true)
    assert.equal(f.session.snapshot().fenced, false)
    assert.equal(f.session.snapshot().outerPending, null)
    assert.equal(f.reservations.length, f.session.plans.length)
  }
  // Exercise callback failures on an actual failing producer/codec path too.
  const f = await createOfflineScriptFixture('B01', {
    onDiagnostic: () => {
      throw new Error(SECRET)
    },
    onOutputObservation: () => {
      throw new Error(SECRET)
    },
  })
  f.requestAndAck()
  await f.executeCurrent()
  f.transcript.at(-1).output[0].text = SECRET
  assert.throws(() => f.request(), /PRODUCER_ERROR/)
  assert.equal(f.session.snapshot().fenced, true)
})

test('durable recorder rejects spoofed, foreign, stale and accessor details; defaults carry no raw data', () => {
  const d = durableFixture()
  try {
    const pre = d.recorder.beginPreReservation()
    let reads = 0
    for (const detail of [
      { component: SECRET, category: 'OTHER' },
      { component: 'R10_CODEC', category: SECRET },
      { component: 'R10_CODEC', category: 'PLAN', error: SECRET },
      { component: 'AUDIT', category: 'OUTPUT_SHAPE' },
      Object.defineProperty({ category: 'PLAN' }, 'component', {
        enumerable: true,
        get() {
          reads++
          return SECRET
        },
      }),
    ])
      assert.throws(() => d.recorder.markDetail(pre, detail), /diagnostic contract/)
    assert.equal(reads, 0)
    assert.throws(() => d.recorder.markDetail({}, { component: 'R10_CODEC', category: 'PLAN' }), /foreign context/)
    d.reserve(1)
    const context = d.recorder.bindRequest(pre, 1)
    assert.throws(() => d.recorder.markDetail(pre, { component: 'R10_CODEC', category: 'PLAN' }), /diagnostic contract/)
    d.recorder.record(context, 'OTHER')
    const receipt = JSON.parse(fs.readFileSync(d.file))
    assert.equal(receipt.diagnosticComponent, 'NONE')
    assert.equal(receipt.diagnosticCategory, 'UNCLASSIFIED')
    assert.equal(receipt.outputStatus, 'OTHER')
    assert.equal(receipt.scriptFailureMarker, 'OTHER')
    assert.equal(fs.readFileSync(d.file, 'utf8').includes(SECRET), false)
    assert.equal(fs.statSync(d.file).mode & 0o777, 0o600)
    assert.throws(
      () => d.recorder.markDetail(context, { component: 'R10_CODEC', category: 'PLAN' }),
      /diagnostic contract/,
    )
  } finally {
    d.cleanup()
  }
  const stale = durableFixture()
  try {
    const pre = stale.recorder.beginPreReservation()
    stale.reserve(1)
    const context = stale.recorder.bindRequest(pre, 1)
    stale.reserve(2)
    assert.throws(
      () => stale.recorder.markDetail(context, { component: 'R10_CODEC', category: 'PLAN' }),
      /latest request changed/,
    )
    assert.throws(() => stale.recorder.record(context, 'OTHER'), /latest request changed/)
    assert.equal(fs.existsSync(stale.file), false)
  } finally {
    stale.cleanup()
  }
})

test('every allowlisted diagnostic pair serializes fixed constants with first detail winning', () => {
  for (const [component, categories] of Object.entries(DIAGNOSTIC_CATEGORIES))
    for (const category of categories) {
      const d = durableFixture()
      try {
        const pre = d.recorder.beginPreReservation()
        d.recorder.markDetail(pre, { component, category })
        d.reserve(1)
        const context = d.recorder.bindRequest(pre, 1)
        d.recorder.markDetail(context, { component: 'PRODUCER', category: 'OTHER' })
        d.recorder.record(context, 'TRUSTED_GATE_REFUSAL')
        const receipt = JSON.parse(fs.readFileSync(d.file))
        assert.equal(receipt.diagnosticComponent, component)
        assert.equal(receipt.diagnosticCategory, category)
        assert.equal(receipt.requestState, 'RESERVED_PENDING')
      } finally {
        d.cleanup()
      }
    }
})

test('durable recorder retains exclusive no-follow writes, ancestor identity, fsync and one-attempt behavior', () => {
  for (const kind of ['existing', 'symlink', 'ancestor', 'fsync']) {
    let fsyncCount = 0
    const io = {
      ...fs,
      fsyncSync(fd) {
        fsyncCount++
        if (kind === 'fsync') throw new Error('offline fsync failure')
        return fs.fsyncSync(fd)
      },
    }
    const d = durableFixture('B01', { io })
    try {
      const pre = d.recorder.beginPreReservation()
      if (kind === 'existing') fs.writeFileSync(d.file, 'prior', { mode: 0o600 })
      if (kind === 'symlink') fs.symlinkSync(path.join(d.root, 'other'), d.file)
      if (kind === 'ancestor') {
        fs.renameSync(d.supervisor, `${d.supervisor}-old`)
        fs.mkdirSync(d.supervisor, { mode: 0o700 })
      }
      assert.throws(() => d.recorder.record(pre, 'OTHER'))
      assert.throws(() => d.recorder.record(pre, 'OTHER'), /record contract/)
      if (kind === 'existing') assert.equal(fs.readFileSync(d.file, 'utf8'), 'prior')
      if (kind === 'symlink') assert.equal(fs.lstatSync(d.file).isSymbolicLink(), true)
      if (kind === 'fsync') assert.equal(fsyncCount, 1)
    } finally {
      d.cleanup()
    }
  }
  let fsyncCount = 0
  const d = durableFixture('B01', {
    io: {
      ...fs,
      fsyncSync(fd) {
        fsyncCount++
        return fs.fsyncSync(fd)
      },
    },
  })
  try {
    d.recorder.record(d.recorder.beginPreReservation(), 'OTHER')
    assert.equal(fsyncCount, 2)
  } finally {
    d.cleanup()
  }
  assert.deepEqual(externalEffectAttempts, [])
})

const observedOutput = (header, payload = '') => [
  { type: 'input_text', text: header },
  { type: 'input_text', text: payload },
]

test('output observation classifies only bounded first header lines and exact controlled marker tokens', () => {
  for (const [status, firstLine] of [
    ['COMPLETED', 'Script completed'],
    ['FAILED', 'Script failed'],
    ['YIELDED', 'Script running with cell ID synthetic-cell-1'],
    ['TERMINATED', 'Script terminated'],
    ['OTHER', 'Script completed extra'],
    ['OTHER', 'Script running with cell ID '],
    ['OTHER', 'untrusted-header'],
  ]) {
    const value = classifyOutputObservation(observedOutput(`${firstLine}\nScript completed\n${SECRET}`, SECRET))
    assert.deepEqual(value, { status, scriptMarker: 'NONE' })
    assert.equal(Object.isFrozen(value), true)
    assert.equal(JSON.stringify(value).includes(SECRET), false)
  }
  for (const marker of ['M02_REGISTRY_BOUND', 'M02_ROUTE_UNAVAILABLE', 'M02_UNEXPECTED_ROUTE']) {
    assert.deepEqual(classifyOutputObservation(observedOutput('Script failed', `Error: ${marker}\n${SECRET}`)), {
      status: 'FAILED',
      scriptMarker: marker,
    })
  }
  for (const [payload, scriptMarker] of [
    ['M02_ROUTE_UNAVAILABLE M02_ROUTE_UNAVAILABLE', 'M02_ROUTE_UNAVAILABLE'],
    ['M02_ROUTE_UNAVAILABLE M02_UNEXPECTED_ROUTE', 'MULTIPLE'],
    ['M02_REGISTRY_BOUND M02_ROUTE_UNAVAILABLE M02_UNEXPECTED_ROUTE', 'MULTIPLE'],
    ['M02_ROUTE_UNAVAILABLE_SUFFIX', 'OTHER'],
    ['M02_UNKNOWN', 'OTHER'],
    ['prefixM02_ROUTE_UNAVAILABLE', 'NONE'],
    [SECRET, 'NONE'],
  ]) {
    assert.deepEqual(classifyOutputObservation(observedOutput('Script failed', payload)), {
      status: 'FAILED',
      scriptMarker,
    })
  }
  // A marker outside the payload and a later header line cannot determine the observation.
  assert.deepEqual(classifyOutputObservation(observedOutput('Script completed\nM02_REGISTRY_BOUND', SECRET)), {
    status: 'COMPLETED',
    scriptMarker: 'NONE',
  })
})

test('malformed, non-text, oversized and accessor outputs map to OTHER without throwing or reading getters', () => {
  let reads = 0
  const accessor = Object.defineProperty({ type: 'input_text' }, 'text', {
    enumerable: true,
    get() {
      reads++
      throw new Error(SECRET)
    },
  })
  const arrayAccessor = Object.defineProperty([null, { type: 'input_text', text: '' }], '0', {
    get() {
      reads++
      throw new Error(SECRET)
    },
  })
  for (const output of [
    SECRET,
    null,
    [],
    [{ type: 'input_text', text: 'Script completed' }],
    [accessor, { type: 'input_text', text: '' }],
    arrayAccessor,
    [
      { type: 'input_image', image_url: SECRET },
      { type: 'input_text', text: '' },
    ],
    [
      { type: 'input_text', text: 'Script completed' },
      { type: 'input_audio', data: SECRET },
    ],
    [
      { type: 'input_text', text: 'Script completed', extra: SECRET },
      { type: 'input_text', text: '' },
    ],
    observedOutput('Script completed', 'x'.repeat(64 * 1024)),
    observedOutput('Script completed', 'é'.repeat(33 * 1024)),
    observedOutput('x'.repeat(64 * 1024 + 1), ''),
    new Proxy([], {
      getOwnPropertyDescriptor() {
        throw new Error(SECRET)
      },
    }),
  ])
    assert.deepEqual(classifyOutputObservation(output), { status: 'OTHER', scriptMarker: 'OTHER' })
  assert.equal(reads, 0)
})

test('session observes correlated failed output before audit refusal and durably keeps both independent fixed bins', async () => {
  const d = durableFixture()
  try {
    const observed = []
    let context
    const f = await createOfflineScriptFixture('B01', {
      onDiagnostic: detail => d.recorder.markDetail(context, detail),
      onOutputObservation: output => {
        observed.push(output)
        d.recorder.markOutput(context, output)
      },
    })
    f.requestAndAck()
    assert.deepEqual(observed, [])
    await f.executeCurrent()
    f.transcript.at(-1).output = observedOutput('Script failed\nOutput:\n', `Error: M02_ROUTE_UNAVAILABLE\n${SECRET}`)
    f.auditSession.snapshot = () => ({ pending: 1, scopedDispatchCount: 0, calls: [] })
    const pre = d.recorder.beginPreReservation()
    d.reserve(1)
    context = d.recorder.bindRequest(pre, 1)
    assert.throws(() => f.request(), /PRODUCER_ERROR/)
    d.recorder.markOutput(context, { status: 'OTHER', scriptMarker: 'OTHER' })
    d.recorder.record(context, 'TRUSTED_GATE_REFUSAL')
    const receipt = JSON.parse(fs.readFileSync(d.file))
    assert.deepEqual(observed, [{ status: 'FAILED', scriptMarker: 'M02_ROUTE_UNAVAILABLE' }])
    assert.equal(receipt.outputStatus, 'FAILED')
    assert.equal(receipt.scriptFailureMarker, 'M02_ROUTE_UNAVAILABLE')
    assert.equal(receipt.diagnosticComponent, 'AUDIT')
    assert.equal(receipt.diagnosticCategory, 'INCOMPLETE')
    assert.equal(fs.readFileSync(d.file, 'utf8').includes(SECRET), false)
    assert.equal(f.completions.length, 0)
    assert.equal(f.reservations.length, 1)
    assert.equal(f.acknowledgements.length, 1)
    assert.equal(d.state.pending.length, 1)
    assert.throws(() => f.request(), /no resend/)
  } finally {
    d.cleanup()
  }
})

test('transcript rejection precedes output observation and observer failure cannot change the original refusal', async () => {
  let observations = 0
  const f = await createOfflineScriptFixture('B01', {
    onOutputObservation: () => {
      observations++
    },
  })
  f.requestAndAck()
  await f.executeCurrent()
  f.transcript.at(-1).call_id = 'foreign'
  assert.throws(() => f.request(), /unscheduled provider tool transcript item/)
  assert.equal(observations, 0)
  const failed = await createOfflineScriptFixture('B01', {
    onOutputObservation: () => {
      observations++
      throw new Error(SECRET)
    },
  })
  failed.requestAndAck()
  await failed.executeCurrent()
  failed.transcript.at(-1).output = observedOutput('Script failed', 'M02_ROUTE_UNAVAILABLE')
  failed.auditSession.snapshot = () => ({ pending: 1, scopedDispatchCount: 0, calls: [] })
  assert.throws(() => failed.request(), /provider continuation UNKNOWN: PRODUCER_ERROR/)
  assert.equal(observations, 1)
  assert.equal(failed.session.snapshot().fenced, true)
})

test('recorder output enums refuse spoofed fields, getters, foreign and stale request contexts', () => {
  const d = durableFixture()
  try {
    const pre = d.recorder.beginPreReservation()
    let reads = 0
    for (const output of [
      null,
      { status: SECRET, scriptMarker: 'NONE' },
      { status: 'FAILED', scriptMarker: SECRET },
      { status: 'FAILED', scriptMarker: 'NONE', text: SECRET },
      Object.defineProperty({ scriptMarker: 'NONE' }, 'status', {
        enumerable: true,
        get() {
          reads++
          return 'FAILED'
        },
      }),
      Object.defineProperty({ status: 'FAILED' }, 'scriptMarker', {
        enumerable: true,
        get() {
          reads++
          return SECRET
        },
      }),
    ])
      assert.throws(() => d.recorder.markOutput(pre, output), /output observation contract/)
    assert.equal(reads, 0)
    assert.throws(() => d.recorder.markOutput({}, { status: 'FAILED', scriptMarker: 'NONE' }), /foreign context/)
    d.reserve(1)
    const context = d.recorder.bindRequest(pre, 1)
    assert.throws(
      () => d.recorder.markOutput(pre, { status: 'FAILED', scriptMarker: 'NONE' }),
      /output observation contract/,
    )
    d.reserve(2)
    assert.throws(
      () => d.recorder.markOutput(context, { status: 'FAILED', scriptMarker: 'NONE' }),
      /latest request changed/,
    )
    assert.equal(fs.existsSync(d.file), false)
  } finally {
    d.cleanup()
  }
})

test('all fixed output enums serialize without accepting later overwrite or granting request authority', () => {
  for (const status of OUTPUT_STATUSES)
    for (const scriptMarker of SCRIPT_FAILURE_MARKERS) {
      const d = durableFixture()
      try {
        const pre = d.recorder.beginPreReservation()
        d.recorder.markOutput(pre, { status, scriptMarker })
        d.reserve(1)
        const context = d.recorder.bindRequest(pre, 1)
        d.recorder.markOutput(context, { status: 'OTHER', scriptMarker: 'OTHER' })
        d.recorder.record(context, 'OTHER')
        const receipt = JSON.parse(fs.readFileSync(d.file))
        assert.equal(receipt.outputStatus, status)
        assert.equal(receipt.scriptFailureMarker, scriptMarker)
        assert.equal(receipt.requestIndex, 1)
        assert.equal(receipt.requestState, 'RESERVED_PENDING')
        assert.throws(() => d.recorder.markOutput(context, { status, scriptMarker }), /output observation contract/)
      } finally {
        d.cleanup()
      }
    }
  assert.deepEqual(externalEffectAttempts, [])
})
