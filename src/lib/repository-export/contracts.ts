import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'

export const repositoryExportPolicySchema = z.enum(['disabled', 'optional', 'required'])
export type RepositoryExportPolicyValue = z.infer<typeof repositoryExportPolicySchema>

const repositoryExportFileSchema = z
  .object({
    path: z.string().min(1).max(512),
    hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    size: z.number().int().nonnegative(),
  })
  .strict()

export const repositoryExportManifestSchema = z
  .object({
    schemaVersion: z.literal('1'),
    projectId: z.string().min(1).max(256),
    validationHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    publishOperationId: z.string().min(1).max(256),
    files: z.array(repositoryExportFileSchema).max(2048),
  })
  .strict()

export type RepositoryExportManifest = z.infer<typeof repositoryExportManifestSchema>

export const hashRepositoryExportBytes = (bytes: Uint8Array) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`
export const hashRepositoryExportValue = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
