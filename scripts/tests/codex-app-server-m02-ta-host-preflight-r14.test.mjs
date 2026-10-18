import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { PREFLIGHT } from './fixtures/codex-app-server-m02-ta-host-preflight-r14/policy.mjs'
import {
  createOwnedLoopbackAdapter,
  runHostPreflight,
} from './fixtures/codex-app-server-m02-ta-host-preflight-r14/runner.mjs'
import {
  assertExactApproval,
  dispatchHostPreflight,
} from './fixtures/codex-app-server-m02-ta-host-preflight-r14/entrypoint.mjs'
import {
  MANIFEST,
  PROPOSAL,
  PROPOSAL_SHA,
  pinReadFailure,
} from './fixtures/codex-app-server-m02-ta-host-preflight-r14/preparation.mjs'
import { fileURLToPath } from 'node:url'

function fakeIo(fault = {}) {
  const events = []
  const files = new Map()
  let now = 0
  return {
    events,
    files,
    io: {
      now: () => now,
      readPlist: async () => {
        events.push('plist')
        if (fault.plist) throw Object.assign(new Error('secret plist path'), { code: fault.plist })
        return `<key>ProductBuildVersion</key><string>${PREFLIGHT.osBuild}</string>`
      },
      createRoot: async () => {
        events.push('root')
        if (fault.rootAfterCreate)
          throw Object.assign(new Error('private root fsync'), {
            code: 'EIO',
            rootCreated: true,
            rootIdentity: { dev: 1, ino: 2 },
          })
        if (fault.root) throw Object.assign(new Error('secret root path'), { code: fault.root })
        if (fault.rootMissingIdentity) return null
        return { dev: 1, ino: 2 }
      },
      createDirectory: async (relative, index) => {
        events.push(`dir:${index}:${relative}`)
        if (fault.directory === index) throw Object.assign(new Error('secret mkdir path'), { code: 'EPERM' })
      },
      write: async (name, bytes) => {
        events.push(`write:${name}`)
        if (fault.write === name) throw Object.assign(new Error('secret write body'), { code: 'EIO' })
        if (files.has(name)) throw Object.assign(new Error('duplicate'), { code: 'EEXIST' })
        files.set(name, bytes)
        if (name === 'result.json' && fault.finalDelayMs) now += fault.finalDelayMs
      },
      read: async name => {
        events.push(`read:${name}`)
        if (fault.read) throw new Error('secret read path')
        return files.get(name)
      },
      makeListener: () => {
        events.push('listener:create')
        return {
          bind: async () => {
            events.push('listener:bind')
            if (fault.bind) throw Object.assign(new Error('secret socket detail'), { code: fault.bind })
            return 49152
          },
          close: async () => {
            events.push('listener:close')
            if (fault.closeHang) return await new Promise(() => {})
            if (fault.close) throw Object.assign(new Error('secret close detail'), { code: fault.close })
          },
          bestEffortClose: async () => {
            events.push('listener:best-effort-close')
            if (fault.cleanupHang) return await new Promise(() => {})
            return fault.cleanup !== false
          },
          unref: () => events.push('listener:unref'),
          assertHealthy: () => {
            if (fault.lateError) throw new Error('secret late server error')
          },
        }
      },
      withDeadline: async (promise, remaining) => {
        if (fault.closeHang && remaining > 250 && events.includes('listener:close'))
          throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
        if (fault.cleanupHang && remaining <= 250) throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
        return await promise
      },
      advance: ms => {
        now += ms
      },
    },
  }
}

test('inert import and default command do not invoke active ports', async () => {
  await assert.rejects(
    dispatchHostPreflight([], {
      prepare: () => {
        throw new Error('unexpected effect')
      },
    }),
    /inert default/,
  )
  assert.equal(PREFLIGHT.root, '/private/tmp/appraise-m02-ta-host-preflight-p1')
  assert.equal(PREFLIGHT.directories.length, 8)
})

test('exact eight directory operations, synthetic marker, durable intent, then one bind and observed close', async () => {
  const fake = fakeIo()
  const result = await runHostPreflight({ verifyAuthorization: async () => true, io: fake.io })
  assert.equal(result.status, 'OBSERVED_PERMISSION_CHECK_ONLY')
  assert.equal(result.runtimeQualified, false)
  assert.equal(result.t2Authorized, false)
  assert.equal(result.listenerCloseObserved, true)
  assert.equal(result.directoriesCreated, 8)
  assert.equal(fake.events.filter(item => item.startsWith('dir:')).length, 7)
  assert.ok(fake.events.indexOf('write:listener-intent.json') < fake.events.indexOf('listener:bind'))
  assert.deepEqual(
    fake.events.filter(item => item === 'listener:bind'),
    ['listener:bind'],
  )
  assert.deepEqual([...fake.files.keys()], ['synthetic.txt', 'listener-intent.json', 'result.json'])
  assert.equal(JSON.parse(fake.files.get('result.json')).status, 'CANDIDATE_OBSERVATION_PENDING_FINAL_DEADLINE')
})

test('all pre-bind stage faults have sanitized categories and never bind', async () => {
  for (const fault of [
    { plist: 'EPERM' },
    { root: 'EPERM' },
    { directory: 5 },
    { write: 'synthetic.txt' },
    { read: true },
    { write: 'listener-intent.json' },
  ]) {
    const fake = fakeIo(fault)
    const result = await runHostPreflight({ verifyAuthorization: async () => true, io: fake.io })
    assert.equal(result.status, 'UNKNOWN')
    assert.equal(result.runtimeQualified, false)
    assert.equal(fake.events.includes('listener:bind'), false)
    assert.equal(JSON.stringify(result).includes('secret'), false)
    if (fault.directory) assert.equal(result.failure.operationIndex, fault.directory)
  }
})

test('uncertain fsync after root creation retains one-shot evidence and never binds', async () => {
  const fake = fakeIo({ rootAfterCreate: true })
  const result = await runHostPreflight({ verifyAuthorization: async () => true, io: fake.io })
  assert.equal(result.status, 'UNKNOWN')
  assert.equal(result.rootRetainedForEvidence, true)
  assert.equal(result.failure.operationIndex, 0)
  assert.equal(fake.events.includes('listener:bind'), false)
})

test('root ownership observation is false when created root identity is absent', async () => {
  const fake = fakeIo({ rootMissingIdentity: true })
  const result = await runHostPreflight({ verifyAuthorization: async () => true, io: fake.io })
  assert.equal(result.status, 'UNKNOWN')
  assert.equal(result.rootRetainedForEvidence, true)
  assert.equal(result.rootOwnedObserved, false)
  assert.equal(fake.events.includes('listener:bind'), false)
})

test('ambiguous bind and close remain UNKNOWN with no resend', async () => {
  for (const fault of [{ bind: 'EPERM' }, { close: 'EIO', cleanup: false }]) {
    const fake = fakeIo(fault)
    const result = await runHostPreflight({ verifyAuthorization: async () => true, io: fake.io })
    assert.equal(result.status, 'UNKNOWN')
    assert.equal(result.intentWritten, true)
    assert.equal(fake.events.filter(item => item === 'listener:bind').length, 1)
    assert.equal(result.listenerCloseObserved, false)
    assert.equal(JSON.stringify(result).includes('secret'), false)
  }
})

test('result write failure is UNKNOWN; no second listener attempt', async () => {
  const fake = fakeIo({ write: 'result.json' })
  const result = await runHostPreflight({ verifyAuthorization: async () => true, io: fake.io })
  assert.equal(result.status, 'UNKNOWN')
  assert.equal(result.resultFileAuthoritative, false)
  assert.equal(fake.events.filter(item => item === 'listener:bind').length, 1)
  assert.equal(fake.events.filter(item => item === 'write:result.json').length, 1)
})

test('delayed final fsync is UNKNOWN while retained file remains candidate-only', async () => {
  const fake = fakeIo({ finalDelayMs: PREFLIGHT.deadlineMs + 1 })
  const result = await runHostPreflight({ verifyAuthorization: async () => true, io: fake.io })
  assert.equal(result.status, 'UNKNOWN')
  assert.equal(result.resultFileCandidateOnly, true)
  assert.equal(JSON.parse(fake.files.get('result.json')).status, 'CANDIDATE_OBSERVATION_PENDING_FINAL_DEADLINE')
  assert.equal(fake.events.filter(item => item === 'listener:bind').length, 1)
})

test('lost close acknowledgement is bounded and unreconciled owned handle is unrefed', async () => {
  const fake = fakeIo({ closeHang: true, cleanupHang: true })
  const result = await runHostPreflight({ verifyAuthorization: async () => true, io: fake.io })
  assert.equal(result.status, 'UNKNOWN')
  assert.equal(result.cleanupObserved, false)
  assert.equal(fake.events.includes('listener:unref'), true)
})

test('pre-bind full-pin failure preserves sanitized PIN_READ index and does not bind', async () => {
  const fake = fakeIo()
  let checks = 0
  const result = await runHostPreflight({
    verifyAuthorization: async () => {
      if (++checks === 2) throw pinReadFailure('R13_ARTIFACT', 6123, { code: 'EPERM' })
      return true
    },
    io: fake.io,
  })
  assert.deepEqual(result.failure, {
    stage: 'PIN_READ',
    pinClass: 'R13_ARTIFACT',
    operationIndex: 6123,
    errno: 'EPERM',
  })
  assert.equal(fake.events.includes('listener:bind'), false)
})

test('owned listener adapter retains an error handler after bind and after close', async () => {
  class FakeServer extends EventEmitter {
    listening = false
    listen(_options, callback) {
      this.listening = true
      callback()
    }
    address() {
      return this.listening ? { address: PREFLIGHT.listenerHost, port: 49152 } : null
    }
    close(callback) {
      this.listening = false
      callback()
    }
    unref() {}
  }
  const server = new FakeServer()
  const adapter = createOwnedLoopbackAdapter(() => server)
  assert.equal(await adapter.bind(), 49152)
  server.emit('error', new Error('secret late socket failure'))
  await assert.rejects(adapter.close(), /secret late socket failure/)
  assert.throws(() => adapter.assertHealthy(), /listener error/)
  assert.doesNotThrow(() => server.emit('error', new Error('after close')))
})

test('review or decision drift after durable intent fences before bind', async () => {
  const fake = fakeIo()
  let checks = 0
  const result = await runHostPreflight({
    verifyAuthorization: async () => ++checks === 1,
    io: fake.io,
  })
  assert.equal(checks, 2)
  assert.equal(result.status, 'UNKNOWN')
  assert.equal(result.intentWritten, true)
  assert.equal(fake.events.includes('listener:bind'), false)
})

test('pinned-file failure reports only bounded class, index, and errno', () => {
  const failure = pinReadFailure(
    'R13_ARTIFACT',
    501,
    Object.assign(new Error('raw private pathname'), { code: 'EPERM' }),
  )
  assert.deepEqual(failure.safeReceipt, {
    stage: 'PIN_READ',
    pinClass: 'R13_ARTIFACT',
    operationIndex: 501,
    errno: 'EPERM',
  })
  assert.equal(JSON.stringify(failure.safeReceipt).includes('private'), false)
  assert.throws(() => pinReadFailure('RAW_PATH', 1, null), /unreviewed/)
})

test('exact review and distinct decision require escalated host request and no T2 follow-on', () => {
  const entry = fileURLToPath(
    new URL('./fixtures/codex-app-server-m02-ta-host-preflight-r14/entrypoint.mjs', import.meta.url),
  )
  const hex = 'a'.repeat(64),
    manifestSha = 'b'.repeat(64),
    reviewSha = 'c'.repeat(64),
    decisionSha = 'd'.repeat(64)
  const base = [
    '/usr/bin/env',
    '-i',
    'PATH=/usr/bin:/bin',
    'LANG=C',
    PREFLIGHT.node,
    entry,
    '--run',
    MANIFEST,
    hex,
    manifestSha,
  ]
  const prepared = {
    manifestDigest: hex,
    manifestFileSha256: manifestSha,
    manifest: { sources: [{ path: entry, sha256: hex }] },
  }
  const review = {
    sha256: reviewSha,
    value: {
      schema: 'appraise.m02-ta-host-preflight-r14-exact-review/v1',
      verdict: 'ACCEPT_ONE_FIXED_R14_HOST_PREFLIGHT_INVOCATION',
      runtimeVerdict: 'NOT_RUN',
      manifest: { path: MANIFEST, manifestDigest: hex, fileSha256: manifestSha },
      proposal: { path: PROPOSAL, sha256: PROPOSAL_SHA },
      root: PREFLIGHT.root,
      requiredHostExecutionPermission: 'exec_command sandbox_permissions=require_escalated',
      sourceEnforcementOfSandboxMode: 'UNATTESTED',
      exactInvocationPrefix: base,
    },
  }
  const decision = {
    sha256: decisionSha,
    value: {
      schema: 'appraise.m02-ta-host-preflight-r14-user-decision/v1',
      decision: 'APPROVE_ONE_FIXED_R14_HOST_PREFLIGHT',
      evidenceClass: 'VISIBLE_HOST_CONVERSATION_DECISION_TRANSCRIBED_NOT_CRYPTOGRAPHIC_ATTESTATION',
      manifestDigest: hex,
      manifestFileSha256: manifestSha,
      exactReviewSha256: reviewSha,
      proposal: { path: PROPOSAL, sha256: PROPOSAL_SHA },
      requiredHostExecutionPermission: 'exec_command sandbox_permissions=require_escalated',
      noAutomaticT2Followon: true,
      exactInvocationPrefix: [...base, reviewSha],
    },
  }
  const args = { prepared, review, decision, requested: [hex, manifestSha, reviewSha, decisionSha], sourceSha256: hex }
  assert.doesNotThrow(() => assertExactApproval(args))
  assert.throws(
    () =>
      assertExactApproval({
        ...args,
        decision: { ...decision, value: { ...decision.value, noAutomaticT2Followon: false } },
      }),
    /absent/,
  )
  assert.throws(
    () =>
      assertExactApproval({
        ...args,
        review: { ...review, value: { ...review.value, requiredHostExecutionPermission: 'default' } },
      }),
    /absent/,
  )
})
