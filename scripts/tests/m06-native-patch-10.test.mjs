import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { applyExactPatch, defaultBundle, prepareNativePatch } from '../m06-native-patch-10.mjs'

function requireUpstreamSource(value) {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value))
    throw new Error('APPRAISE_M06_UPSTREAM_SOURCE must be a nonempty absolute path to the accepted authentic Git input')
  return value
}
const upstreamSource = requireUpstreamSource(process.env.APPRAISE_M06_UPSTREAM_SOURCE)

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const blob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
const roots = []
const originalPath = process.env.PATH
const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'm06-patch-tests-10-'))
roots.push(root)
const bin = path.join(root, 'bin')
fs.mkdirSync(bin)
// Only miniature fixture metadata is simulated. The separate frozen-source check
// uses the real Git executable. No fixture commits or native processes are created.
fs.writeFileSync(
  path.join(bin, 'git'),
  `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const index = args.indexOf('-C');
const root = args[index + 1];
const command = args.slice(index + 2);
const data = JSON.parse(fs.readFileSync(path.join(root, '.fixture-git.json')));
if (command[0] === 'rev-parse') process.stdout.write(command[1] === 'HEAD' ? data.revision : data.tree);
else if (command[0] === 'status') process.stdout.write(data.status);
else if (command[0] === 'ls-files') for (const entry of data.entries) process.stdout.write(entry.mode + ' ' + entry.blob + ' 0\\t' + entry.path + '\\0');
else process.exit(2);
`,
  { mode: 0o755 },
)

test.after(() => {
  process.env.PATH = originalPath
  for (const directory of roots) fs.rmSync(directory, { recursive: true, force: true })
})
function fixture() {
  const directory = fs.mkdtempSync(path.join(root, 'fixture-'))
  const source = path.join(directory, 'source'),
    bundle = path.join(directory, 'bundle')
  fs.mkdirSync(source)
  fs.mkdirSync(bundle)
  const before = Buffer.from('before\nkeep\n'),
    after = Buffer.from('after\nkeep\n')
  fs.writeFileSync(path.join(source, 'file.rs'), before, { mode: 0o644 })
  fs.writeFileSync(path.join(source, 'ignored-private'), 'never copied')
  const metadata = {
    revision: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    status: '',
    entries: [{ mode: '100644', blob: blob(before), path: 'file.rs' }],
  }
  const patch = Buffer.from(
    'diff --git a/file.rs b/file.rs\nindex 123abc..456def 100644\n--- a/file.rs\n+++ b/file.rs\n@@ -1,2 +1,2 @@\n-before\n+after\n keep\n',
  )
  const manifest = {
    version: 1,
    status: 'CANDIDATE_COMPILE_UNVERIFIED',
    sourceRevision: metadata.revision,
    sourceTree: metadata.tree,
    patchSha256: hash(patch),
    changedPaths: ['file.rs'],
    files: [
      {
        path: 'file.rs',
        preimage: { mode: '100644', sha256: hash(before) },
        postimage: { mode: '100644', sha256: hash(after) },
      },
    ],
  }
  const save = () => {
    fs.writeFileSync(path.join(source, '.fixture-git.json'), JSON.stringify(metadata))
    fs.writeFileSync(path.join(bundle, 'manifest.json'), JSON.stringify(manifest))
  }
  fs.writeFileSync(path.join(bundle, 'ordinary-cancel-v1.patch'), patch)
  save()
  return {
    source,
    bundle,
    directory,
    before,
    after,
    metadata,
    manifest,
    patch,
    save,
    destination: path.join(directory, 'candidate'),
    receipt: path.join(directory, 'receipt.json'),
  }
}
function prepare(f) {
  process.env.PATH = bin + path.delimiter + originalPath
  try {
    return prepareNativePatch(f)
  } finally {
    process.env.PATH = originalPath
  }
}

test('exact preparation copies tracked bytes only and binds candidate receipt', () => {
  const f = fixture()
  const result = prepare(f)
  assert.equal(result.status, 'CANDIDATE_COMPILE_UNVERIFIED')
  assert.equal(result.rustCompilation, 'UNEXECUTED')
  assert.equal(result.runtimeQualified, false)
  assert.equal(result.nativeExecution, false)
  assert.equal(fs.readFileSync(path.join(f.destination, 'file.rs'), 'utf8'), f.after.toString())
  assert.equal(fs.readFileSync(path.join(f.source, 'file.rs'), 'utf8'), f.before.toString())
  assert.equal(fs.existsSync(path.join(f.destination, 'ignored-private')), false)
  assert.equal(fs.existsSync(path.join(f.destination, '.fixture-git.json')), false)
  assert.equal(JSON.parse(fs.readFileSync(f.receipt)).patchSha256, hash(f.patch))
  assert.throws(() => prepare(f), /destination must be new|receipt must be new/)
})

for (const [name, mutate] of [
  ['pin', f => (f.metadata.revision = 'c'.repeat(40))],
  ['dirty', f => (f.metadata.status = ' M file.rs\n')],
  ['bytes', f => fs.writeFileSync(path.join(f.source, 'file.rs'), 'changed\n')],
  ['mode', f => fs.chmodSync(path.join(f.source, 'file.rs'), 0o755)],
  ['preimage', f => (f.manifest.files[0].preimage.sha256 = '0'.repeat(64))],
  ['postimage', f => (f.manifest.files[0].postimage.sha256 = '0'.repeat(64))],
  ['patch', f => fs.appendFileSync(path.join(f.bundle, 'ordinary-cancel-v1.patch'), 'drift\n')],
])
  test(`preparation refuses ${name} drift before copying`, () => {
    const f = fixture()
    mutate(f)
    f.save()
    assert.throws(() => prepare(f), /pin|dirty|preimage|mode|postimage|digest/)
    assert.equal(fs.existsSync(f.destination), false)
  })

function replaceFileWithLink(directory, name) {
  fs.renameSync(path.join(directory, name), path.join(directory, 'target'))
  fs.symlinkSync('target', path.join(directory, name))
}
for (const [name, mutate] of [
  [
    'source-link',
    f => {
      fs.symlinkSync(f.source, path.join(f.directory, 'alias'))
      f.source = path.join(f.directory, 'alias')
    },
  ],
  ['file-link', f => replaceFileWithLink(f.source, 'file.rs')],
  ['bundle-link', f => replaceFileWithLink(f.bundle, 'ordinary-cancel-v1.patch')],
  ['tracked-link', f => (f.metadata.entries[0].mode = '120000')],
  [
    'escape',
    f => {
      f.manifest.changedPaths[0] = '../escape'
      f.manifest.files[0].path = '../escape'
    },
  ],
  [
    'undeclared',
    f => {
      f.manifest.changedPaths[0] = 'other.rs'
      f.manifest.files[0].path = 'other.rs'
    },
  ],
  ['existing', f => fs.mkdirSync(f.destination)],
])
  test(`preparation fails closed for ${name}`, () => {
    const f = fixture()
    mutate(f)
    f.save()
    assert.throws(() => prepare(f), /symlink|nonregular|unsafe|preimage|destination|license/)
  })

test('receipt inside source is refused without writing source', () => {
  const f = fixture()
  f.receipt = path.join(f.source, 'new-receipt.json')
  assert.throws(() => prepare(f), /outside source/)
  assert.equal(fs.existsSync(f.receipt), false)
})

test('exact hunk applier rejects offsets, fuzz, path drift and missing declared paths', () => {
  const f = fixture()
  assert.equal(
    applyExactPatch(f.patch, new Map([['file.rs', f.before]]), ['file.rs'])
      .get('file.rs')
      .toString(),
    f.after.toString(),
  )
  for (const patch of [
    f.patch.toString().replace('@@ -1,2 +1,2 @@', '@@ -2,2 +2,2 @@'),
    f.patch.toString().replace(' keep', ' missing'),
    f.patch.toString().replace('+++ b/file.rs', '+++ b/other.rs'),
    f.patch.toString().replace('@@ -1,2 +1,2 @@', '@@ -1,1 +1,2 @@'),
  ])
    assert.throws(
      () => applyExactPatch(Buffer.from(patch), new Map([['file.rs', f.before]]), ['file.rs']),
      /offset|context|path|count/,
    )
  assert.throws(() => applyExactPatch(f.patch, new Map([['file.rs', f.before]]), ['file.rs', 'extra.rs']), /path drift/)
})

test('patch mode metadata must match the declared pinned mode', () => {
  const f = fixture()
  const patch = Buffer.from(f.patch.toString().replace('100644', '100755'))
  fs.writeFileSync(path.join(f.bundle, 'ordinary-cancel-v1.patch'), patch)
  f.manifest.patchSha256 = hash(patch)
  f.save()
  assert.throws(() => prepare(f), /patch mode drift/)
  assert.equal(fs.existsSync(f.destination), false)
})

test('exact patch parsing keeps file and hunk cursors independent', () => {
  const patch = Buffer.from(
    'diff --git a/first.rs b/first.rs\nindex 123abc..456def 100644\n--- a/first.rs\n+++ b/first.rs\n@@ -1 +1 @@\n-before\n+after\n@@ -2 +2 @@\n-keep\n+kept\ndiff --git a/second.rs b/second.rs\nindex 123abc..456def 100644\n--- a/second.rs\n+++ b/second.rs\n@@ -1 +1 @@\n-x\n+y\n',
  )
  const inputs = new Map([
    ['first.rs', Buffer.from('before\nkeep\n')],
    ['second.rs', Buffer.from('x\n')],
  ])
  const result = applyExactPatch(patch, inputs, [...inputs.keys()])
  assert.equal(result.get('first.rs').toString(), 'after\nkept\n')
  assert.equal(result.get('second.rs').toString(), 'y\n')
})

for (const [name, mutate, reason] of [
  ['duplicate file', text => text + text, /undeclared\/duplicate patch path/],
  ['empty file', text => text.slice(0, text.indexOf('@@')), /empty patch file/],
  ['unsupported marker', text => text.replace('-before', '?before'), /unsupported patch line\/fuzz/],
  ['invalid header', text => text.replace('b/file.rs\n', 'b/other.rs\n'), /unsupported patch header\/path/],
  ['incomplete header', text => text.slice(0, text.indexOf('index')), /unsupported patch mode/],
  ['missing final newline', text => text.slice(0, -1), /invalid patch encoding\/newline/],
])
  test(`exact patch parser refuses ${name}`, () => {
    const f = fixture()
    assert.throws(
      () => applyExactPatch(Buffer.from(mutate(f.patch.toString())), new Map([['file.rs', f.before]]), ['file.rs']),
      reason,
    )
  })

test('partial copy stays failed and cannot be reused', () => {
  const f = fixture()
  const original = fs.writeFileSync
  fs.writeFileSync = function (target, ...args) {
    if (target === path.join(f.destination, 'file.rs')) throw new Error('injected copy failure')
    return original.call(this, target, ...args)
  }
  try {
    assert.throws(() => prepare(f), /copy failure/)
  } finally {
    fs.writeFileSync = original
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.destination, 'M06-PREPARATION-STATUS.json'))).status, 'FAILED')
  assert.throws(() => prepare(f), /destination must be new/)
})

function licenseFixture() {
  const f = fixture()
  const actual = JSON.parse(fs.readFileSync(path.join(defaultBundle, 'manifest.json')))
  const copied = structuredClone(actual.copiedPinnedSymlink)
  f.metadata.revision = copied.sourceRevision
  f.manifest.sourceRevision = copied.sourceRevision
  f.manifest.copiedPinnedSymlink = copied
  const target = fs.readFileSync(path.join(upstreamSource, copied.targetPath))
  fs.mkdirSync(path.dirname(path.join(f.source, copied.path)), { recursive: true })
  fs.writeFileSync(path.join(f.source, copied.targetPath), target, { mode: 0o644 })
  fs.symlinkSync(copied.target, path.join(f.source, copied.path))
  f.metadata.entries.push(
    { mode: copied.targetMode, blob: copied.targetBlob, path: copied.targetPath },
    { mode: copied.mode, blob: copied.blob, path: copied.path },
  )
  f.save()
  return f
}

test('10b copies only the fixed pinned license as a link without dereferencing', () => {
  const f = licenseFixture()
  const result = prepare(f)
  const copied = f.manifest.copiedPinnedSymlink
  assert.equal(fs.lstatSync(path.join(f.destination, copied.path)).isSymbolicLink(), true)
  assert.equal(fs.readlinkSync(path.join(f.destination, copied.path)), 'COPYING')
  assert.equal(hash(fs.readFileSync(path.join(f.destination, copied.targetPath))), copied.targetSha256)
  assert.equal(fs.lstatSync(path.join(f.destination, copied.targetPath)).mode & 0o777, 0o644)
  assert.deepEqual(result.copiedPinnedSymlink, copied)
})

function replaceLicenseLink(f, target) {
  const link = path.join(f.source, f.manifest.copiedPinnedSymlink.path)
  fs.unlinkSync(link)
  fs.symlinkSync(target, link)
}
function addUnexpectedLicenseLink(f, target) {
  const copied = f.manifest.copiedPinnedSymlink
  fs.symlinkSync(target, path.join(f.source, path.dirname(copied.path), 'EXTRA'))
  f.metadata.entries.push({ mode: '120000', blob: copied.blob, path: 'codex-rs/vendor/bubblewrap/EXTRA' })
}
for (const [name, mutate] of [
  [
    'revision',
    f => {
      f.metadata.revision = 'c'.repeat(40)
      f.manifest.sourceRevision = f.metadata.revision
    },
  ],
  ['path', f => (f.metadata.entries[2].path = 'other-LICENSE')],
  ['mode', f => (f.metadata.entries[2].mode = '100644')],
  ['blob', f => (f.metadata.entries[2].blob = '0'.repeat(40))],
  ['target', f => replaceLicenseLink(f, './COPYING')],
  ['absolute', f => replaceLicenseLink(f, path.join(f.source, f.manifest.copiedPinnedSymlink.targetPath))],
  ['escape', f => replaceLicenseLink(f, '../../outside')],
  [
    'chain',
    f => {
      replaceLicenseLink(f, 'CHAIN')
      fs.symlinkSync('COPYING', path.join(f.source, path.dirname(f.manifest.copiedPinnedSymlink.path), 'CHAIN'))
    },
  ],
  ['hash', f => (f.manifest.copiedPinnedSymlink.sha256 = '0'.repeat(64))],
  ['missing-target', f => fs.unlinkSync(path.join(f.source, f.manifest.copiedPinnedSymlink.targetPath))],
  ['changed-target', f => fs.appendFileSync(path.join(f.source, f.manifest.copiedPinnedSymlink.targetPath), 'changed')],
  [
    'target-link',
    f => {
      const target = path.join(f.source, f.manifest.copiedPinnedSymlink.targetPath)
      fs.renameSync(target, target + '.real')
      fs.symlinkSync('COPYING.real', target)
    },
  ],
  ['target-mode', f => fs.chmodSync(path.join(f.source, f.manifest.copiedPinnedSymlink.targetPath), 0o755)],
  ['target-git-mode', f => (f.metadata.entries[1].mode = '100755')],
  ['target-git-blob', f => (f.metadata.entries[1].blob = '0'.repeat(40))],
  ['extra-link', f => addUnexpectedLicenseLink(f, 'COPYING')],
  ['directory-link', f => addUnexpectedLicenseLink(f, '.')],
  [
    'patch-target',
    f => {
      f.manifest.changedPaths[0] = f.manifest.copiedPinnedSymlink.targetPath
      f.manifest.files[0].path = f.manifest.copiedPinnedSymlink.targetPath
    },
  ],
])
  test(`10b refuses pinned license tuple drift: ${name}`, () => {
    const f = licenseFixture()
    mutate(f)
    f.save()
    assert.throws(() => prepare(f), /license|COPYING|symlink|ENOENT|mode/, name)
    assert.equal(fs.existsSync(f.destination), false, name)
  })

for (const [name, mutate] of [
  [
    'source-ancestor',
    f => {
      fs.renameSync(path.join(f.source, 'codex-rs'), path.join(f.source, 'real-codex-rs'))
      fs.symlinkSync('real-codex-rs', path.join(f.source, 'codex-rs'))
    },
  ],
  [
    'destination-ancestor',
    f => {
      fs.mkdirSync(path.join(f.directory, 'real-output'))
      fs.symlinkSync('real-output', path.join(f.directory, 'output'))
      f.destination = path.join(f.directory, 'output/candidate')
    },
  ],
])
  test(`10b refuses ${name}`, () => {
    const f = licenseFixture()
    mutate(f)
    assert.throws(() => prepare(f), /symlink|unexpected copied/)
  })

test('10b refuses unexpected copied links and retains the failed destination', () => {
  const f = licenseFixture()
  const original = fs.symlinkSync
  fs.symlinkSync = function (target, filename, ...args) {
    const result = original.call(this, target, filename, ...args)
    if (filename === path.join(f.destination, f.manifest.copiedPinnedSymlink.path))
      original.call(this, 'COPYING', path.join(path.dirname(filename), 'EXTRA'))
    return result
  }
  try {
    assert.throws(() => prepare(f), /symlink|unexpected copied/)
  } finally {
    fs.symlinkSync = original
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.destination, 'M06-PREPARATION-STATUS.json'))).status, 'FAILED')
  assert.throws(() => prepare(f), /destination must be new/)
})

test('10b detects source mutation after copy and preserves the failed destination', () => {
  const f = licenseFixture()
  const original = fs.writeFileSync
  fs.writeFileSync = function (target, ...args) {
    const result = original.call(this, target, ...args)
    if (target === path.join(f.destination, 'file.rs'))
      original.call(this, path.join(f.source, f.manifest.copiedPinnedSymlink.targetPath), 'mutation')
    return result
  }
  try {
    assert.throws(() => prepare(f), /COPYING/)
  } finally {
    fs.writeFileSync = original
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.destination, 'M06-PREPARATION-STATUS.json'))).status, 'FAILED')
  assert.throws(() => prepare(f), /destination must be new/)
})

test('real frozen source copy and exact candidate patch application', t => {
  const source = upstreamSource
  assert.equal(fs.existsSync(source), true, 'required frozen source must be present')
  const manifest = JSON.parse(fs.readFileSync(path.join(defaultBundle, 'manifest.json')))
  const inputs = new Map(manifest.changedPaths.map(name => [name, fs.readFileSync(path.join(source, name))]))
  const patch = fs.readFileSync(path.join(defaultBundle, 'ordinary-cancel-v1.patch'))
  assert.equal(hash(patch), manifest.patchSha256)
  const outputs = applyExactPatch(patch, inputs, manifest.changedPaths)
  for (const file of manifest.files) {
    assert.equal(hash(inputs.get(file.path)), file.preimage.sha256)
    assert.equal(hash(outputs.get(file.path)), file.postimage.sha256)
  }
  // Actual-source copies and receipts are retained rather than cleaned/reused.
  const retained = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'm06-native-real-copy-test-10-'))
  const destination = path.join(retained, 'candidate'),
    receipt = path.join(retained, 'receipt.json')
  const result = prepareNativePatch({ source, destination, receipt })
  assert.equal(result.status, 'CANDIDATE_COMPILE_UNVERIFIED')
  assert.equal(result.runtimeQualified, false)
  assert.equal(result.nativeExecution, false)
  assert.equal(fs.readlinkSync(path.join(destination, manifest.copiedPinnedSymlink.path)), 'COPYING')
  for (const file of manifest.files)
    assert.equal(hash(fs.readFileSync(path.join(destination, file.path))), file.postimage.sha256)
  t.diagnostic(
    JSON.stringify({ retained, receipt, copiedTrackedFiles: result.copiedTrackedFiles, rustTests: 'UNEXECUTED' }),
  )
})
