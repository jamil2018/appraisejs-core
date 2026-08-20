import { promises as fs } from 'node:fs'
import path from 'node:path'

export const managedRuntimeArtifactPaths = (cwd = process.cwd()) => [
  path.resolve(cwd, 'packages/cucumber-runtime/dist/index.js'),
  path.resolve(cwd, 'packages/cucumber-runtime/dist/hooks.js'),
]

/** Read-only execution gate. Startup may build these artifacts, but lifecycle
 * execution never creates a durable AssessmentRun when its runtime is absent. */
export async function assertManagedRuntimeReady(
  cwd = process.cwd(),
  stat: (path: string) => Promise<{ isFile(): boolean }> = fs.stat,
) {
  const requiredFiles = managedRuntimeArtifactPaths(cwd)
  try {
    const states = await Promise.all(requiredFiles.map(file => stat(file)))
    if (states.some(state => !state.isFile())) throw new Error('not a regular file')
  } catch {
    throw new Error(
      `Managed execution runtime is not ready. Run "npm run build:cucumber-runtime" before assessment_run. Required files: ${requiredFiles.join(', ')}`,
    )
  }
  return requiredFiles
}
