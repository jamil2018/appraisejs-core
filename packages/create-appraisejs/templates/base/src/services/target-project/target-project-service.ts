import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

import type { PrismaClient, TargetProject } from '@prisma/client'

import prisma from '@/config/db-config'
import { ServiceError } from '@/services/shared/errors'
import { initializeNewTargetSharedResourceCoverage, prepareSharedResourceMutationInTransaction } from '@/services/coordinator/quality-journey-shared-resource-guard-service'
import { isSharedResourceId } from '@/lib/quality-journey/shared-resource-contract'
import { collectTargetProjectDeletionEffects } from './target-project-deletion-effects'

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

    return client.$transaction(async tx => {
      const existing = await tx.targetProject.findUnique({ where: { canonicalIdentity } })
      const metadataUpdate = {
        displayName,
        description: input.description?.trim() || null,
        packageName: metadata.name,
        packageManager,
        packageJson,
        fingerprint: fingerprintTargetProject(canonicalIdentity, metadata.name),
        lastDetectedAt: new Date(),
      }
      if (existing) return tx.targetProject.update({ where: { id: existing.id }, data: metadataUpdate })
      const id = randomUUID()
      await initializeNewTargetSharedResourceCoverage(tx, id)
      return tx.targetProject.create({ data: {
        id,
        kind: 'LOCAL_WORKSPACE',
        canonicalIdentity,
        canonicalPath,
        displayName,
        description: input.description?.trim() || null,
        packageName: metadata.name,
        packageManager,
        packageJson,
        fingerprint: fingerprintTargetProject(canonicalIdentity, metadata.name),
      } })
    })
  }

  const normalizedRemoteOrigin = normalizeRemoteOrigin(input.url)
  const canonicalIdentity = remoteCanonicalIdentity(normalizedRemoteOrigin)
  const displayName = input.displayName?.trim() || new URL(normalizedRemoteOrigin).hostname
  return client.$transaction(async tx => {
    const existing = await tx.targetProject.findUnique({ where: { canonicalIdentity } })
    const id = existing?.id ?? randomUUID()
    if (!existing) await initializeNewTargetSharedResourceCoverage(tx, id)
    const targetProject = existing ? await tx.targetProject.update({
      where: { id },
      data: { displayName, description: input.description?.trim() || null, lastDetectedAt: new Date() },
    }) : await tx.targetProject.create({ data: {
      id,
      kind: 'REMOTE_BLACK_BOX',
      canonicalIdentity,
      normalizedRemoteOrigin,
      displayName,
      description: input.description?.trim() || null,
      fingerprint: fingerprintTargetProject(canonicalIdentity),
    } })
    await tx.environment.upsert({
    where: { targetProjectId_name: { targetProjectId: targetProject.id, name: 'default' } },
    create: { targetProjectId: targetProject.id, name: 'default', baseUrl: normalizedRemoteOrigin },
    // Registration refresh is an Environment write too. Preserve the remote
    // scope invariant even when the origin happens to be unchanged: callers
    // must issue a new scope after a target registration refresh.
    update: { baseUrl: normalizedRemoteOrigin, scopeVersion: { increment: 1 } },
    })
    return targetProject
  })
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

function assertTargetDeletionCount(result: { count: number }, expected: number) {
  if (result.count !== expected)
    throw new ServiceError('Target deletion count changed inside its owning transaction.', 'CONFLICT', 409, {
      protocol: 'M06_TARGET_DELETION_EFFECTS_V1', reason: 'DELETE_COUNT',
    })
}

export async function deleteTargetProject(
  targetProjectId: string,
  client: PrismaClient = prisma,
): Promise<TargetProject> {
  const id = targetProjectId
  if (!isSharedResourceId(id)) throw new ServiceError('Target project id is invalid.', 'VALIDATION', 400)
  if (typeof client.$transaction !== 'function')
    throw new ServiceError('Target deletion requires a supported owning transaction.', 'CONFLICT', 409)
  return client.$transaction(async tx => {
    const existing = await tx.targetProject.findUnique({ where: { id } })
    if (!existing) throw new ServiceError('Target project not found.', 'NOT_FOUND', 404)
    if (existing.id !== id) throw new ServiceError('Target project scope changed.', 'CONFLICT', 409)
    const plan = await collectTargetProjectDeletionEffects(tx, id)
    await prepareSharedResourceMutationInTransaction(tx, id, { existing: plan.roots, newRoots: [], deleted: plan.roots })
    // Every deletion below is a precomputed finite effect in this exact owner.
    // Retained runtime/history/lineage, coverage, guards, Uses and Claims have no
    // deletion or reset path here. Preparation tombstones each actual root once.
    if (plan.imports.length) assertTargetDeletionCount(await tx.projectResourceImport.deleteMany({
      where: { id: { in: [...plan.imports] } },
    }), plan.imports.length)
    if (plan.ownerships.length) assertTargetDeletionCount(await tx.projectResourceOwnership.deleteMany({
      where: { id: { in: [...plan.ownerships] }, targetProjectId: id },
    }), plan.ownerships.length)
    if (plan.parameters.length) assertTargetDeletionCount(await tx.testCaseStepParameter.deleteMany({
      where: { id: { in: [...plan.parameters] } },
    }), plan.parameters.length)
    if (plan.templateParameters.length) assertTargetDeletionCount(await tx.templateTestCaseStepParameter.deleteMany({
      where: { id: { in: [...plan.templateParameters] } },
    }), plan.templateParameters.length)
    if (plan.nodes.length) assertTargetDeletionCount(await tx.testCaseFlowBlockNode.deleteMany({
      where: { id: { in: [...plan.nodes] } },
    }), plan.nodes.length)
    if (plan.templateNodes.length) assertTargetDeletionCount(await tx.templateTestCaseFlowBlockNode.deleteMany({
      where: { id: { in: [...plan.templateNodes] } },
    }), plan.templateNodes.length)
    if (plan.steps.length) assertTargetDeletionCount(await tx.testCaseStep.deleteMany({
      where: { id: { in: [...plan.steps] } },
    }), plan.steps.length)
    if (plan.templateSteps.length) assertTargetDeletionCount(await tx.templateTestCaseStep.deleteMany({
      where: { id: { in: [...plan.templateSteps] } },
    }), plan.templateSteps.length)
    if (plan.blocks.length) assertTargetDeletionCount(await tx.testCaseFlowBlock.deleteMany({
      where: { id: { in: [...plan.blocks] } },
    }), plan.blocks.length)
    if (plan.templateBlocks.length) assertTargetDeletionCount(await tx.templateTestCaseFlowBlock.deleteMany({
      where: { id: { in: [...plan.templateBlocks] } },
    }), plan.templateBlocks.length)
    if (plan.caseMetrics.length) assertTargetDeletionCount(await tx.testCaseMetrics.deleteMany({
      where: { id: { in: [...plan.caseMetrics] }, targetProjectId: id },
    }), plan.caseMetrics.length)
    if (plan.suiteMetrics.length) assertTargetDeletionCount(await tx.testSuiteMetrics.deleteMany({
      where: { id: { in: [...plan.suiteMetrics] }, targetProjectId: id },
    }), plan.suiteMetrics.length)
    if (plan.dashboardMetrics.length) assertTargetDeletionCount(await tx.dashboardMetrics.deleteMany({
      where: { id: { in: [...plan.dashboardMetrics] }, targetProjectId: id },
    }), plan.dashboardMetrics.length)
    if (plan.cases.length) assertTargetDeletionCount(await tx.testCase.deleteMany({
      where: { id: { in: [...plan.cases] }, targetProjectId: id },
    }), plan.cases.length)
    if (plan.templates.length) assertTargetDeletionCount(await tx.templateTestCase.deleteMany({
      where: { id: { in: [...plan.templates] }, targetProjectId: id },
    }), plan.templates.length)
    if (plan.suites.length) assertTargetDeletionCount(await tx.testSuite.deleteMany({
      where: { id: { in: [...plan.suites] }, targetProjectId: id },
    }), plan.suites.length)
    if (plan.conflicts.length) assertTargetDeletionCount(await tx.conflictResolution.deleteMany({
      where: { id: { in: [...plan.conflicts] } },
    }), plan.conflicts.length)
    if (plan.locators.length) assertTargetDeletionCount(await tx.locator.deleteMany({
      where: { id: { in: [...plan.locators] }, targetProjectId: id },
    }), plan.locators.length)
    if (plan.groups.length) assertTargetDeletionCount(await tx.locatorGroup.deleteMany({
      where: { id: { in: [...plan.groups] }, targetProjectId: id },
    }), plan.groups.length)
    for (const moduleId of plan.moduleDeleteOrder)
      assertTargetDeletionCount(await tx.module.deleteMany({ where: { id: moduleId, targetProjectId: id } }), 1)
    if (plan.environments.length) assertTargetDeletionCount(await tx.environment.deleteMany({
      where: { id: { in: [...plan.environments] }, targetProjectId: id },
    }), plan.environments.length)
    if (plan.tags.length) assertTargetDeletionCount(await tx.tag.deleteMany({
      where: { id: { in: [...plan.tags] }, targetProjectId: id },
    }), plan.tags.length)
    assertTargetDeletionCount(await tx.targetProject.deleteMany({ where: { id } }), 1)
    return existing
  })
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
