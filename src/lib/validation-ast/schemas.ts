import { z } from 'zod'

export const VALIDATION_AST_SCHEMA_VERSION = '1' as const

import { locatorCatalogReferenceSchema } from '@/lib/catalog-contracts'

import { actionReferenceIdentitySchema } from '@/lib/action-contracts'

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const versionSchema = z.string().regex(/^\d+(?:\.\d+){0,2}$/)
const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)

export const locatorReferenceSchema = locatorCatalogReferenceSchema.extend({ ref: z.literal('locator') })

export const storedValueReferenceSchema = z.object({ ref: z.literal('stored'), name: idSchema })

export const astValueSchema: z.ZodType<unknown> = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  locatorReferenceSchema,
  z.object({ ref: z.literal('environment'), key: idSchema }),
  storedValueReferenceSchema,
  z.object({ ref: z.literal('custom-extension'), id: idSchema, version: versionSchema }),
])

export const actionReferenceSchema = actionReferenceIdentitySchema.extend({
  inputs: z.record(z.string(), astValueSchema),
})

export const validationMatrixEntrySchema = z.object({
  browser: z.enum(['chromium', 'firefox', 'webkit']).optional(),
  environmentId: idSchema,
})

export const qualityConcernSchema = z.enum(['accessibility', 'persistence', 'responsive', 'performance', 'security'])

export const validationAstStepSchema = z
  .object({
    id: idSchema,
    keyword: z.enum(['Given', 'When', 'Then', 'And']),
    description: z.string().min(1),
    action: actionReferenceSchema,
    store: z.object({ output: idSchema, as: idSchema }).optional(),
  })
  .strict()

export const validationAstSchema = z
  .object({
    schemaVersion: z.literal(VALIDATION_AST_SCHEMA_VERSION),
    id: idSchema,
    title: z.string().min(1).max(120),
    purpose: z.string().min(1),
    coversTaskIds: z.array(idSchema).min(1),
    matrix: z.array(validationMatrixEntrySchema).min(1),
    scenarios: z
      .array(
        z
          .object({
            id: idSchema,
            title: z.string().min(1),
            description: z.string().min(1).optional(),
            steps: z.array(validationAstStepSchema).min(1),
          })
          .strict(),
      )
      .min(1),
    qualityConcerns: z.array(qualityConcernSchema).default([]),
    customExtensions: z.array(idSchema).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [path, ids] of [
      ['scenarios', value.scenarios.map(item => item.id)],
      ...value.scenarios.map((scenario, index) => [`scenarios.${index}.steps`, scenario.steps.map(item => item.id)]),
    ] as Array<[string, string[]]>) {
      if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: `Duplicate ID in ${path}.` })
    }
  })

const extensionFieldSchema = z.object({
  name: idSchema,
  type: z.enum(['string', 'number', 'boolean', 'locator', 'json']),
  required: z.boolean().optional(),
})

export const customActionExtensionProposalSchema = z
  .object({
    schemaVersion: z.literal(VALIDATION_AST_SCHEMA_VERSION),
    id: idSchema,
    version: versionSchema,
    title: z.string().min(1),
    description: z.string().min(1),
    reasonExistingActionsAreInsufficient: z.string().min(1),
    inputs: z.array(extensionFieldSchema.extend({ required: z.boolean() })),
    outputs: z.array(extensionFieldSchema.omit({ required: true })),
    requiredCapabilities: z.array(idSchema),
    implementation: z.object({ language: z.literal('typescript'), source: z.string().min(1) }),
  })
  .strict()

export const validationAstSubmissionSchema = z.object({
  expectedPlanHash: hashSchema,
  ast: validationAstSchema,
  customExtensionProposals: z.array(customActionExtensionProposalSchema).default([]),
})

export type ValidationAst = z.infer<typeof validationAstSchema>
export type ValidationAstSubmission = z.infer<typeof validationAstSubmissionSchema>
export type CustomActionExtensionProposal = z.infer<typeof customActionExtensionProposalSchema>
