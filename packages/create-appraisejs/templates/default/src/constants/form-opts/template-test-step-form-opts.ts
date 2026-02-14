import { z } from 'zod'

export const templateStepSchema = z.object({
  name: z.string().min(3, { message: 'Name must be at least 3 characters' }),
  description: z.string().optional(),
  type: z.string(),
  signature: z.string(),
  functionDefinition: z.string().optional(),
  params: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      order: z.number(),
    }),
  ),
  icon: z.string(),
  templateStepGroupId: z.string().min(1, { message: 'Template step group is required' }),
})

export type TemplateStep = z.infer<typeof templateStepSchema>

export const formOpts = {
  defaultValues: {
    name: '',
    description: '',
    type: 'ACTION',
    signature: '',
    functionDefinition: '',
    params: [],
    icon: 'MOUSE',
    templateStepGroupId: '',
  } as TemplateStep,
  validators: {
    onChange: templateStepSchema,
  },
}
