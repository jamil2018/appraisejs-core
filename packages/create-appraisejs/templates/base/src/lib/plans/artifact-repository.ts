import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { ArtifactKind } from '@/lib/plan-contract'

import { findProjectRoot } from './project-root'

const PLAN_ID_PATTERN = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*|pln_[0-9a-hjkmnp-tv-z]{26})$/
const WINDOWS_ABSOLUTE_PATTERN = /^[a-zA-Z]:[\\/]/

const artifactLocation: Record<ArtifactKind, { directory: string; extension: string }> = {
  plan: { directory: '', extension: '.yaml' },
  review: { directory: 'reviews', extension: '.review.yaml' },
  validation: { directory: 'validations', extension: '.validation.yaml' },
  layout: { directory: 'layouts', extension: '.layout.json' },
}

function artifactDirectoryPath(plansRoot: string, kind: ArtifactKind): string {
  switch (kind) {
    case 'plan':
      return plansRoot
    case 'review':
      return path.join(plansRoot, 'reviews')
    case 'validation':
      return path.join(plansRoot, 'validations')
    case 'layout':
      return path.join(plansRoot, 'layouts')
  }
}

function artifactFilePath(plansRoot: string, kind: ArtifactKind, planId: string): string {
  switch (kind) {
    case 'plan':
      return path.join(plansRoot, `${planId}.yaml`)
    case 'review':
      return path.join(plansRoot, 'reviews', `${planId}.review.yaml`)
    case 'validation':
      return path.join(plansRoot, 'validations', `${planId}.validation.yaml`)
    case 'layout':
      return path.join(plansRoot, 'layouts', `${planId}.layout.json`)
  }
}

export type PlanRepositoryErrorCode = 'already-exists' | 'lock-timeout' | 'not-found' | 'path-escape' | 'stale-write'

export class PlanRepositoryError extends Error {
  constructor(
    public readonly code: PlanRepositoryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'PlanRepositoryError'
  }
}

export type StoredPlanArtifact = {
  planId: string
  kind: ArtifactKind
  relativePath: string
  absolutePath: string
  content: string
  hash: string
  modifiedAt: Date
}

export type PlanArtifactRepositoryOptions = {
  lockTimeoutMs?: number
  staleLockMs?: number
}

function hashContent(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function assertPlanId(planId: string): void {
  if (
    !PLAN_ID_PATTERN.test(planId) ||
    path.isAbsolute(planId) ||
    WINDOWS_ABSOLUTE_PATTERN.test(planId) ||
    planId.includes('..')
  ) {
    throw new PlanRepositoryError('path-escape', `Invalid plan ID: ${planId}`)
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

export class PlanArtifactRepository {
  private readonly projectRootPromise: Promise<string>
  private readonly lockTimeoutMs: number
  private readonly staleLockMs: number

  constructor(
    projectDirectory = process.cwd(),
    { lockTimeoutMs = 5000, staleLockMs = 30000 }: PlanArtifactRepositoryOptions = {},
  ) {
    this.projectRootPromise = findProjectRoot(projectDirectory)
    this.lockTimeoutMs = lockTimeoutMs
    this.staleLockMs = staleLockMs
  }

  async create(kind: ArtifactKind, planId: string, content: string): Promise<StoredPlanArtifact> {
    return this.withPlanLock(planId, async () => {
      const targetPath = await this.resolveArtifactPath(kind, planId, true)
      if (await pathExists(targetPath)) {
        throw new PlanRepositoryError('already-exists', `${kind} artifact already exists for ${planId}`)
      }
      await this.atomicWrite(targetPath, content)
      return this.read(kind, planId)
    })
  }

  async read(kind: ArtifactKind, planId: string): Promise<StoredPlanArtifact> {
    const absolutePath = await this.resolveArtifactPath(kind, planId, false)
    try {
      const [content, stats] = await Promise.all([fs.readFile(absolutePath, 'utf8'), fs.stat(absolutePath)])
      const projectRoot = await this.projectRootPromise
      return {
        planId,
        kind,
        relativePath: path.relative(projectRoot, absolutePath).split(path.sep).join('/'),
        absolutePath,
        content,
        hash: hashContent(content),
        modifiedAt: stats.mtime,
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new PlanRepositoryError('not-found', `${kind} artifact not found for ${planId}`)
      }
      throw error
    }
  }

  async list(): Promise<StoredPlanArtifact[]> {
    const plansRoot = await this.resolvePlansRoot(true)
    const results: StoredPlanArtifact[] = []

    for (const kind of Object.keys(artifactLocation) as ArtifactKind[]) {
      const { extension } = artifactLocation[kind]
      const artifactDirectory = artifactDirectoryPath(plansRoot, kind)
      await this.assertContainedPath(plansRoot, artifactDirectory)
      if (!(await pathExists(artifactDirectory))) continue
      for (const entry of await fs.readdir(artifactDirectory, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(extension)) continue
        const planId = entry.name.slice(0, -extension.length)
        if (!PLAN_ID_PATTERN.test(planId)) continue
        results.push(await this.read(kind, planId))
      }
    }

    return results.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  }

  async compareAndWrite(
    kind: ArtifactKind,
    planId: string,
    expectedHash: string,
    content: string,
  ): Promise<StoredPlanArtifact> {
    return this.withPlanLock(planId, async () => {
      const current = await this.read(kind, planId)
      if (current.hash !== expectedHash) {
        throw new PlanRepositoryError('stale-write', `${kind} artifact changed since it was read`)
      }
      await this.atomicWrite(current.absolutePath, content)
      return this.read(kind, planId)
    })
  }

  // fallow-ignore-next-line unused-class-member
  async writeCompletionTransaction(planId: string, content: string): Promise<void> {
    await this.withPlanLock(planId, async () => {
      const targetPath = await this.resolveCompletionTransactionPath(planId, true)
      if (await pathExists(targetPath)) return
      await this.atomicWrite(targetPath, content)
    })
  }

  async readCompletionTransaction(planId: string): Promise<string | null> {
    const targetPath = await this.resolveCompletionTransactionPath(planId, false)
    return fs.readFile(targetPath, 'utf8').catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    })
  }

  async removeCompletionTransaction(planId: string): Promise<void> {
    await this.withPlanLock(planId, async () => {
      await fs.rm(await this.resolveCompletionTransactionPath(planId, false), { force: true })
    })
  }

  private async resolvePlansRoot(create: boolean): Promise<string> {
    const projectRoot = await this.projectRootPromise
    const plansRoot = path.join(projectRoot, 'appraise', 'plans')
    await this.assertContainedPath(projectRoot, plansRoot)
    if (create) await fs.mkdir(plansRoot, { recursive: true })
    return plansRoot
  }

  private async resolveArtifactPath(kind: ArtifactKind, planId: string, createDirectory: boolean): Promise<string> {
    assertPlanId(planId)
    const plansRoot = await this.resolvePlansRoot(createDirectory)
    const artifactDirectory = artifactDirectoryPath(plansRoot, kind)
    await this.assertContainedPath(plansRoot, artifactDirectory)
    if (createDirectory) await fs.mkdir(artifactDirectory, { recursive: true })
    return artifactFilePath(plansRoot, kind, planId)
  }

  private async resolveCompletionTransactionPath(planId: string, createDirectory: boolean): Promise<string> {
    assertPlanId(planId)
    const plansRoot = await this.resolvePlansRoot(createDirectory)
    const transactionDirectory = path.join(plansRoot, '.transactions')
    await this.assertContainedPath(plansRoot, transactionDirectory)
    if (createDirectory) await fs.mkdir(transactionDirectory, { recursive: true })
    return path.join(transactionDirectory, `${planId}.completion.json`)
  }

  private async assertContainedPath(root: string, target: string): Promise<void> {
    const relative = path.relative(root, target)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new PlanRepositoryError('path-escape', `Path escapes ${root}`)
    }

    const existingAncestor = await this.findExistingAncestor(target)
    const [realRoot, realAncestor] = await Promise.all([fs.realpath(root), fs.realpath(existingAncestor)])
    const realRelative = path.relative(realRoot, realAncestor)
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
      throw new PlanRepositoryError('path-escape', `Symlink escapes ${root}`)
    }
  }

  private async findExistingAncestor(target: string): Promise<string> {
    let current = target
    while (!(await pathExists(current))) {
      const parent = path.dirname(current)
      if (parent === current) return current
      current = parent
    }
    return current
  }

  private async atomicWrite(targetPath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temporaryPath, content, { flag: 'wx' })
      await fs.rename(temporaryPath, targetPath)
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => {})
    }
  }

  private async withPlanLock<T>(planId: string, operation: () => Promise<T>): Promise<T> {
    assertPlanId(planId)
    const plansRoot = await this.resolvePlansRoot(true)
    const lockDirectory = path.join(plansRoot, '.locks')
    const lockPath = path.join(lockDirectory, `${planId}.lock`)
    await this.assertContainedPath(plansRoot, lockDirectory)
    await fs.mkdir(lockDirectory, { recursive: true })
    const startedAt = Date.now()

    while (true) {
      try {
        const handle = await fs.open(lockPath, 'wx')
        await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }))
        await handle.close()
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        const stats = await fs.stat(lockPath).catch(() => null)
        if (stats && Date.now() - stats.mtimeMs > this.staleLockMs) {
          await fs.rm(lockPath, { force: true })
          continue
        }
        if (Date.now() - startedAt >= this.lockTimeoutMs) {
          throw new PlanRepositoryError('lock-timeout', `Timed out waiting for plan lock: ${planId}`)
        }
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    }

    try {
      return await operation()
    } finally {
      await fs.rm(lockPath, { force: true })
    }
  }
}
