import crypto from 'node:crypto'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { GENERATED_AUTOMATION_MARKER } from '@/lib/automation/generated-ownership'
import { validationArtifactSchema } from '@/lib/plan-contract'
import {
  hashRepositoryExportBytes,
  hashRepositoryExportValue,
  repositoryExportPolicySchema,
  type RepositoryExportPolicyValue,
} from '@/lib/repository-export/contracts'
import { publishRepositoryExport } from '@/lib/repository-export/storage'
import { buildReviewedRuntimeCapsuleFiles } from '@/lib/runtime-capsule/materializer'
import { ServiceError } from '@/services/shared/errors'
import {
  validateStoredValidationAstPublish,
  validateValidationAstRuntimeInput,
} from '@/services/coordinator/validation-ast-publish-journal-service'

const DEFAULT_DESTINATION = 'automation/appraise'

// Policy and idempotency branches are the enqueue contract.
// fallow-ignore-next-line complexity
export async function enqueueRepositoryExport(
  input: {
    publishOperationId: string
    policy: RepositoryExportPolicyValue
    destinationPath?: string
  },
  client: PrismaClient = prisma,
) {
  const policy = repositoryExportPolicySchema.parse(input.policy)
  const operation = await client.validationAstPublishOperation.findUnique({ where: { id: input.publishOperationId } })
  if (!operation || operation.phase !== 'review_ready' || !operation.runtimeInputHash)
    throw new ServiceError('Repository export requires an exact review-ready validation publication.', 'CONFLICT')
  const destinationPath = input.destinationPath ?? DEFAULT_DESTINATION
  const idempotencyKey = hashRepositoryExportValue({
    projectId: operation.targetProjectId,
    validationHash: operation.validationHash,
    destinationPath,
  })
  return client.repositoryExportJob.upsert({
    where: { idempotencyKey },
    create: {
      id: crypto.randomUUID(),
      targetProjectId: operation.targetProjectId,
      publishOperationId: operation.id,
      validationHash: operation.validationHash,
      destinationPath,
      policy,
      idempotencyKey,
      state: policy === 'disabled' ? 'succeeded' : 'queued',
      completedAt: policy === 'disabled' ? new Date() : null,
    },
    update: {},
  })
}

function buildExport(operation: Awaited<ReturnType<typeof loadExportOperation>>) {
  validateStoredValidationAstPublish(operation)
  const runtimeInput = validateValidationAstRuntimeInput({
    operation,
    projectionJson: operation.projectionJson,
    extensionReviews: operation.extensionReviews,
  })
  const validation = validationArtifactSchema.parse(JSON.parse(operation.validationProjectionJson))
  const node = validation.validations.find(item => item.id === runtimeInput.astId)
  if (!node) throw new ServiceError('Reviewed validation node is missing from its publication.', 'CONFLICT')
  const built = buildReviewedRuntimeCapsuleFiles({
    node,
    runtimeInput,
    extensionArtifacts: operation.extensionReviews.map(item => JSON.parse(item.artifactJson)),
  })
  const authoredExtensionPaths = built.files.filter(file => file.role === 'extension').map(file => file.path)
  const ownership = {
    schemaVersion: '1',
    owner: 'appraise',
    authority: 'reviewed-validation-ast',
    mutationPolicy: 'replace-through-appraise-export-only',
    projectId: operation.targetProjectId,
    validationHash: operation.validationHash,
    publishOperationId: operation.id,
    authoredExtensionPaths,
  }
  const files = [
    ...built.files.map(file => ({ path: file.path, bytes: file.bytes })),
    { path: GENERATED_AUTOMATION_MARKER, bytes: Buffer.from(`${canonicalContractJson(ownership)}\n`) },
  ].sort((left, right) => left.path.localeCompare(right.path))
  const manifest = {
    schemaVersion: '1' as const,
    projectId: operation.targetProjectId,
    validationHash: operation.validationHash,
    publishOperationId: operation.id,
    files: files.map(file => ({
      path: file.path,
      hash: hashRepositoryExportBytes(file.bytes),
      size: file.bytes.length,
    })),
  }
  return { files, manifest, manifestHash: hashRepositoryExportValue(manifest) }
}

function loadExportOperation(client: PrismaClient, id: string) {
  return client.validationAstPublishOperation.findUniqueOrThrow({
    where: { id },
    include: { extensionReviews: true, targetProject: true },
  })
}

// Durable state, conflict, and receipt transitions stay adjacent.
// fallow-ignore-next-line complexity
export async function runRepositoryExportJob(
  jobId: string,
  options: { client?: PrismaClient; allowReplaceConflicts?: boolean } = {},
) {
  const client = options.client ?? prisma
  const job = await client.repositoryExportJob.findUniqueOrThrow({ where: { id: jobId } })
  if (job.state === 'succeeded' && job.policy !== 'disabled')
    return client.repositoryExportReceipt.findUniqueOrThrow({ where: { jobId } })
  if (job.policy === 'disabled') return null
  const operation = await loadExportOperation(client, job.publishOperationId)
  if (
    operation.targetProjectId !== job.targetProjectId ||
    operation.validationHash !== job.validationHash ||
    path.resolve(operation.targetProject.canonicalPath) !== operation.targetProject.canonicalPath
  )
    throw new ServiceError('Repository export ownership or destination identity has drifted.', 'CONFLICT')
  await client.repositoryExportJob.update({
    where: { id: job.id },
    data: { state: 'running', attemptCount: { increment: 1 }, failureCode: null },
  })
  try {
    const built = buildExport(operation)
    const result = await publishRepositoryExport({
      projectRoot: operation.targetProject.canonicalPath,
      destinationPath: job.destinationPath,
      manifest: built.manifest,
      files: built.files,
      allowReplaceConflicts: options.allowReplaceConflicts,
    })
    if (result.status === 'conflict') {
      await client.repositoryExportJob.update({
        where: { id: job.id },
        data: { state: 'conflict', conflictJson: canonicalContractJson({ paths: result.conflicts }) },
      })
      throw new ServiceError('Repository export conflicts with external modifications.', 'CONFLICT', undefined, {
        paths: result.conflicts,
      })
    }
    const receiptValue = {
      schemaVersion: '1',
      jobId: job.id,
      projectId: job.targetProjectId,
      validationHash: job.validationHash,
      manifestHash: built.manifestHash,
      destinationPath: job.destinationPath,
    }
    const receiptJson = canonicalContractJson(receiptValue)
    return client.$transaction(async transaction => {
      const receipt = await transaction.repositoryExportReceipt.upsert({
        where: { jobId: job.id },
        create: {
          id: crypto.randomUUID(),
          jobId: job.id,
          targetProjectId: job.targetProjectId,
          validationHash: job.validationHash,
          manifestHash: built.manifestHash,
          destinationPath: job.destinationPath,
          receiptJson,
        },
        update: {},
      })
      await transaction.repositoryExportJob.update({
        where: { id: job.id },
        data: {
          state: 'succeeded',
          manifestHash: built.manifestHash,
          manifestJson: canonicalContractJson(built.manifest),
          conflictJson: null,
          completedAt: new Date(),
        },
      })
      return receipt
    })
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'CONFLICT') throw error
    await client.repositoryExportJob.update({
      where: { id: job.id },
      data: { state: 'failed', failureCode: 'export_failed' },
    })
    throw error
  }
}
