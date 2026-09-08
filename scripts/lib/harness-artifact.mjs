import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 10_000 })
  if (result.status !== 0) throw new Error(`Git artifact inventory failed: ${result.stderr}`)
  return result.stdout
}

// Include tracked, deleted, and untracked files; ignored local journals are not acceptance artifacts.
export function artifactIdentity(cwd = process.cwd()) {
  const files = [
    ...new Set(git(cwd, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean)),
  ].sort()
  const hash = createHash('sha256')
  for (const file of files) {
    const full = path.join(cwd, file)
    let content = 'deleted'
    let mode = null
    try {
      const stat = fs.lstatSync(full)
      mode = stat.mode
      content = stat.isSymbolicLink() ? fs.readlinkSync(full) : fs.readFileSync(full)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    hash
      .update(JSON.stringify([file, mode]))
      .update('\0')
      .update(content)
      .update('\0')
  }
  return { version: 1, algorithm: 'sha256', digest: hash.digest('hex'), fileCount: files.length }
}

export function bindReview(artifact, { reviewer, evidence, independent, outcome }) {
  if (!reviewer || !evidence || independent !== true || !['accepted', 'changes-required'].includes(outcome)) {
    throw new Error('Review requires independent reviewer, evidence, and explicit outcome')
  }
  return { version: 1, artifact, reviewer, evidence, independent, outcome, recordedAt: new Date().toISOString() }
}

export function verifyReview(review, current) {
  return Boolean(
    review?.version === 1 &&
    review.independent === true &&
    review.reviewer &&
    review.evidence &&
    review.outcome === 'accepted' &&
    review.artifact?.version === current.version &&
    review.artifact?.algorithm === current.algorithm &&
    review.artifact?.digest === current.digest,
  )
}
