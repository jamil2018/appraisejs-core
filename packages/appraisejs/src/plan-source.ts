import { promises as fs } from 'node:fs'
import path from 'node:path'

export async function resolvePlanSource(cwd: string, file: string, allowExternal: boolean) {
  const projectPath = await fs.realpath(path.resolve(cwd))
  const sourcePath = await fs.realpath(path.resolve(file))
  const relative = path.relative(projectPath, sourcePath)
  const external = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
  if (external && !allowExternal) {
    throw new Error(
      `Plan file resolves outside --cwd: ${sourcePath}. Pass --allow-external-plan-file for intentional cross-project submission.`,
    )
  }
  return {
    path: sourcePath,
    external,
    ...(external ? { warning: 'external-plan-source' as const } : {}),
  }
}
