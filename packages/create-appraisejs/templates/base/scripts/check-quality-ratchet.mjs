import { addedQualitySuppressions, readQualityDiff } from './lib/quality-ratchet.mjs'

const baseIndex = process.argv.indexOf('--base')
const base = baseIndex >= 0 ? process.argv[baseIndex + 1] : 'HEAD^'
if (!base) throw new Error('--base requires a Git reference.')

let patch
try {
  patch = readQualityDiff(base)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const suppressions = addedQualitySuppressions(patch)
if (suppressions.length > 0) {
  console.error('Quality ratchet rejected new source suppressions:')
  suppressions.forEach(line => console.error(`- ${line}`))
  process.exit(1)
}
console.log(`Quality ratchet passed against ${base}; no new source suppressions were added.`)
