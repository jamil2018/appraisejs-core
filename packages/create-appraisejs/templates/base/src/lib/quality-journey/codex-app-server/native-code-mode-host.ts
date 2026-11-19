import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'

/** The reviewed producer can acquire its matching stdio host only through a session or enabled prewarm. */
export const nativeCodeModeBeforeTurnRelease = Object.freeze({
  native: 'f69d8040091fc4997fb37e7f5ada428ec2fd06656b66ff5a72b31e12e0e67c20',
  host: 'a9b25a40c8d5e00a3c30a6e1e1f5ce6224e7dd7bc3cdf46c2fe51483919ee4c8',
  packageMetadata: '3fcbea530e1e8e494c1a1e540b92a345ed15614c9f017b2910a730bcfd53a358',
})

type ProcessIdentity = Readonly<{ pid: number; ppid: number; birthSec: number; birthUsec: number }>
type DirectForkWatch = Readonly<{
  observeExit?(): 'EXIT_NO_FORK' | 'FORK_OBSERVED' | 'EXIT_UNPROVEN'
  exitedWithoutForking?(): boolean
  close(): void
}>
type NativeProcessMetadata = Readonly<{
  identity(pid: number): ProcessIdentity | null
  listDirectChildren(pid: number): number[]
  directChildMetadata(parentPid: number, pid: number): (ProcessIdentity & { path: string }) | null
  watchDirectForks?(pid: number): DirectForkWatch
}>

function sameBirth(a: ProcessIdentity, b: ProcessIdentity) {
  return a.pid === b.pid && a.birthSec === b.birthSec && a.birthUsec === b.birthUsec
}

function childrenExcludeCompanion(metadata: NativeProcessMetadata, parent: ProcessIdentity, hostPath?: string) {
  const children = metadata.listDirectChildren(parent.pid)
  if (hostPath === undefined) return children.length === 0
  return children.every(pid => {
    const child = metadata.directChildMetadata(parent.pid, pid)
    return child !== null && child.path !== hostPath
  })
}

function watchOriginalForks(metadata: NativeProcessMetadata, parent: ProcessIdentity, hostPath?: string) {
  let watch: DirectForkWatch | undefined
  try {
    watch = metadata.watchDirectForks?.(parent.pid)
    if (watch) {
      const registered = metadata.identity(parent.pid)
      if (
        registered &&
        sameBirth(parent, registered) &&
        registered.ppid === parent.ppid &&
        childrenExcludeCompanion(metadata, parent, hostPath)
      )
        return watch
    }
  } catch {
    // An unavailable watch cannot prove that the lazy host was never acquired.
  }
  watch?.close()
  return undefined
}

function verifyExitWithoutFork(watch: DirectForkWatch | undefined, deadline: number, afterStartup: boolean) {
  if (Date.now() >= deadline) return 'CLEANUP_DEADLINE' as const
  if (!watch) return 'CODE_MODE_FORK_WATCH_UNAVAILABLE' as const
  const evidence = watch.observeExit ? watch.observeExit() : watch.exitedWithoutForking?.() && 'EXIT_NO_FORK'
  if (evidence === 'EXIT_NO_FORK') return afterStartup ? 'NATIVE_EXIT_NO_FORK_AFTER_STARTUP' : 'NATIVE_EXIT_NO_FORK'
  if (evidence === 'FORK_OBSERVED') return 'CODE_MODE_FORK_OBSERVED' as const
  return 'CODE_MODE_EXIT_UNPROVEN' as const
}

/** Observe the original Codex child's companion. The host owns its own group and receives no signals here. */
export function observeNativeCodeModeHost(
  childPid: number,
  supervisorPid: number,
  hostPath: string,
  observerPath: string,
) {
  const metadata = createRequire(import.meta.url)(observerPath) as NativeProcessMetadata
  const originalParent = metadata.identity(childPid)
  if (!originalParent || originalParent.ppid !== supervisorPid) throw new Error('Original Code Mode parent unavailable')
  const parent = originalParent
  // The pinned local producer starts the companion lazily, after AppServer receives input.
  let forkWatch = watchOriginalForks(metadata, parent)
  let beforeTurnArmed = false,
    beforeTurnAttempted = false
  let host: ProcessIdentity | undefined
  let uncertain = false
  function observeChild(pid: number) {
    const child = metadata.directChildMetadata(childPid, pid)
    if (child?.path !== hostPath) return
    if (host && !sameBirth(host, child)) throw new Error('Unexpected Code Mode host replacement')
    host = child
  }
  function sample() {
    if (uncertain) return
    try {
      const current = metadata.identity(childPid)
      if (!current || !sameBirth(parent, current)) return
      for (const pid of metadata.listDirectChildren(childPid)) observeChild(pid)
    } catch {
      uncertain = true
    }
  }
  sample()
  const sampler = setInterval(sample, 25).unref()

  return Object.freeze({
    armBeforeFirstTurn() {
      if (beforeTurnAttempted) return
      beforeTurnAttempted = true
      const watch = watchOriginalForks(metadata, parent, hostPath)
      if (!watch) return
      forkWatch?.close()
      forkWatch = watch
      beforeTurnArmed = true
    },
    close() {
      clearInterval(sampler)
      forkWatch?.close()
    },
    async verifyGone(deadline: number) {
      clearInterval(sampler)
      // A terminal no-fork witness does not depend on a later metadata sample.
      if (!host) return verifyExitWithoutFork(forkWatch, deadline, beforeTurnArmed)
      if (uncertain) return 'CODE_MODE_COMPANION_UNPROVEN' as const
      while (Date.now() < deadline) {
        const current = metadata.identity(host.pid)
        if (!current || !sameBirth(host, current)) return 'OBSERVED_HOST_GONE' as const
        await delay(25)
      }
      return 'CLEANUP_DEADLINE' as const
    },
  })
}
