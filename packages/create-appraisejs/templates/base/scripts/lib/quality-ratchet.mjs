import { spawnSync } from 'node:child_process'

const suppressionPattern = /^(?:\/\/|\/\*)\s*(?:fallow-ignore|eslint-disable|@ts-ignore|@ts-expect-error)\b/

const qualityDiffMaxBufferBytes = 16 * 1024 * 1024

export function readQualityDiff(base, spawn = spawnSync) {
  const result = spawn('git', ['diff', '--unified=0', `${base}...HEAD`, '--', '*.ts', '*.tsx', '*.js', '*.mjs'], {
    encoding: 'utf8',
    maxBuffer: qualityDiffMaxBufferBytes,
  })

  if (result.error) {
    throw new Error(`Unable to read the quality diff: ${result.error.message}`, { cause: result.error })
  }
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `git diff exited with status ${result.status ?? 'unknown'}.`)
  }

  return result.stdout
}

export function addedQualitySuppressions(patch) {
  return patch
    .split('\n')
    .filter(line => line.startsWith('+') && !line.startsWith('+++'))
    .map(line => line.slice(1).trim())
    .filter(line => suppressionPattern.test(line))
}
