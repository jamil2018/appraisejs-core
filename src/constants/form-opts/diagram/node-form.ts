import { StepParameterType } from '@prisma/client'
import { formOptions } from '@tanstack/react-form/nextjs'
import { z } from 'zod'

export const nodeDataSchema = z.object({
  label: z.string().min(3, { message: 'Label must be at least 3 characters' }),
  gherkinStep: z.string(),
  templateStepId: z.string().min(1, { message: 'Template step is required' }),
  parameters: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      type: z.nativeEnum(StepParameterType),
      order: z.number(),
    }),
  ),
})

export type NodeData = z.infer<typeof nodeDataSchema>

export const formOpts = formOptions({
  defaultValues: {
    label: '',
    gherkinStep: '',
    templateStepId: '',
    parameters: [],
  } as NodeData,
  validators: {
    onChange: nodeDataSchema,
  },
})
