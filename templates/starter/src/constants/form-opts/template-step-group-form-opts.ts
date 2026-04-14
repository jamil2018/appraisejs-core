import { z } from 'zod'

// TemplateStepGroupType enum - will be available from @prisma/client after migration
const TemplateStepGroupTypeEnum = z.enum(['ACTION', 'VALIDATION'])
type TemplateStepGroupType = z.infer<typeof TemplateStepGroupTypeEnum>

export const templateStepGroupSchema = z.object({
  name: z.string().min(3, { message: 'Name must be at least 3 characters' }),
  description: z.string().optional(),
  type: TemplateStepGroupTypeEnum,
})

export type TemplateStepGroup = z.infer<typeof templateStepGroupSchema>

export const formOpts = {
  defaultValues: {
    name: '',
    description: '',
    type: 'ACTION' as TemplateStepGroupType,
  } as TemplateStepGroup,
  validators: {
    onChange: templateStepGroupSchema,
  },
}
