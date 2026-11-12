import {
  boundedBrowserStartupStep,
  DiscoveryBrowserStartupError,
} from '@/services/coordinator/quality-journey-discovery-browser-startup'

type Closable = { close(): Promise<unknown> }
type Record = { ready: Promise<Closable>; closing?: Promise<unknown> }
const retainedOwners = new Set<DiscoveryBrowserTestOwner>()

/** One case owns all of its pending results, including results arriving after hook timeout. */
export class DiscoveryBrowserTestOwner {
  private readonly controller = new AbortController()
  private readonly records: Record[] = []
  private failure?: Pick<DiscoveryBrowserStartupError, 'category' | 'phase' | 'elapsedMs' | 'cleanupStatus'>
  private ended = false
  private cleanupFlight?: Promise<void>

  constructor() {
    retainedOwners.add(this)
  }

  acquire<T extends Closable>(produce: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.ended) return Promise.reject(new Error('Discovery browser test owner is closed.'))
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const ready = new Promise<T>((done, failed) => {
      resolve = done
      reject = failed
    })
    const record: Record = { ready }
    this.records.push(record)
    try {
      void produce(this.controller.signal).then(resolve, reject)
    } catch (error) {
      reject(error)
    }
    const result = ready.then(async value => {
      if (this.ended) {
        await this.closeRecord(record, value)
        throw new Error('Discovery browser test owner ended before resource publication.')
      }
      return value
    })
    void result.catch(error => {
      if (error instanceof DiscoveryBrowserStartupError)
        this.failure = {
          category: error.category,
          phase: error.phase,
          elapsedMs: error.elapsedMs,
          cleanupStatus: error.cleanupStatus,
        }
    })
    return result
  }

  diagnostic() {
    return this.failure
  }

  clearTimerOnCleanup(timer: Parameters<typeof clearTimeout>[0]) {
    const value = { close: async () => clearTimeout(timer) }
    const record: Record = { ready: Promise.resolve(value) }
    this.records.push(record)
    if (this.ended) void this.closeRecord(record, value).catch(() => undefined)
  }

  abort() {
    if (this.ended) return
    this.ended = true
    // Install custody before abort callbacks run; they can synchronously reenter teardown.
    this.cleanupFlight = Promise.resolve().then(() => this.cleanup())
    void this.cleanupFlight.catch(() => undefined)
    this.controller.abort()
  }

  async drain(timeoutMs = 45_000) {
    this.abort()
    try {
      await boundedBrowserStartupStep(this.cleanupFlight!, timeoutMs)
    } catch {
      throw new Error('Discovery browser test cleanup is UNKNOWN; original owner retains late results.')
    }
  }

  private closeRecord(record: Record, value: Closable) {
    record.closing ??= Promise.resolve().then(() => value.close())
    return record.closing
  }

  private async cleanup() {
    let unknown = false
    for (const record of [...this.records].reverse()) {
      try {
        await this.closeRecord(record, await record.ready)
      } catch (error) {
        if (!(error instanceof DiscoveryBrowserStartupError) || (await error.cleanup) !== 'OBSERVED') unknown = true
      }
    }
    if (unknown) throw new Error('Discovery browser test cleanup is UNKNOWN.')
    retainedOwners.delete(this)
  }
}
