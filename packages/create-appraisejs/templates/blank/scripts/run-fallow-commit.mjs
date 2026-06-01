import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
// Invoke the package CLI via node — Windows cannot spawn extensionless .bin shims directly.
const fallowCli = path.join(repoRoot, 'node_modules', 'fallow', 'bin', 'fallow')
const fallowArgs = ['audit', '--base', 'HEAD', '--format', 'json', '--quiet', '--explain', '--fail-on-issues']

const env = { ...process.env }
delete env.GIT_INDEX_FILE

const result = spawnSync(process.execPath, [fallowCli, ...fallowArgs], { cwd: repoRoot, env, stdio: 'inherit' })

if (result.error) {
  console.error(result.error)
  process.exit(2)
}

process.exit(result.status ?? 1)
