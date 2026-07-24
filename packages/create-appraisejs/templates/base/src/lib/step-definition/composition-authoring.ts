import { z } from 'zod'

import {
  stepInputExpressionSchema,
  stepReferenceSchema,
  type StepDefinition,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

const identifierSchema = z.string().regex(/^[a-z][a-zA-Z0-9-]*$/)

const compositionAuthoringChildSchema = z
  .object({ step: stepReferenceSchema, inputs: z.record(identifierSchema, stepInputExpressionSchema) })
  .strict()

// Drafts may temporarily be empty while the author searches for ready children.
// Publication still uses the runtime Step Definition schema, which requires at
// least one child for a composition.
const compositionAuthoringChildrenSchema = z.array(compositionAuthoringChildSchema).max(100)

export type CompositionAuthoringChild = z.infer<typeof compositionAuthoringChildSchema>

export type ReadyCompositionChildContract = {
  step: CompositionAuthoringChild['step']
  title: string
  description: string
  inputs: StepDefinition['inputs']
  outputs: StepDefinition['outputs']
}

export function normalizeCompositionChildren(value: unknown): CompositionAuthoringChild[] {
  return compositionAuthoringChildrenSchema.parse(value)
}

export function compositionChildFromContract(contract: ReadyCompositionChildContract): CompositionAuthoringChild {
  return {
    step: contract.step,
    // A mapping is deliberate authoring data. Do not infer a parent input just
    // because it has the same name as a required child input.
    inputs: {},
  }
}
