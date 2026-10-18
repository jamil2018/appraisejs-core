import { R27_INSTALLED_HOST_FILE, verifyR27HostFile } from '../codex-app-server-m02-ta-matrix-r27/host-file.mjs'
import { verifyQualifiedGitFile } from './git-readiness.mjs'
import { createOwnedHostObserver } from '../codex-app-server-m02-ta-owned-host-observer/observer.mjs'
export const R33_INSTALLED_HOST_FILE = R27_INSTALLED_HOST_FILE
export async function verifyR33HostFile() {
  const host = await verifyR27HostFile()
  await verifyQualifiedGitFile()
  return host
}
export function createR33OwnedHostObserver(options) {
  const spawn = options.spawnOwnedCodex
  if (typeof spawn !== 'function') throw new Error('trusted spawn required')
  return createOwnedHostObserver({
    os: options.os,
    allowedDirectChildPaths: options.allowedDirectChildPaths,
    verifyHostPin: () => verifyR27HostFile(),
    maxPolls: 1,
    spawnOwnedCodex: async args => {
      await verifyQualifiedGitFile()
      return spawn(args)
    },
  })
}
