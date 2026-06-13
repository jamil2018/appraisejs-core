import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export type CoordinatorProjectDetails = {
  canonicalProjectPath: string
  packageName?: string
  projectFingerprint: string
}

class CoordinatorProjectIdentityError extends Error {
  readonly code = 'package-json-invalid'

  constructor(
    message: string,
    readonly path: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'CoordinatorProjectIdentityError'
  }
}

export async function deriveCoordinatorProjectIdentity(projectDirectory: string): Promise<CoordinatorProjectDetails> {
  const canonicalProjectPath = await fs.realpath(path.resolve(projectDirectory))
  const packageJsonPath = path.join(canonicalProjectPath, 'package.json')
  let packageName: string | undefined
  try {
    const value = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('package.json must contain a JSON object.')
    }
    const name = (value as { name?: unknown }).name
    if (name !== undefined && typeof name !== 'string') {
      throw new Error('package.json "name" must be a string when provided.')
    }
    packageName = name
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new CoordinatorProjectIdentityError(
        `Invalid package metadata at ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`,
        packageJsonPath,
        { cause: error },
      )
    }
  }
  const canonical = `${canonicalProjectPath}\0${packageName ?? 'appraisejs'}`
  return {
    canonicalProjectPath,
    packageName,
    projectFingerprint: `sha256:${createHash('sha256').update(canonical).digest('hex')}`,
  }
}
