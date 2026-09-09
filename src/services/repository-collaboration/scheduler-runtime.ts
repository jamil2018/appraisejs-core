import { runCollaborationSchedulerTick } from './queue-service'

export const COLLABORATION_SCHEDULER_INTERVAL_MS = 5 * 60 * 1_000

export interface CollaborationSchedulerTimer {
  unref?: () => void
}

export interface CollaborationSchedulerDependencies {
  tick?: () => Promise<unknown>
  setInterval?: (callback: () => void, intervalMs: number) => CollaborationSchedulerTimer
  clearInterval?: (timer: CollaborationSchedulerTimer) => void
  reportFailure?: (message: string) => void
}

interface CollaborationScheduler {
  startup: Promise<void>
  start(): void
  stop(): void
  tick(): Promise<void>
}

const schedulerStateKey = '__appraiseRepositoryCollaborationScheduler__'
const schedulerFailureMessage = 'Repository collaboration scheduler tick failed.'

type SchedulerGlobal = typeof globalThis & {
  [schedulerStateKey]?: CollaborationScheduler
}

function defaultReportFailure(message: string) {
  console.error(message)
}

/**
 * Creates a process-local scheduler with injectable time and I/O edges. The
 * timer only reconciles persisted, currently due collaboration state; it does
 * not start, wake, or otherwise control external workers.
 */
function createCollaborationScheduler(
  dependencies: CollaborationSchedulerDependencies = {},
): CollaborationScheduler {
  const runTick = dependencies.tick ?? (() => runCollaborationSchedulerTick())
  const setTimer = dependencies.setInterval ?? ((callback, intervalMs) => setInterval(callback, intervalMs))
  const clearTimer = dependencies.clearInterval ?? (timer => clearInterval(timer as ReturnType<typeof setInterval>))
  const reportFailure = dependencies.reportFailure ?? defaultReportFailure

  let active = false
  let timer: CollaborationSchedulerTimer | undefined
  let pending: Promise<void> | undefined

  const scheduler: CollaborationScheduler = {
    startup: Promise.resolve(),
    start() {
      if (active) return
      active = true
      timer = setTimer(() => void scheduler.tick(), COLLABORATION_SCHEDULER_INTERVAL_MS)
      timer.unref?.()
      scheduler.startup = scheduler.tick()
    },
    stop() {
      active = false
      if (!timer) return
      clearTimer(timer)
      timer = undefined
    },
    tick() {
      if (!active) return Promise.resolve()
      if (pending) return pending
      const current = Promise.resolve(runTick())
        .then(() => undefined)
        .catch(() => {
          try {
            reportFailure(schedulerFailureMessage)
          } catch {
            // Reporting must never turn a background reconciliation failure
            // into a process-level failure.
          }
        })
        .finally(() => {
          pending = undefined
        })
      pending = current
      return current
    },
  }

  return scheduler
}

/** Starts one hot-reload-safe scheduler for the current Node process. */
export function startCollaborationScheduler(dependencies: CollaborationSchedulerDependencies = {}) {
  const globalState = globalThis as SchedulerGlobal
  const existing = globalState[schedulerStateKey]
  if (existing) return existing
  const scheduler = createCollaborationScheduler(dependencies)
  globalState[schedulerStateKey] = scheduler
  scheduler.start()
  return scheduler
}

/** Stops the current process-local scheduler, primarily for orderly shutdown and tests. */
export function stopCollaborationScheduler() {
  const globalState = globalThis as SchedulerGlobal
  const scheduler = globalState[schedulerStateKey]
  if (!scheduler) return
  scheduler.stop()
  delete globalState[schedulerStateKey]
}

/** Runs the current scheduler immediately without creating a new timer. */
export function tickCollaborationScheduler() {
  return (globalThis as SchedulerGlobal)[schedulerStateKey]?.tick() ?? Promise.resolve()
}
