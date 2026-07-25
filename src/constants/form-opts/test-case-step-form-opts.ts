import { StepParameterType, TemplateStepIcon } from '@prisma/client'
import { z } from 'zod'
import { stepInvocationSchema } from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

export const flowBlockSchema = z.object({
  id: z.string(),
  name: z.string(),
  nodeIds: z.array(z.string()),
})

const testCaseStepSchema = z.object({
  nodeId: z.string().optional(),
  gherkinStep: z.string(),
  label: z.string(),
  icon: z.nativeEnum(TemplateStepIcon),
  parameters: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      type: z.nativeEnum(StepParameterType),
      order: z.number(),
    }),
  ),
  order: z.number(),
  invocation: stepInvocationSchema,
})

export const testCaseStepsSchema = z.array(testCaseStepSchema).min(1, { message: 'Steps are required' })
