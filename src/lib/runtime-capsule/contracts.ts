import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'

export const runtimeCapsuleSegmentSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'must be a safe opaque identifier')

export const runtimeCapsuleHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
export const runtimeCapsuleFilePathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9._/-]+$/, 'must use portable ASCII path tokens')
  .refine(value => !value.startsWith('/') && !value.includes('\\'), 'must be a relative POSIX path')
  .refine(
    value => value.split('/').every(segment => segment.length > 0 && segment !== '.' && segment !== '..'),
    'must not contain empty, current, or parent segments',
  )

export const runtimeCapsuleManifestSchema = z
  .object({
    schemaVersion: z.literal('1'),
    projectId: runtimeCapsuleSegmentSchema,
    validationHash: runtimeCapsuleHashSchema,
    runId: runtimeCapsuleSegmentSchema,
    operationHash: runtimeCapsuleHashSchema,
    projectionHash: runtimeCapsuleHashSchema,
    receiptHash: runtimeCapsuleHashSchema,
    runtimeInputHash: runtimeCapsuleHashSchema,
    commandReceipt: z.object({ path: z.literal('command-receipt.json'), hash: runtimeCapsuleHashSchema }).strict(),
    generator: z
      .object({
        id: z.literal('appraise.validation-ast-capsule'),
        version: z.enum(['1', '2']),
      })
      .strict(),
    operations: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
            version: z.string().regex(/^\d+(?:\.\d+){0,2}$/),
            descriptorHash: runtimeCapsuleHashSchema,
            handler: z
              .object({
                id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
                version: z.string().regex(/^\d+(?:\.\d+){0,2}$/),
                contentHash: runtimeCapsuleHashSchema,
              })
              .strict(),
          })
          .strict(),
      )
      .max(256)
      .default([]),
    expectedCases: z
      .array(
        z
          .object({
            validationId: runtimeCapsuleSegmentSchema,
            suiteId: runtimeCapsuleSegmentSchema,
            caseId: runtimeCapsuleSegmentSchema,
            scenarioId: runtimeCapsuleSegmentSchema,
          })
          .strict(),
      )
      .max(256),
    files: z
      .array(
        z
          .object({
            path: runtimeCapsuleFilePathSchema,
            role: z.enum(['feature', 'binding', 'extension', 'support', 'config', 'expected-cases', 'command-receipt']),
            hash: runtimeCapsuleHashSchema,
            size: z
              .number()
              .int()
              .nonnegative()
              .max(100 * 1024 * 1024),
          })
          .strict(),
      )
      .max(512)
      .default([]),
  })
  .strict()
  .superRefine((manifest, context) => {
    const paths = manifest.files.map(file => file.path)
    if (new Set(paths).size !== paths.length)
      context.addIssue({ code: 'custom', path: ['files'], message: 'file paths must be unique' })
    const sorted = [...paths].sort((left, right) => left.localeCompare(right))
    if (paths.some((filePath, index) => filePath !== sorted[index]))
      context.addIssue({ code: 'custom', path: ['files'], message: 'files must be ordered by path' })
    const receiptFile = manifest.files.find(file => file.path === manifest.commandReceipt.path)
    if (!receiptFile || receiptFile.role !== 'command-receipt' || receiptFile.hash !== manifest.commandReceipt.hash)
      context.addIssue({
        code: 'custom',
        path: ['commandReceipt'],
        message: 'command receipt reference must match its immutable manifest file',
      })
    const expectedCaseIds = manifest.expectedCases.map(item => `${item.validationId}/${item.suiteId}/${item.caseId}`)
    if (new Set(expectedCaseIds).size !== expectedCaseIds.length)
      context.addIssue({ code: 'custom', path: ['expectedCases'], message: 'expected cases must be unique' })
    const operationRefs = manifest.operations.map(item => `${item.id}@${item.version}`)
    const sortedOperationRefs = [...operationRefs].sort()
    if (
      new Set(operationRefs).size !== operationRefs.length ||
      operationRefs.some((ref, index) => ref !== sortedOperationRefs[index])
    )
      context.addIssue({ code: 'custom', path: ['operations'], message: 'operations must be unique and ordered' })
  })

export type RuntimeCapsuleManifest = z.infer<typeof runtimeCapsuleManifestSchema>

export function canonicalRuntimeCapsuleJson(value: unknown): string {
  return canonicalContractJson(value)
}

export function hashRuntimeCapsuleValue(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalRuntimeCapsuleJson(value)).digest('hex')}`
}

export function hashRuntimeCapsuleBytes(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

export function parseCanonicalRuntimeCapsuleManifest(value: string): RuntimeCapsuleManifest {
  if (Buffer.byteLength(value, 'utf8') > 1024 * 1024) throw new Error('Runtime capsule manifest exceeds 1 MiB.')
  const parsed = runtimeCapsuleManifestSchema.parse(JSON.parse(value))
  if (canonicalRuntimeCapsuleJson(parsed) !== value) throw new Error('Runtime capsule manifest is not canonical JSON.')
  return parsed
}

export function validationHashSegment(validationHash: string): string {
  return runtimeCapsuleHashSchema.parse(validationHash).slice('sha256:'.length)
}
