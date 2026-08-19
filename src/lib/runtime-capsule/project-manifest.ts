import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { canonicalRuntimeCapsuleJson, runtimeCapsuleHashSchema, runtimeCapsuleSegmentSchema } from './contracts'
import { prepareManagedProjectDirectory, resolveManagedProjectPaths } from './storage'

const managedProjectManifestSchema = z
  .object({
    schemaVersion: z.literal('2'),
    projectId: runtimeCapsuleSegmentSchema,
    kind: z.enum(['LOCAL_WORKSPACE', 'REMOTE_BLACK_BOX']),
    canonicalIdentity: z.string().min(1).max(4096),
    displayName: z.string().min(1).max(512),
    canonicalPath: z.string().min(1).max(4096).nullable(),
    normalizedRemoteOrigin: z.string().url().nullable(),
    fingerprint: runtimeCapsuleHashSchema,
    registeredAt: z.string().datetime({ offset: true }),
    lastVerifiedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type ManagedProjectManifest = z.infer<typeof managedProjectManifestSchema>
function parseCanonicalProjectManifest(value: string): ManagedProjectManifest {
  if (Buffer.byteLength(value) > 64 * 1024) throw new Error('Managed project manifest exceeds 64 KiB.')
  const parsed = managedProjectManifestSchema.parse(JSON.parse(value))
  if (canonicalRuntimeCapsuleJson(parsed) !== value) throw new Error('Managed project manifest is not canonical JSON.')
  return parsed
}

export class ManagedProjectManifestRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly appraiseRoot: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async refresh(projectIdValue: string): Promise<ManagedProjectManifest> {
    const projectId = runtimeCapsuleSegmentSchema.parse(projectIdValue)
    const project = await this.prisma.targetProject.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        kind: true,
        canonicalIdentity: true,
        displayName: true,
        canonicalPath: true,
        normalizedRemoteOrigin: true,
        fingerprint: true,
        createdAt: true,
      },
    })
    if (!project) throw new Error('Managed project manifest target project does not exist.')
    const paths = resolveManagedProjectPaths(this.appraiseRoot, projectId)
    await prepareManagedProjectDirectory(paths)
    const current = await this.readFile(paths.projectManifestPath)
    if (current === 'corrupt') throw new Error('Managed project manifest is corrupt and cannot be refreshed silently.')
    if (current && (current.projectId !== project.id || current.fingerprint !== project.fingerprint))
      throw new Error('Managed project manifest identity does not match database ownership.')
    const manifest = managedProjectManifestSchema.parse({
      schemaVersion: '2',
      projectId: project.id,
      kind: project.kind,
      canonicalIdentity: project.canonicalIdentity,
      displayName: project.displayName,
      canonicalPath: project.canonicalPath,
      normalizedRemoteOrigin: project.normalizedRemoteOrigin,
      fingerprint: project.fingerprint,
      registeredAt: current?.registeredAt ?? project.createdAt.toISOString(),
      lastVerifiedAt: this.now().toISOString(),
    })
    const canonical = canonicalRuntimeCapsuleJson(manifest)
    await this.writeManifest(paths.projectManifestPath, canonical)
    return manifest
  }

  private async writeManifest(manifestPath: string, canonical: string) {
    const temporaryPath = `${manifestPath}.${crypto.randomUUID()}.tmp`
    try {
      const existing = await fs.lstat(manifestPath).catch(error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      })
      if (existing && (!existing.isFile() || existing.isSymbolicLink()))
        throw new Error('Managed project manifest path must be a regular file.')
      await fs.writeFile(temporaryPath, canonical, { flag: 'wx', mode: 0o600 })
      await fs.chmod(temporaryPath, 0o600)
      await fs.rename(temporaryPath, manifestPath)
      await fs.chmod(manifestPath, 0o600)
    } finally {
      await fs.unlink(temporaryPath).catch(() => undefined)
    }
  }

  private async readFile(filePath: string): Promise<ManagedProjectManifest | 'corrupt' | null> {
    try {
      const stat = await fs.lstat(filePath)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) return 'corrupt'
      return parseCanonicalProjectManifest(await fs.readFile(filePath, 'utf8'))
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? null : 'corrupt'
    }
  }
}
