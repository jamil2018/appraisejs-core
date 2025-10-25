import { BrowserEngine } from '@prisma/client'
import { formOptions } from '@tanstack/react-form/nextjs'
import { z } from 'zod'

export const testRunSchema = z.object({
  environmentId: z.string().min(1, { message: 'Environment is required' }),
  tags: z.array(z.string()),
  testWorkersCount: z.number().min(1, { message: 'Test workers count must be at least 1' }).optional(),
  browserEngine: z.nativeEnum(BrowserEngine),
  testCases: z.array(
    z.object({
      testCaseId: z.string().min(1, { message: 'Test case is required' }),
    }),
  ),
})

export type TestRun = z.infer<typeof testRunSchema>

export const formOpts = formOptions({
  defaultValues: {
    environmentId: '',
    tags: [],
    testWorkersCount: 1,
    browserEngine: BrowserEngine.CHROMIUM,
    testCases: [],
  } as TestRun,
  validators: {
    onChange: testRunSchema,
  },
})
