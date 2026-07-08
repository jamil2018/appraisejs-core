import { z } from 'zod'

const stepBlockStepSchema = z.object({
  templateStepId: z.string().min(1, { message: 'Template step is required' }),
})

export const stepBlockSchema = z.object({
  name: z.string().min(3, { message: 'Name must be at least 3 characters' }),
  description: z.string().optional(),
  intent: z.string().optional(),
  steps: z.array(stepBlockStepSchema).min(1, { message: 'Add at least one template step' }),
})

export type StepBlockFormValues = z.infer<typeof stepBlockSchema>

export const stepBlockFormOpts = {
  defaultValues: {
    name: '',
    description: '',
    intent: '',
    steps: [{ templateStepId: '' }],
  } satisfies StepBlockFormValues,
  validators: {
    onChange: stepBlockSchema,
  },
}
