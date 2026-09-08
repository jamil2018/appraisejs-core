import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { isStrictlyDocumentationOnly } from './lib/commit-scope-policy.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staged = spawnSync('git', ['diff', '--cached', '--no-renames', '--name-only'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 10000,
})
if (staged.error || staged.status !== 0) {
  console.error(staged.error ?? staged.stderr)
  process.exit(2)
}
const stagedChanges = staged.stdout
  .split('\n')
  .filter(Boolean)
  .map(pathname => ({ status: 'M', path: pathname }))
if (isStrictlyDocumentationOnly(stagedChanges)) {
  console.log('Skipping React Doctor for a strictly documentation-only staged change.')
  process.exit(0)
}
const result = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules/react-doctor/bin/react-doctor.js'),
    '.',
    '--project',
    'appraise',
    '--offline',
    '--staged',
    '--fail-on',
    'error',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    timeout: 180000,
  },
)
if (result.error) console.error(result.error)
if (result.signal === 'SIGTERM') console.error('React Doctor commit validation exceeded its configured timeout.')
process.exit(result.status ?? 1)
