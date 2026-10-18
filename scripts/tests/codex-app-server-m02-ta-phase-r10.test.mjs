import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  DurablePhaseJournal,
  conservativeHostBudget,
} from './fixtures/codex-app-server-m02-ta-phase-r10/phase-journal.mjs'
import { FiniteBufferedResponses, scriptDigest } from './fixtures/codex-app-server-m02-ta-phase-r10/responses-sse.mjs'
import { ScopedTransportAudit } from './fixtures/codex-app-server-m02-ta-phase-r10/scoped-transport-audit.mjs'
import { PHASE_OUTER_POLICY } from './fixtures/codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { POLICY, canonical } from './fixtures/codex-app-server-m02-ta-runtime-r9/policy.mjs'

const sha = value => createHash('sha256').update(value).digest('hex')
const finishSyntheticT3 = journal => {
  for (const id of ['N01', 'N02']) {
    journal.begin(id)
    journal.reserve('turnStarts', `${id}-synthetic-turn`)
    journal.acknowledge(`${id}-synthetic-turn`)
    journal.finish({ outcome: 'workspace-effect', cleanupKnown: true, caseWitnessSha256: 'a'.repeat(64) })
  }
}
const withDirectory = fn => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'm02-phase-r10-test-'))
  fs.chmodSync(directory, 0o700)
  try {
    return fn(directory)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}
test('successful phase closure verifies the durable terminal checkpoint without adopting a replay', () =>
  withDirectory(directory => {
    const journal = DurablePhaseJournal.create({ directory, phase: 'T3' })
    finishSyntheticT3(journal)
    const closure = journal.closeAndVerifyTerminal()
    assert.equal(closure.status, 'CLOSED_TERMINAL_CHECKPOINT_VERIFIED')
    assert.equal(closure.snapshot.completed.length, 2)
    assert.equal(closure.snapshot.fenced, false)
    assert.match(closure.fileSha256, /^[a-f0-9]{64}$/)
    fs.appendFileSync(path.join(directory, 'phase-journal.jsonl'), '{}\n')
    assert.throws(() => journal.closeAndVerifyTerminal(), /identity changed/)
    assert.equal(journal.snapshot().fenced, true)
  }))

test('terminal checkpoint fsync failure fences UNKNOWN instead of returning phase success', () =>
  withDirectory(directory => {
    const journal = DurablePhaseJournal.create({ directory, phase: 'T3' })
    finishSyntheticT3(journal)
    journal._fsyncSync = () => {
      throw new Error('CHECKPOINT_FSYNC_LOST')
    }
    assert.throws(() => journal.closeAndVerifyTerminal(), /incomplete or uncertain/)
    assert.equal(journal.snapshot().fenced, true)
    assert.equal(journal.snapshot().reason, 'UNCERTAIN_CLOSE')
    assert.equal(journal.closed, true)
  }))

test('a private checkpoint on an incomplete phase is never terminal success', () =>
  withDirectory(directory => {
    const journal = DurablePhaseJournal.create({ directory, phase: 'T3' })
    assert.throws(() => journal.closeAndVerifyTerminal(), /incomplete or uncertain/)
    assert.equal(journal.snapshot().fenced, true)
  }))
const planFor = (caseId, count = 3) => ({
  caseId,
  calls: Array.from({ length: count }, (_, index) => ({
    callId: `${caseId}-call-${index + 1}`,
    input: `const synthetic${index}=1`,
  })),
  terminalText: 'SYNTHETIC_COMPLETE',
})
const producer = (caseId = 'B03', count = 3, overrides = {}) => {
  const plan = planFor(caseId, count)
  return new FiniteBufferedResponses({
    caseId,
    plan,
    planSha256: scriptDigest(plan),
    validateDescriptor: () => true,
    decodeResult: () => true,
    ...overrides,
  })
}
const events = body =>
  body
    .trim()
    .split('\n\n')
    .map(part => JSON.parse(part.split('\ndata: ')[1]))
const journalStub = () => ({
  reserved: [],
  acknowledged: [],
  unknown: [],
  reserve(kind, id) {
    this.reserved.push({ kind, id })
  },
  acknowledge(id) {
    this.acknowledged.push(id)
  },
  markUnknown(reason) {
    this.unknown.push(reason)
  },
})
const fakeTransport = () => ({ start: async () => {}, send: async () => {}, close: async () => {}, onmessage: null })

test('phase policy order, P00 zero effects and conservative source host budgets', () => {
  assert.equal(POLICY.cases.filter(item => item.phase === 'T2').length, 24)
  assert.deepEqual(
    POLICY.cases.filter(item => item.phase === 'T3').map(item => item.id),
    ['N01', 'N02'],
  )
  assert.equal(conservativeHostBudget('B01').sourceMaximum, 4)
  assert.equal(conservativeHostBudget('P00').sourceMaximum, 0)
  assert.equal(conservativeHostBudget('P00').codexStartMaximum, 1)
  assert.equal(conservativeHostBudget('P00').outerExecMaximum, 0)
  assert.equal(conservativeHostBudget('B14').outerExecMaximum, 1)
  const phaseCases = POLICY.cases.filter(item => item.phase === 'T2' || item.phase === 'T3')
  assert.equal(
    phaseCases.reduce((sum, item) => sum + conservativeHostBudget(item.id).sourceMaximum, 0),
    62,
  )
  assert.equal(
    phaseCases.reduce((sum, item) => sum + conservativeHostBudget(item.id).outerExecMaximum, 0),
    37,
  )
  assert.equal(conservativeHostBudget('N01').sourceMaximum, 2)
  assert.equal(conservativeHostBudget('B01').actualHostCountAttested, false)
  assert.equal(PHASE_OUTER_POLICY.auditRequestsAggregateMaximum, 68)
  for (const key of ['prewarm', 'wait', 'terminate', 'retry']) assert.equal(conservativeHostBudget('B01')[key], false)
})

test('durable T2 journal enforces ordered begin, policy ceiling, fsynced reservation and acknowledgement', () =>
  withDirectory(directory => {
    const journal = DurablePhaseJournal.create({ directory, phase: 'T2' })
    try {
      assert.throws(() => journal.begin('B02'), /order/)
      journal.begin('B01')
      assert.equal(journal.snapshot().sourceHostCapacity.B01, 4)
      assert.match(
        fs.readFileSync(path.join(directory, 'phase-journal.jsonl'), 'utf8'),
        /SOURCE_BOUND_CAPACITY_RESERVED/,
      )
      journal.reserve('turnStarts', 'turn-1')
      journal.reserve('providerRequests', 'provider-1')
      assert.equal(journal.snapshot().pending.length, 2)
      assert.ok(fs.readFileSync(path.join(directory, 'phase-journal.jsonl'), 'utf8').includes('provider-1'))
      journal.acknowledge('turn-1')
      journal.acknowledge('provider-1')
      assert.throws(() => journal.reserve('turnStarts', 'turn-2'), /ceiling/)
      journal.finish({ outcome: 'accepted', cleanupKnown: true })
      assert.equal(journal.snapshot().completed[0].caseId, 'B01')
      journal.begin('B02')
      assert.equal(journal.snapshot().sourceHostCapacity.B02, 4)
    } finally {
      journal.close()
    }
    const reopened = DurablePhaseJournal.open({ directory, phase: 'T2' })
    try {
      assert.equal(reopened.snapshot().fenced, true)
      assert.equal(reopened.snapshot().reason, 'RECOVERY')
      assert.throws(() => reopened.begin('B03'), /fenced/)
    } finally {
      reopened.close()
    }
  }))

test('separate scoped audit request ceiling is twice actual scoped dispatch ceiling', () =>
  withDirectory(directory => {
    const journal = DurablePhaseJournal.create({ directory, phase: 'T2' })
    try {
      journal.begin('B01')
      for (let index = 0; index < 6; index++) {
        const id = `audit-${index}`
        journal.reserve('auditRequests', id)
        journal.acknowledge(id)
      }
      assert.throws(() => journal.reserve('auditRequests', 'audit-excess'), /ceiling/)
      assert.equal(journal.snapshot().counts.B01.auditRequests, 6)
      assert.equal(journal.snapshot().counts.B01.providerRequests, 0)
      assert.equal(journal.snapshot().counts.B01.canonicalRequests, 0)
    } finally {
      journal.close()
    }
  }))

test('lost ACK, partial journal, revocation and receipt identity drift all fail closed', () =>
  withDirectory(directory => {
    const journal = DurablePhaseJournal.create({ directory, phase: 'T2' })
    journal.begin('B01')
    journal.reserve('providerRequests', 'provider-lost')
    journal.close()
    const reopened = DurablePhaseJournal.open({ directory, phase: 'T2' })
    assert.equal(reopened.snapshot().reason, 'ACK_LOST')
    assert.throws(() => reopened.reserve('providerRequests', 'provider-resend'), /fenced/)
    reopened.close()
  }))

test('explicit deadline, error, yield and revocation fences never permit resend', () => {
  for (const reason of ['DEADLINE', 'ERROR', 'YIELD', 'REVOKED'])
    withDirectory(directory => {
      const journal = DurablePhaseJournal.create({ directory, phase: 'T3' })
      try {
        journal.begin('N01')
        journal.markUnknown(reason)
        assert.equal(journal.snapshot().reason, reason)
        assert.throws(() => journal.reserve('workspaceActions', 'retry'), /fenced/)
      } finally {
        journal.close()
      }
    })
})

test('elapsed case and phase deadlines create durable UNKNOWN before another reservation', () => {
  for (const phase of ['T2', 'T3'])
    withDirectory(directory => {
      const journal = DurablePhaseJournal.create({ directory, phase })
      try {
        const first = phase === 'T2' ? 'B01' : 'N01'
        journal.begin(first)
        const limit = phase === 'T2' ? POLICY.deadlineMs.case : POLICY.deadlineMs.T3
        journal._now = () => Date.parse(journal.snapshot().startedAt) + limit + 1_000
        assert.throws(() => journal.reserve('providerRequests', 'too-late'), /deadline exceeded/)
        assert.equal(journal.snapshot().reason, 'DEADLINE')
        assert.equal(journal.snapshot().pending.length, 0)
      } finally {
        journal.close()
      }
      const reopened = DurablePhaseJournal.open({ directory, phase })
      assert.equal(reopened.snapshot().fenced, true)
      reopened.close()
    })
})

test('journal rejects symlink replacement and partial bytes without adoption', () =>
  withDirectory(directory => {
    const journal = DurablePhaseJournal.create({ directory, phase: 'T2' })
    journal.close()
    const file = path.join(directory, 'phase-journal.jsonl')
    fs.appendFileSync(file, '{')
    const reopened = DurablePhaseJournal.open({ directory, phase: 'T2' })
    assert.equal(reopened.snapshot().reason, 'CORRUPT')
    reopened.close()
    fs.rmSync(file)
    fs.symlinkSync('/dev/null', file)
    assert.throws(() => DurablePhaseJournal.open({ directory, phase: 'T2' }), /identity/)
  }))

test('finite SSE emits one exact custom exec item per step then fixed terminal message', () => {
  const p = producer()
  for (let i = 0; i < 4; i++) {
    const request =
      i === 0
        ? { input: [] }
        : { input: [{ type: 'custom_tool_call_output', call_id: `B03-call-${i}`, output: `synthetic-result-${i}` }] }
    const answer = p.next({ descriptor: {}, request })
    assert.equal(answer.status, 'READY')
    const frames = events(answer.body)
    assert.deepEqual(
      frames.map(frame => frame.type),
      ['response.created', 'response.output_item.done', 'response.completed'],
    )
    assert.equal(frames[2].response.output.length, 1)
    assert.deepEqual(frames[2].response.output[0], frames[1].item)
    if (i < 3) {
      assert.equal(frames[1].item.type, 'custom_tool_call')
      assert.equal(frames[1].item.name, 'exec')
      assert.equal(frames[1].item.namespace, 'functions')
      assert.equal(typeof frames[1].item.input, 'string')
    } else {
      assert.equal(frames[1].item.type, 'message')
      assert.equal(frames[1].item.content[0].text, 'SYNTHETIC_COMPLETE')
    }
  }
  assert.equal(p.snapshot().completed, true)
  assert.throws(() => p.next({ descriptor: {}, request: { input: [] } }), /no resend/)
})

test('SSE validates descriptor before first byte, script pin and per-case budgets', () => {
  const plan = planFor('B03')
  assert.throws(
    () =>
      new FiniteBufferedResponses({
        caseId: 'B03',
        plan,
        planSha256: sha('wrong'),
        validateDescriptor: () => true,
        decodeResult: () => true,
      }),
    /pin mismatch/,
  )
  assert.throws(() => producer('P00', 0), /zero provider/)
  assert.throws(() => producer('B14', 0), /not qualified/)
  const p = producer('B03', 3, { validateDescriptor: () => false })
  const result = p.next({ descriptor: {}, request: { input: [] } })
  assert.equal(result.status, 'UNKNOWN')
  assert.equal(p.snapshot().emitted, 0)
  const initial = producer()
  assert.equal(
    initial.next({ descriptor: {}, request: { input: [{ role: 'user', content: 'synthetic' }] } }).status,
    'READY',
  )
  const injected = producer()
  assert.equal(
    injected.next({
      descriptor: {},
      request: { input: [{ type: 'custom_tool_call_output', call_id: 'foreign', output: 'x' }] },
    }).status,
    'UNKNOWN',
  )
})

test('SSE fences wrong, duplicate, missing, extra and undecodable continuation', () => {
  const shapes = [
    { input: [] },
    { input: [{ type: 'custom_tool_call_output', call_id: 'foreign', output: 'x' }] },
    {
      input: [
        { type: 'custom_tool_call_output', call_id: 'B03-call-1', output: 'x' },
        { type: 'custom_tool_call_output', call_id: 'B03-call-1', output: 'x' },
      ],
    },
    { input: [{ type: 'custom_tool_call_output', call_id: 'B03-call-1', output: 'x', extra: true }] },
    { input: [{ type: 'function_call_output', call_id: 'B03-call-1', output: 'x' }] },
  ]
  for (const request of shapes) {
    const p = producer()
    p.next({ descriptor: {}, request: { input: [] } })
    assert.equal(p.next({ descriptor: {}, request }).status, 'UNKNOWN')
    assert.throws(() => p.next({ descriptor: {}, request }), /no resend/)
  }
  const p = producer('B03', 3, { decodeResult: () => false })
  p.next({ descriptor: {}, request: { input: [] } })
  assert.equal(
    p.next({
      descriptor: {},
      request: { input: [{ type: 'custom_tool_call_output', call_id: 'B03-call-1', output: 'x' }] },
    }).status,
    'UNKNOWN',
  )
  const q = producer()
  q.fail('YIELD')
  assert.throws(() => q.next({ descriptor: {}, request: { input: [] } }), /no resend/)
})

test('scoped transport facade captures bounded synthetic call only, correlates response and omits capabilities', async () => {
  const args = { synthetic: true, role: 'REQUIREMENT_ANALYZER' }
  const journal = journalStub()
  const audit = new ScopedTransportAudit({
    caseId: 'B01',
    expectedCalls: [{ callId: 'call-1', name: 'quality_journey_analysis_get', argumentsSha256: sha(canonical(args)) }],
    journal,
  })
  const transport = fakeTransport()
  const facade = audit.wrap(transport)
  const received = []
  facade.onmessage = message => received.push(message)
  await facade.start()
  await facade.send({
    jsonrpc: '2.0',
    id: 'list-1',
    method: 'tools/list',
    params: { capabilities: { secret: 'do-not-capture' } },
  })
  transport.onmessage({
    jsonrpc: '2.0',
    id: 'list-1',
    result: { tools: [], capabilities: { secret: 'do-not-capture' } },
  })
  await facade.send({
    jsonrpc: '2.0',
    id: 'rpc-1',
    method: 'tools/call',
    params: { name: 'quality_journey_analysis_get', arguments: args },
  })
  transport.onmessage({ jsonrpc: '2.0', id: 'rpc-1', result: { content: [{ type: 'text', text: 'synthetic' }] } })
  const snapshot = audit.finish()
  assert.equal(snapshot.calls.length, 1)
  assert.deepEqual(snapshot.calls[0].arguments, args)
  assert.equal(snapshot.calls[0].result.content[0].text, 'synthetic')
  assert.deepEqual(journal.reserved, [{ kind: 'scopedCalls', id: 'call-1' }])
  assert.deepEqual(journal.acknowledged, ['call-1'])
  assert.equal(received.length, 2)
  assert.ok(!JSON.stringify(snapshot).includes('do-not-capture'))
})

test('scoped audit fences extra, duplicate, wrong result, lost ACK and oversized data', async () => {
  const args = { synthetic: true }
  const expectedCalls = [
    { callId: 'call-1', name: 'quality_journey_analysis_get', argumentsSha256: sha(canonical(args)) },
  ]
  for (const mutate of [
    async facade => facade.send({ id: 'rpc-1', method: 'tools/call', params: { name: 'foreign', arguments: args } }),
    async (facade, transport) => {
      await facade.send({ id: 'rpc-1', method: 'tools/call', params: { name: expectedCalls[0].name, arguments: args } })
      transport.onmessage({ id: 'foreign', result: {} })
    },
    async (facade, transport) => {
      await facade.send({ id: 'rpc-1', method: 'tools/call', params: { name: expectedCalls[0].name, arguments: args } })
      transport.onmessage({ id: 'rpc-1', error: { code: -1 } })
    },
    async (facade, transport, audit) => {
      await facade.send({ id: 'rpc-1', method: 'tools/call', params: { name: expectedCalls[0].name, arguments: args } })
      audit.finish()
    },
    async facade =>
      facade.send({
        id: 'rpc-1',
        method: 'tools/call',
        params: { name: expectedCalls[0].name, arguments: { synthetic: 'x'.repeat(20_000) } },
      }),
    async facade => facade.send({ id: 'foreign', method: 'resources/read', params: {} }),
    async (facade, transport) => transport.onmessage({ method: 'notifications/foreign', params: {} }),
  ]) {
    const audit = new ScopedTransportAudit({ caseId: 'B01', expectedCalls, journal: journalStub() })
    const transport = fakeTransport()
    const facade = audit.wrap(transport)
    await assert.rejects(() => mutate(facade, transport, audit), /UNKNOWN/)
    assert.equal(audit.snapshot().fenced, true)
  }
})

test('B07 missing native registry records versioned NO_MCP_DISPATCH, logical attempt one and zero scoped dispatches', () => {
  const missing = new ScopedTransportAudit({ caseId: 'B07-A09', expectedCalls: [], journal: journalStub() })
  assert.throws(() => missing.finish(), /UNKNOWN/)
  const audit = new ScopedTransportAudit({ caseId: 'B07-A09', expectedCalls: [], journal: journalStub() })
  const outcome = audit.recordNoDispatch({
    operationName: 'quality_journey_analysis_answer',
    registryVersion: 'registry-v1',
  })
  assert.equal(outcome.class, 'NO_MCP_DISPATCH')
  assert.equal(outcome.logicalAttempts, 1)
  assert.equal(outcome.scopedDispatchCount, 0)
  assert.equal(audit.finish().calls.length, 0)
  assert.ok(!JSON.stringify(outcome).includes('-32601'))
  assert.throws(
    () => audit.recordNoDispatch({ operationName: 'quality_journey_analysis_answer', registryVersion: 'registry-v1' }),
    /UNKNOWN/,
  )
})
