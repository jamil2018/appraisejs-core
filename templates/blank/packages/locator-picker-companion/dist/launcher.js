import { access, readdir, stat } from 'fs/promises'
import { execa } from 'execa'
import path from 'path'
async function pathExists(targetPath) {
  try {
    await access(targetPath)
    return true
  } catch (_a) {
    return false
  }
}
async function getLatestModifiedTime(targetPath) {
  const stats = await stat(targetPath)
  if (!stats.isDirectory()) {
    return stats.mtimeMs
  }
  const entries = await readdir(targetPath, { withFileTypes: true })
  const times = await Promise.all(entries.map(entry => getLatestModifiedTime(path.join(targetPath, entry.name))))
  return Math.max(stats.mtimeMs, ...times)
}
export function getLocatorPickerCompanionPaths(repoRoot = process.cwd()) {
  const packageRoot = path.join(repoRoot, 'packages', 'locator-picker-companion')
  return {
    packageRoot,
    sourceRoot: path.join(packageRoot, 'src'),
    distCliPath: path.join(packageRoot, 'dist', 'cli.js'),
    tsconfigPath: path.join(packageRoot, 'tsconfig.json'),
    tscCliPath: path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
  }
}
async function ensureLocatorPickerCompanionBuilt(repoRoot = process.cwd()) {
  const { distCliPath, sourceRoot, tsconfigPath, tscCliPath } = getLocatorPickerCompanionPaths(repoRoot)
  if (await pathExists(distCliPath)) {
    const [distMtime, srcMtime] = await Promise.all([
      getLatestModifiedTime(distCliPath),
      getLatestModifiedTime(sourceRoot),
    ])
    if (distMtime >= srcMtime) {
      return distCliPath
    }
  }
  await execa(process.execPath, [tscCliPath, '-p', tsconfigPath], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'pipe',
  })
  if (!(await pathExists(distCliPath))) {
    throw new Error('Locator picker companion build completed without producing dist/cli.js.')
  }
  return distCliPath
}
export async function resolveLocatorPickerCompanionInvocation(cliArgs, repoRoot = process.cwd()) {
  const distCliPath = await ensureLocatorPickerCompanionBuilt(repoRoot)
  return {
    command: process.execPath,
    args: [distCliPath, ...cliArgs],
  }
}
