import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  classifyTA04ArchiveMapping,
  requireTA04Absent,
  verifyTA04ArchiveCopy,
  verifyTA04History,
  verifyReviewedR20TreeEntries,
} from './fixtures/codex-app-server-m02-ta-matrix-r21/prior-evidence.mjs'

const repo = process.cwd()
const json = async file => JSON.parse(await fs.readFile(path.join(repo, file)))
const evidence = async () => {
  const [envelope, snapshot, observation] = await Promise.all([
    json('.appraisejs/m02-ta-matrix-build-r19/manifest.json'),
    json('.appraisejs/m02-r20-resume-preservation-01.json'),
    json('.appraisejs/m02-r20-archive-availability-01.json'),
  ])
  const indexes = new Map(
    await Promise.all(observation.archiveIndexes.map(async row => [row.path, JSON.parse(await fs.readFile(row.path))])),
  )
  return { artifacts: envelope.manifest.artifacts, snapshot, observation, indexes }
}

test('TA04 real read-only history verifies 6498 live and each of 23 archive witnesses', async () => {
  const result = await verifyTA04History()
  assert.equal(result.liveArtifacts.length, 6498)
  assert.equal(result.historicalSources.length, 23)
  assert.equal(result.priorEvidence.allFourRootsRetained, false)
  assert.equal(result.priorEvidence.currentOriginalRootIdentity, 'UNKNOWN')
  assert.deepEqual(new Set(result.historicalSources.map(row => row.path)).size, 23)
  for (const row of result.historicalSources) {
    assert.equal(row.status, 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED')
    assert.equal(row.currentOriginalRootIdentity, 'UNKNOWN')
    assert.ok(result.pinnedFiles.includes(row.archiveIndex))
    assert.ok(result.pinnedFiles.includes(row.archiveCopy))
  }
})

test('finite mapping rejects every missing, changed, duplicate, and ambiguous archive row', async () => {
  const baseline = await evidence()
  assert.equal(classifyTA04ArchiveMapping(baseline).mapped.size, 23)
  for (let index = 0; index < 23; index++) {
    const missing = structuredClone(baseline.observation)
    missing.mappings.splice(index, 1)
    assert.throws(() => classifyTA04ArchiveMapping({ ...baseline, observation: missing }), /shape drift/)
    const changed = structuredClone(baseline.observation)
    changed.mappings[index].bytes++
    assert.throws(
      () => classifyTA04ArchiveMapping({ ...baseline, observation: changed }),
      /mapping ambiguous or changed/,
    )
    const duplicate = structuredClone(baseline.observation)
    duplicate.mappings[index] = duplicate.mappings[(index + 1) % 23]
    assert.throws(
      () => classifyTA04ArchiveMapping({ ...baseline, observation: duplicate }),
      /mapping ambiguous or changed/,
    )
  }
  const ambiguous = new Map(baseline.indexes)
  const first = baseline.observation.mappings[0]
  const modified = structuredClone(ambiguous.get(first.archiveIndex))
  const record = modified.records.find(row => row.sourceRelativePath === 'phase-journal.jsonl')
  modified.records.push(structuredClone(record))
  ambiguous.set(first.archiveIndex, modified)
  assert.throws(() => classifyTA04ArchiveMapping({ ...baseline, indexes: ambiguous }), /mapping ambiguous or changed/)
})

test('finite mapping refuses unexpected missing pin, index claim drift and source reclassification', async () => {
  const baseline = await evidence()
  const extra = structuredClone(baseline.snapshot)
  extra.missing.push({
    path: baseline.artifacts.find(row => !extra.missing.some(item => item.path === row.path)).path,
    status: 'MISSING_ENOENT',
  })
  assert.throws(() => classifyTA04ArchiveMapping({ ...baseline, snapshot: extra }), /shape drift/)
  const indexes = new Map(baseline.indexes)
  const first = baseline.observation.archiveIndexes[0]
  indexes.set(first.path, { ...indexes.get(first.path), sourceRoot: '/private/tmp/other' })
  assert.throws(() => classifyTA04ArchiveMapping({ ...baseline, indexes }), /index\/root drift/)
  const source = structuredClone(baseline.observation)
  source.mappings[0].currentSourceStatus = 'PRESENT'
  assert.throws(() => classifyTA04ArchiveMapping({ ...baseline, observation: source }), /mapping ambiguous or changed/)
})

test('reviewed R20 tree rejects changed, missing, and added entries', async () => {
  const directory = path.join(repo, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r20')
  const entries = await Promise.all(
    (await fs.readdir(directory)).map(async name => ({
      name,
      sha256: createHash('sha256')
        .update(await fs.readFile(path.join(directory, name)))
        .digest('hex'),
    })),
  )
  assert.doesNotThrow(() => verifyReviewedR20TreeEntries(entries))
  const changed = structuredClone(entries)
  changed[0].sha256 = '0'.repeat(64)
  assert.throws(() => verifyReviewedR20TreeEntries(changed), /tree drift/)
  assert.throws(() => verifyReviewedR20TreeEntries(entries.slice(1)), /entry drift/)
  assert.throws(
    () => verifyReviewedR20TreeEntries([...entries, { name: 'extra.mjs', sha256: '0'.repeat(64) }]),
    /entry drift/,
  )
})

test('archive witnesses reject copy hash and length drift, and roots must remain absent', async () => {
  const baseline = await evidence()
  for (const row of baseline.observation.mappings) {
    const bytes = await fs.readFile(row.archiveCopy)
    assert.doesNotThrow(() => verifyTA04ArchiveCopy(row, bytes))
    await assert.rejects(
      async () => verifyTA04ArchiveCopy(row, bytes.subarray(0, bytes.length - 1)),
      /length or hash drift/,
    )
    const changed = Buffer.from(bytes)
    changed[0] ^= 1
    assert.throws(() => verifyTA04ArchiveCopy(row, changed), /length or hash drift/)
  }
  const missing = {
    async lstat() {
      const error = new Error('missing')
      error.code = 'ENOENT'
      throw error
    },
  }
  await assert.doesNotReject(requireTA04Absent('/private/tmp/disposable-only', { fileSystem: missing }))
  const present = {
    async lstat() {
      return { isDirectory: () => true }
    },
  }
  await assert.rejects(requireTA04Absent('/private/tmp/disposable-only', { fileSystem: present }), /reappeared/)
})
