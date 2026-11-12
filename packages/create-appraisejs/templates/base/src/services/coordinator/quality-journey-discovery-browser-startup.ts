/** Fixed categories only: native errors, abort reasons and launch arguments stay private. */
export type DiscoveryBrowserStartupFailure =
  'ABORTED' | 'DEADLINE' | 'PROBE_LAUNCH_FAILED' | 'PROBE_CLOSE_FAILED' | 'STARTUP_FAILED'
export type DiscoveryBrowserStartupCleanup = 'OBSERVED' | 'UNKNOWN'
export type DiscoveryBrowserStartupPhase =
  'ADMISSION' | 'PROBE_LAUNCH' | 'PROBE_CLOSE' | 'PROFILE_CREATE' | 'OWNED_SPAWN' | 'PUBLICATION'
export const discoveryBrowserStartupAdmissionMs = 45_000

type Resource = { ready: Promise<unknown>; dispose(value: unknown): Promise<void>; closing?: Promise<void> }
const retainedStartups = new Set<DiscoveryBrowserStartupFlight>()

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, failed) => {
    resolve = done
    reject = failed
  })
  return { promise, resolve, reject }
}

export class DiscoveryBrowserStartupError extends Error {
  readonly cleanupStatus = 'UNKNOWN'
  constructor(
    readonly category: DiscoveryBrowserStartupFailure,
    readonly cleanup: Promise<DiscoveryBrowserStartupCleanup>,
    readonly phase: DiscoveryBrowserStartupPhase,
    readonly elapsedMs: number,
  ) {
    super(`Discovery browser startup failed: ${category}; cleanup must be observed separately.`)
    this.name = 'DiscoveryBrowserStartupError'
  }
}

export function boundedBrowserStartupStep<T>(pending: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  return Promise.race([
    pending,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Discovery browser startup step timed out.')), timeoutMs)
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/** Retains resource-producing promises after caller cancellation, including late native handles. */
export class DiscoveryBrowserStartupFlight {
  private readonly startedAt = performance.now()
  private phase: DiscoveryBrowserStartupPhase = 'ADMISSION'
  private state: 'OPEN' | 'FENCED' | 'PUBLISHED' = 'OPEN'
  private readonly failure = deferred<never>()
  private readonly resources: Resource[] = []
  private cleanupFlight?: Promise<DiscoveryBrowserStartupCleanup>
  private readonly timer?: NodeJS.Timeout
  private primary?: DiscoveryBrowserStartupError
  private readonly onAbort = () => this.fence('ABORTED')

  constructor(private readonly signal?: AbortSignal) {
    retainedStartups.add(this)
    void this.failure.promise.catch(() => undefined)
    if (signal?.aborted) this.fence('ABORTED')
    else {
      signal?.addEventListener('abort', this.onAbort, { once: true })
      this.timer = setTimeout(() => this.fence('DEADLINE'), discoveryBrowserStartupAdmissionMs)
    }
  }

  mark(phase: DiscoveryBrowserStartupPhase) {
    this.check()
    this.phase = phase
  }

  check() {
    if (this.state !== 'OPEN') throw this.primary ?? new Error('Discovery browser startup is no longer open.')
  }

  async acquire<T>(produce: () => Promise<T> | T, dispose: (value: T) => Promise<void>): Promise<T> {
    this.check()
    // Register before invoking a producer: it may synchronously trigger an abort.
    const ready = deferred<T>()
    const resource: Resource = { ready: ready.promise, dispose: value => dispose(value as T) }
    this.resources.push(resource)
    try {
      ready.resolve(await produce())
    } catch (error) {
      ready.reject(error)
    }
    // Every producer result, even one arriving after fencing, remains on the original resource record.
    const value = await Promise.race([ready.promise, this.failure.promise])
    this.check()
    return value
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    try {
      this.check()
      const pending = work()
      const result = await Promise.race([pending, this.failure.promise])
      this.check()
      this.state = 'PUBLISHED'
      this.detach()
      retainedStartups.delete(this)
      return result
    } catch (error) {
      this.fence(error instanceof DiscoveryBrowserStartupError ? error.category : 'STARTUP_FAILED')
      throw this.primary
    }
  }

  fence(category: DiscoveryBrowserStartupFailure) {
    if (this.state !== 'OPEN') return
    this.state = 'FENCED'
    this.detach()
    // Assign the shared cleanup flight before callbacks can reenter. The first microtask runs
    // after any synchronous resource producer has returned its original handle.
    this.cleanupFlight = Promise.resolve().then(() => this.drain())
    this.primary = new DiscoveryBrowserStartupError(
      category,
      this.cleanupFlight,
      this.phase,
      Math.round(performance.now() - this.startedAt),
    )
    this.failure.reject(this.primary)
  }

  private async drain(): Promise<DiscoveryBrowserStartupCleanup> {
    let observed = true
    for (const resource of [...this.resources].reverse()) {
      try {
        const value = await resource.ready
        resource.closing ??= Promise.resolve().then(() => resource.dispose(value))
        await resource.closing
      } catch {
        observed = false
      }
    }
    if (observed) retainedStartups.delete(this)
    return observed ? 'OBSERVED' : 'UNKNOWN'
  }

  private detach() {
    if (this.timer) clearTimeout(this.timer)
    this.signal?.removeEventListener('abort', this.onAbort)
  }
}
