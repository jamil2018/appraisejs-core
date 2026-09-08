import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { requiresReleaseBaselineAudit } from './lib/fallow-commit-policy.mjs'
import { isStrictlyDocumentationOnly } from './lib/commit-scope-policy.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
// Invoke the package CLI via node — Windows cannot spawn extensionless .bin shims directly.
const fallowCli = path.join(repoRoot, 'node_modules', 'fallow', 'bin', 'fallow')
const fallowArgs = ['audit', '--base', 'HEAD', '--format', 'json', '--quiet', '--explain', '--fail-on-issues']

const env = { ...process.env }
delete env.GIT_INDEX_FILE

const stagedPatch = spawnSync(
  'git',
  ['diff', '--cached', '--no-renames', '--unified=0', '--', '*.ts', '*.tsx', '*.js', '*.mjs'],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
    // Large lifecycle/scaffold changes can legitimately exceed Node's 1 MiB
    // spawnSync default even though the policy only inspects the patch text.
    maxBuffer: 64 * 1024 * 1024,
    timeout: 10000,
  },
)

const stagedFiles = spawnSync('git', ['diff', '--cached', '--no-renames', '--name-only'], {
  cwd: repoRoot,
  encoding: 'utf8',
  env,
  maxBuffer: 64 * 1024 * 1024,
  timeout: 10000,
})

if (stagedPatch.error || stagedPatch.status !== 0 || stagedFiles.error || stagedFiles.status !== 0) {
  console.error(stagedPatch.error ?? stagedFiles.error ?? stagedPatch.stderr ?? stagedFiles.stderr)
  process.exit(2)
}

const stagedChanges = stagedFiles.stdout
  .split('\n')
  .filter(Boolean)
  .map(pathname => ({ status: 'M', path: pathname }))
if (isStrictlyDocumentationOnly(stagedChanges)) {
  console.log('Skipping Fallow for a strictly documentation-only staged change.')
  process.exit(0)
}

const result = requiresReleaseBaselineAudit(stagedPatch.stdout, stagedFiles.stdout)
  ? spawnSync('npm', ['run', 'quality:fallow:release'], { cwd: repoRoot, env, stdio: 'inherit', timeout: 600000 })
  : spawnSync(process.execPath, [fallowCli, ...fallowArgs], { cwd: repoRoot, env, stdio: 'inherit', timeout: 180000 })

if (result.error) {
  console.error(result.error)
  process.exit(2)
}

if (result.signal === 'SIGTERM') {
  console.error('Fallow commit validation exceeded its configured timeout.')
  process.exit(2)
}

process.exit(result.status ?? 1)
