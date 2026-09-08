import { z } from 'zod'

import { stepInvocationSchema } from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

const COLLABORATION_FORMAT = 'appraise.repository-collaboration/v1' as const
const MAX_COLLABORATION_RECORDS = 10_000
export const MAX_COLLABORATION_RECORD_BYTES = 2 * 1024 * 1024
export const MAX_COLLABORATION_TOTAL_BYTES = 64 * 1024 * 1024

const portableIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'portable IDs must be path-safe')
const textSchema = z.string().max(100_000)
const optionalPortableIdSchema = portableIdSchema.nullable()

const collaborationEntityKinds = [
  'module',
  'test-suite',
  'test-case',
  'template',
  'locator-group',
  'locator',
  'tag',
  'environment-reference',
  'journey-reuse-asset',
] as const
const collaborationEntityKindSchema = z.enum(collaborationEntityKinds)

const authoredStepSchema = z
  .object({
    portableId: portableIdSchema,
    flowNodeId: z.string().max(200).nullable(),
    order: z.number().int().nonnegative(),
    keyword: z.enum(['Given', 'When', 'Then', 'And']),
    gherkinStep: z.string().min(1).max(2_000),
    icon: z.enum([
      'MOUSE',
      'NAVIGATION',
      'INPUT',
      'DOWNLOAD',
      'API',
      'STORE',
      'FORMAT',
      'DATA',
      'UPLOAD',
      'WAIT',
      'VALIDATION',
      'DEBUG',
    ]),
    label: z.string().min(1).max(500),
    invocation: stepInvocationSchema,
    parameters: z
      .array(
        z
          .object({
            name: z.string().min(1).max(200),
            value: textSchema,
            type: z.enum(['STRING', 'NUMBER', 'DATE', 'BOOLEAN', 'LOCATOR']),
            order: z.number().int().nonnegative(),
            locatorPortableId: portableIdSchema.nullable(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()

const flowBlockSchema = z
  .object({
    portableId: portableIdSchema,
    name: z.string().min(1).max(500),
    order: z.number().int().nonnegative(),
    flowNodeIds: z.array(z.string().min(1).max(200)).max(10_000),
  })
  .strict()

const commonRecordShape = {
  format: z.literal(COLLABORATION_FORMAT),
  portableProjectId: portableIdSchema,
  portableId: portableIdSchema,
  version: z.number().int().positive(),
  archived: z.boolean(),
}

const moduleRecordSchema = z
  .object({
    ...commonRecordShape,
    kind: z.literal('module'),
    payload: z.object({ name: z.string().min(1).max(500), parentPortableId: optionalPortableIdSchema }).strict(),
  })
  .strict()

const testSuiteRecordSchema = z
  .object({
    ...commonRecordShape,
    kind: z.literal('test-suite'),
    payload: z
      .object({
        name: z.string().min(1).max(500),
        description: textSchema.nullable(),
        modulePortableId: portableIdSchema,
        testCasePortableIds: z.array(portableIdSchema).max(10_000),
        tagPortableIds: z.array(portableIdSchema).max(10_000),
      })
      .strict(),
  })
  .strict()

const testCaseRecordSchema = z
  .object({
    ...commonRecordShape,
    kind: z.literal('test-case'),
    payload: z
      .object({
        title: z.string().min(1).max(500),
        description: textSchema,
        steps: z.array(authoredStepSchema).max(10_000),
        flowBlocks: z.array(flowBlockSchema).max(10_000),
        tagPortableIds: z.array(portableIdSchema).max(10_000),
      })
      .strict(),
  })
  .strict()

const templateRecordSchema = z
  .object({
    ...commonRecordShape,
    kind: z.literal('template'),
    payload: z
      .object({
        name: z.string().min(1).max(500),
        description: textSchema.nullable(),
        steps: z.array(authoredStepSchema).max(10_000),
        flowBlocks: z.array(flowBlockSchema).max(10_000),
      })
      .strict(),
  })
  .strict()

const locatorGroupRecordSchema = z
  .object({
    ...commonRecordShape,
    kind: z.literal('locator-group'),
    payload: z
      .object({
        name: z.string().min(1).max(500),
        route: z.string().min(1).max(2_000),
        modulePortableId: portableIdSchema,
      })
      .strict(),
  })
  .strict()

const locatorRecordSchema = z
  .object({
    ...commonRecordShape,
    kind: z.literal('locator'),
    payload: z
      .object({
        name: z.string().min(1).max(500),
        value: z.string().min(1).max(10_000),
        locatorGroupPortableId: portableIdSchema,
      })
      .strict(),
  })
  .strict()

const tagRecordSchema = z
  .object({
    ...commonRecordShape,
    kind: z.literal('tag'),
    payload: z
      .object({
        name: z.string().min(1).max(500),
        expression: z.string().min(1).max(500),
        type: z.literal('FILTER'),
      })
      .strict(),
  })
  .strict()

const environmentReferenceRecordSchema = z
  .object({
    ...commonRecordShape,
    kind: z.literal('environment-reference'),
    payload: z.object({ name: z.string().min(1).max(500) }).strict(),
  })
  .strict()

const journeyReuseAssetRecordSchema = z
  .object({
    ...commonRecordShape,
    kind: z.literal('journey-reuse-asset'),
    payload: z
      .object({
        assetKind: z.enum(['brief', 'analysis', 'scenario']),
        title: z.string().min(1).max(500),
        content: z.record(z.string(), z.unknown()),
      })
      .strict(),
  })
  .strict()

export const collaborationRecordSchema = z.discriminatedUnion('kind', [
  moduleRecordSchema,
  testSuiteRecordSchema,
  testCaseRecordSchema,
  templateRecordSchema,
  locatorGroupRecordSchema,
  locatorRecordSchema,
  tagRecordSchema,
  environmentReferenceRecordSchema,
  journeyReuseAssetRecordSchema,
])
export type CollaborationRecord = z.infer<typeof collaborationRecordSchema>

export const collaborationManifestSchema = z
  .object({
    format: z.literal(COLLABORATION_FORMAT),
    portableProjectId: portableIdSchema,
    records: z
      .array(
        z
          .object({
            kind: collaborationEntityKindSchema,
            portableId: portableIdSchema,
            path: z.string().regex(/^[a-z0-9-]+\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/),
            hash: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(MAX_COLLABORATION_RECORDS),
  })
  .strict()
  .superRefine((manifest, context) => {
    const keys = new Set<string>()
    const paths = new Set<string>()
    for (const [index, record] of manifest.records.entries()) {
      const key = `${record.kind}:${record.portableId}`
      if (keys.has(key))
        context.addIssue({ code: 'custom', message: `duplicate record ${key}`, path: ['records', index] })
      if (paths.has(record.path))
        context.addIssue({ code: 'custom', message: `duplicate path ${record.path}`, path: ['records', index] })
      keys.add(key)
      paths.add(record.path)
    }
  })
export type CollaborationManifest = z.infer<typeof collaborationManifestSchema>
