import { z } from 'zod'

export const templateSelectionSchema = z.object({
  templateTestCaseId: z.string().min(1, { message: 'Template test case is required' }),
})

export type TemplateSelection = z.infer<typeof templateSelectionSchema>

export const formOpts = {
  defaultValues: {
    templateTestCaseId: '',
  },
  validators: {
    onChange: templateSelectionSchema,
  },
}
