import { z } from 'zod'
import { stepInvocationSchema } from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

const stepBlockStepSchema = z.object({
  invocation: stepInvocationSchema,
})

export const stepBlockSchema = z.object({
  name: z.string().min(3, { message: 'Name must be at least 3 characters' }),
  description: z.string().optional(),
  intent: z.string().optional(),
  steps: z.array(stepBlockStepSchema).min(1, { message: 'Add at least one Step Definition' }),
})

export type StepBlockFormValues = z.infer<typeof stepBlockSchema>

export const stepBlockFormOpts = {
  defaultValues: {
    name: '',
    description: '',
    intent: '',
    steps: [],
  } satisfies StepBlockFormValues,
  validators: {
    onChange: stepBlockSchema,
  },
}
