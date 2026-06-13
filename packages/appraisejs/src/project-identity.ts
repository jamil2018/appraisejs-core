import { createHash, randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export type ProjectIdentity = { projectFingerprint: string; token: string }
export type ProjectIdentityDetails = {
  canonicalProjectPath: string
  packageName?: string
  projectFingerprint: string
}

export class ProjectIdentityError extends Error {
  constructor(
    message: string,
    readonly code: 'project-directory-invalid' | 'package-json-invalid' | 'identity-file-invalid',
    readonly path: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ProjectIdentityError'
  }
}

export async function deriveProjectIdentity(projectDirectory: string): Promise<ProjectIdentityDetails> {
  let canonicalProjectPath: string
  try {
    canonicalProjectPath = await fs.realpath(path.resolve(projectDirectory))
  } catch (error) {
    throw new ProjectIdentityError(
      `Project directory could not be resolved: ${path.resolve(projectDirectory)}`,
      'project-directory-invalid',
      path.resolve(projectDirectory),
      { cause: error },
    )
  }

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
      throw new ProjectIdentityError(
        `Invalid package metadata at ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`,
        'package-json-invalid',
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

export async function ensureLocalProjectIdentity(projectDirectory: string) {
  const details = await deriveProjectIdentity(projectDirectory)
  const identityPath = path.join(details.canonicalProjectPath, '.appraisejs', 'coordinator.json')
  try {
    const identity = JSON.parse(await fs.readFile(identityPath, 'utf8')) as Partial<ProjectIdentity>
    if (typeof identity.projectFingerprint !== 'string' || typeof identity.token !== 'string') {
      throw new Error('Coordinator identity must include projectFingerprint and token strings.')
    }
    if (identity.projectFingerprint !== details.projectFingerprint) {
      throw new Error('Coordinator identity belongs to a different project.')
    }
    return { identity: identity as ProjectIdentity, details, created: false }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new ProjectIdentityError(
        `Invalid coordinator identity at ${identityPath}: ${error instanceof Error ? error.message : String(error)}`,
        'identity-file-invalid',
        identityPath,
        { cause: error },
      )
    }
  }

  const identity = {
    projectFingerprint: details.projectFingerprint,
    token: randomBytes(32).toString('base64url'),
  }
  await fs.mkdir(path.dirname(identityPath), { recursive: true, mode: 0o700 })
  await fs.writeFile(identityPath, `${JSON.stringify(identity, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  return { identity, details, created: true }
}
