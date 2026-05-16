import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const fallowBin = path.join(repoRoot, 'node_modules', '.bin', 'fallow')

const env = { ...process.env }
delete env.GIT_INDEX_FILE

const result = spawnSync(
  fallowBin,
  ['audit', '--base', 'HEAD', '--format', 'json', '--quiet', '--explain', '--fail-on-issues'],
  { cwd: repoRoot, env, stdio: 'inherit' },
)

if (result.error) {
  console.error(result.error)
  process.exit(2)
}

process.exit(result.status ?? 1)
