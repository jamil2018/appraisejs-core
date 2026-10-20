import assert from 'node:assert/strict'
import { constants } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  createOwnedScratchProofIssuer,
  T3_SCRATCH_ROOT,
} from './fixtures/codex-app-server-m02-ta-workspace-r10/owned-scratch-proof.mjs'

const manifestDigest = 'a'.repeat(64)
const expected = { N01: 'M02-TA-N01\n', N02: 'M02-TA-N02\n' }

function fixture(caseId = 'N01') {
  const entries = new Map()
  const calls = { lstat: [], open: [], reads: 0, readLengths: [], closes: 0 }
  const owner = BigInt(process.getuid())
  let nextInode = 10n
  let currentCase = caseId
  let readHook = null
  const caseRoot = join(T3_SCRATCH_ROOT, 'cases', caseId)
  const workspace = join(caseRoot, 'workspace')
  const scratch = join(workspace, 'scratch')
  const file = join(scratch, `${caseId.toLowerCase()}.txt`)
  const dirs = [T3_SCRATCH_ROOT, join(T3_SCRATCH_ROOT, 'cases'), caseRoot, workspace, scratch]
  const entry = (type, props = {}) => ({
    type,
    dev: 1n,
    ino: nextInode++,
    uid: owner,
    mode: type === 'dir' ? 0o40700n : type === 'symlink' ? 0o120777n : 0o100600n,
    nlink: type === 'dir' ? 2n : 1n,
    bytes: Buffer.alloc(0),
    mtimeNs: 1n,
    ctimeNs: 1n,
    ...props,
  })
  for (const path of dirs) entries.set(path, entry('dir'))
  const stat = value => ({
    dev: value.dev,
    ino: value.ino,
    uid: value.uid,
    mode: value.mode,
    nlink: value.nlink,
    size: BigInt(value.bytes.length),
    mtimeNs: value.mtimeNs,
    ctimeNs: value.ctimeNs,
    isDirectory: () => value.type === 'dir',
    isFile: () => value.type === 'file',
    isSymbolicLink: () => value.type === 'symlink',
  })
  const errors = new Map()
  const fileSystem = {
    async lstat(path) {
      calls.lstat.push(path)
      if (errors.has(path)) throw Object.assign(new Error('synthetic lstat error'), { code: errors.get(path) })
      const value = entries.get(path)
      if (!value) throw Object.assign(new Error('synthetic missing'), { code: 'ENOENT' })
      return stat(value)
    },
    async open(path, flags) {
      calls.open.push([path, flags])
      assert.ok(flags & constants.O_NOFOLLOW)
      const value = entries.get(path)
      if (!value) throw Object.assign(new Error('synthetic missing'), { code: 'ENOENT' })
      if (value.type === 'symlink') throw Object.assign(new Error('synthetic symlink'), { code: 'ELOOP' })
      if (flags & constants.O_DIRECTORY && value.type !== 'dir') throw new Error('synthetic non-directory')
      let closed = false
      return {
        async stat() {
          if (closed) throw new Error('closed handle')
          return stat(value)
        },
        async read(buffer, _offset, length) {
          if (closed) throw new Error('closed handle')
          calls.reads++
          calls.readLengths.push(length)
          const bytesRead = Math.min(value.bytes.length, length)
          value.bytes.copy(buffer, 0, 0, bytesRead)
          if (readHook) readHook()
          return { bytesRead, buffer }
        },
        async close() {
          if (!closed) calls.closes++
          closed = true
        },
      }
    },
  }
  const issuer = createOwnedScratchProofIssuer({ fileSystem, activeCase: () => currentCase })
  const putFile = (content = expected[caseId], props = {}) =>
    entries.set(file, entry('file', { bytes: Buffer.from(content), ...props }))
  return {
    issuer,
    entries,
    errors,
    calls,
    dirs,
    file,
    entry,
    putFile,
    onRead: callback => {
      readHook = callback
    },
    setActive: value => {
      currentCase = value
    },
  }
}

test('N01 and N02 issue one branded proof from a bounded owned read', async () => {
  for (const caseId of ['N01', 'N02']) {
    const f = fixture(caseId)
    const token = await f.issuer.prepare({ caseId, manifestDigest })
    assert.equal(f.calls.lstat.at(-1), f.dirs.at(-1)) // parent anchors rechecked after ENOENT
    f.putFile()
    const proof = await f.issuer.verify({ token, caseId, manifestDigest })
    assert.equal(proof.caseId, caseId)
    assert.equal(proof.relativePath, `scratch/${caseId.toLowerCase()}.txt`)
    assert.equal(proof.bytes, expected[caseId])
    assert.equal(proof.absentBefore, true)
    assert.equal(proof.ownedRegularSingleLink, true)
    assert.equal(proof.runtimeQualified, false)
    assert.equal(proof.evidenceProvenance, 'OWNED_SCRATCH_FD_READ_V1')
    assert.match(proof.contentSha256, /^[a-f0-9]{64}$/)
    assert.equal(f.issuer.verifyIssuedWorkspaceProof(proof, { caseId, manifestDigest }), true)
    assert.equal(f.issuer.verifyIssuedWorkspaceProof({ ...proof }, { caseId, manifestDigest }), false)
    assert.equal(f.calls.reads, 1)
    assert.deepEqual(f.calls.readLengths, [1025])
    assert.equal(f.calls.open.length, 6) // five held directory anchors and one no-follow file
    await assert.rejects(f.issuer.verify({ token, caseId, manifestDigest }), /UNISSUED_OR_CONSUMED_TOKEN/)
    await assert.rejects(f.issuer.prepare({ caseId, manifestDigest }), /PREPARATION_ALREADY_ATTEMPTED/)
  }
})

test('foreign case, unissued token/proof, and changed active case fail closed', async () => {
  const f = fixture()
  await assert.rejects(f.issuer.prepare({ caseId: 'X99', manifestDigest }), /CASE_OR_MANIFEST_INVALID/)
  assert.deepEqual(f.calls.lstat, [])
  await assert.rejects(f.issuer.verify({ token: {}, caseId: 'N01', manifestDigest }), /UNISSUED_OR_CONSUMED_TOKEN/)
  assert.equal(f.issuer.verifyIssuedWorkspaceProof({}, { caseId: 'N01', manifestDigest }), false)
  const token = await f.issuer.prepare({ caseId: 'N01', manifestDigest })
  f.putFile()
  f.setActive('N02')
  await assert.rejects(f.issuer.verify({ token, caseId: 'N01', manifestDigest }), /FOREIGN_ACTIVE_CASE/)
  await assert.rejects(f.issuer.verify({ token, caseId: 'N01', manifestDigest }), /UNISSUED_OR_CONSUMED_TOKEN/)
  const mismatch = fixture()
  const mismatchToken = await mismatch.issuer.prepare({ caseId: 'N01', manifestDigest })
  mismatch.putFile()
  await assert.rejects(
    mismatch.issuer.verify({ token: mismatchToken, caseId: 'N01', manifestDigest: 'b'.repeat(64) }),
    /TOKEN_BINDING_MISMATCH/,
  )
})

test('preparation accepts only true ENOENT and never retries a failed case', async () => {
  const existing = fixture()
  existing.putFile()
  await assert.rejects(existing.issuer.prepare({ caseId: 'N01', manifestDigest }), /SCRATCH_ALREADY_EXISTS/)
  await assert.rejects(existing.issuer.prepare({ caseId: 'N01', manifestDigest }), /PREPARATION_ALREADY_ATTEMPTED/)
  const uncertain = fixture()
  uncertain.errors.set(uncertain.file, 'EACCES')
  await assert.rejects(uncertain.issuer.prepare({ caseId: 'N01', manifestDigest }), /synthetic lstat error/)
  assert.equal(uncertain.calls.closes, 5)
})

test('root and scratch ancestors require exact owner, mode, device, type and stable identity', async () => {
  for (const mutation of [
    value => {
      value.type = 'symlink'
    },
    value => {
      value.mode = 0o40755n
    },
    value => {
      value.mode = 0o41700n
    },
    value => {
      value.uid = 999999n
    },
    value => {
      value.dev = 2n
    },
  ]) {
    const f = fixture()
    mutation(f.entries.get(f.dirs.at(-1)))
    await assert.rejects(f.issuer.prepare({ caseId: 'N01', manifestDigest }), /DIRECTORY_NOT_OWNED/)
  }
  const replaced = fixture()
  const token = await replaced.issuer.prepare({ caseId: 'N01', manifestDigest })
  replaced.putFile()
  replaced.entries.set(replaced.dirs.at(-1), replaced.entry('dir'))
  await assert.rejects(replaced.issuer.verify({ token, caseId: 'N01', manifestDigest }), /DIRECTORY_IDENTITY_CHANGED/)
})

test('after action, symlink, hardlink, mode, owner, device, and wrong bytes fail', async () => {
  const variants = [
    { type: 'symlink' },
    { nlink: 2n },
    { mode: 0o100644n },
    { mode: 0o101600n },
    { uid: 999999n },
    { dev: 2n },
    { bytes: Buffer.from('wrong\n') },
  ]
  for (const variant of variants) {
    const f = fixture()
    const token = await f.issuer.prepare({ caseId: 'N01', manifestDigest })
    f.putFile(expected.N01, variant)
    await assert.rejects(f.issuer.verify({ token, caseId: 'N01', manifestDigest }), /SCRATCH_/)
    assert.equal(f.issuer.verifyIssuedWorkspaceProof({}, { caseId: 'N01', manifestDigest }), false)
    await assert.rejects(f.issuer.verify({ token, caseId: 'N01', manifestDigest }), /UNISSUED_OR_CONSUMED_TOKEN/)
  }
})

test('one read is bounded to 1025 bytes and a verified proof cannot be reissued', async () => {
  const oversized = fixture()
  const token = await oversized.issuer.prepare({ caseId: 'N01', manifestDigest })
  oversized.putFile('x'.repeat(1025))
  await assert.rejects(oversized.issuer.verify({ token, caseId: 'N01', manifestDigest }), /SCRATCH_FILE_NOT_OWNED/)
  assert.equal(oversized.calls.reads, 0)
  const f = fixture()
  const token2 = await f.issuer.prepare({ caseId: 'N01', manifestDigest })
  f.putFile()
  await f.issuer.abandon(token2)
  assert.equal(f.calls.closes, 5)
  await assert.rejects(f.issuer.verify({ token: token2, caseId: 'N01', manifestDigest }), /UNISSUED_OR_CONSUMED_TOKEN/)
})

test('missing or replaced post-action file never yields a proof', async () => {
  const missing = fixture()
  const missingToken = await missing.issuer.prepare({ caseId: 'N01', manifestDigest })
  await assert.rejects(
    missing.issuer.verify({ token: missingToken, caseId: 'N01', manifestDigest }),
    error => error.code === 'ENOENT',
  )

  const replaced = fixture()
  const token = await replaced.issuer.prepare({ caseId: 'N01', manifestDigest })
  replaced.putFile()
  replaced.onRead(() => replaced.putFile())
  await assert.rejects(
    replaced.issuer.verify({ token, caseId: 'N01', manifestDigest }),
    /SCRATCH_FILE_IDENTITY_CHANGED/,
  )
  assert.equal(replaced.calls.reads, 1)
})
