import { StepParameterType, TemplateStepIcon } from '@prisma/client'
import { formOptions } from '@tanstack/react-form/nextjs'
import { z } from 'zod'

export const templateTestCaseSchema = z.object({
  title: z.string().min(3, { message: 'Title must be at least 3 characters' }),
  description: z.string().optional(),
  steps: z
    .array(
      z.object({
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

export type TemplateTestCase = z.infer<typeof templateTestCaseSchema>

export const formOpts = formOptions({
  defaultValues: {
    title: '',
    description: '',
    steps: [],
  } as TemplateTestCase,
  validators: {
    onChange: templateTestCaseSchema,
  },
})
