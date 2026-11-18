import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'

type ProcessIdentity = Readonly<{ pid: number; ppid: number; birthSec: number; birthUsec: number }>
type DirectForkWatch = Readonly<{ exitedWithoutForking(): boolean; close(): void }>
type NativeProcessMetadata = Readonly<{
  identity(pid: number): ProcessIdentity | null
  listDirectChildren(pid: number): number[]
  directChildMetadata(parentPid: number, pid: number): (ProcessIdentity & { path: string }) | null
  watchDirectForks?(pid: number): DirectForkWatch
}>

function sameBirth(a: ProcessIdentity, b: ProcessIdentity) {
  return a.pid === b.pid && a.birthSec === b.birthSec && a.birthUsec === b.birthUsec
}

function watchBeforeFirstRequest(metadata: NativeProcessMetadata, parent: ProcessIdentity) {
  let watch: DirectForkWatch | undefined
  try {
    watch = metadata.watchDirectForks?.(parent.pid)
    if (watch) {
      const registered = metadata.identity(parent.pid)
      if (
        registered &&
        sameBirth(parent, registered) &&
        registered.ppid === parent.ppid &&
        metadata.listDirectChildren(parent.pid).length === 0
      )
        return watch
    }
  } catch {
    // An unavailable watch cannot prove that the lazy host was never acquired.
  }
  watch?.close()
  return undefined
}

function verifyExitWithoutFork(watch: DirectForkWatch | undefined, deadline: number) {
  return Date.now() < deadline && watch?.exitedWithoutForking() ? ('NATIVE_EXIT_NO_FORK' as const) : false
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
  const forkWatch = watchBeforeFirstRequest(metadata, parent)
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
    close() {
      clearInterval(sampler)
      forkWatch?.close()
    },
    async verifyGone(deadline: number) {
      clearInterval(sampler)
      if (uncertain) return false
      if (!host) return verifyExitWithoutFork(forkWatch, deadline)
      while (Date.now() < deadline) {
        const current = metadata.identity(host.pid)
        if (!current || !sameBirth(host, current)) return 'OBSERVED_HOST_GONE' as const
        await delay(25)
      }
      return false
    },
  })
}
