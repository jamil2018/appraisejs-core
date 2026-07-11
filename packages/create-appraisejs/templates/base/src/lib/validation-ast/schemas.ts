import { z } from 'zod'

export const VALIDATION_AST_SCHEMA_VERSION = '1' as const

import { locatorCatalogReferenceSchema } from '@/lib/catalog-contracts'

import { actionReferenceIdentitySchema } from '@/lib/action-contracts'
import { validationAstAuthoringProfileSchema } from './authoring-profile'

export const VALIDATION_AST_LIMITS = {
  idCharacters: 80,
  textCharacters: 2_000,
  sourceBytes: 65_536,
  scenarios: 20,
  stepsPerScenario: 100,
  matrixEntries: 12,
  taskIds: 100,
  actionInputs: 32,
  extensionProposals: 8,
  extensionFields: 32,
  extensionCapabilities: 16,
} as const

const idSchema = z
  .string()
  .max(VALIDATION_AST_LIMITS.idCharacters)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const versionSchema = z.string().regex(/^\d+(?:\.\d+){0,2}$/)
const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const textSchema = z.string().min(1).max(VALIDATION_AST_LIMITS.textCharacters)

export const locatorReferenceSchema = locatorCatalogReferenceSchema.extend({ ref: z.literal('locator') })

export const storedValueReferenceSchema = z.object({ ref: z.literal('stored'), name: idSchema })

export const astValueSchema: z.ZodType<unknown> = z.union([
  z.string().max(VALIDATION_AST_LIMITS.textCharacters),
  z.number().finite(),
  z.boolean(),
  locatorReferenceSchema,
  z.object({ ref: z.literal('environment'), key: idSchema }),
  storedValueReferenceSchema,
  z.object({ ref: z.literal('custom-extension'), id: idSchema, version: versionSchema }),
])

export const actionReferenceSchema = actionReferenceIdentitySchema.extend({
  inputs: z.record(idSchema, astValueSchema).superRefine((value, context) => {
    if (Object.keys(value).length > VALIDATION_AST_LIMITS.actionInputs)
      context.addIssue({ code: 'custom', message: 'Too many action inputs.' })
  }),
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
    description: textSchema,
    action: actionReferenceSchema,
    store: z.object({ output: idSchema, as: idSchema }).optional(),
  })
  .strict()

export const validationAstSchema = z
  .object({
    schemaVersion: z.literal(VALIDATION_AST_SCHEMA_VERSION),
    id: idSchema,
    title: z.string().min(1).max(120),
    purpose: textSchema,
    coversTaskIds: z.array(idSchema).min(1).max(VALIDATION_AST_LIMITS.taskIds),
    matrix: z.array(validationMatrixEntrySchema).min(1).max(VALIDATION_AST_LIMITS.matrixEntries),
    scenarios: z
      .array(
        z
          .object({
            id: idSchema,
            title: textSchema,
            description: textSchema.optional(),
            steps: z.array(validationAstStepSchema).min(1).max(VALIDATION_AST_LIMITS.stepsPerScenario),
          })
          .strict(),
      )
      .min(1)
      .max(VALIDATION_AST_LIMITS.scenarios),
    qualityConcerns: z.array(qualityConcernSchema).max(5).default([]),
    customExtensions: z.array(idSchema).max(VALIDATION_AST_LIMITS.extensionProposals).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.qualityConcerns).size !== value.qualityConcerns.length)
      context.addIssue({ code: 'custom', message: 'Duplicate quality concern.' })
    if (value.scenarios.reduce((total, scenario) => total + scenario.steps.length, 0) > 100)
      context.addIssue({ code: 'custom', message: 'Too many validation steps.' })
    for (const [path, ids] of [
      ['customExtensions', value.customExtensions],
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
    title: textSchema,
    description: textSchema,
    reasonExistingActionsAreInsufficient: textSchema,
    inputs: z.array(extensionFieldSchema.extend({ required: z.boolean() })).max(VALIDATION_AST_LIMITS.extensionFields),
    outputs: z.array(extensionFieldSchema.omit({ required: true })).max(VALIDATION_AST_LIMITS.extensionFields),
    requiredCapabilities: z.array(idSchema).max(VALIDATION_AST_LIMITS.extensionCapabilities),
    implementation: z.object({
      language: z.literal('typescript'),
      source: z
        .string()
        .min(1)
        .refine(value => Buffer.byteLength(value, 'utf8') <= VALIDATION_AST_LIMITS.sourceBytes, 'Source is too large.'),
    }),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [name, values] of [
      ['input', value.inputs.map(field => field.name)],
      ['output', value.outputs.map(field => field.name)],
      ['capability', value.requiredCapabilities],
    ] as Array<[string, string[]]>)
      if (new Set(values).size !== values.length)
        context.addIssue({ code: 'custom', message: `Duplicate extension ${name}.` })
  })

export const validationAstSubmissionSchema = z
  .object({
    expectedPlanHash: hashSchema,
    authoringProfile: validationAstAuthoringProfileSchema.optional(),
    ast: validationAstSchema,
    customExtensionProposals: z
      .array(customActionExtensionProposalSchema)
      .max(VALIDATION_AST_LIMITS.extensionProposals)
      .default([]),
  })
  .superRefine((value, context) => {
    const identities = value.customExtensionProposals.map(proposal => `${proposal.id}@${proposal.version}`)
    if (new Set(identities).size !== identities.length)
      context.addIssue({ code: 'custom', message: 'Duplicate custom extension identity.' })
  })

export type ValidationAst = z.infer<typeof validationAstSchema>
export type ValidationAstSubmission = z.infer<typeof validationAstSubmissionSchema>
export type CustomActionExtensionProposal = z.infer<typeof customActionExtensionProposalSchema>
