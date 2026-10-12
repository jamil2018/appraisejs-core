import { fork, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ownerPath = fileURLToPath(new URL('./c233-restart-owner.ts', import.meta.url))
const timeoutMs = 20_000

type Scope = {
  journeyId: string
  targetProjectId: string
  discoveryRevisionId: string
  sessionId: string
}
type OwnerMessage =
  | { phase: 'OWNER_READY'; scope: Scope; browserPid: number }
  | { phase: 'GRACEFUL_CLEANUP_COMPLETE'; browserPid: number; browserProcess: 'CLOSED' }
  | { phase: 'OWNER_FAILED'; code: 'INITIALIZATION_FAILED' | 'CLEANUP_FAILED' }
type ObserverMessage =
  | { phase: 'OLD_SCOPE_REJECTED'; lookup: 'NOT_FOUND'; capture: 'NOT_FOUND' }
  | { phase: 'OBSERVER_FAILED'; code: 'OLD_SCOPE_WAS_AVAILABLE' | 'UNEXPECTED_LOOKUP_FAILURE' }

export type C233GracefulRestartQualification = {
  qualification: 'SYNTHETIC_GRACEFUL_OWNER_RESTART_V1'
  ownerExit: 'EXITED_BEFORE_FRESH_PROCESS'
  browserProcess: 'CLOSED'
  scopeInvalidation: 'NOT_FOUND_AFTER_GRACEFUL_OWNER_RESTART'
}

function browserIsAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

async function waitForBrowserExit(pid: number, deadline = Date.now() + 5_000) {
  while (Date.now() < deadline) {
    if (!browserIsAlive(pid)) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  if (browserIsAlive(pid)) throw new Error('C2.3.3 owner cleanup left the synthetic Chromium process alive.')
}

function waitForExit(child: ChildProcess, label: string, timeout = timeoutMs) {
  return new Promise<void>((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      reject(new Error(`C2.3.3 ${label} did not exit within ${timeout}ms.`))
    }, timeout)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function waitForMessage<T extends { phase: string }, P extends T['phase']>(
  child: ChildProcess,
  expected: P,
  label: string,
) {
  return new Promise<Extract<T, { phase: P }>>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`C2.3.3 ${label} did not report ${expected} within ${timeoutMs}ms.`))
    }, timeoutMs)
    const onMessage = (message: T) => {
      if (!message || typeof message !== 'object') return
      if (message.phase === 'OWNER_FAILED' || message.phase === 'OBSERVER_FAILED') {
        cleanup()
        const code =
          'code' in message && typeof (message as { code?: unknown }).code === 'string'
            ? (message as unknown as { code: string }).code
            : 'UNKNOWN_FAILURE'
        reject(new Error(`C2.3.3 ${label} reported ${message.phase}:${code}.`))
      } else if (message.phase === expected) {
        cleanup()
        resolve(message as Extract<T, { phase: P }>)
      }
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const cleanup = () => {
      clearTimeout(timer)
      child.off('message', onMessage)
      child.off('error', onError)
    }
    child.on('message', onMessage)
    child.on('error', onError)
  })
}

async function terminateChild(child: ChildProcess, browserPid?: number) {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      waitForExit(child, 'owner cleanup', 5_000).catch(() => undefined),
      new Promise(resolve => setTimeout(resolve, 5_000)),
    ])
  }
  if (browserPid && browserIsAlive(browserPid)) {
    process.kill(browserPid, 'SIGTERM')
    await waitForBrowserExit(browserPid).catch(() => undefined)
  }
}

function child(args: string[] = []) {
  return fork(ownerPath, args, {
    cwd: process.cwd(),
    execArgv: ['--import', 'tsx/esm'],
    env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '' },
    silent: true,
  })
}

/**
 * Mechanical C2.3.3 evidence only: a synthetic, anonymous session owned by a
 * real Chromium child is gracefully closed before a fresh process rejects it.
 * It is not evidence of a human authenticated crash or restart.
 */
export async function qualifyC233GracefulOwnerRestart(): Promise<C233GracefulRestartQualification> {
  const owner = child()
  let browserPid: number | undefined
  try {
    const ready = await waitForMessage<OwnerMessage, 'OWNER_READY'>(owner, 'OWNER_READY', 'owner')
    browserPid = ready.browserPid
    owner.send({ phase: 'GRACEFUL_SHUTDOWN' })
    const cleaned = await waitForMessage<OwnerMessage, 'GRACEFUL_CLEANUP_COMPLETE'>(
      owner,
      'GRACEFUL_CLEANUP_COMPLETE',
      'owner',
    )
    await waitForExit(owner, 'owner')
    if (cleaned.browserPid !== browserPid || browserIsAlive(browserPid))
      throw new Error('C2.3.3 owner exited without closing the synthetic Chromium process.')

    const observer = child(['fresh-observer'])
    try {
      observer.send({ phase: 'VERIFY_OLD_SCOPE', scope: ready.scope })
      const rejected = await waitForMessage<ObserverMessage, 'OLD_SCOPE_REJECTED'>(
        observer,
        'OLD_SCOPE_REJECTED',
        'fresh observer',
      )
      await waitForExit(observer, 'fresh observer')
      if (rejected.lookup !== 'NOT_FOUND' || rejected.capture !== 'NOT_FOUND')
        throw new Error('C2.3.3 fresh process did not reject the old synthetic session scope.')
    } finally {
      await terminateChild(observer)
    }
    return {
      qualification: 'SYNTHETIC_GRACEFUL_OWNER_RESTART_V1',
      ownerExit: 'EXITED_BEFORE_FRESH_PROCESS',
      browserProcess: 'CLOSED',
      scopeInvalidation: 'NOT_FOUND_AFTER_GRACEFUL_OWNER_RESTART',
    }
  } finally {
    await terminateChild(owner, browserPid)
  }
}
