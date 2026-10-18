/** T3 exact-artifact preparation API. Import and verify are read-only; writer is never called offline. */
import fsp from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digest } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { prepareWorkspaceManifest, T3_HELPER_BLOCKER } from './manifest.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
export const WORKSPACE_BUILD = join(REPO, '.appraisejs/m02-ta-workspace-build-r10')
export const WORKSPACE_MANIFEST = join(WORKSPACE_BUILD, 'manifest.json')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

/** No writer authority exists while the transient helper criterion cannot be observed. */
export async function writeWorkspacePreparation() {
  // N01 transient helper lifetimes cannot be attested by the current owned observer.
  throw new Error(`T3 preparation blocked: ${T3_HELPER_BLOCKER}`)
}

export async function verifyWorkspacePreparation() {
  const prepared = await prepareWorkspaceManifest()
  if (prepared.blockers?.includes(T3_HELPER_BLOCKER))
    throw new Error(`T3 runtime qualification blocked: ${T3_HELPER_BLOCKER}`)
  const directory = await fsp.lstat(WORKSPACE_BUILD)
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== process.getuid() ||
    (directory.mode & 0o777) !== 0o700
  )
    throw new Error('T3 preparation directory identity changed')
  const state = await fsp.lstat(WORKSPACE_MANIFEST)
  if (
    !state.isFile() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid() ||
    state.nlink !== 1 ||
    (state.mode & 0o777) !== 0o600
  )
    throw new Error('T3 preparation manifest identity changed')
  const bytes = await fsp.readFile(WORKSPACE_MANIFEST)
  const envelope = JSON.parse(bytes)
  if (
    envelope.schema !== 'appraise.m02-ta-workspace-r10-preparation/v1' ||
    envelope.manifestDigest !== prepared.manifestDigest ||
    envelope.manifestDigest !== digest(envelope.manifest) ||
    sha(Buffer.from(JSON.stringify(envelope.manifest))) !== sha(Buffer.from(JSON.stringify(prepared.manifest))) ||
    envelope.canonicalSha256 !== prepared.canonicalSha256 ||
    envelope.runtimeEligible !== false ||
    envelope.exactArtifactReviewRequired !== true ||
    envelope.blockers?.length !== 0
  )
    throw new Error('T3 preparation drift')
  return Object.freeze({
    manifest: envelope.manifest,
    manifestDigest: envelope.manifestDigest,
    manifestFileSha256: sha(bytes),
    seal: prepared.seal,
    runtimeEligible: false,
    blockers: [],
  })
}
