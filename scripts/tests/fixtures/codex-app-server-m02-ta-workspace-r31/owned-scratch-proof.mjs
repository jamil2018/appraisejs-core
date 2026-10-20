import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'

export const T3_SCRATCH_ROOT = '/private/tmp/appraise-m02-ta-workspace-p2'
const cases = Object.freeze({ N01: 'M02-TA-N01\n', N02: 'M02-TA-N02\n' })
const provenance = 'OWNED_SCRATCH_FD_READ_V1'

function fail(code) {
  throw new Error(`scratch proof ${code}`)
}

function exactInteger(value) {
  if (typeof value === 'bigint') return value
  if (Number.isSafeInteger(value)) return BigInt(value)
  fail('INEXACT_METADATA')
}

function metadata(stat) {
  return {
    dev: exactInteger(stat.dev),
    ino: exactInteger(stat.ino),
    uid: exactInteger(stat.uid),
    mode: exactInteger(stat.mode),
    nlink: exactInteger(stat.nlink),
    size: exactInteger(stat.size),
    mtimeNs: stat.mtimeNs === undefined ? null : exactInteger(stat.mtimeNs),
    ctimeNs: stat.ctimeNs === undefined ? null : exactInteger(stat.ctimeNs),
  }
}

function sameMetadata(a, b) {
  const left = metadata(a)
  const right = metadata(b)
  return Object.keys(left).every(key => left[key] === right[key])
}

function sameDirectory(a, b) {
  const left = metadata(a)
  const right = metadata(b)
  return ['dev', 'ino', 'uid', 'mode', 'nlink'].every(key => left[key] === right[key])
}

function ownedDirectory(stat, owner, rootDev = null) {
  const item = metadata(stat)
  return (
    stat.isDirectory() &&
    !stat.isSymbolicLink() &&
    item.uid === owner &&
    (item.mode & 0o7777n) === 0o700n &&
    (rootDev === null || item.dev === rootDev)
  )
}

function ownedFile(stat, owner, rootDev) {
  const item = metadata(stat)
  return (
    stat.isFile() &&
    !stat.isSymbolicLink() &&
    item.uid === owner &&
    item.dev === rootDev &&
    (item.mode & 0o7777n) === 0o600n &&
    item.nlink === 1n &&
    item.size <= 1024n
  )
}

async function closeAnchors(anchors) {
  const results = await Promise.allSettled(anchors.map(anchor => anchor.handle.close()))
  if (results.some(result => result.status === 'rejected')) fail('ANCHOR_CLOSE_UNCERTAIN')
}

/**
 * Real filesystem calls happen only when the trusted T3 supervisor invokes prepare/verify.
 * A supplied activeCase port must read its current coordinator state; no caller boolean attests an action.
 */
export function createOwnedScratchProofIssuer({ fileSystem = fs, activeCase } = {}) {
  if (typeof activeCase !== 'function') fail('ACTIVE_CASE_PORT_REQUIRED')
  if (typeof fileSystem?.lstat !== 'function' || typeof fileSystem.open !== 'function') fail('FILESYSTEM_PORT_REQUIRED')
  const owner = BigInt(process.getuid())
  const attempted = new Set()
  const tokens = new WeakMap()
  const proofs = new WeakMap()

  const checkActive = caseId => {
    if (activeCase() !== caseId) fail('FOREIGN_ACTIVE_CASE')
  }
  const casePaths = caseId => {
    const caseRoot = join(T3_SCRATCH_ROOT, 'cases', caseId)
    const workspace = join(caseRoot, 'workspace')
    const scratch = join(workspace, 'scratch')
    return {
      directories: [T3_SCRATCH_ROOT, join(T3_SCRATCH_ROOT, 'cases'), caseRoot, workspace, scratch],
      file: join(scratch, `${caseId.toLowerCase()}.txt`),
      relativePath: `scratch/${caseId.toLowerCase()}.txt`,
    }
  }
  const checkAnchors = async state => {
    for (const anchor of state.anchors) {
      const current = await fileSystem.lstat(anchor.path, { bigint: true })
      const held = await anchor.handle.stat({ bigint: true })
      if (
        !ownedDirectory(current, owner, state.rootDev) ||
        !ownedDirectory(held, owner, state.rootDev) ||
        !sameDirectory(current, anchor.stat) ||
        !sameDirectory(held, anchor.stat)
      )
        fail('DIRECTORY_IDENTITY_CHANGED')
    }
  }

  return Object.freeze({
    async prepare({ caseId, manifestDigest }) {
      if (!Object.hasOwn(cases, caseId) || !/^[a-f0-9]{64}$/.test(manifestDigest ?? ''))
        fail('CASE_OR_MANIFEST_INVALID')
      checkActive(caseId)
      if (attempted.has(caseId)) fail('PREPARATION_ALREADY_ATTEMPTED')
      attempted.add(caseId)
      const paths = casePaths(caseId)
      const anchors = []
      try {
        let rootDev = null
        for (const path of paths.directories) {
          const before = await fileSystem.lstat(path, { bigint: true })
          if (!ownedDirectory(before, owner, rootDev)) fail('DIRECTORY_NOT_OWNED')
          if (rootDev === null) rootDev = metadata(before).dev
          const handle = await fileSystem.open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
          anchors.push({ path, handle, stat: before })
          const held = await handle.stat({ bigint: true })
          if (!ownedDirectory(held, owner, rootDev) || !sameDirectory(before, held)) fail('DIRECTORY_IDENTITY_CHANGED')
        }
        try {
          await fileSystem.lstat(paths.file, { bigint: true })
          fail('SCRATCH_ALREADY_EXISTS')
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
        }
        const state = { caseId, manifestDigest, paths, anchors, rootDev, consumed: false }
        await checkAnchors(state)
        const token = Object.freeze({})
        tokens.set(token, state)
        return token
      } catch (error) {
        await closeAnchors(anchors)
        throw error
      }
    },
    async assertPrepared({ token, caseId, manifestDigest }) {
      const state = tokens.get(token)
      if (!state || state.consumed) fail('UNISSUED_OR_CONSUMED_TOKEN')
      if (state.caseId !== caseId || state.manifestDigest !== manifestDigest) fail('TOKEN_BINDING_MISMATCH')
      checkActive(caseId)
      await checkAnchors(state)
      try {
        await fileSystem.lstat(state.paths.file, { bigint: true })
        fail('SCRATCH_ALREADY_EXISTS')
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      await checkAnchors(state)
      checkActive(caseId)
      return true
    },
    async verify({ token, caseId, manifestDigest }) {
      const state = tokens.get(token)
      if (!state || state.consumed) fail('UNISSUED_OR_CONSUMED_TOKEN')
      state.consumed = true // A failed or ambiguous read cannot be retried.
      let draft
      try {
        if (state.caseId !== caseId || state.manifestDigest !== manifestDigest) fail('TOKEN_BINDING_MISMATCH')
        checkActive(caseId)
        await checkAnchors(state)
        const before = await fileSystem.lstat(state.paths.file, { bigint: true })
        if (!ownedFile(before, owner, state.rootDev)) fail('SCRATCH_FILE_NOT_OWNED')
        const handle = await fileSystem.open(state.paths.file, constants.O_RDONLY | constants.O_NOFOLLOW)
        try {
          const held = await handle.stat({ bigint: true })
          if (!ownedFile(held, owner, state.rootDev) || !sameMetadata(before, held))
            fail('SCRATCH_FILE_IDENTITY_CHANGED')
          const buffer = Buffer.alloc(1025)
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
          if (bytesRead > 1024) fail('SCRATCH_BYTES_EXCEEDED')
          const bytes = buffer.subarray(0, bytesRead)
          const afterHeld = await handle.stat({ bigint: true })
          const afterPath = await fileSystem.lstat(state.paths.file, { bigint: true })
          if (!sameMetadata(before, afterHeld) || !sameMetadata(before, afterPath))
            fail('SCRATCH_FILE_IDENTITY_CHANGED')
          if (!bytes.equals(Buffer.from(cases[caseId], 'utf8'))) fail('SCRATCH_BYTES_MISMATCH')
          await checkAnchors(state)
          checkActive(caseId)
          draft = {
            caseId,
            manifestDigest,
            root: T3_SCRATCH_ROOT,
            relativePath: state.paths.relativePath,
            absentBefore: true,
            ownedRegularSingleLink: true,
            bytes: cases[caseId],
            contentSha256: createHash('sha256').update(bytes).digest('hex'),
            rootDevice: String(state.rootDev),
            rootInode: String(metadata(state.anchors[0].stat).ino),
            scratchInode: String(metadata(before).ino),
            evidenceProvenance: provenance,
            runtimeQualified: false,
          }
        } finally {
          await handle.close()
        }
      } finally {
        await closeAnchors(state.anchors)
      }
      const proof = Object.freeze(draft)
      proofs.set(proof, { caseId, manifestDigest })
      return proof
    },
    async abandon(token) {
      const state = tokens.get(token)
      if (!state || state.consumed) fail('UNISSUED_OR_CONSUMED_TOKEN')
      state.consumed = true
      await closeAnchors(state.anchors)
    },
    verifyIssuedWorkspaceProof(proof, { caseId, manifestDigest }) {
      const binding = proofs.get(proof)
      if (!binding || binding.caseId !== caseId || binding.manifestDigest !== manifestDigest) return false
      checkActive(caseId)
      proofs.delete(proof)
      return true
    },
  })
}
