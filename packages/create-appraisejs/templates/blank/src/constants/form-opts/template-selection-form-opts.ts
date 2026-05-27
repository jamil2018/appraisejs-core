import { z } from 'zod'

export const templateSelectionSchema = z.object({
  templateTestCaseId: z.string().min(1, { message: 'Template test case is required' }),
})
