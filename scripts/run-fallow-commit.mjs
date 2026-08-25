import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { requiresReleaseBaselineAudit } from './lib/fallow-commit-policy.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
// Invoke the package CLI via node — Windows cannot spawn extensionless .bin shims directly.
const fallowCli = path.join(repoRoot, 'node_modules', 'fallow', 'bin', 'fallow')
const fallowArgs = ['audit', '--base', 'HEAD', '--format', 'json', '--quiet', '--explain', '--fail-on-issues']

const env = { ...process.env }
delete env.GIT_INDEX_FILE

const stagedPatch = spawnSync('git', ['diff', '--cached', '--unified=0', '--', '*.ts', '*.tsx', '*.js', '*.mjs'], {
  cwd: repoRoot,
  encoding: 'utf8',
  env,
  // Large lifecycle/scaffold changes can legitimately exceed Node's 1 MiB
  // spawnSync default even though the policy only inspects the patch text.
  maxBuffer: 64 * 1024 * 1024,
})

if (stagedPatch.error || stagedPatch.status !== 0) {
  console.error(stagedPatch.error ?? stagedPatch.stderr)
  process.exit(2)
}

const result = requiresReleaseBaselineAudit(stagedPatch.stdout)
  ? spawnSync('npm', ['run', 'quality:fallow:release'], { cwd: repoRoot, env, stdio: 'inherit' })
  : spawnSync(process.execPath, [fallowCli, ...fallowArgs], { cwd: repoRoot, env, stdio: 'inherit' })

if (result.error) {
  console.error(result.error)
  process.exit(2)
}

process.exit(result.status ?? 1)
