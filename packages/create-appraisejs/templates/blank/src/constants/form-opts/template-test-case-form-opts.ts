import { z } from 'zod'
import { flowBlockSchema, testCaseStepsSchema } from './test-case-step-form-opts'

export const templateTestCaseSchema = z.object({
  title: z.string().min(3, { message: 'Title must be at least 3 characters' }),
  description: z.string().optional(),
  flowBlocks: z.array(flowBlockSchema).default([]),
  steps: testCaseStepsSchema,
})
