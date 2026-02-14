import { z } from 'zod'

export const testSuiteSchema = z.object({
  name: z.string().min(3, { message: 'Name must be at least 3 characters' }),
  description: z.string().optional(),
  testCases: z.array(z.string()).optional(),
  moduleId: z.string().min(1, { message: 'Module is required' }),
  tagIds: z.array(z.string()).optional(),
})

export type TestSuite = z.infer<typeof testSuiteSchema>

export const formOpts = {
  defaultValues: {
    name: '',
    description: '',
    testCases: [],
    moduleId: '',
    tagIds: [],
  } as TestSuite,
  validators: {
    onChange: testSuiteSchema,
  },
}
