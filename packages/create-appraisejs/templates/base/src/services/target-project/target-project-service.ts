import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

import type { Prisma, PrismaClient, TargetProject } from '@prisma/client'

import prisma from '@/config/db-config'
import { ServiceError } from '@/services/shared/errors'

type PackageMetadata = {
  name?: string
  version?: string
  scripts?: Record<string, string>
  packageManager?: string
}

export type RegisterTargetProjectInput =
  | {
      path: string
      displayName?: string
      description?: string
    }
  | {
      url: string
      displayName?: string
      description?: string
    }

const execFileAsync = promisify(execFile)

export type TargetGitInitialization = {
  status: 'initialized' | 'already_present' | 'skipped'
  branch?: string
  warning?: string
}

export type ActiveProjectSelectionSource = 'url' | 'cookie'

export type ActiveProjectContext = Pick<
  TargetProject,
  'id' | 'kind' | 'displayName' | 'canonicalIdentity' | 'canonicalPath' | 'normalizedRemoteOrigin'
> & {
  source: ActiveProjectSelectionSource
}

type PackageJsonShape = Record<string, unknown>
export type TargetProjectMarkerStatus = {
  status: 'written' | 'refreshed' | 'skipped'
  path?: string
  warning?: string
}

function detectPackageManager(projectRoot: string): string | undefined {
  if (existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(path.join(projectRoot, 'yarn.lock'))) return 'yarn'
  if (existsSync(path.join(projectRoot, 'bun.lockb'))) return 'bun'
  if (existsSync(path.join(projectRoot, 'package-lock.json'))) return 'npm'
  return undefined
}

async function readPackageJson(projectRoot: string): Promise<PackageJsonShape> {
  const packageJsonPath = path.join(projectRoot, 'package.json')
  try {
    const value = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('package.json must contain a JSON object.')
    }
    return value as PackageJsonShape
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}
    }
    throw new ServiceError(
      `Invalid package metadata at ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`,
      'VALIDATION',
      400,
    )
  }
}

function readStringField(packageJson: PackageJsonShape, field: string): string | undefined {
  const value = packageJson[field]
  return typeof value === 'string' ? value : undefined
}

function extractScripts(packageJson: PackageJsonShape): Record<string, string> {
  const scripts = packageJson.scripts
  return scripts && typeof scripts === 'object' && !Array.isArray(scripts) ? (scripts as Record<string, string>) : {}
}

async function readPackageMetadata(projectRoot: string): Promise<PackageMetadata> {
  const packageJson = await readPackageJson(projectRoot)
  return {
    name: readStringField(packageJson, 'name'),
    version: readStringField(packageJson, 'version'),
    scripts: extractScripts(packageJson),
    packageManager: readStringField(packageJson, 'packageManager'),
  }
}

function isLocalTargetProject(
  targetProject: Pick<TargetProject, 'kind' | 'canonicalPath'>,
): targetProject is Pick<TargetProject, 'kind' | 'canonicalPath'> & { kind: 'LOCAL_WORKSPACE'; canonicalPath: string } {
  return targetProject.kind === 'LOCAL_WORKSPACE' && Boolean(targetProject.canonicalPath)
}

export async function readTargetProjectLaunchMetadata(targetProject: Pick<TargetProject, 'kind' | 'canonicalPath'>) {
  if (!isLocalTargetProject(targetProject))
    throw new ServiceError('Launch metadata is available only for local workspace targets.', 'VALIDATION', 400)
  const metadata = await readPackageMetadata(targetProject.canonicalPath)
  return {
    packageManager: metadata.packageManager ?? detectPackageManager(targetProject.canonicalPath) ?? 'npm',
    scripts: metadata.scripts ?? {},
  }
}

function fingerprintTargetProject(canonicalIdentity: string, packageName?: string): string {
  return `sha256:${createHash('sha256')
    .update(`${canonicalIdentity}\0${packageName ?? 'appraisejs-target'}`)
    .digest('hex')}`
}

function normalizeRemoteOrigin(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new ServiceError('Target URL must be a valid HTTP(S) URL.', 'VALIDATION', 400)
  }
  if (!['http:', 'https:'].includes(parsed.protocol))
    throw new ServiceError('Target URL must use HTTP or HTTPS.', 'VALIDATION', 400)
  if (parsed.username || parsed.password)
    throw new ServiceError('Target URL must not include credentials.', 'VALIDATION', 400)
  if (parsed.hash) throw new ServiceError('Target URL must not include a fragment.', 'VALIDATION', 400)
  return parsed.origin
}

function localCanonicalIdentity(canonicalPath: string) {
  return `path:${canonicalPath}`
}

function remoteCanonicalIdentity(normalizedRemoteOrigin: string) {
  return `url:${normalizedRemoteOrigin}`
}

export async function initializeTargetGitRepository(
  projectPath: string,
  requested: boolean,
): Promise<TargetGitInitialization> {
  if (!requested) return { status: 'skipped' }
  let canonicalPath: string
  try {
    canonicalPath = await fs.realpath(path.resolve(projectPath))
  } catch {
    throw new ServiceError(`Target project path could not be resolved: ${projectPath}`, 'VALIDATION', 400)
  }
  if (existsSync(path.join(canonicalPath, '.git'))) return { status: 'already_present' }
  const entries = await fs.readdir(canonicalPath)
  if (entries.length > 0)
    throw new ServiceError(
      'Git initialization is only available for an empty target workspace. Initialize this existing project manually.',
      'VALIDATION',
      400,
    )
  try {
    await execFileAsync('git', ['init', '--quiet', '--initial-branch=main'], {
      cwd: canonicalPath,
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    })
    return { status: 'initialized', branch: 'main' }
  } catch (error) {
    throw new ServiceError(
      `Git initialization failed: ${error instanceof Error ? error.message.split(/\r?\n/, 1)[0] : String(error)}`,
      'INTERNAL',
      500,
    )
  }
}

export async function registerTargetProject(
  input: RegisterTargetProjectInput,
  client: PrismaClient = prisma,
): Promise<TargetProject> {
  if ('path' in input) {
    let canonicalPath: string
    try {
      canonicalPath = await fs.realpath(path.resolve(input.path))
    } catch {
      throw new ServiceError(`Target project path could not be resolved: ${input.path}`, 'VALIDATION', 400)
    }

    const metadata = await readPackageMetadata(canonicalPath)
    const packageManager = metadata.packageManager ?? detectPackageManager(canonicalPath)
    const canonicalIdentity = localCanonicalIdentity(canonicalPath)
    const displayName = input.displayName?.trim() || metadata.name || path.basename(canonicalPath)
    const packageJson = JSON.stringify({
      name: metadata.name,
      version: metadata.version,
      scripts: metadata.scripts,
      packageManager,
    })

    return client.targetProject.upsert({
      where: { canonicalIdentity },
      create: {
        kind: 'LOCAL_WORKSPACE',
        canonicalIdentity,
        canonicalPath,
        displayName,
        description: input.description?.trim() || null,
        packageName: metadata.name,
        packageManager,
        packageJson,
        fingerprint: fingerprintTargetProject(canonicalIdentity, metadata.name),
      },
      update: {
        displayName,
        description: input.description?.trim() || null,
        packageName: metadata.name,
        packageManager,
        packageJson,
        fingerprint: fingerprintTargetProject(canonicalIdentity, metadata.name),
        lastDetectedAt: new Date(),
      },
    })
  }

  const normalizedRemoteOrigin = normalizeRemoteOrigin(input.url)
  const canonicalIdentity = remoteCanonicalIdentity(normalizedRemoteOrigin)
  const displayName = input.displayName?.trim() || new URL(normalizedRemoteOrigin).hostname
  const targetProject = await client.targetProject.upsert({
    where: { canonicalIdentity },
    create: {
      kind: 'REMOTE_BLACK_BOX',
      canonicalIdentity,
      normalizedRemoteOrigin,
      displayName,
      description: input.description?.trim() || null,
      fingerprint: fingerprintTargetProject(canonicalIdentity),
    },
    update: {
      displayName,
      description: input.description?.trim() || null,
      lastDetectedAt: new Date(),
    },
  })
  await client.environment.upsert({
    where: { targetProjectId_name: { targetProjectId: targetProject.id, name: 'default' } },
    create: { targetProjectId: targetProject.id, name: 'default', baseUrl: normalizedRemoteOrigin },
    update: { baseUrl: normalizedRemoteOrigin },
  })
  return targetProject
}

export async function writeTargetProjectMarker(
  targetProject: TargetProject,
  hubFingerprint: string,
): Promise<TargetProjectMarkerStatus> {
  if (!isLocalTargetProject(targetProject)) return { status: 'skipped' }
  const markerDirectory = path.join(targetProject.canonicalPath, '.appraisejs')
  const markerPath = path.join(markerDirectory, 'project.json')
  try {
    const existed = existsSync(markerPath)
    await fs.mkdir(markerDirectory, { recursive: true })
    await fs.writeFile(
      markerPath,
      `${JSON.stringify(
        {
          schema: 'appraise.target-project/v1',
          hubFingerprint,
          targetProjectId: targetProject.id,
          targetProjectFingerprint: targetProject.fingerprint,
          displayName: targetProject.displayName,
          registeredAt: new Date().toISOString(),
          guidance:
            'Future AppraiseJS plans for this workspace should go through the registered Appraise hub. This marker only records routing metadata; it does not make the target workspace an Appraise hub.',
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
    return { status: existed ? 'refreshed' : 'written', path: markerPath }
  } catch (error) {
    return {
      status: 'skipped',
      path: markerPath,
      warning: `Target project was registered, but AppraiseJS could not write ${markerPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }
}

export async function listTargetProjects(client: PrismaClient = prisma): Promise<TargetProject[]> {
  return client.targetProject.findMany({ orderBy: [{ displayName: 'asc' }, { canonicalIdentity: 'asc' }] })
}

export async function resolveActiveProject(
  input: { urlProjectId?: string | null; cookieProjectId?: string | null },
  client: PrismaClient = prisma,
): Promise<ActiveProjectContext | null> {
  const source: ActiveProjectSelectionSource | null = input.urlProjectId
    ? 'url'
    : input.cookieProjectId
      ? 'cookie'
      : null
  const id = input.urlProjectId || input.cookieProjectId
  if (!source || !id) return null

  const project = await client.targetProject.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      displayName: true,
      canonicalIdentity: true,
      canonicalPath: true,
      normalizedRemoteOrigin: true,
    },
  })
  return project ? { ...project, source } : null
}

export async function renameTargetProject(
  input: { targetProjectId: string; displayName: string; description?: string },
  client: PrismaClient = prisma,
): Promise<TargetProject> {
  const displayName = input.displayName.trim()
  if (!displayName) throw new ServiceError('Project display name is required.', 'VALIDATION', 400)

  const existing = await client.targetProject.findUnique({ where: { id: input.targetProjectId } })
  if (!existing) throw new ServiceError('Target project not found.', 'NOT_FOUND', 404)

  const description = input.description === undefined ? undefined : input.description.trim() || null
  return client.targetProject.update({
    where: { id: existing.id },
    data: { displayName, ...(description !== undefined ? { description } : {}) },
  })
}

export type ExecutionConsentModeValue = 'ALWAYS_ASK' | 'RISK_AWARE' | 'TRUSTED_AGENT'

export async function updateTargetProjectExecutionConsentMode(
  input: { targetProjectId: string; mode: ExecutionConsentModeValue },
  client: PrismaClient = prisma,
): Promise<TargetProject> {
  const existing = await client.targetProject.findUnique({ where: { id: input.targetProjectId } })
  if (!existing) throw new ServiceError('Target project not found.', 'NOT_FOUND', 404)
  return client.targetProject.update({
    where: { id: existing.id },
    data: { executionConsentMode: input.mode },
  })
}

async function deleteProjectRuntimeRecords(targetProjectId: string, tx: Prisma.TransactionClient) {
  const [capsules, blobs] = await Promise.all([
    tx.runtimeCapsule.findMany({ where: { targetProjectId }, select: { id: true } }),
    tx.runtimeCapsuleBlob.findMany({ where: { targetProjectId }, select: { id: true } }),
  ])
  const capsuleIds = capsules.map(capsule => capsule.id)
  const blobIds = blobs.map(blob => blob.id)

  if (capsuleIds.length)
    await tx.runtimeCapsuleExecutionAttempt.deleteMany({ where: { capsuleId: { in: capsuleIds } } })
  if (capsuleIds.length || blobIds.length) {
    await tx.runtimeCapsuleBlobReference.deleteMany({
      where: { OR: [{ capsuleId: { in: capsuleIds } }, { blobId: { in: blobIds } }] },
    })
  }
  await tx.runtimeCapsule.deleteMany({ where: { targetProjectId } })
  await tx.runtimeCapsuleBlob.deleteMany({ where: { targetProjectId } })
  await tx.runtimeCapsuleLease.deleteMany({ where: { targetProjectId } })
  await tx.report.deleteMany({ where: { targetProjectId } })
  await tx.testRun.deleteMany({ where: { targetProjectId } })
}

async function deleteProjectAuthoredRecords(targetProjectId: string, tx: Prisma.TransactionClient) {
  const [testCases, templateTestCases] = await Promise.all([
    tx.testCase.findMany({ where: { targetProjectId }, select: { id: true } }),
    tx.templateTestCase.findMany({ where: { targetProjectId }, select: { id: true } }),
  ])
  const testCaseIds = testCases.map(testCase => testCase.id)
  const templateTestCaseIds = templateTestCases.map(testCase => testCase.id)

  if (testCaseIds.length) {
    await tx.review.deleteMany({ where: { testCaseId: { in: testCaseIds } } })
    await tx.linkedJiraTicket.deleteMany({ where: { testCaseId: { in: testCaseIds } } })
    await tx.testCaseStep.deleteMany({ where: { testCaseId: { in: testCaseIds } } })
    await tx.testCaseFlowBlock.deleteMany({ where: { testCaseId: { in: testCaseIds } } })
  }
  if (templateTestCaseIds.length) {
    await tx.templateTestCaseStep.deleteMany({ where: { templateTestCaseId: { in: templateTestCaseIds } } })
    await tx.templateTestCaseFlowBlock.deleteMany({ where: { templateTestCaseId: { in: templateTestCaseIds } } })
  }

  await tx.testCaseMetrics.deleteMany({ where: { targetProjectId } })
  await tx.testSuiteMetrics.deleteMany({ where: { targetProjectId } })
  await tx.dashboardMetrics.deleteMany({ where: { targetProjectId } })
  await tx.testCase.deleteMany({ where: { targetProjectId } })
  await tx.templateTestCase.deleteMany({ where: { targetProjectId } })
  await tx.testSuite.deleteMany({ where: { targetProjectId } })
  await tx.locator.deleteMany({ where: { targetProjectId } })
  await tx.locatorGroup.deleteMany({ where: { targetProjectId } })
  await tx.module.deleteMany({ where: { targetProjectId } })
  await tx.environment.deleteMany({ where: { targetProjectId } })
  await tx.tag.deleteMany({ where: { targetProjectId } })
}

export async function deleteTargetProject(
  targetProjectId: string,
  client: PrismaClient = prisma,
): Promise<TargetProject> {
  const existing = await client.targetProject.findUnique({ where: { id: targetProjectId } })
  if (!existing) throw new ServiceError('Target project not found.', 'NOT_FOUND', 404)

  await client.$transaction(async tx => {
    await deleteProjectRuntimeRecords(existing.id, tx)
    await tx.projectResourceImport.deleteMany({
      where: {
        OR: [{ destinationProjectId: existing.id }, { sourceOwnership: { targetProjectId: existing.id } }],
      },
    })
    await tx.projectResourceOwnership.deleteMany({ where: { targetProjectId: existing.id } })
    await deleteProjectAuthoredRecords(existing.id, tx)
    await tx.targetProject.delete({ where: { id: existing.id } })
  })

  return existing
}

export async function resolveTargetProject(reference: string, client: PrismaClient = prisma): Promise<TargetProject> {
  const trimmed = reference.trim()
  if (!trimmed) throw new ServiceError('Target project is required.', 'VALIDATION', 400)

  const localPath = trimmed.includes('://') ? undefined : path.resolve(trimmed)
  const remoteOrigin = trimmed.includes('://') ? normalizeRemoteOrigin(trimmed) : undefined

  const candidates = await client.targetProject.findMany({
    where: {
      OR: [
        { id: trimmed },
        { fingerprint: trimmed },
        { displayName: trimmed },
        { canonicalIdentity: trimmed },
        ...(localPath ? [{ canonicalPath: localPath }] : []),
        ...(remoteOrigin ? [{ normalizedRemoteOrigin: remoteOrigin }] : []),
      ],
    },
    take: 2,
  })

  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) {
    throw new ServiceError(
      `Target project reference "${reference}" is ambiguous. Use the target project id.`,
      'VALIDATION',
      400,
    )
  }

  let canonicalPath: string | undefined
  try {
    canonicalPath = await fs.realpath(path.resolve(trimmed))
  } catch {
    canonicalPath = undefined
  }

  if (canonicalPath) {
    const byPath = await client.targetProject.findUnique({
      where: { canonicalIdentity: localCanonicalIdentity(canonicalPath) },
    })
    if (byPath) return byPath
  }

  throw new ServiceError(
    `Target project "${reference}" is not registered. Run appraisejs project add first.`,
    'NOT_FOUND',
    404,
  )
}
