import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { createTrustedLauncher } from './fixtures/codex-app-server-m02-ta-matrix-r10/launcher.mjs'
import { digest, POLICY } from './fixtures/codex-app-server-m02-ta-runtime-r9/policy.mjs'

function fixture({ validChild = true } = {}) {
  const calls = []
  const state = { activeCase: null, fenced: false, pending: [] }
  const owned = { listeners: 0, children: 0 }
  const journal = {
    async begin(caseId) {
      if (state.fenced) throw new Error('durable phase UNKNOWN; no retry')
      state.activeCase = caseId
    },
    snapshot: () => ({ ...state, pending: [...state.pending], counts: {} }),
    markUnknown() {
      state.fenced = true
    },
    recordRecovery() {},
  }
  const manifest = {
    phase: 'T2',
    root: POLICY.roots.T2,
    cases: ['B01'],
    artifacts: [
      { purpose: 'interpreter', path: '/opt/homebrew/Cellar/node/26.11.0/bin/node' },
      { purpose: 'scoped-mcp-entry', path: '/private/tmp/reviewed-scoped-entry.mjs' },
    ],
  }
  const prepared = { manifest, manifestDigest: digest(manifest) }
  let providerRequest
  const ports = {
    async startProvider(options) {
      calls.push('listener-start')
      providerRequest = options.request
      owned.listeners++
      return { port: 17777, server: Object.freeze({ owned: true }) }
    },
    async writeBootstrap() {
      calls.push('bootstrap-write')
    },
    async spawnCodex() {
      calls.push('child-spawn')
      owned.children++
      if (!validChild) return { on() {} }
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.stdin = new EventEmitter()
      return child
    },
    async sendOwned() {
      calls.push('stdio-send')
    },
    async stopOwned({ child = null, server = null } = {}) {
      calls.push(`stop:${child ? 'child' : 'none'}:${server ? 'listener' : 'none'}`)
      if (child) owned.children = 0
      if (server) owned.listeners = 0
    },
    snapshot: () => ({ ownedChildren: owned.children, ownedListeners: owned.listeners }),
  }
  const launcher = createTrustedLauncher({
    prepared,
    precreatedRootIdentity: { dev: 1, ino: 1 },
    journal,
    authorize: async () => true,
    clock: () => 1000,
    verifyMcpStartup: () => false,
    verifyRequiredMcpFailure: () => false,
    verifyRequiredMcpTelemetry: () => false,
    createPorts: () => ports,
    createObserver: async ({ spawnOwnedCodex }) => ({
      async spawn() {
        const result = await spawnOwnedCodex()
        return {
          child: result.child,
          assertLiveHostBeforeCaseComplete() {},
          stopAndVerify() {},
        }
      },
    }),
  })
  const canonicalBridge = {
    handle() {},
    bootstrapConfig(url) {
      return { schema: 'appraise.m02-ta-bridge-bootstrap/v1', caseId: 'B01', capability: 'x'.repeat(32), url }
    },
    auditCapability() {
      return 'fake-capability'
    },
  }
  const input = {
    caseId: 'B01',
    canonicalBridge,
    auditSession: { observe() {} },
    request: () => {
      calls.push('scripted-request')
    },
  }
  return { calls, owned, state, journal, launcher, input, providerRequest: () => providerRequest }
}

test('prepareScript failure after owned listener fences UNKNOWN and requests listener cleanup', async () => {
  const f = fixture()
  await assert.rejects(
    f.launcher.startCase({
      ...f.input,
      prepareScript: async () => {
        f.calls.push('prepare-script')
        throw new Error('synthetic prepare failure')
      },
    }),
    /synthetic prepare failure/,
  )
  assert.equal(f.state.fenced, true)
  assert.equal(f.owned.listeners, 0)
  assert.equal(f.owned.children, 0)
  assert.deepEqual(f.calls, ['listener-start', 'prepare-script', 'stop:none:listener'])
  assert.throws(() => f.providerRequest()({ requestIndex: 0 }), /provider request before owned thread and turn/)
  assert.equal(f.calls.includes('scripted-request'), false)
  await assert.rejects(f.launcher.startCase(f.input), /campaign fenced|synthetic|UNKNOWN/)
  assert.equal(f.calls.filter(item => item === 'listener-start').length, 1)
})

test('invalid postspawn stdio fences UNKNOWN and requests child plus listener cleanup', async () => {
  const f = fixture({ validChild: false })
  await assert.rejects(f.launcher.startCase(f.input), /owned stdio channels missing/)
  assert.equal(f.state.fenced, true)
  assert.equal(f.owned.listeners, 0)
  assert.equal(f.owned.children, 0)
  assert.deepEqual(f.calls, ['listener-start', 'bootstrap-write', 'child-spawn', 'stop:child:listener'])
  assert.throws(() => f.providerRequest()({ requestIndex: 0 }), /provider request before owned thread and turn/)
  assert.equal(f.calls.includes('stdio-send'), false)
  assert.equal(f.calls.includes('scripted-request'), false)
  await assert.rejects(f.launcher.startCase(f.input), /campaign fenced|UNKNOWN/)
  assert.equal(f.calls.filter(item => item === 'child-spawn').length, 1)
})

test('provider callback requires active case, turn phase, and no pending start before script', async () => {
  const f = fixture()
  const started = await f.launcher.startCase(f.input)
  const request = f.providerRequest()
  assert.throws(() => request({ requestIndex: 0 }), /provider request before owned thread and turn/)
  started.peer.snapshot = () => ({ phase: 'turn', threadId: 'thread-1', turnId: 'turn-1' })
  f.state.activeCase = 'B02'
  assert.throws(() => request({ requestIndex: 0 }), /provider request before owned thread and turn/)
  f.state.activeCase = 'B01'
  f.state.pending.push({ kind: 'threadStarts', id: 'B01-thread-start' })
  assert.throws(() => request({ requestIndex: 0 }), /provider request before owned thread and turn/)
  f.state.pending = [{ kind: 'turnStarts', id: 'B01-turn-start' }]
  assert.throws(() => request({ requestIndex: 0 }), /provider request before owned thread and turn/)
  assert.equal(f.calls.includes('scripted-request'), false)
  f.state.pending = []
  request({ requestIndex: 0 })
  assert.equal(f.calls.filter(item => item === 'scripted-request').length, 1)
  await started.stopOwned()
})
