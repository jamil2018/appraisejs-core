import { promises as fs } from 'node:fs'
import { constants as fsConstants } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import {
  hashCapsuleCommandReceipt,
  hashRuntimeCapsuleValue,
  assertTrustedRuntimeCapsuleContainment,
  parseCanonicalCapsuleCommandReceipt,
  parseCanonicalRuntimeCapsuleManifest,
} from '@/lib/runtime-capsule'
import { ServiceError } from '@/services/shared/errors'

type TestRunArtifactKind = 'log' | 'report' | 'trace' | 'screenshot'
type ArtifactInput = {
  runId: string
  kind: TestRunArtifactKind
  testCaseId?: string
  storedPath?: string | null
  expectedTargetProjectId?: string
}

const HARD_CAPS: Record<TestRunArtifactKind, number> = {
  log: 100_000_000,
  report: 100_000_000,
  trace: 100_000_000,
  screenshot: 25_000_000,
}

export class TestRunArtifactAccessService {
  constructor(
    private readonly client: PrismaClient = prisma,
    private readonly appraiseRoot = path.join(process.cwd(), '.appraise'),
    private readonly openVerifiedDescriptor: (filePath: string, flags: number) => Promise<FileHandle> = fs.open,
  ) {}

  async resolve(input: ArtifactInput) {
    const { run, root, receipt } = await this.loadAuthority(input)
    const { relativePath, maxBytes } = this.selectArtifact(input, root, run.testCases, receipt)
    const verified = await this.verifyAnchored(root, this.toRelative(root, relativePath), maxBytes)
    const { absolutePath } = verified
    const header = await this.readVerifiedHeader(verified)
    this.assertContentType(input.kind, header)
    return {
      absolutePath,
      maxBytes,
      contentType: this.contentType(input.kind),
      device: verified.stat.dev,
      inode: verified.stat.ino,
    }
  }

  private async loadAuthority(input: ArtifactInput) {
    const { run, capsule, root } = await this.loadOwnedCapsule(input)
    let manifest
    try {
      manifest = parseCanonicalRuntimeCapsuleManifest(capsule.manifestJson)
    } catch {
      throw new ServiceError('Capsule manifest is corrupt.', 'CONFLICT', 409)
    }
    if (!this.manifestMatches(manifest, capsule, run.runId))
      throw new ServiceError('Capsule manifest ownership is corrupt.', 'CONFLICT', 409)

    const receiptPath = (await this.verifyAnchored(root, manifest.commandReceipt.path, 1024 * 1024)).absolutePath
    let receipt
    try {
      receipt = parseCanonicalCapsuleCommandReceipt(await fs.readFile(receiptPath, 'utf8'))
    } catch {
      throw new ServiceError('Capsule receipt is corrupt.', 'CONFLICT', 409)
    }
    if (!this.receiptMatches(receipt, manifest.commandReceipt.hash, capsule.targetProjectId, run.id, run.runId))
      throw new ServiceError('Capsule receipt ownership is corrupt.', 'CONFLICT', 409)
    return { run, root, receipt }
  }

  private async loadOwnedCapsule(input: ArtifactInput) {
    const run = await this.client.testRun.findUnique({
      where: { runId: input.runId },
      include: {
        runtimeCapsule: true,
        testCases: { select: { id: true, testCaseId: true, tracePath: true } },
      },
    })
    if (!run?.runtimeCapsule) throw new ServiceError('Artifact not found.', 'NOT_FOUND', 404)
    if (input.expectedTargetProjectId && run.targetProjectId !== input.expectedTargetProjectId)
      throw new ServiceError('Artifact not found.', 'NOT_FOUND', 404)
    const capsule = run.runtimeCapsule
    if (run.targetProjectId !== capsule.targetProjectId || capsule.testRunId !== run.id)
      throw new ServiceError('Capsule artifact ownership is corrupt.', 'CONFLICT', 409)

    const projectRoot = path.join(this.appraiseRoot, 'projects', capsule.targetProjectId)
    const capsuleRoot = path.join(projectRoot, capsule.storagePath)
    const root = await fs.realpath(capsuleRoot).catch(() => null)
    if (!root) throw new ServiceError('Artifact not found.', 'NOT_FOUND', 404)
    try {
      await assertTrustedRuntimeCapsuleContainment(this.appraiseRoot, projectRoot, capsuleRoot)
    } catch {
      throw new ServiceError('Capsule managed-root containment is corrupt.', 'CONFLICT', 409)
    }
    return { run, capsule, root }
  }

  async readBytes(input: Parameters<TestRunArtifactAccessService['resolve']>[0]) {
    const artifact = await this.resolve(input)
    const handle = await this.openVerifiedDescriptor(
      artifact.absolutePath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    )
    try {
      const stat = await handle.stat()
      if (
        !stat.isFile() ||
        stat.dev !== artifact.device ||
        stat.ino !== artifact.inode ||
        stat.size > artifact.maxBytes
      )
        throw new ServiceError('Capsule artifact changed during verification.', 'CONFLICT', 409)
      const bytes = Buffer.alloc(stat.size)
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
      if (bytesRead !== stat.size) throw new ServiceError('Capsule artifact read was incomplete.', 'CONFLICT', 409)
      this.assertContentType(input.kind, bytes.subarray(0, 8))
      return { bytes, contentType: artifact.contentType, maxBytes: artifact.maxBytes }
    } finally {
      await handle.close()
    }
  }

  private toRelative(root: string, storedPath: string) {
    const absolute = path.isAbsolute(storedPath) ? storedPath : path.resolve(root, storedPath)
    const relative = path.relative(root, absolute)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
      throw new ServiceError('Capsule artifact path is corrupt.', 'CONFLICT', 409)
    return relative
  }

  private async verifyAnchored(root: string, relativePath: string, maxBytes: number) {
    const normalized = path.posix.normalize(relativePath.replaceAll(path.sep, '/'))
    if (!this.isSafeRelativePath(relativePath, normalized))
      throw new ServiceError('Capsule artifact path is corrupt.', 'CONFLICT', 409)
    let current = root
    for (const segment of normalized.split('/')) {
      current = path.join(current, segment)
      const stat = await fs.lstat(current).catch(() => null)
      if (!stat) throw new ServiceError('Artifact not found.', 'NOT_FOUND', 404)
      if (stat.isSymbolicLink()) throw new ServiceError('Capsule artifact symlinks are forbidden.', 'CONFLICT', 409)
    }
    const stat = await fs.stat(current)
    if (!stat.isFile() || stat.size > maxBytes)
      throw new ServiceError('Capsule artifact is corrupt or oversized.', 'CONFLICT', 409)
    const real = await fs.realpath(current)
    if (real !== path.join(root, ...normalized.split('/')))
      throw new ServiceError('Capsule artifact containment is corrupt.', 'CONFLICT', 409)
    return { absolutePath: real, stat }
  }

  private assertContentType(kind: TestRunArtifactKind, header: Buffer) {
    if (kind === 'screenshot' && !header.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      throw new ServiceError('Capsule screenshot content type is corrupt.', 'CONFLICT', 409)
    if (kind === 'trace' && header.subarray(0, 2).toString('ascii') !== 'PK')
      throw new ServiceError('Capsule trace content type is corrupt.', 'CONFLICT', 409)
  }

  private async readVerifiedHeader(verified: Awaited<ReturnType<TestRunArtifactAccessService['verifyAnchored']>>) {
    const header = Buffer.alloc(8)
    const handle = await fs.open(verified.absolutePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    try {
      const openedStat = await handle.stat()
      if (!openedStat.isFile() || openedStat.dev !== verified.stat.dev || openedStat.ino !== verified.stat.ino)
        throw new ServiceError('Capsule artifact changed during verification.', 'CONFLICT', 409)
      await handle.read(header, 0, header.length, 0)
      return header
    } finally {
      await handle.close()
    }
  }

  private contentType(kind: TestRunArtifactKind) {
    const values: Record<TestRunArtifactKind, string> = {
      screenshot: 'image/png',
      trace: 'application/zip',
      report: 'application/json',
      log: 'text/plain; charset=utf-8',
    }
    return values[kind]
  }

  private selectArtifact(
    input: ArtifactInput,
    root: string,
    testCases: Array<{ id: string; testCaseId: string; tracePath: string | null }>,
    receipt: ReturnType<typeof parseCanonicalCapsuleCommandReceipt>,
  ) {
    if (input.kind === 'log')
      return {
        relativePath: receipt.outputs.log.path,
        maxBytes: Math.min(HARD_CAPS.log, receipt.outputs.log.maxBytes),
      }
    if (input.kind === 'report')
      return {
        relativePath: receipt.outputs.report.path,
        maxBytes: Math.min(HARD_CAPS.report, receipt.outputs.report.maxBytes),
      }
    return this.selectEvidenceArtifact(input, root, testCases, receipt)
  }

  private selectEvidenceArtifact(
    input: ArtifactInput,
    root: string,
    testCases: Array<{ id: string; testCaseId: string; tracePath: string | null }>,
    receipt: ReturnType<typeof parseCanonicalCapsuleCommandReceipt>,
  ) {
    const membership = testCases.find(item => item.id === input.testCaseId || item.testCaseId === input.testCaseId)
    if (!membership) throw new ServiceError('Artifact not found.', 'NOT_FOUND', 404)
    const storedPath = input.storedPath ?? (input.kind === 'trace' ? membership.tracePath : null)
    if (!storedPath) throw new ServiceError('Artifact not found.', 'NOT_FOUND', 404)
    const relativePath = this.toRelative(root, storedPath)
    const contract =
      input.kind === 'trace' ? receipt.outputs.artifactEvidence.traces : receipt.outputs.artifactEvidence.screenshots
    if (!relativePath.startsWith(`${contract.root}/`) || !relativePath.endsWith(contract.suffix))
      throw new ServiceError('Capsule evidence membership is corrupt.', 'CONFLICT', 409)
    return { relativePath, maxBytes: Math.min(HARD_CAPS[input.kind], contract.maxBytes) }
  }

  private manifestMatches(
    manifest: ReturnType<typeof parseCanonicalRuntimeCapsuleManifest>,
    capsule: { targetProjectId: string; manifestHash: string },
    runId: string,
  ) {
    return (
      manifest.projectId === capsule.targetProjectId &&
      manifest.runId === runId &&
      hashRuntimeCapsuleValue(manifest) === capsule.manifestHash
    )
  }

  private receiptMatches(
    receipt: ReturnType<typeof parseCanonicalCapsuleCommandReceipt>,
    expectedHash: string,
    projectId: string,
    testRunId: string,
    runId: string,
  ) {
    return (
      hashCapsuleCommandReceipt(receipt) === expectedHash &&
      receipt.ownership.targetProjectId === projectId &&
      receipt.ownership.testRunId === testRunId &&
      receipt.ownership.runId === runId
    )
  }

  private isSafeRelativePath(relativePath: string, normalized: string) {
    return normalized === relativePath && !normalized.startsWith('../') && !path.posix.isAbsolute(normalized)
  }
}

export async function readTestRunArtifactText(
  access: TestRunArtifactAccessService,
  input: Parameters<TestRunArtifactAccessService['resolve']>[0],
  maxCharacters = 1_000_000,
) {
  const artifact = await access.readBytes(input)
  const byteLimit = Math.min(artifact.maxBytes, maxCharacters * 4)
  if (artifact.bytes.length > byteLimit)
    throw new ServiceError('Capsule artifact exceeds its read cap.', 'CONFLICT', 409)
  return artifact.bytes.toString('utf8').slice(0, maxCharacters)
}
