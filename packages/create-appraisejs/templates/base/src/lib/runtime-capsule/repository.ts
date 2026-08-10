import type { PrismaClient } from '@prisma/client'
import path from 'node:path'
import {
  canonicalRuntimeCapsuleJson,
  hashRuntimeCapsuleValue,
  runtimeCapsuleManifestSchema,
  type RuntimeCapsuleManifest,
} from './contracts'
import {
  readCapsuleManifest,
  resolveRuntimeCapsulePaths,
  verifyContentAddressedBlob,
  verifyRuntimeCapsuleFile,
  writeContentAddressedBlob,
  writeImmutableCapsuleManifest,
} from './storage'

export type RuntimeCapsuleIntegrity = 'ready' | 'missing' | 'corrupt' | 'orphaned_storage'
type StoredRuntimeCapsuleIntegrity = Exclude<RuntimeCapsuleIntegrity, 'orphaned_storage'>

type CapsuleBlobReference = {
  filePath: string
  blob: {
    targetProjectId: string
    contentHash: string
    size: number
    integrityState: string
  }
}

type CapsuleRowIdentity = {
  targetProjectId: string
  validationHash: string
  qualityPublicationId: string | null
  capsuleHash: string
  manifestHash: string
}

export class RuntimeCapsuleRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly appraiseRoot = path.join(process.cwd(), '.appraise'),
  ) {}

  private assertManifestIdentity(
    manifest: RuntimeCapsuleManifest,
    input: { projectId: string; validationHash: string; runId: string },
  ) {
    if (
      manifest.projectId !== input.projectId ||
      manifest.validationHash !== input.validationHash ||
      manifest.runId !== input.runId
    )
      throw new Error('Runtime capsule manifest identity does not match its database ownership.')
  }

  private async assertDatabaseOwnership(input: { projectId: string; testRunId: string; runId: string }) {
    const [project, testRun] = await Promise.all([
      this.prisma.targetProject.findUnique({ where: { id: input.projectId }, select: { id: true } }),
      this.prisma.testRun.findUnique({
        where: { id: input.testRunId },
        select: { id: true, runId: true, targetProjectId: true },
      }),
    ])
    if (!project || !testRun || testRun.targetProjectId !== project.id || testRun.runId !== input.runId)
      throw new Error('Runtime capsule project and TestRun ownership do not match.')
  }

  private async findOrCreateCapsuleRow(input: {
    projectId: string
    testRunId: string
    validationHash: string
    qualityPublicationId?: string
    capsuleHash: string
    manifestHash: string
    manifestJson: string
    storagePath: string
    assertLeaseOwned?: () => Promise<void>
  }) {
    const existing = await this.prisma.runtimeCapsule.findUnique({ where: { testRunId: input.testRunId } })
    if (existing) return this.assertExistingCapsuleIdentity(existing, input)
    return this.createCapsuleRow(input)
  }

  private capsuleRowMatchesIdentity(
    row: CapsuleRowIdentity,
    input: {
      projectId: string
      validationHash: string
      qualityPublicationId?: string
      capsuleHash: string
      manifestHash: string
    },
  ) {
    return (
      row.targetProjectId === input.projectId &&
      row.validationHash === input.validationHash &&
      (row.qualityPublicationId ?? undefined) === input.qualityPublicationId &&
      row.capsuleHash === input.capsuleHash &&
      row.manifestHash === input.manifestHash
    )
  }

  private assertExistingCapsuleIdentity<Row extends CapsuleRowIdentity>(
    row: Row,
    input: {
      projectId: string
      validationHash: string
      qualityPublicationId?: string
      capsuleHash: string
      manifestHash: string
    },
  ) {
    if (!this.capsuleRowMatchesIdentity(row, input))
      throw new Error('A TestRun cannot be reassigned to a different runtime capsule.')
    return row
  }

  private async createCapsuleRow(input: {
    projectId: string
    testRunId: string
    validationHash: string
    qualityPublicationId?: string
    capsuleHash: string
    manifestHash: string
    manifestJson: string
    storagePath: string
    assertLeaseOwned?: () => Promise<void>
  }) {
    try {
      await input.assertLeaseOwned?.()
      return await this.prisma.runtimeCapsule.create({
        data: {
          targetProjectId: input.projectId,
          testRunId: input.testRunId,
          validationHash: input.validationHash,
          ...(input.qualityPublicationId ? { qualityPublicationId: input.qualityPublicationId } : {}),
          capsuleHash: input.capsuleHash,
          manifestHash: input.manifestHash,
          manifestJson: input.manifestJson,
          storagePath: input.storagePath,
          integrityState: 'staging',
        },
      })
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error
      const concurrent = await this.prisma.runtimeCapsule.findUnique({ where: { testRunId: input.testRunId } })
      if (!concurrent || !this.capsuleRowMatchesIdentity(concurrent, input))
        throw new Error('Concurrent runtime capsule creation resolved to different immutable content.')
      return concurrent
    }
  }

  private async attachManifestBlobs(
    rowId: string,
    projectId: string,
    manifest: RuntimeCapsuleManifest,
    assertLeaseOwned?: () => Promise<void>,
  ) {
    const blobs = await Promise.all(
      manifest.files.map(file =>
        this.prisma.runtimeCapsuleBlob.findUnique({
          where: { targetProjectId_contentHash: { targetProjectId: projectId, contentHash: file.hash } },
        }),
      ),
    )
    if (
      blobs.some((blob, index) => !blob || blob.integrityState !== 'ready' || blob.size !== manifest.files[index]!.size)
    )
      throw new Error('Runtime capsule manifest references a missing, unready, or size-mismatched blob.')

    await assertLeaseOwned?.()
    const references = await Promise.all(
      blobs.map((blob, index) =>
        this.prisma.runtimeCapsuleBlobReference.upsert({
          where: { capsuleId_filePath: { capsuleId: rowId, filePath: manifest.files[index]!.path } },
          create: { capsuleId: rowId, blobId: blob!.id, filePath: manifest.files[index]!.path },
          update: {},
        }),
      ),
    )
    if (references.some((reference, index) => reference.blobId !== blobs[index]!.id))
      throw new Error('Runtime capsule blob reference conflicts with immutable manifest content.')
  }

  async create(input: {
    projectId: string
    testRunId: string
    runId: string
    validationHash: string
    qualityPublicationId?: string
    manifest: RuntimeCapsuleManifest
    assertLeaseOwned?: () => Promise<void>
  }) {
    const manifest = runtimeCapsuleManifestSchema.parse(input.manifest)
    this.assertManifestIdentity(manifest, input)
    await this.assertDatabaseOwnership(input)

    const paths = resolveRuntimeCapsulePaths({
      appraiseRoot: this.appraiseRoot,
      projectId: input.projectId,
      validationHash: input.validationHash,
      runId: input.runId,
    })
    const manifestJson = canonicalRuntimeCapsuleJson(manifest)
    const manifestHash = hashRuntimeCapsuleValue(manifest)
    const capsuleHash = hashRuntimeCapsuleValue({ ...manifest, manifestHash })
    const row = await this.findOrCreateCapsuleRow({
      ...input,
      capsuleHash,
      manifestHash,
      manifestJson,
      storagePath: path.relative(paths.projectRoot, paths.capsuleRoot),
    })
    await input.assertLeaseOwned?.()
    await writeImmutableCapsuleManifest(paths, manifestJson)
    await this.attachManifestBlobs(row.id, input.projectId, manifest, input.assertLeaseOwned)
    await input.assertLeaseOwned?.()
    const integrity = await this.verifyAndPersist({
      projectId: input.projectId,
      validationHash: input.validationHash,
      testRunId: input.testRunId,
      runId: input.runId,
    })
    if (integrity !== 'ready')
      throw new Error(`Runtime capsule failed complete immutable storage verification: ${integrity}.`)
    return this.prisma.runtimeCapsule.findUniqueOrThrow({ where: { id: row.id } })
  }

  async inspect(input: {
    projectId: string
    validationHash: string
    testRunId: string
    runId: string
  }): Promise<RuntimeCapsuleIntegrity> {
    return this.verifyAndPersist(input)
  }

  private manifestMatchesStoredIdentity(
    manifest: RuntimeCapsuleManifest,
    row: { manifestJson: string; manifestHash: string; capsuleHash: string },
    input: { projectId: string; validationHash: string; runId: string },
  ) {
    const canonical = canonicalRuntimeCapsuleJson(manifest)
    const manifestHash = hashRuntimeCapsuleValue(manifest)
    const capsuleHash = hashRuntimeCapsuleValue({ ...manifest, manifestHash })
    return (
      row.manifestJson === canonical &&
      row.manifestHash === manifestHash &&
      row.capsuleHash === capsuleHash &&
      manifest.projectId === input.projectId &&
      manifest.validationHash === input.validationHash &&
      manifest.runId === input.runId
    )
  }

  private async verifyManifestFiles(
    paths: ReturnType<typeof resolveRuntimeCapsulePaths>,
    projectId: string,
    manifest: RuntimeCapsuleManifest,
    references: CapsuleBlobReference[],
  ): Promise<StoredRuntimeCapsuleIntegrity> {
    if (references.length !== manifest.files.length) return 'missing'
    for (const [index, file] of manifest.files.entries()) {
      const reference = references[index]
      const integrity = await this.verifyManifestFile(paths, projectId, file, reference)
      if (integrity !== 'ready') return integrity
    }
    return 'ready'
  }

  private async verifyManifestFile(
    paths: ReturnType<typeof resolveRuntimeCapsulePaths>,
    projectId: string,
    file: RuntimeCapsuleManifest['files'][number],
    reference: CapsuleBlobReference | undefined,
  ): Promise<StoredRuntimeCapsuleIntegrity> {
    if (!reference) return 'missing'
    if (!this.referenceMatchesFile(reference, projectId, file)) return 'corrupt'
    const physical = await verifyContentAddressedBlob({
      appraiseRoot: this.appraiseRoot,
      projectId,
      contentHash: file.hash,
      expectedSize: file.size,
    })
    if (physical !== 'ready') return physical
    return verifyRuntimeCapsuleFile({
      paths,
      filePath: file.path,
      contentHash: file.hash,
      expectedSize: file.size,
    })
  }

  private referenceMatchesFile(
    reference: CapsuleBlobReference,
    projectId: string,
    file: RuntimeCapsuleManifest['files'][number],
  ) {
    return (
      reference.filePath === file.path &&
      reference.blob.targetProjectId === projectId &&
      reference.blob.contentHash === file.hash &&
      reference.blob.size === file.size &&
      reference.blob.integrityState === 'ready'
    )
  }

  private async determineIntegrity(
    paths: ReturnType<typeof resolveRuntimeCapsulePaths>,
    row: {
      manifestJson: string
      manifestHash: string
      capsuleHash: string
      blobReferences: CapsuleBlobReference[]
    },
    manifest: RuntimeCapsuleManifest | 'corrupt' | null,
    input: { projectId: string; validationHash: string; runId: string },
  ): Promise<StoredRuntimeCapsuleIntegrity> {
    if (!manifest) return 'missing'
    if (manifest === 'corrupt' || !this.manifestMatchesStoredIdentity(manifest, row, input)) return 'corrupt'
    return this.verifyManifestFiles(paths, input.projectId, manifest, row.blobReferences)
  }

  private async verifyAndPersist(input: {
    projectId: string
    validationHash: string
    testRunId: string
    runId: string
  }): Promise<RuntimeCapsuleIntegrity> {
    const paths = resolveRuntimeCapsulePaths({ appraiseRoot: this.appraiseRoot, ...input })
    const row = await this.prisma.runtimeCapsule.findUnique({
      where: { testRunId: input.testRunId },
      include: {
        testRun: { select: { runId: true } },
        blobReferences: { include: { blob: true }, orderBy: { filePath: 'asc' } },
      },
    })
    const manifest = await readCapsuleManifest(paths).catch(() => 'corrupt' as const)
    if (!row) return manifest ? 'orphaned_storage' : 'missing'
    if (
      row.targetProjectId !== input.projectId ||
      row.validationHash !== input.validationHash ||
      row.testRun.runId !== input.runId
    )
      throw new Error('Runtime capsule database ownership does not match the requested identity.')

    const integrity = await this.determineIntegrity(paths, row, manifest, input)
    if (row.integrityState !== integrity)
      await this.prisma.runtimeCapsule.updateMany({
        where: { id: row.id, version: row.version },
        data: { integrityState: integrity, version: { increment: 1 } },
      })
    return integrity
  }
}

export class RuntimeCapsuleBlobRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly appraiseRoot = path.join(process.cwd(), '.appraise'),
  ) {}

  async put(input: { projectId: string; contentHash: string; bytes: Uint8Array }) {
    const project = await this.prisma.targetProject.findUnique({ where: { id: input.projectId }, select: { id: true } })
    if (!project) throw new Error('Runtime capsule blob target project does not exist.')
    const stored = await writeContentAddressedBlob({ appraiseRoot: this.appraiseRoot, ...input })
    const storagePath = path.relative(path.join(this.appraiseRoot, 'projects', input.projectId), stored.path)
    let row = await this.findBlob(input)
    this.assertBlobIdentity(row, input.bytes.byteLength, storagePath)
    row ??= await this.createBlob(input, storagePath)
    if (!row || row.size !== input.bytes.byteLength || row.storagePath !== storagePath)
      throw new Error('Concurrent runtime capsule blob creation did not preserve immutable identity.')
    if (row.integrityState === 'ready') return row
    const advanced = await this.prisma.runtimeCapsuleBlob.updateMany({
      where: { id: row.id, version: row.version },
      data: { integrityState: 'ready', version: { increment: 1 } },
    })
    if (advanced.count === 1) return this.prisma.runtimeCapsuleBlob.findUniqueOrThrow({ where: { id: row.id } })
    return this.prisma.runtimeCapsuleBlob.findUniqueOrThrow({
      where: { targetProjectId_contentHash: { targetProjectId: input.projectId, contentHash: input.contentHash } },
    })
  }

  private findBlob(input: { projectId: string; contentHash: string }) {
    return this.prisma.runtimeCapsuleBlob.findUnique({
      where: { targetProjectId_contentHash: { targetProjectId: input.projectId, contentHash: input.contentHash } },
    })
  }

  private assertBlobIdentity(
    row: { size: number; storagePath: string } | null,
    expectedSize: number,
    storagePath: string,
  ) {
    if (row && (row.size !== expectedSize || row.storagePath !== storagePath))
      throw new Error('Runtime capsule blob database identity conflicts with immutable bytes.')
  }

  private async createBlob(input: { projectId: string; contentHash: string; bytes: Uint8Array }, storagePath: string) {
    try {
      return await this.prisma.runtimeCapsuleBlob.create({
        data: {
          targetProjectId: input.projectId,
          contentHash: input.contentHash,
          size: input.bytes.byteLength,
          storagePath,
          integrityState: 'staging',
        },
      })
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error
      return this.findBlob(input)
    }
  }
}
