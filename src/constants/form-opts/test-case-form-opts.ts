import { StepParameterType, TemplateStepIcon } from '@prisma/client'
import { z } from 'zod'

export const testCaseSchema = z.object({
  title: z.string().min(3, { message: 'Title must be at least 3 characters' }),
  description: z.string().optional(),
  testSuiteIds: z.array(z.string()),
  tagIds: z.array(z.string()).optional(),
  flowBlocks: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        nodeIds: z.array(z.string()),
      }),
    )
    .default([]),
  steps: z
    .array(
      z.object({
        nodeId: z.string().optional(),
        gherkinStep: z.string(),
        label: z.string(),
        icon: z.nativeEnum(TemplateStepIcon),
        parameters: z.array(
          z.object({
            name: z.string(),
            value: z.string(),
            type: z.nativeEnum(StepParameterType),
            order: z.number(),
          }),
        ),
        order: z.number(),
        templateStepId: z.string(),
      }),
    )
    .min(1, { message: 'Steps are required' }),
})

export type TestCase = z.infer<typeof testCaseSchema>

export const formOpts = {
  defaultValues: {
    title: '',
    description: '',
    testSuiteIds: [],
    tagIds: [],
    flowBlocks: [],
    steps: [],
  } as TestCase,
  validators: {
    onChange: testCaseSchema,
  },
}
