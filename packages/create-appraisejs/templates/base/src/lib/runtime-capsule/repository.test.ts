import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  capsuleCommandBytes as commandBytes,
  capsuleCommandHash as commandHash,
  capsuleValidationHash as validationHash,
} from '@/test/runtime-capsule-test-fixtures'
import {
  canonicalRuntimeCapsuleJson,
  hashRuntimeCapsuleValue,
  RuntimeCapsuleRepository,
  materializeRuntimeCapsuleFile,
  resolveRuntimeCapsulePaths,
  writeContentAddressedBlob,
  type RuntimeCapsuleManifest,
} from './index'

const manifest: RuntimeCapsuleManifest = {
  schemaVersion: '1',
  projectId: 'project-one',
  validationHash,
  runId: 'run-one',
  operationHash: validationHash,
  projectionHash: validationHash,
  receiptHash: validationHash,
  runtimeInputHash: validationHash,
  commandReceipt: { path: 'command-receipt.json', hash: commandHash },
  generator: { id: 'appraise.validation-ast-capsule', version: '1' },
  expectedCases: [],
  files: [{ path: 'command-receipt.json', role: 'command-receipt', hash: commandHash, size: commandBytes.length }],
}

let workspace: string

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-capsule-repository-'))
  const blob = await writeContentAddressedBlob({
    appraiseRoot: workspace,
    projectId: 'project-one',
    contentHash: commandHash,
    bytes: commandBytes,
  })
  await materializeRuntimeCapsuleFile({
    paths: resolveRuntimeCapsulePaths({
      appraiseRoot: workspace,
      projectId: 'project-one',
      validationHash,
      runId: 'run-one',
    }),
    filePath: 'command-receipt.json',
    blobPath: blob.path,
    contentHash: commandHash,
    expectedSize: commandBytes.length,
  })
})

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true })
})

function prismaMock(overrides: Record<string, unknown> = {}) {
  const row = {
    id: 'capsule-one',
    targetProjectId: 'project-one',
    testRunId: 'test-run-db-one',
    validationHash,
    capsuleHash: '',
    manifestHash: '',
    manifestJson: '',
    storagePath: '',
    integrityState: 'staging',
    version: 1,
  }
  let stored: Record<string, unknown> | null = null
  const runtimeCapsule = {
    findUnique: vi.fn().mockImplementation(() => Promise.resolve(stored)),
    findUniqueOrThrow: vi.fn().mockImplementation(() => Promise.resolve(stored)),
    create: vi.fn().mockImplementation(({ data }) => {
      stored = {
        ...row,
        ...data,
        testRun: { runId: 'run-one' },
        blobReferences: [],
      }
      return Promise.resolve(stored)
    }),
    update: vi
      .fn()
      .mockImplementation(({ data }) => Promise.resolve({ ...row, integrityState: data.integrityState, version: 2 })),
    updateMany: vi.fn().mockImplementation(({ data }) => {
      if (stored) stored = { ...stored, integrityState: data.integrityState, version: 2 }
      return Promise.resolve({ count: 1 })
    }),
    findMany: vi.fn().mockResolvedValue([]),
  }
  return {
    targetProject: { findUnique: vi.fn().mockResolvedValue({ id: 'project-one' }) },
    testRun: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'test-run-db-one',
        runId: 'run-one',
        targetProjectId: 'project-one',
      }),
    },
    runtimeCapsule,
    runtimeCapsuleBlob: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'blob-one',
        targetProjectId: 'project-one',
        contentHash: commandHash,
        size: commandBytes.length,
        integrityState: 'ready',
      }),
    },
    runtimeCapsuleBlobReference: {
      upsert: vi.fn().mockImplementation(({ create }) => {
        const reference = {
          id: 'reference-one',
          ...create,
          blob: {
            id: 'blob-one',
            targetProjectId: 'project-one',
            contentHash: commandHash,
            size: commandBytes.length,
            integrityState: 'ready',
          },
        }
        if (stored) stored = { ...stored, blobReferences: [reference] }
        return Promise.resolve(reference)
      }),
    },
    ...overrides,
  }
}

describe('RuntimeCapsuleRepository', () => {
  it('persists staging authority before materialization and advances with CAS', async () => {
    const prisma = prismaMock()
    const repository = new RuntimeCapsuleRepository(prisma as unknown as PrismaClient, workspace)
    await repository.create({
      projectId: 'project-one',
      testRunId: 'test-run-db-one',
      runId: 'run-one',
      validationHash,
      manifest,
    })
    expect(prisma.runtimeCapsule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ integrityState: 'staging', targetProjectId: 'project-one' }),
    })
    expect(prisma.runtimeCapsule.updateMany).toHaveBeenCalledWith({
      where: { id: 'capsule-one', version: 1 },
      data: { integrityState: 'ready', version: { increment: 1 } },
    })
  })

  it('rejects cross-project TestRun ownership before creating storage authority', async () => {
    const prisma = prismaMock({
      testRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'test-run-db-one',
          runId: 'run-one',
          targetProjectId: 'project-two',
        }),
      },
    })
    const repository = new RuntimeCapsuleRepository(prisma as unknown as PrismaClient, workspace)
    await expect(
      repository.create({
        projectId: 'project-one',
        testRunId: 'test-run-db-one',
        runId: 'run-one',
        validationHash,
        manifest,
      }),
    ).rejects.toThrow(/ownership do not match/)
    expect(prisma.runtimeCapsule.create).not.toHaveBeenCalled()
  })

  it('reconciles an identical concurrent unique create race idempotently', async () => {
    const prisma = prismaMock()
    const manifestHash = hashRuntimeCapsuleValue(manifest)
    const capsuleHash = hashRuntimeCapsuleValue({ ...manifest, manifestHash })
    const racedRow = {
      id: 'capsule-race',
      targetProjectId: 'project-one',
      testRunId: 'test-run-db-one',
      validationHash,
      capsuleHash,
      manifestHash,
      manifestJson: canonicalRuntimeCapsuleJson(manifest),
      storagePath: `runtime/${'a'.repeat(64)}/run-one`,
      integrityState: 'staging',
      version: 1,
      testRun: { runId: 'run-one' },
      blobReferences: [],
    }
    const verifiedRow = {
      ...racedRow,
      blobReferences: [
        {
          id: 'reference-one',
          capsuleId: racedRow.id,
          blobId: 'blob-one',
          filePath: 'command-receipt.json',
          blob: {
            id: 'blob-one',
            targetProjectId: 'project-one',
            contentHash: commandHash,
            size: commandBytes.length,
            integrityState: 'ready',
          },
        },
      ],
    }
    prisma.runtimeCapsule.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(racedRow)
      .mockResolvedValue(verifiedRow)
    prisma.runtimeCapsule.findUniqueOrThrow.mockResolvedValue(racedRow)
    prisma.runtimeCapsule.create.mockRejectedValueOnce({ code: 'P2002' })
    const repository = new RuntimeCapsuleRepository(prisma as unknown as PrismaClient, workspace)
    await expect(
      repository.create({
        projectId: 'project-one',
        testRunId: 'test-run-db-one',
        runId: 'run-one',
        validationHash,
        manifest,
      }),
    ).resolves.toBeDefined()
  })
})
