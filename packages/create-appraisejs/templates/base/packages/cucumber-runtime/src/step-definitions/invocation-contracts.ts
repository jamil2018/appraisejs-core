import { z } from 'zod'

import { boundedOperationValueSchema } from '../operations/value-schema.ts'

/** Browser-safe invocation schemas; keep Node hashing and server contract imports outside this module. */
export const stepDefinitionIdSchema = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/)
export const stepDefinitionVersionSchema = z.string().regex(/^\d+(?:\.\d+){0,2}$/)
export const stepDefinitionHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
export const identifierSchema = z.string().regex(/^[a-z][a-zA-Z0-9-]*$/)
export const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum)

export const stepIdentitySchema = z.object({
  id: stepDefinitionIdSchema,
  version: stepDefinitionVersionSchema,
})

export const stepReferenceSchema = stepIdentitySchema.extend({ definitionHash: stepDefinitionHashSchema })

export const stepValueSchema = boundedOperationValueSchema

export type StepValue = string | number | boolean | null | StepValue[] | { [key: string]: StepValue }

export type StepInputSelector = { input: string } | { output: string }
export type StepInputExpression = StepValue | StepInputSelector

function isSelectorShaped(value: unknown) {
  return !!value && typeof value === 'object' && (Object.hasOwn(value, 'input') || Object.hasOwn(value, 'output'))
}

export const stepInputExpressionSchema: z.ZodType<StepInputExpression> = z.union([
  z.object({ input: identifierSchema }).strict(),
  z.object({ output: identifierSchema }).strict(),
  stepValueSchema.refine(value => !isSelectorShaped(value), {
    message: 'Selector-shaped composition input expressions must be exact input or output selectors.',
  }),
]) as z.ZodType<StepInputExpression>

export const stepInvocationSchema = z
  .object({
    step: stepReferenceSchema,
    inputs: z.record(identifierSchema, stepValueSchema),
    store: z.object({ output: identifierSchema, as: identifierSchema }).optional(),
    presentation: z
      .object({ keyword: z.enum(['Given', 'When', 'Then', 'And']), description: boundedText(2_000).optional() })
      .optional(),
  })
  .strict()
