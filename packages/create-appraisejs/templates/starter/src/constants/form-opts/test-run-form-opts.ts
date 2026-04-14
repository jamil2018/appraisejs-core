import { BrowserEngine } from '@prisma/client'
import { z } from 'zod'

export const testRunSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  environmentId: z.string().min(1, { message: 'Environment is required' }),
  tags: z.array(z.string()),
  testWorkersCount: z.number().min(1, { message: 'Test workers count must be at least 1' }).optional(),
  browserEngine: z.nativeEnum(BrowserEngine),
  testSuites: z.array(
    z.object({
      testSuiteId: z.string().min(1, { message: 'Test suite is required' }),
      runAll: z.boolean(),
      testCaseIds: z.array(z.string()),
    }),
  ),
})

export type TestRun = z.infer<typeof testRunSchema>

export const formOpts = {
  defaultValues: {
    name: '',
    environmentId: '',
    tags: [],
    testWorkersCount: 1,
    browserEngine: BrowserEngine.CHROMIUM,
    testSuites: [],
  } as TestRun,
  validators: {
    onChange: testRunSchema,
  },
}
