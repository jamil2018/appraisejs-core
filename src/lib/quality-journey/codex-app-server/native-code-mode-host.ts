import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'

type ProcessIdentity = Readonly<{ pid: number; ppid: number; birthSec: number; birthUsec: number }>
type NativeProcessMetadata = Readonly<{
  identity(pid: number): ProcessIdentity | null
  listDirectChildren(pid: number): number[]
  directChildMetadata(parentPid: number, pid: number): (ProcessIdentity & { path: string }) | null
}>

function sameBirth(a: ProcessIdentity, b: ProcessIdentity) {
  return a.pid === b.pid && a.birthSec === b.birthSec && a.birthUsec === b.birthUsec
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
    },
    async verifyGone(deadline: number) {
      clearInterval(sampler)
      while (host && !uncertain && Date.now() < deadline) {
        const current = metadata.identity(host.pid)
        if (!current || !sameBirth(host, current)) return true
        await delay(25)
      }
      return false
    },
  })
}
