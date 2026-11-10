import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import baselineSupervisorSource from '../../scripts/tests/fixtures/m06-supervisor-pre-never-launch.mjs'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { providerIntentPolicy, trustedProviderObservation } from '@/lib/quality-journey/provider-intent-contract'
import { ServiceError } from '@/services/shared/errors'
import {
  configureInertSupervisor,
  inertSupervisorFixture,
  provider,
  supervisorGate,
} from '@/services/coordinator/quality-journey-process-supervisor.test-support'
import {
  createQualityJourneyProcessSupervisor,
  trustedJourneyProcessAdapter,
} from '@/services/coordinator/quality-journey-process-supervisor'
import type { AnalysisFollowupDelivery } from '@/services/coordinator/quality-journey-analysis-scheduler'
import {
  RetainedAnalysisLifetime,
  assertRetainedFields,
  assertRetainedDeliveryCanClose,
} from './m06-analysis-retained-lifetime'
function gate() {
  let resolve!: () => void
  const promise = new Promise<void>(yes => {
    resolve = yes
  })
  return { promise, resolve }
}
function delivery(snapshot: object) {
  return { snapshot: () => snapshot } as unknown as AnalysisFollowupDelivery
}
describe('per-delivery closure validation (inert trusted snapshots)', () => {
  const stopped = { status: 'stopped', groupExitObserved: true }
  it.each([
    {
      name: 'settled fenced prelaunch rejection',
      snapshot: { originalStartState: 'REJECTED', childLaunchEntered: false, fenced: true },
      allowed: true,
    },
    {
      name: 'pristine unstarted factory',
      snapshot: { originalStartState: 'NOT_CALLED', childLaunchEntered: false, fenced: false, state: 'startup' },
      allowed: true,
    },
    {
      name: 'pending with owned group exit',
      snapshot: { originalStartState: 'PENDING', childLaunchEntered: false, fenced: true, cleanup: stopped },
      error: /start.*pending/i,
    },
    {
      name: 'attempted rejection without drain',
      snapshot: { originalStartState: 'REJECTED', childLaunchEntered: true, fenced: true },
      error: /drain is unverified/,
    },
    {
      name: 'unfenced rejection without drain',
      snapshot: { originalStartState: 'REJECTED', childLaunchEntered: false, fenced: false },
      error: /drain is unverified/,
    },
    {
      name: 'armed factory without drain',
      snapshot: {
        originalStartState: 'NOT_CALLED',
        childLaunchEntered: false,
        fenced: false,
        state: 'startup',
        providerRunId: 'run',
      },
      error: /drain is unverified/,
    },
    { name: 'missing disposition without drain', snapshot: {}, error: /drain is unverified/ },
    {
      name: 'unknown disposition without drain',
      snapshot: { originalStartState: 'UNKNOWN', childLaunchEntered: false, fenced: true },
      error: /drain is unverified/,
    },
    {
      name: 'unknown disposition with owned group exit',
      snapshot: { originalStartState: 'UNKNOWN', childLaunchEntered: false, fenced: true, cleanup: stopped },
      allowed: true,
    },
    { name: 'missing disposition with owned group exit', snapshot: { cleanup: stopped }, allowed: true },
    {
      name: 'attempted launch with owned group exit',
      snapshot: { originalStartState: 'REJECTED', childLaunchEntered: true, fenced: true, cleanup: stopped },
      allowed: true,
    },
    {
      name: 'stopped without owned group exit',
      snapshot: { cleanup: { status: 'stopped', groupExitObserved: false } },
      error: /group exit is unverified/,
    },
    {
      name: 'uncertain cleanup even with group exit',
      snapshot: { cleanup: { status: 'uncertain', groupExitObserved: true } },
      error: /drain is unverified/,
    },
  ])('$name', ({ snapshot, allowed, error }) => {
    const trusted = delivery(Object.freeze(snapshot)).snapshot()
    if (allowed) expect(() => assertRetainedDeliveryCanClose(trusted)).not.toThrow()
    else expect(() => assertRetainedDeliveryCanClose(trusted)).toThrow(error)
  })
})

describe('retained original Analysis resources (inert operations only)', () => {
  it('captures the original delivery into its preowned own-data cell before later work', () => {
    const owner = new RetainedAnalysisLifetime()
    const { cell, controller } = owner.reserveDelivery()
    expect(Object.getOwnPropertyDescriptor(cell, 'actual')?.value).toBeUndefined()
    const actual = delivery({ state: 'startup', fenced: false })
    controller.retainDelivery(actual)
    expect(cell.actual).toBe(actual)
    expect(owner.deliveries[0]).toBe(actual)
  })
  it('retains exact original promises and refuses client closure while start is pending despite fulfilled stop', async () => {
    const owner = new RetainedAnalysisLifetime(),
      start = gate()
    const disconnect = vi.fn().mockResolvedValue(undefined)
    owner.retainClient({ $disconnect: disconnect })
    owner
      .reserveDelivery()
      .controller.retainDelivery(
        delivery({ state: 'stopped', cleanup: { status: 'stopped', groupExitObserved: true } }),
      )
    const originalStart = owner.track('original-start', () => start.promise)
    expect(originalStart).toBe(start.promise)
    expect(owner.operations[0].original).toBe(start.promise)
    await owner.track('original-stop', () => Promise.resolve())
    await expect(owner.closeKnownSettledClients()).rejects.toThrow(/still pending/)
    expect(disconnect).not.toHaveBeenCalled()
    start.resolve()
    await originalStart
    await owner.closeKnownSettledClients()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })
  it('retains the complete guarded named import/extraction promise until its exact registry is available', async () => {
    const owner = new RetainedAnalysisLifetime()
    const registry = Object.freeze({ originalCase: async () => undefined })
    let resolve!: (module: { retainedAnalysisScenarios: typeof registry }) => void
    const originalImport = new Promise<{ retainedAnalysisScenarios: typeof registry }>(yes => {
      resolve = yes
    })
    const originalCallback = owner.track('guarded-named-import', async () => {
      const { retainedAnalysisScenarios } = await originalImport
      return retainedAnalysisScenarios
    })
    expect(owner.operations[0].original).toBe(originalCallback)
    await expect(owner.closeKnownSettledClients()).rejects.toThrow(/still pending/)
    resolve({ retainedAnalysisScenarios: registry })
    expect(await originalCallback).toBe(registry)
    expect(owner.operations[0].state).toBe('FULFILLED')
    await owner.closeKnownSettledClients()
  })
  it('refuses unverified actual drain and retains a failed owner without disconnect/cancel', async () => {
    const owner = new RetainedAnalysisLifetime(),
      disconnect = vi.fn().mockResolvedValue(undefined)
    owner.retainClient({ $disconnect: disconnect })
    owner
      .reserveDelivery()
      .controller.retainDelivery(
        delivery({ state: 'uncertain', cleanup: { status: 'uncertain', groupExitObserved: false } }),
      )
    await expect(owner.closeKnownSettledClients()).rejects.toThrow(/drain is unverified/)
    owner.retainFailure()
    await expect(owner.closeKnownSettledClients()).rejects.toThrow(/must remain retained/)
    expect(() => owner.reserveDelivery()).toThrow()
    expect(() => owner.track('forbidden-retry', () => Promise.resolve())).toThrow()
    expect(disconnect).not.toHaveBeenCalled()
  })
  it('closes known-drained clients while logical UNKNOWN remains and keeps the exact original disconnect', async () => {
    const owner = new RetainedAnalysisLifetime(),
      close = gate()
    const actual = {
      state: 'stopped',
      cleanup: { status: 'stopped', groupExitObserved: true },
      slotReleased: false,
      providerTerminationProven: false,
    }
    owner.reserveDelivery().controller.retainDelivery(delivery(actual))
    const disconnect = vi.fn(() => close.promise)
    owner.retainClient({ $disconnect: disconnect })
    const closing = owner.closeKnownSettledClients()
    expect(owner.operations[0].original).toBe(close.promise)
    expect(owner.admissionOpen).toBe(false)
    close.resolve()
    await closing
    expect(owner.disposition().deliveries[0]).toBe(actual)
    expect(owner.disposition().deliveries[0].slotReleased).toBe(false)
  })
  it('allows only a never-started factory result after every original operation settled', async () => {
    const owner = new RetainedAnalysisLifetime(),
      disconnect = vi.fn().mockResolvedValue(undefined)
    owner.retainClient({ $disconnect: disconnect })
    owner.reserveDelivery().controller.retainDelivery(
      delivery({
        state: 'startup',
        fenced: false,
        providerRunId: undefined,
        originalStartState: 'NOT_CALLED',
        childLaunchEntered: false,
      }),
    )
    await owner.closeKnownSettledClients()
    expect(disconnect).toHaveBeenCalledTimes(1)
    const active = new RetainedAnalysisLifetime()
    active
      .reserveDelivery()
      .controller.retainDelivery(delivery({ state: 'startup', fenced: false, providerRunId: 'armed-run' }))
    await expect(active.closeKnownSettledClients()).rejects.toThrow(/drain is unverified/)
  })
  it.each([
    {},
    { childLaunchEntered: false },
    { originalStartState: 'REJECTED' },
    { originalStartState: 'UNKNOWN', childLaunchEntered: false },
    { originalStartState: 'NOT_CALLED', childLaunchEntered: undefined },
    { originalStartState: 'REJECTED', childLaunchEntered: true },
    { originalStartState: 'REJECTED', childLaunchEntered: false, fenced: false },
  ])('requires verified owned drain for missing or ineligible disposition %j', async disposition => {
    const owner = new RetainedAnalysisLifetime(),
      disconnect = vi.fn().mockResolvedValue(undefined)
    owner.retainClient({ $disconnect: disconnect })
    owner.reserveDelivery().controller.retainDelivery(delivery({ state: 'startup', fenced: true, ...disposition }))
    await expect(owner.closeKnownSettledClients()).rejects.toThrow(/drain is unverified/)
    expect(disconnect).not.toHaveBeenCalled()
    expect(owner.deliveries).toHaveLength(1)
  })
  it('refuses explicit PENDING even with stopped owned cleanup and an already settled outer operation', async () => {
    const owner = new RetainedAnalysisLifetime(),
      disconnect = vi.fn().mockResolvedValue(undefined)
    owner.retainClient({ $disconnect: disconnect })
    owner.reserveDelivery().controller.retainDelivery(
      delivery({
        state: 'stopped',
        fenced: true,
        originalStartState: 'PENDING',
        childLaunchEntered: true,
        cleanup: { status: 'stopped', groupExitObserved: true },
      }),
    )
    await owner.track('outer', () => Promise.resolve())
    await expect(owner.closeKnownSettledClients()).rejects.toThrow(/start.*pending/i)
    expect(disconnect).not.toHaveBeenCalled()
  })
  it('retains undefined original rejection as an own error field', async () => {
    const owner = new RetainedAnalysisLifetime(),
      original = Promise.reject(undefined)
    await expect(owner.track('undefined-rejection', () => original)).rejects.toBeUndefined()
    expect(owner.operations[0].original).toBe(original)
    expect(Object.hasOwn(owner.operations[0], 'error')).toBe(true)
    expect(owner.operations[0].error).toBeUndefined()
  })
  it('preserves subset assertion meaning and rejected original operation without retry', async () => {
    const owner = new RetainedAnalysisLifetime(),
      error = new Error('inert failure')
    const original = Promise.reject(error)
    await expect(owner.track('original-failure', () => original)).rejects.toBe(error)
    expect(owner.operations[0].error).toBe(error)
    assertRetainedFields({ value: { id: 'actual', extra: true } }, { value: { id: 'actual' } })
    expect(() => assertRetainedFields({ value: 'wrong' }, { value: 'actual' })).toThrow()
  })
})

// Read/parse source only. Never import or execute the controller entry.
describe('exact retained controller failure reporting (inert effects)', () => {
  const sourcePath = path.resolve('src/test/m06-analysis-retained-controller.ts')
  const source = readFileSync(sourcePath, 'utf8')
  const parsed = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true)
  const reporter = parsed.statements.find(
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'reportRetainedFailure',
  )
  const retainedTry = parsed.statements.find(ts.isTryStatement)
  const intervalStatement = parsed.statements.find(
    node =>
      ts.isVariableStatement(node) && node.declarationList.declarations[0]?.name.getText(parsed) === 'retainedLifetime',
  )
  if (!reporter || !retainedTry?.catchClause || !intervalStatement || !ts.isVariableStatement(intervalStatement))
    throw new Error('Exact retained controller source responsibilities required.')
  const intervalCall = intervalStatement.declarationList.declarations[0]!.initializer
  if (!intervalCall || !ts.isCallExpression(intervalCall)) throw new Error('Original retained interval required.')
  const javascript = ts.transpileModule(
    reporter.getText(parsed) +
      '\ntry { throw originalFailure } ' +
      retainedTry.catchClause.getText(parsed) +
      '\n(' +
      intervalCall.arguments[0]!.getText(parsed) +
      ')()',
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText
  const effects = ['success', 'error', 'undefined'] as const
  const rows = [false, true].flatMap(allocated =>
    effects.flatMap(evidence => effects.map(reporting => ({ allocated, evidence, reporting }))),
  )
  it.each(rows)(
    'retains owner/first failure for allocated=$allocated evidence=$evidence reporter=$reporting',
    async ({ allocated, evidence, reporting }) => {
      const owner = new RetainedAnalysisLifetime()
      const disconnect = vi.fn().mockResolvedValue(undefined)
      owner.retainClient({ $disconnect: disconnect })
      const actualDelivery = delivery({ state: 'uncertain' })
      owner.reserveDelivery().controller.retainDelivery(actualDelivery)
      const pending = gate()
      const originalPending = owner.track('original-pending', () => pending.promise)
      const originalFailure = evidence === 'undefined' ? undefined : new Error('first original failure')
      const originalRejected = Promise.reject(originalFailure)
      await expect(owner.track('original-rejected', () => originalRejected)).rejects.toBe(originalFailure)
      const evidenceFailure = new Error('evidence failure'),
        reportingFailure = new Error('reporting failure')
      const calls: string[] = []
      const writeFileSync = vi.fn(() => {
        calls.push('evidence')
        if (evidence !== 'success') throw evidence === 'undefined' ? undefined : evidenceFailure
      })
      const writeSync = vi.fn(() => {
        calls.push('report')
        if (reporting !== 'success') throw reporting === 'undefined' ? undefined : reportingFailure
        return 1
      })
      const streamAccess = vi.fn(() => {
        throw new Error('Asynchronous stderr stream must never be accessed.')
      })
      const context = {
        originalFailure,
        owner,
        allocated,
        admission: { rootDirectory: '/inert/original-case' },
        path,
        writeFileSync,
        writeSync,
        process: Object.defineProperty({}, 'stderr', { get: streamAccess }),
      }
      expect(() => vm.runInNewContext(javascript, context)).not.toThrow()
      expect(owner.failed).toBe(true)
      expect(owner.admissionOpen).toBe(false)
      expect(owner.clients).toHaveLength(1)
      expect(owner.deliveries[0]).toBe(actualDelivery)
      expect(owner.operations[0]!.original).toBe(originalPending)
      expect(owner.operations[0]!.state).toBe('PENDING')
      expect(owner.operations[1]!.original).toBe(originalRejected)
      expect(owner.operations[1]!.error).toBe(originalFailure)
      expect(Object.hasOwn(owner.operations[1]!, 'error')).toBe(true)
      expect(disconnect).not.toHaveBeenCalled()
      expect(streamAccess).not.toHaveBeenCalled()
      expect(calls[0]).toBe(allocated ? 'evidence' : 'report')
      expect(writeFileSync).toHaveBeenCalledTimes(allocated ? 1 : 0)
      if (allocated)
        expect(writeFileSync).toHaveBeenCalledWith('/inert/original-case/retained-failure.json', expect.any(String), {
          flag: 'wx',
        })
      expect(writeSync).toHaveBeenCalledTimes(allocated && evidence !== 'success' ? 2 : 1)
      expect(writeSync).toHaveBeenLastCalledWith(2, 'RETAINED_ANALYSIS_FAILURE_NO_RETRY\n')
      if (allocated && evidence !== 'success')
        expect(writeSync).toHaveBeenNthCalledWith(1, 2, 'RETAINED_ANALYSIS_EVIDENCE_WRITE_FAILED\n')
    },
  )
})

const fixture = () => inertSupervisorFixture(createQualityJourneyProcessSupervisor, trustedJourneyProcessAdapter)
beforeEach(configureInertSupervisor)
afterEach(() => vi.useRealTimers())

function retained(f: ReturnType<typeof fixture>) {
  const owner = new RetainedAnalysisLifetime()
  const disconnect = vi.fn().mockResolvedValue(undefined)
  owner.retainClient({ $disconnect: disconnect })
  owner.reserveDelivery().controller.retainDelivery(f.supervisor as unknown as AnalysisFollowupDelivery)
  return { owner, disconnect }
}

describe('passive original-start and adapter-entry disposition (actual supervisor, inert boundaries)', () => {
  it('keeps the pristine actual factory closure exception without launching or starting work', async () => {
    const f = fixture(),
      { owner, disconnect } = retained(f)
    expect(f.supervisor.snapshot()).toMatchObject({
      state: 'startup',
      fenced: false,
      childLaunchEntered: false,
      originalStartState: 'NOT_CALLED',
    })
    await owner.closeKnownSettledClients()
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(provider.prepare).not.toHaveBeenCalled()
    expect(f.launch).not.toHaveBeenCalled()
  })

  it('closes only the settled never-entered conflicting adapter and keeps the exact rejection and UNKNOWN', async () => {
    const failure = new ServiceError('inert atomic duplicate claim', 'CONFLICT')
    provider.claim.mockRejectedValueOnce(failure)
    const f = fixture(),
      { owner, disconnect } = retained(f)
    const original = owner.track('original-start', () => f.supervisor.start())
    expect(f.supervisor.start()).toBe(original)
    await owner.track('scheduler-outer', () =>
      original.catch(error => {
        expect(error).toBe(failure)
        return 'RECOVERY_REQUIRED'
      }),
    )
    expect(owner.operations[0].original).toBe(original)
    expect(owner.operations[0].error).toBe(failure)
    await owner.closeKnownSettledClients()
    expect(f.supervisor.snapshot()).toMatchObject({
      state: 'uncertain',
      reason: 'START_FAILED',
      fenced: true,
      childLaunchEntered: false,
      originalStartState: 'REJECTED',
      providerTerminationProven: false,
      slotReleased: false,
    })
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(owner.deliveries).toHaveLength(1)
    expect(f.supervisor.snapshot().cleanup).toBeUndefined()
    expect(f.launch).not.toHaveBeenCalled()
    expect(f.child.stop).not.toHaveBeenCalled()
    expect(() => owner.reserveDelivery()).toThrow()
  })

  it('retains both actual duplicate adapters and requires the winner original owned drain', async () => {
    let claimed = false
    provider.claim.mockImplementation(async () => {
      if (claimed) throw new ServiceError('inert duplicate', 'CONFLICT')
      claimed = true
      return { intent: { claimEpoch: 1 } }
    })
    const winner = fixture(),
      loser = fixture(),
      { owner, disconnect } = retained(winner)
    owner.reserveDelivery().controller.retainDelivery(loser.supervisor as unknown as AnalysisFollowupDelivery)
    const starts = [winner, loser].map((f, index) => owner.track(`start:${index}`, () => f.supervisor.start()))
    await Promise.allSettled(starts)
    expect(winner.launch).toHaveBeenCalledTimes(1)
    expect(loser.launch).not.toHaveBeenCalled()
    expect(loser.supervisor.snapshot().originalStartState).toBe('REJECTED')
    await expect(owner.closeKnownSettledClients()).rejects.toThrow(/drain is unverified/)
    expect(disconnect).not.toHaveBeenCalled()
    await owner.track('winner-drain', () => winner.supervisor.cancel())
    expect(winner.child.stop).toHaveBeenCalledTimes(1)
    await owner.closeKnownSettledClients()
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(owner.deliveries).toHaveLength(2)
  })

  it('refuses pending original claim despite fulfilled outer work and fulfilled cancel', async () => {
    const claim = supervisorGate<never>(),
      f = fixture(),
      { owner, disconnect } = retained(f)
    provider.claim.mockReturnValueOnce(claim.promise)
    const original = f.supervisor.start()
    const rejected = expect(original).rejects.toBeUndefined()
    await vi.waitFor(() => expect(provider.claim).toHaveBeenCalledTimes(1))
    await owner.track('outer-already-fulfilled', () => Promise.resolve())
    await owner.track('cancel-fulfilled', () => f.supervisor.cancel())
    expect(f.supervisor.snapshot()).toMatchObject({ childLaunchEntered: false, originalStartState: 'PENDING' })
    await expect(owner.closeKnownSettledClients()).rejects.toThrow(/start.*pending/i)
    expect(disconnect).not.toHaveBeenCalled()
    claim.reject(undefined)
    await rejected
    expect(f.supervisor.snapshot().originalStartState).toBe('REJECTED')
    await owner.closeKnownSettledClients()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it.each(['sync', 'async', 'undefined'] as const)(
    'retains attempted %s launch failure without a returned child',
    async mode => {
      const f = fixture(),
        { owner, disconnect } = retained(f)
      const failure = mode === 'undefined' ? undefined : new Error('inert launch failure')
      if (mode === 'sync')
        f.launch.mockImplementation(() => {
          throw failure
        })
      else f.launch.mockRejectedValue(failure)
      const original = owner.track('original-start', () => f.supervisor.start())
      await expect(original).rejects.toBe(failure)
      expect(f.supervisor.start()).toBe(original)
      expect(f.supervisor.snapshot()).toMatchObject({
        childLaunchEntered: true,
        originalStartState: 'REJECTED',
        state: 'uncertain',
      })
      await expect(owner.closeKnownSettledClients()).rejects.toThrow(/drain is unverified/)
      expect(disconnect).not.toHaveBeenCalled()
      expect(f.launch).toHaveBeenCalledTimes(1)
      expect(f.child.stop).not.toHaveBeenCalled()
    },
  )

  it('latches pending launch and cancellation, then still requires positive actual group exit', async () => {
    const f = fixture(),
      { owner, disconnect } = retained(f),
      launch = supervisorGate<typeof f.child>()
    f.launch.mockReturnValueOnce(launch.promise)
    f.child.stop.mockResolvedValue({ status: 'stopped', groupExitObserved: false })
    const original = f.supervisor.start()
    const rejected = expect(original).rejects.toThrow(/fenced/)
    await vi.waitFor(() => expect(f.launch).toHaveBeenCalledTimes(1))
    const cancelling = f.supervisor.cancel()
    expect(f.supervisor.snapshot()).toMatchObject({
      childLaunchEntered: true,
      originalStartState: 'PENDING',
      fenced: true,
    })
    await expect(owner.closeKnownSettledClients()).rejects.toThrow(/start.*pending/i)
    launch.resolve(f.child)
    await Promise.all([cancelling, rejected])
    await expect(owner.closeKnownSettledClients()).rejects.toThrow(/group exit is unverified/)
    expect(disconnect).not.toHaveBeenCalled()
  })

  it('preserves distinct cancel adopting Promises over one original child drain', async () => {
    const f = fixture(),
      { owner, disconnect } = retained(f),
      drain = supervisorGate<{ status: string; groupExitObserved: boolean }>()
    await f.supervisor.start()
    f.child.stop.mockReturnValueOnce(drain.promise)
    const first = f.supervisor.cancel(),
      second = f.supervisor.cancel()
    expect(first).not.toBe(second)
    expect(f.child.stop).toHaveBeenCalledTimes(1)
    drain.resolve({ status: 'uncertain', groupExitObserved: false })
    await Promise.all([first, second])
    await expect(owner.closeKnownSettledClients()).rejects.toThrow(/drain is unverified/)
    expect(disconnect).not.toHaveBeenCalled()
    expect(f.supervisor.snapshot().childLaunchEntered).toBe(true)
  })
})

// Execute the complete hash-bound baseline and current modules with the same closed import allowlist.
// No provider service, Prisma client, owned-child module, controller or engine is evaluated here.
function isolatedSupervisor(source: string, identities: object[]) {
  let uuid = 0
  const exports: Record<string, unknown> = {}
  const imports: Record<string, unknown> = {
    'node:crypto': { createHash, randomUUID: () => `inert-uuid-${++uuid}` },
    'node:fs': {
      readFileSync: () => {
        throw new Error('Fixture reads forbidden.')
      },
    },
    '@/lib/catalog-contracts': {
      canonicalContractJson: (value: unknown) => {
        if (value && typeof value === 'object' && Object.hasOwn(value, 'providerTerminationProven'))
          identities.push(structuredClone(value))
        return canonicalContractJson(value)
      },
    },
    '@/lib/quality-journey/codex-app-server/owned-child': {
      launchOwnedFixtureChild: () => {
        throw new Error('Real launch forbidden.')
      },
    },
    '@/lib/quality-journey/provider-intent-contract': { providerIntentPolicy, trustedProviderObservation },
    '@/services/shared/errors': { ServiceError },
    './quality-journey-provider-run-service': {
      prepareQualityJourneyProviderRun: provider.prepare,
      claimQualityJourneyProviderIntent: provider.claim,
      armQualityJourneyProviderIntent: provider.arm,
      writeQualityJourneyProviderTransport: provider.write,
      recordQualityJourneyProviderAcknowledgement: provider.ack,
    },
  }
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  vm.runInNewContext(javascript, {
    exports,
    structuredClone,
    Date,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    require: (name: string) => {
      if (!Object.hasOwn(imports, name)) throw new Error(`Unapproved inert import: ${name}`)
      return imports[name]
    },
  })
  return exports as unknown as {
    createQualityJourneyProcessSupervisor: typeof createQualityJourneyProcessSupervisor
    trustedJourneyProcessAdapter: typeof trustedJourneyProcessAdapter
  }
}

describe('actual preimage/current durable observation equivalence (inert fixed inputs)', () => {
  it.each([
    'active-drain',
    'sync-launch-failure',
    'async-launch-failure',
    'pending-active-cancel',
    'pending-launch-cancel',
  ] as const)('keeps every persisted payload/hash and identity key unchanged for %s', async mode => {
    expect(createHash('sha256').update(baselineSupervisorSource).digest('hex')).toBe(
      'b58abedfb58385a52e50d10631df1dc57c360eefe84db945d1c651bf67593d67',
    )
    const currentSource = readFileSync(
      new URL('../services/coordinator/quality-journey-process-supervisor.ts', import.meta.url),
      'utf8',
    )
    async function capture(source: string) {
      const identities: object[] = [],
        diagnostics: object[] = []
      const isolated = isolatedSupervisor(source, identities)
      const f = inertSupervisorFixture(
        isolated.createQualityJourneyProcessSupervisor,
        isolated.trustedJourneyProcessAdapter,
      )
      const active = supervisorGate<object>(),
        launch = supervisorGate<typeof f.child>()
      f.create.mockImplementation(async ({ data }) => {
        diagnostics.push({ kind: data.kind, snapshot: f.supervisor.snapshot() })
        return mode === 'pending-active-cancel' && data.kind === 'TRANSPORT_ACTIVE' ? active.promise : {}
      })
      if (mode === 'sync-launch-failure')
        f.launch.mockImplementation(() => {
          throw undefined
        })
      if (mode === 'async-launch-failure') f.launch.mockRejectedValue(undefined)
      if (mode === 'pending-launch-cancel') f.launch.mockReturnValueOnce(launch.promise)
      const original = f.supervisor.start()
      // Attach both branches immediately, keeping the original Promise itself intact.
      const settlement = original.then(
        value => ({ value }),
        error => ({ error }),
      )
      if (mode === 'pending-active-cancel') {
        await vi.waitFor(() => expect(f.supervisor.snapshot().state).toBe('active'))
        await f.supervisor.cancel()
        active.resolve({})
      }
      if (mode === 'pending-launch-cancel') {
        await vi.waitFor(() => expect(f.launch).toHaveBeenCalledTimes(1))
        const cancelling = f.supervisor.cancel()
        launch.resolve(f.child)
        await cancelling
      }
      await settlement
      await f.supervisor.cancel()
      return {
        payloads: f.create.mock.calls.map(([payload]) => structuredClone(payload)),
        identities,
        diagnostics,
        final: f.supervisor.snapshot(),
        childStopCalls: f.child.stop.mock.calls.length,
        requestCalls: f.child.transport.request.mock.calls.length,
      }
    }
    const baseline = await capture(baselineSupervisorSource),
      current = await capture(currentSource)
    expect(current.payloads).toStrictEqual(baseline.payloads)
    expect(JSON.stringify(current.payloads)).toBe(JSON.stringify(baseline.payloads))
    expect(current.identities).toStrictEqual(baseline.identities)
    expect(current.identities.length).toBeGreaterThanOrEqual(2)
    for (const identity of current.identities) {
      expect(Object.hasOwn(identity, 'childLaunchEntered')).toBe(false)
      expect(Object.hasOwn(identity, 'originalStartState')).toBe(false)
    }
    const expectedKinds = mode.includes('launch-failure')
      ? ['TRANSPORT_STARTUP', 'TRANSPORT_FENCED']
      : mode === 'pending-launch-cancel'
        ? ['TRANSPORT_STARTUP', 'TRANSPORT_DRAINED_UNCERTAIN']
        : ['TRANSPORT_STARTUP', 'TRANSPORT_READY', 'TRANSPORT_ACTIVE', 'TRANSPORT_DRAINED_UNCERTAIN']
    expect(current.payloads.map(payload => payload.data.kind)).toEqual(expectedKinds)
    expect(current.diagnostics[0]).toMatchObject({
      snapshot: { originalStartState: 'PENDING', childLaunchEntered: false },
    })
    expect(current.diagnostics.at(-1)).toMatchObject({
      snapshot: {
        originalStartState: mode === 'active-drain' ? 'FULFILLED' : 'PENDING',
        childLaunchEntered: true,
      },
    })
    expect(current.final.originalStartState).toBe(
      mode.includes('launch-failure') || mode === 'pending-launch-cancel' ? 'REJECTED' : 'FULFILLED',
    )
    expect(current.childStopCalls).toBe(baseline.childStopCalls)
    if (mode === 'pending-launch-cancel') {
      // Existing readyOwnedChild and stopFlight both invoke child.stop; the real owned child memoizes its cleanup.
      expect(current.childStopCalls).toBe(2)
      expect(current.requestCalls).toBe(0)
      expect(baseline.requestCalls).toBe(0)
      expect(current.final.state).toBe(baseline.final.state)
      expect(current.final.reason).toBe(baseline.final.reason)
    }
  })
})
