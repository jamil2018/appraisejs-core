import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  claimOriginalNativeQualificationChild,
  launchNativeQualificationChild,
  type NativeChildOutcomeObserver,
} from './native-qualification-child'
import { captureNativeQualificationPlan } from './native-qualification-contract'
import { createNativeQualificationDiagnostics } from './native-qualification-diagnostics'
import {
  expectedNativeMcpConfiguration,
  nativeQualificationFeatureControls,
  verifyNativeQualificationConfiguration,
} from './native-qualification-configuration'
import { NativeStartupMetadata, nativeStartupWarning } from './native-startup-metadata'
import { syntheticNativeManifest } from './native-qualification.test-support'

const roots: string[] = []
const failedFramingRoots = new Set<string>()
afterEach(() =>
  roots.splice(0).forEach(root => {
    if (failedFramingRoots.has(root)) {
      process.stderr.write('INERT_STARTUP_FRAMING_FAILURE_RETAINED\n')
      return
    }
    // Original uncertain cleanup retains custody; generic fixture cleanup cannot erase it.
    if (existsSync(path.join(root, 'fresh'))) {
      process.stderr.write('INERT_SYNTHETIC_FIXTURE_RETAINED_UNKNOWN\n')
      return
    }
    rmSync(root, { recursive: true, force: true })
  }),
)
function expectOriginalRefusalCleanup(receipt: Awaited<ReturnType<Awaited<ReturnType<typeof setup>>['stop']>>) {
  if (receipt.status === 'stopped')
    expect(receipt).toMatchObject({ groupExitObserved: true, privateRootRemoved: true, privateRootRetained: false })
  else expect(receipt).toMatchObject({ status: 'uncertain', privateRootRemoved: false, privateRootRetained: true })
}

async function setup(scenario: string, invalidConfig = false) {
  const f = syntheticNativeManifest()
  roots.push(f.parent)
  const configuration = {
    origins: {},
    config: {
      model: 'gpt-6.1-sol',
      model_provider: 'openai',
      model_reasoning_effort: 'medium',
      approval_policy: 'never',
      sandbox_mode: 'read-only',
      web_search: 'disabled',
      cli_auth_credentials_store: 'file',
      mcp_oauth_credentials_store: 'file',
      features: Object.fromEntries(nativeQualificationFeatureControls.map(key => [key, false])),
      analytics: { enabled: false },
      feedback: { enabled: false },
      history: { persistence: 'none' },
      mcp_servers: { appraise_worker: expectedNativeMcpConfiguration(f.manifest, f.capability) },
    },
  }
  if (invalidConfig) configuration.config.features.sleep_tool = true
  const body = readFileSync(new URL('./fixtures/inert-startup-metadata.cjs', import.meta.url), 'utf8')
  writeFileSync(
    f.manifest.native.path,
    `#!${process.execPath}\nconst startupScenario = ${JSON.stringify(scenario)}\nconst startupWarning = ${JSON.stringify(nativeStartupWarning)}\nconst safeConfiguration = ${JSON.stringify(configuration)}\n` +
      body,
    { mode: 0o700 },
  )
  f.manifest.native.sha256 = f.sha(readFileSync(f.manifest.native.path))
  // Entire waiting period must fit the original initialization request's 1000 ms budget.
  const plan = captureNativeQualificationPlan(f.manifest, f.capability)
  const trace = createNativeQualificationDiagnostics(f.parent, f.manifest.freshRoot)
  const state = new NativeStartupMetadata()
  let admission = true
  let nextAdmissionEffect: (() => void) | undefined
  const approvedSnapshots: Array<{ method: string; params: Record<string, unknown> }> = []
  let faulted = false,
    originalInitializationSettled = false
  const child = await launchNativeQualificationChild(plan, {
    transportId: 'inert-startup-transport',
    onNotification() {},
    onFault() {
      faulted = true
    },
    assertAdmission() {
      const effect = nextAdmissionEffect
      nextAdmissionEffect = undefined
      effect?.()
      if (!admission) throw new Error('Inert controller revoked')
    },
    fenceMcp() {},
    async closeMcp() {
      return true
    },
    diagnostics: trace.observer,
  })
  const observer: NativeChildOutcomeObserver = {
    validatedInitialize() {
      state.validatedInitialize()
    },
    closeStartup() {
      state.close()
    },
    startupReady: (deadline, signal) => state.wait(deadline, signal),
    beforeRequest(method, params) {
      approvedSnapshots.push({ method, params })
      if (method === 'thread/start') state.assertReady()
    },
    admitStartup() {
      state.admit()
    },
    operation(operation, method) {
      void operation
        .then(
          value => {
            if (method === 'initialize') {
              originalInitializationSettled = true
              state.settledInitialize()
            }
            if (method === 'config/read') {
              if (!verifyNativeQualificationConfiguration(value, f.manifest, f.capability)) {
                state.close()
                return
              }
              state.verifiedConfiguration()
            }
          },
          () => state.close(),
        )
        .catch(() => state.close())
    },
    notification(method, params) {
      if (method === 'configWarning' || method === 'account/updated') {
        if (scenario === 'same-chunk') expect(originalInitializationSettled).toBe(false)
        state.notification(method, params)
      }
    },
    fault() {
      state.close()
    },
    cleanup() {
      state.close()
    },
  }
  expect(() => claimOriginalNativeQualificationChild({ ...child }, plan, observer)).toThrow()
  claimOriginalNativeQualificationChild(child, plan, observer)
  async function initialize(signal?: AbortSignal) {
    await child.transport.request(
      'initialize',
      {
        clientInfo: { name: 'inert', version: '0' },
        capabilities: { experimentalApi: false },
      },
      undefined,
      signal,
    )
    await child.transport.notifyInitialized()
    await child.transport.request('config/read', { cwd: path.join(f.manifest.freshRoot, 'cwd'), includeLayers: false })
  }
  const thread = (signal?: AbortSignal) =>
    child.transport.request(
      'thread/start',
      {
        cwd: path.join(f.manifest.freshRoot, 'cwd'),
        ephemeral: true,
        model: 'gpt-6.1-sol',
        sandbox: 'read-only',
        approvalPolicy: 'never',
      },
      undefined,
      signal,
    )
  async function stop() {
    const receipt = await child.stop()
    trace.close()
    expect(readFileSync(path.join(f.parent, 'c1-acquisition-diagnostics.jsonl'), 'utf8')).not.toContain(
      'private-sentinel-rejected',
    )
    return receipt
  }
  return {
    ...f,
    child,
    initialize,
    thread,
    stop,
    state,
    approvedSnapshots,
    revokeAdmission: () => {
      admission = false
    },
    setNextAdmissionEffect: (effect: () => void) => {
      nextAdmissionEffect = effect
    },
    faulted: () => faulted,
  }
}
describe('genuine inert owned child startup policy', () => {
  it.each(['same-chunk', 'split', 'different-microtasks'])(
    'admits strict-config original child for %s framing',
    async scenario => {
      const f = await setup(scenario)
      const entered = Date.now()
      let phase = 'INITIALIZE_CONFIG',
        initializeConfigElapsedMs: number | null = null
      try {
        await f.initialize()
        initializeConfigElapsedMs = Date.now() - entered
        phase = 'THREAD_START'
        expect(await f.thread()).toHaveProperty('thread.id', 'inert-thread')
        phase = 'ASSERTIONS'
        expect(f.child.transport.snapshot().issuedRequests).toBe(3)
        expect(() => f.state.notification('account/updated', { authMode: 'chatgpt', planType: 'unknown' })).toThrow()
      } catch (error) {
        failedFramingRoots.add(f.parent)
        // Only finite local metadata: never retain native reply bodies or arbitrary thrown values.
        writeFileSync(
          path.join(f.parent, 'startup-framing-failure.json'),
          JSON.stringify({
            scenario,
            phase,
            elapsedMs: Date.now() - entered,
            initializeConfigElapsedMs,
            transport: f.child.transport.snapshot(),
            diagnostics: readFileSync(path.join(f.parent, 'c1-acquisition-diagnostics.jsonl'), 'utf8')
              .trim()
              .split('\n')
              .map(line => JSON.parse(line)),
          }) + '\n',
          { flag: 'wx', mode: 0o600 },
        )
        process.stderr.write(`INERT_STARTUP_FRAMING_FAILURE ${f.parent}\n`)
        throw error
      } finally {
        expect(await f.stop()).toMatchObject({ status: 'stopped', groupExitObserved: true, privateRootRemoved: true })
      }
    },
    10000,
  )
  it.each(['deadline-before-wait', 'original-signal'])(
    'closes startup on %s without new RPC or waiter',
    async mode => {
      const f = await setup('missing-account'),
        controller = new AbortController()
      try {
        await f.initialize(controller.signal)
        if (mode === 'original-signal') controller.abort()
        else await new Promise(resolve => setTimeout(resolve, 1050))
        expect(f.child.transport.snapshot()).toMatchObject({ status: 'fenced', issuedRequests: 2 })
        await expect(f.thread()).rejects.toThrow()
        expect(() => f.state.notification('account/updated', { authMode: 'chatgpt', planType: 'unknown' })).toThrow()
      } finally {
        expect(await f.stop()).toMatchObject({ status: 'stopped', groupExitObserved: true, privateRootRemoved: true })
      }
    },
    10000,
  )
  it.each(['before-init', 'invalid-init', 'nonnull-warning', 'duplicate'])(
    'refuses %s before any thread/turn admission',
    async scenario => {
      const f = await setup(scenario)
      try {
        await f.initialize().catch(() => {})
        await expect(f.thread()).rejects.toThrow()
        expect(f.child.transport.snapshot().status).toBe('fenced')
        expect(f.child.transport.snapshot().issuedRequests).toBeLessThanOrEqual(2)
        expect(f.faulted()).toBe(true)
      } finally {
        const cleanup = await f.stop()
        expect(cleanup.status).toBe('uncertain')
        expect(cleanup.privateRootRemoved).toBe(false)
      }
    },
    10000,
  )
  it.each(['missing-account', 'invalid-config', 'cancel', 'fence', 'drift'])(
    'retains original deadline/config/owner boundary for %s',
    async mode => {
      const f = await setup(
        mode === 'invalid-config' || mode === 'drift' ? 'same-chunk' : 'missing-account',
        mode === 'invalid-config',
      )
      try {
        await f.initialize()
        if (mode === 'drift') writeFileSync(f.manifest.native.path, 'inert source drift')
        const controller = new AbortController(),
          started = Date.now(),
          waiting = expect(f.thread(controller.signal)).rejects.toThrow()
        if (mode === 'cancel') controller.abort()
        if (mode === 'fence') f.child.transport.fence('test_fence')
        await waiting
        expect(Date.now() - started).toBeLessThanOrEqual(1100)
        expect(f.child.transport.snapshot()).toMatchObject({ status: 'fenced', issuedRequests: 2 })
        expect(() => f.state.notification('account/updated', { authMode: 'chatgpt', planType: 'unknown' })).toThrow()
      } finally {
        const cleanup = await f.stop()
        expect(cleanup.groupExitObserved).toBe(true)
        expect(cleanup.status).toBe('stopped')
      }
    },
    10000,
  )
})

describe('genuine original wire snapshot and final admission regressions', () => {
  const paramsFor = (method: string, root: string): Record<string, unknown> => {
    if (method === 'initialize')
      return { clientInfo: { name: 'inert', version: '0' }, capabilities: { experimentalApi: false } }
    if (method === 'config/read') return { cwd: path.join(root, 'cwd'), includeLayers: false }
    if (method === 'thread/start')
      return {
        cwd: path.join(root, 'cwd'),
        ephemeral: true,
        model: 'gpt-6.1-sol',
        sandbox: 'read-only',
        approvalPolicy: 'never',
      }
    return {
      threadId: 'inert-thread',
      input: [{ type: 'text', text: 'approved' }],
      model: 'gpt-6.1-sol',
      effort: 'medium',
    }
  }
  for (const method of ['initialize', 'config/read', 'thread/start', 'turn/start'] as const)
    it.each(['serializer', 'getter'])(
      'rejects ' + method + ' %s without invocation or allocation',
      async mode => {
        const f = await setup('same-chunk')
        try {
          if (method !== 'initialize') await f.initialize()
          if (method === 'turn/start') {
            await f.thread()
            await f.child.transport.request('mcpServerStatus/list', {
              serverName: 'appraise_worker',
              threadId: 'inert-thread',
              detail: 'full',
              limit: 1,
            })
          }
          const baseline = f.child.transport.snapshot(),
            params = paramsFor(method, f.manifest.freshRoot)
          const hook = vi.fn(() => ({ sandbox: 'danger-full-access', ephemeral: false }))
          if (mode === 'serializer') Object.defineProperty(params, 'toJSON', { value: hook })
          else Object.defineProperty(params, Object.keys(params)[0], { get: hook, enumerable: true })
          await expect(f.child.transport.request(method, params)).rejects.toThrow()
          expect(hook).not.toHaveBeenCalled()
          expect(f.child.transport.snapshot()).toMatchObject({
            status: 'fenced',
            issuedRequests: baseline.issuedRequests,
            writtenBytes: baseline.writtenBytes,
          })
          await expect(f.child.transport.request(method, paramsFor(method, f.manifest.freshRoot))).rejects.toThrow()
        } finally {
          expectOriginalRefusalCleanup(await f.stop())
        }
      },
      10000,
    )
  it.each(['serializer', 'getter'])(
    'rejects nested turn input %s before digest or serialization can diverge',
    async mode => {
      const f = await setup('same-chunk')
      try {
        await f.initialize()
        await f.thread()
        const params = paramsFor('turn/start', f.manifest.freshRoot),
          nested = (params.input as Record<string, unknown>[])[0]
        const hook = vi.fn(() => 'private unauthorized input')
        if (mode === 'serializer') Object.defineProperty(nested, 'toJSON', { value: hook })
        else Object.defineProperty(nested, 'text', { get: hook, enumerable: true })
        const baseline = f.child.transport.snapshot()
        await expect(f.child.transport.request('turn/start', params)).rejects.toThrow()
        expect(hook).not.toHaveBeenCalled()
        expect(f.child.transport.snapshot()).toMatchObject({
          status: 'fenced',
          issuedRequests: baseline.issuedRequests,
          writtenBytes: baseline.writtenBytes,
        })
      } finally {
        expectOriginalRefusalCleanup(await f.stop())
      }
    },
    10000,
  )
  it.each(['delay', 'abort', 'revoke'])(
    'retains entry budgets and refuses trusted admission %s with zero new writes',
    async mode => {
      const f = await setup('same-chunk'),
        controller = new AbortController()
      try {
        await f.initialize(controller.signal)
        const baseline = f.child.transport.snapshot()
        f.setNextAdmissionEffect(() => {
          if (mode === 'delay') {
            const end = Date.now() + 1050
            while (Date.now() < end) {
              /* bounded trusted gate delay */
            }
          }
          if (mode === 'abort') controller.abort()
          if (mode === 'revoke') f.revokeAdmission()
        })
        await expect(
          f.child.transport.request('thread/start', paramsFor('thread/start', f.manifest.freshRoot)),
        ).rejects.toThrow()
        expect(f.child.transport.snapshot()).toMatchObject({
          status: 'fenced',
          issuedRequests: baseline.issuedRequests,
          writtenBytes: baseline.writtenBytes,
        })
      } finally {
        expectOriginalRefusalCleanup(await f.stop())
      }
    },
    10000,
  )
  for (const location of ['root', 'nested'] as const)
    it.each(['Object', 'Array'] as const)(
      'rejects ' + location + ' Proxy before installing inherited %s serializer',
      async prototype => {
        const f = await setup('same-chunk'),
          target = prototype === 'Object' ? Object.prototype : Array.prototype
        const original = Object.getOwnPropertyDescriptor(target, 'toJSON'),
          trap = vi.fn((value: object) => {
            Object.defineProperty(target, 'toJSON', { configurable: true, value: () => ({ method: 'account/logout' }) })
            return Reflect.ownKeys(value)
          })
        try {
          await f.initialize()
          const baseline = f.child.transport.snapshot(),
            params = paramsFor('thread/start', f.manifest.freshRoot)
          const request =
            location === 'root'
              ? new Proxy<Record<string, unknown>>(params, { ownKeys: trap })
              : { ...params, cwd: new Proxy({}, { ownKeys: trap }) }
          await expect(f.child.transport.request('thread/start', request)).rejects.toThrow()
          expect(trap).not.toHaveBeenCalled()
          expect(f.child.transport.snapshot()).toMatchObject({
            status: 'fenced',
            issuedRequests: baseline.issuedRequests,
            writtenBytes: baseline.writtenBytes,
          })
        } finally {
          if (original) Object.defineProperty(target, 'toJSON', original)
          else Reflect.deleteProperty(target, 'toJSON')
          expectOriginalRefusalCleanup(await f.stop())
        }
      },
      10000,
    )
  it('emits approved nested turn data and method with inherited serializers present', async () => {
    const f = await setup('same-chunk'),
      objectOriginal = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON'),
      arrayOriginal = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON')
    let frameHookCalls = 0,
      arrayHookCalls = 0,
      operation!: Promise<unknown>
    try {
      await f.initialize()
      await f.thread()
      await f.child.transport.request('mcpServerStatus/list', {
        serverName: 'appraise_worker',
        threadId: 'inert-thread',
        detail: 'full',
        limit: 1,
      })
      try {
        Object.defineProperty(Object.prototype, 'toJSON', {
          configurable: true,
          value: function (this: Record<string, unknown>) {
            if (Object.hasOwn(this, 'id') && Object.hasOwn(this, 'method')) {
              frameHookCalls++
              return { id: 5, method: 'account/logout', params: {} }
            }
            return this
          },
        })
        Object.defineProperty(Array.prototype, 'toJSON', {
          configurable: true,
          value: function () {
            arrayHookCalls++
            return [{ type: 'text', text: 'substituted' }]
          },
        })
        operation = f.child.transport.request('turn/start', paramsFor('turn/start', f.manifest.freshRoot))
      } finally {
        if (objectOriginal) Object.defineProperty(Object.prototype, 'toJSON', objectOriginal)
        else Reflect.deleteProperty(Object.prototype, 'toJSON')
        if (arrayOriginal) Object.defineProperty(Array.prototype, 'toJSON', arrayOriginal)
        else Reflect.deleteProperty(Array.prototype, 'toJSON')
      }
      expect(await operation).toHaveProperty('turn.id', 'inert-turn')
      expect(frameHookCalls).toBe(0)
      expect(arrayHookCalls).toBe(0)
      expect(f.approvedSnapshots.find(row => row.method === 'turn/start')!.params).toMatchObject({
        input: [{ type: 'text', text: 'approved' }],
      })
    } finally {
      expect(await f.stop()).toMatchObject({ status: 'stopped', groupExitObserved: true, privateRootRemoved: true })
    }
  }, 10000)
  it('does not register or accept an unwritten same-ID reply during startup wait', async () => {
    const f = await setup('premature-reply')
    try {
      await f.initialize()
      const baseline = f.child.transport.snapshot(),
        waiting = f.thread()
      expect(f.child.transport.snapshot()).toMatchObject({ pendingRequests: 0, issuedRequests: 2 })
      await expect(waiting).rejects.toThrow()
      expect(f.child.transport.snapshot()).toMatchObject({
        status: 'fenced',
        issuedRequests: 2,
        writtenBytes: baseline.writtenBytes,
      })
    } finally {
      expect((await f.stop()).status).toBe('uncertain')
    }
  }, 10000)
  it('validates and emits a frozen data snapshot even when the original data changes during the wait', async () => {
    const f = await setup('different-microtasks')
    try {
      await f.initialize()
      const params = paramsFor('thread/start', f.manifest.freshRoot),
        operation = f.child.transport.request('thread/start', params)
      params.sandbox = 'danger-full-access'
      params.ephemeral = false
      expect(await operation).toHaveProperty('thread.id', 'inert-thread')
      const approved = f.approvedSnapshots.find(row => row.method === 'thread/start')!.params
      expect(approved).toMatchObject({ sandbox: 'read-only', ephemeral: true })
      expect(Object.isFrozen(approved)).toBe(true)
    } finally {
      expect(await f.stop()).toMatchObject({ status: 'stopped', groupExitObserved: true, privateRootRemoved: true })
    }
  }, 10000)
})
