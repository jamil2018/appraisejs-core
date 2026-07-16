import { spawnSync } from 'node:child_process'

import { addedQualitySuppressions } from './lib/quality-ratchet.mjs'

const baseIndex = process.argv.indexOf('--base')
const base = baseIndex >= 0 ? process.argv[baseIndex + 1] : 'HEAD^'
if (!base) throw new Error('--base requires a Git reference.')

const diff = spawnSync('git', ['diff', '--unified=0', `${base}...HEAD`, '--', '*.ts', '*.tsx', '*.js', '*.mjs'], {
  encoding: 'utf8',
})
if (diff.status !== 0) {
  process.stderr.write(diff.stderr)
  process.exit(diff.status ?? 1)
}

const suppressions = addedQualitySuppressions(diff.stdout)
if (suppressions.length > 0) {
  console.error('Quality ratchet rejected new source suppressions:')
  suppressions.forEach(line => console.error(`- ${line}`))
  process.exit(1)
}
console.log(`Quality ratchet passed against ${base}; no new source suppressions were added.`)
